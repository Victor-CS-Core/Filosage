import "server-only";

import type OpenAI from "openai";
import { AccountLifecycleError, currentAccountGeneration, runWithBannerUploadReceipt } from "@/lib/account-lifecycle";
import type { CourseBanner } from "@/lib/course-types";
import {
  getStoredDocument,
  runStoredDocumentTransaction,
} from "@/lib/document-store";
import {
  storeCourseBannerObject,
} from "@/lib/course-banner-storage";
import {
  buildCourseBannerPrompt,
  courseBannerFingerprintMaterial,
  COURSE_BANNER_STYLE_VERSION,
} from "@/lib/course-banner-prompt";
import { serverEnvironment } from "@/lib/runtime-environment";

const STYLE_VERSION = COURSE_BANNER_STYLE_VERSION;
const MAX_STORED_IMAGE_BYTES = 650_000;
const DEFAULT_MODEL = "gpt-image-1-mini";
const GENERATION_LEASE_MS = 90_000;
const GENERATION_WAIT_MS = 18_000;

interface CourseBannerInput {
  topic: string;
  category?: string;
  outcome?: string;
  mission?: string;
  safetyIdentifier: string;
  variant?: 0 | 1;
}

export interface CourseBannerResult {
  banner: CourseBanner;
  generated: boolean;
  model: string;
  costMicros: number;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rawBase64Bytes(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function generationCostMicros(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  if (normalizedModel.startsWith("gpt-image-1-mini")) return 6_000;
  if (normalizedModel.startsWith("gpt-image-1")) return 16_000;
  return 16_000;
}

function isEnabled() {
  const flag = serverEnvironment.COURSE_BANNERS_ENABLED?.trim().toLowerCase();
  return flag !== "false" && Boolean(serverEnvironment.OPENAI_API_KEY);
}

async function reusableBanner(assetId: string, fallbackModel: string): Promise<CourseBannerResult | null> {
  if (!/^[a-f0-9]{32}$/.test(assetId)) return null;
  const asset = await getStoredDocument(`courseBannerAssets/${assetId}`);
  if (!asset || asset.contentType !== "image/webp" || (asset.status && asset.status !== "uploaded")) return null;
  const available = asset.storage === "azure-blob" || typeof asset.data === "string";
  if (!available) return null;
  return {
    banner: {
      assetId,
      version: 1,
      generatedAt: typeof asset.createdAt === "string" ? asset.createdAt : undefined,
    },
    generated: false,
    model: typeof asset.model === "string" ? asset.model : fallbackModel,
    costMicros: 0,
  };
}

async function waitForReusableBanner(keyPath: string, model: string) {
  const deadline = Date.now() + GENERATION_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    const key = await getStoredDocument(keyPath);
    const assetId = typeof key?.assetId === "string" ? key.assetId : "";
    const reused = await reusableBanner(assetId, model);
    if (reused) return reused;
    if (key?.status === "failed") return null;
  }
  return null;
}

export async function createOrReuseCourseBanner(
  client: OpenAI,
  input: CourseBannerInput,
): Promise<CourseBannerResult | null> {
  if (!isEnabled()) return null;

  const model = serverEnvironment.OPENAI_COURSE_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
  const account = currentAccountGeneration();
  if (!account) throw new AccountLifecycleError("Banner generation requires an account generation.");
  const fingerprint = await sha256(`${account.uid}:${account.generation}:${courseBannerFingerprintMaterial(input, input.variant ?? 0)}`);
  const keyPath = `courseBannerKeys/${fingerprint}`;
  const claimId = crypto.randomUUID();
  // A lease retry must never upload to an earlier worker's Blob key. Each
  // attempt has its own durable receipt until its remote outcome is known.
  const assetId = (await sha256(`${fingerprint}:${claimId}`)).slice(0, 32);
  let ownsGeneration = false;

  try {
    const existingKey = await getStoredDocument(keyPath);
    const existingAssetId = typeof existingKey?.assetId === "string" ? existingKey.assetId : "";
    const reused = await reusableBanner(existingAssetId, model);
    if (reused) return reused;

    const claim = await runStoredDocumentTransaction([keyPath], (documents) => {
      const current = documents[keyPath];
      const leaseUntil = typeof current?.leaseUntil === "string"
        ? Date.parse(current.leaseUntil)
        : 0;
      if (current?.status === "generating" && leaseUntil > Date.now()) {
        return { writes: [], result: "wait" as const };
      }
      const now = new Date();
      return {
        writes: [{
          path: keyPath,
          data: {
            status: "generating",
            ownerUid: account.uid,
            accountGeneration: account.generation,
            assetId,
            claimId,
            styleVersion: STYLE_VERSION,
            leaseUntil: new Date(now.getTime() + GENERATION_LEASE_MS).toISOString(),
            updatedAt: now.toISOString(),
          },
        }],
        result: "generate" as const,
      };
    });
    if (claim === "wait") return await waitForReusableBanner(keyPath, model);
    ownsGeneration = true;

    const response = await client.images.generate({
      model,
      prompt: buildCourseBannerPrompt(input),
      n: 1,
      size: "1536x1024",
      quality: "low",
      background: "opaque",
      moderation: "auto",
      output_format: "webp",
      output_compression: 65,
      user: input.safetyIdentifier,
    });
    const data = response.data?.[0]?.b64_json;
    if (!data) throw new Error("The image provider returned no banner data.");

    const bytes = rawBase64Bytes(data);
    if (bytes <= 0 || bytes > MAX_STORED_IMAGE_BYTES) {
      throw new Error("The generated banner exceeded the storage budget.");
    }

    const createdAt = new Date().toISOString();
    const imageBytes = decodeBase64(data);
    const assetPath = `courseBannerAssets/${assetId}`;
    await runStoredDocumentTransaction([keyPath, assetPath], (documents) => {
      if (documents[keyPath]?.claimId !== claimId || documents[assetPath]) throw new AccountLifecycleError("This banner generation claim was superseded.");
      return { writes: [{ path: assetPath, data: {
      ownerUid: account.uid, accountGeneration: account.generation,
      claimId,
      ownership: "exclusive", status: "uploading", objectKey: `course-banners/${assetId}.webp`,
      contentType: "image/webp",
      bytes,
      width: 1536,
      height: 1024,
      model,
      styleVersion: STYLE_VERSION,
      fingerprint,
      createdAt,
      } }], result: undefined };
    });
    const objectStorage = await storeCourseBannerObject(assetId, imageBytes);
    await runWithBannerUploadReceipt({ ...account, assetId, claimId }, () => runStoredDocumentTransaction([assetPath], (documents) => ({
      writes: [{ path: assetPath, data: { ...documents[assetPath], status: "uploaded", ...(objectStorage ? { storage: objectStorage } : { data }), updatedAt: createdAt } }], result: undefined,
    })));
    await runStoredDocumentTransaction([keyPath], (documents) => ({ writes: documents[keyPath]?.claimId === claimId ? [{ path: keyPath, data: {
      ownerUid: account.uid, accountGeneration: account.generation,
      assetId,
      claimId,
      status: "ready",
      styleVersion: STYLE_VERSION,
      updatedAt: createdAt,
    } }] : [], result: undefined }));

    return {
      banner: { assetId, version: 1, generatedAt: createdAt },
      generated: true,
      model,
      costMicros: generationCostMicros(model),
    };
  } catch (error) {
    // An unknown Azure outcome retains the uploading marker for manual recovery.
    if (ownsGeneration) {
      await runStoredDocumentTransaction([keyPath], (documents) => ({ writes: documents[keyPath]?.claimId === claimId ? [{ path: keyPath, data: {
        status: "failed",
        ownerUid: account.uid, accountGeneration: account.generation,
        claimId,
        styleVersion: STYLE_VERSION,
        updatedAt: new Date().toISOString(),
      } }] : [], result: undefined })).catch(() => undefined);
    }
    console.error(
      "Course banner generation failed; the deterministic banner will be used.",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
