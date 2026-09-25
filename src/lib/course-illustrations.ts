import "server-only";

import type OpenAI from "openai";
import {
  AccountLifecycleError,
  currentAccountGeneration,
  runWithIllustrationUploadReceipt,
} from "@/lib/account-lifecycle";
import type { ServerAccount } from "@/lib/account-server";
import type { CourseBanner, CourseIllustration } from "@/lib/course-types";
import {
  getStoredDocument,
  runStoredDocumentTransaction,
} from "@/lib/document-store";
import {
  storeCourseIllustrationObject,
} from "@/lib/course-illustration-storage";
import { COURSE_ILLUSTRATION_STYLE_VERSION } from "@/lib/course-illustration-prompt";
import { finalizeAiUsage, reserveAiUsage } from "@/lib/ai-usage";
import {
  reserveCourseIllustrationBudget,
  settleCourseIllustrationBudget,
  CourseIllustrationBudgetExceededError,
  type CourseIllustrationBudgetTier,
} from "@/lib/course-illustration-budget";
import { serverEnvironment } from "@/lib/runtime-environment";

const STYLE_VERSION = COURSE_ILLUSTRATION_STYLE_VERSION;
const MAX_STORED_IMAGE_BYTES = 650_000;
const GENERATION_LEASE_MS = 90_000;
const GENERATION_WAIT_MS = 18_000;

export type CourseIllustrationKind = "hero" | "module" | "lesson";

interface IllustrationModelSpec {
  model: string;
  size: "1536x1024" | "1024x1024";
  quality: "low" | "medium";
  width: number;
  height: number;
  costMicros: number;
}

function modelSpecFor(kind: CourseIllustrationKind): IllustrationModelSpec {
  if (kind === "hero") {
    // Flagship model for the premium first impression (browse cards, course page).
    // Measured 2026-09-25 via Responses API tool_usage: $0.0107/image at medium.
    const model = serverEnvironment.OPENAI_COURSE_HERO_IMAGE_MODEL?.trim() || "gpt-image-2.5-sunburst";
    return { model, size: "1536x1024", quality: "medium", width: 1536, height: 1024, costMicros: 10_700 };
  }
  // Speed-optimized model for the higher-volume module/lesson illustrations.
  // Measured 2026-09-25: $0.0063/image at low quality, visually near-identical
  // to medium for our text-free decorative style, zero text artifacts.
  const model = serverEnvironment.OPENAI_COURSE_IMAGE_MODEL?.trim() || "gpt-image-2.5-flare";
  return { model, size: "1024x1024", quality: "low", width: 1024, height: 1024, costMicros: 6_300 };
}

export interface CourseIllustrationInput {
  kind: CourseIllustrationKind;
  /** Stable subject identity inside the course, e.g. "module:2" or "lesson:1-3". */
  subjectKey: string;
  prompt: string;
  fingerprintMaterial: string;
  safetyIdentifier: string;
  /**
   * When set (with budgetTier), generation reserves against the course's hard
   * illustration spend cap before any provider cost is incurred. Reused
   * artwork costs nothing and never touches the budget.
   */
  courseId?: string;
  budgetTier?: CourseIllustrationBudgetTier;
}

export interface CourseIllustrationResult {
  illustration: CourseIllustration | CourseBanner;
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

function isEnabled() {
  const flag = serverEnvironment.COURSE_ILLUSTRATIONS_ENABLED?.trim().toLowerCase();
  return flag !== "false" && Boolean(serverEnvironment.OPENAI_API_KEY);
}

async function reusableIllustration(
  assetId: string,
  kind: CourseIllustrationKind,
  fallbackModel: string,
): Promise<CourseIllustrationResult | null> {
  if (!/^[a-f0-9]{32}$/.test(assetId)) return null;
  const asset = await getStoredDocument(`courseIllustrationAssets/${assetId}`);
  if (!asset || asset.contentType !== "image/webp" || (asset.status && asset.status !== "uploaded")) return null;
  if (asset.kind !== kind) return null;
  const available = asset.storage === "azure-blob" || typeof asset.data === "string";
  if (!available) return null;
  const illustration: CourseIllustration | CourseBanner = kind === "hero"
    ? { assetId, version: 1, generatedAt: typeof asset.createdAt === "string" ? asset.createdAt : undefined }
    : { assetId, version: 1, kind, generatedAt: typeof asset.createdAt === "string" ? asset.createdAt : undefined };
  return { illustration, generated: false, model: typeof asset.model === "string" ? asset.model : fallbackModel, costMicros: 0 };
}

async function waitForReusableIllustration(keyPath: string, kind: CourseIllustrationKind, model: string) {
  const deadline = Date.now() + GENERATION_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    const key = await getStoredDocument(keyPath);
    const assetId = typeof key?.assetId === "string" ? key.assetId : "";
    const reused = await reusableIllustration(assetId, kind, model);
    if (reused) return reused;
    if (key?.status === "failed") return null;
  }
  return null;
}

/**
 * Generate (or reuse) one course illustration with per-subject dedup, a
 * generation lease so concurrent triggers don't double-spend, and exact
 * cost recording in the AI usage ledger. Returns null when illustrations are
 * disabled or generation failed — callers must treat imagery as enhancement,
 * never as load-bearing.
 */
export async function createOrReuseCourseIllustration(
  client: OpenAI,
  account: ServerAccount,
  input: CourseIllustrationInput,
): Promise<CourseIllustrationResult | null> {
  if (!isEnabled()) return null;

  const spec = modelSpecFor(input.kind);
  const generation = currentAccountGeneration();
  if (!generation) throw new AccountLifecycleError("Illustration generation requires an account generation.");
  const fingerprint = await sha256(`${generation.uid}:${generation.generation}:${input.kind}:${input.fingerprintMaterial}`);
  const keyPath = `courseIllustrationKeys/${fingerprint}`;
  const claimId = crypto.randomUUID();
  // A lease retry must never upload to an earlier worker's Blob key. Each
  // attempt has its own durable receipt until its remote outcome is known.
  const assetId = (await sha256(`${fingerprint}:${claimId}`)).slice(0, 32);
  let ownsGeneration = false;
  let budgetReservation: string | null = null;

  try {
    const existingKey = await getStoredDocument(keyPath);
    const existingAssetId = typeof existingKey?.assetId === "string" ? existingKey.assetId : "";
    const reused = await reusableIllustration(existingAssetId, input.kind, spec.model);
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
            kind: input.kind,
            subjectKey: input.subjectKey,
            ownerUid: generation.uid,
            accountGeneration: generation.generation,
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
    if (claim === "wait") return await waitForReusableIllustration(keyPath, input.kind, spec.model);
    ownsGeneration = true;

    // Hard per-course spend cap first: the budget reservation fails before any
    // provider cost when the course already spent its Tier B/C envelope.
    if (input.courseId && input.budgetTier) {
      budgetReservation = await reserveCourseIllustrationBudget(input.courseId, input.budgetTier, spec.costMicros);
      if (!budgetReservation) {
        console.warn(
          `Course illustration skipped for course ${input.courseId}: per-course illustration budget exceeded.`,
        );
        throw new CourseIllustrationBudgetExceededError(input.courseId);
      }
    }

    // Reserve AI budget first: quota/overspend fails before any provider cost.
    const reservation = await reserveAiUsage(
      account,
      "course_banner",
      `course-illustration-${claimId}`,
      fingerprint,
    );
    let responseId: string | undefined;
    try {
      const response = await client.images.generate({
        model: spec.model,
        prompt: input.prompt,
        n: 1,
        size: spec.size,
        quality: spec.quality,
        background: "opaque",
        moderation: "auto",
        output_format: "webp",
        output_compression: 65,
        user: input.safetyIdentifier,
      });
      responseId = typeof response.created !== "undefined" ? `img_${assetId}` : undefined;
      const data = response.data?.[0]?.b64_json;
      if (!data) throw new Error("The image provider returned no illustration data.");

      const bytes = rawBase64Bytes(data);
      if (bytes <= 0 || bytes > MAX_STORED_IMAGE_BYTES) {
        throw new Error("The generated illustration exceeded the storage budget.");
      }

      const createdAt = new Date().toISOString();
      const imageBytes = decodeBase64(data);
      const assetPath = `courseIllustrationAssets/${assetId}`;
      await runStoredDocumentTransaction([keyPath, assetPath], (documents) => {
        if (documents[keyPath]?.claimId !== claimId || documents[assetPath]) throw new AccountLifecycleError("This illustration generation claim was superseded.");
        return { writes: [{ path: assetPath, data: {
          ownerUid: generation.uid, accountGeneration: generation.generation,
          claimId,
          kind: input.kind,
          subjectKey: input.subjectKey,
          ownership: "exclusive", status: "uploading", objectKey: `course-illustrations/${assetId}.webp`,
          contentType: "image/webp",
          bytes,
          width: spec.width,
          height: spec.height,
          model: spec.model,
          styleVersion: STYLE_VERSION,
          fingerprint,
          createdAt,
        } }], result: undefined };
      });
      const objectStorage = await storeCourseIllustrationObject(assetId, imageBytes);
      await runWithIllustrationUploadReceipt({ ...generation, assetId, claimId }, () => runStoredDocumentTransaction([assetPath], (documents) => ({
        writes: [{ path: assetPath, data: { ...documents[assetPath], status: "uploaded", ...(objectStorage ? { storage: objectStorage } : { data }), updatedAt: createdAt } }], result: undefined,
      })));
      await finalizeAiUsage(reservation, {
        model: spec.model,
        usageSamples: [{
          model: spec.model,
          inputTokens: 0,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
          fixedCostMicros: spec.costMicros,
          promptVersion: String(STYLE_VERSION),
        }],
        ...(responseId ? { responseId } : {}),
        resultId: assetId,
      });
      if (budgetReservation && input.courseId) {
        await settleCourseIllustrationBudget(input.courseId, budgetReservation, "spent").catch(() => undefined);
        budgetReservation = null;
      }
      await runStoredDocumentTransaction([keyPath], (documents) => ({ writes: documents[keyPath]?.claimId === claimId ? [{ path: keyPath, data: {
        status: "ready",
        kind: input.kind,
        subjectKey: input.subjectKey,
        ownerUid: generation.uid, accountGeneration: generation.generation,
        assetId,
        claimId,
        styleVersion: STYLE_VERSION,
        updatedAt: createdAt,
      } }] : [], result: undefined }));

      const illustration: CourseIllustration | CourseBanner = input.kind === "hero"
        ? { assetId, version: 1, generatedAt: createdAt }
        : { assetId, version: 1, kind: input.kind, generatedAt: createdAt };
      return { illustration, generated: true, model: spec.model, costMicros: spec.costMicros };
    } catch (error) {
      // Release the unused budget reservation on provider failure.
      await finalizeAiUsage(reservation, { failed: true, providerOutcome: "not_started", model: spec.model }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    // Release the held per-course budget reservation on any failure path.
    if (budgetReservation && input.courseId) {
      await settleCourseIllustrationBudget(input.courseId, budgetReservation, "released").catch(() => undefined);
    }
    // An unknown Azure outcome retains the uploading marker for manual recovery.
    if (ownsGeneration) {
      await runStoredDocumentTransaction([keyPath], (documents) => ({ writes: documents[keyPath]?.claimId === claimId ? [{ path: keyPath, data: {
        status: "failed",
        kind: input.kind,
        subjectKey: input.subjectKey,
        ownerUid: generation.uid,
        accountGeneration: generation.generation,
        claimId,
        styleVersion: STYLE_VERSION,
        updatedAt: new Date().toISOString(),
      } }] : [], result: undefined })).catch(() => undefined);
    }
    console.error(
      "Course illustration generation failed; the deterministic artwork will be used.",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
