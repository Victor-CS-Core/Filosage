import "server-only";

import type OpenAI from "openai";
import type { CourseBanner } from "@/lib/course-types";
import {
  getStoredDocument,
  putStoredDocument,
} from "@/lib/firebase-server";

const STYLE_VERSION = 1;
const MAX_STORED_IMAGE_BYTES = 650_000;
const DEFAULT_MODEL = "gpt-image-1-mini";

interface CourseBannerInput {
  topic: string;
  category?: string;
  outcome?: string;
  mission?: string;
  safetyIdentifier: string;
}

export interface CourseBannerResult {
  banner: CourseBanner;
  generated: boolean;
  model: string;
  costMicros: number;
}

function normalized(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rawBase64Bytes(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function generationCostMicros(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  if (normalizedModel.startsWith("gpt-image-1-mini")) return 6_000;
  if (normalizedModel.startsWith("gpt-image-1")) return 16_000;
  return 16_000;
}

function promptFor(input: CourseBannerInput) {
  return [
    "Create a panoramic editorial course-cover image in Erudoza's standardized visual language.",
    `Subject: ${normalized(input.topic)}.`,
    input.category ? `Discipline: ${normalized(input.category)}.` : "",
    input.outcome ? `Learning outcome: ${normalized(input.outcome)}.` : "",
    input.mission ? `Course focus: ${normalized(input.mission)}.` : "",
    "Visual direction: a refined miniature physical model or still life that expresses the subject through one clear symbolic composition. Matte paper, ceramic, wood, or architectural forms; calm studio lighting; crisp edges; restrained depth; intelligent and quietly premium.",
    "Palette: deep navy as the anchor, with off-white, muted teal, clear blue, and at most one restrained coral detail. Keep saturation controlled and preserve readable tonal contrast in both light and dark interfaces.",
    "Composition: landscape 3:2. Keep the meaningful subject inside the central 70 percent so the same image can crop safely to a wide banner and a 2:1 course card. Leave calm negative space near the outer edges.",
    "Do not include text, letters, numbers, logos, watermarks, UI, frames, badges, gradients, faces, or generic stock-photo staging. Avoid visual clutter, fantasy spectacle, neon, glossy 3D, and literal classroom scenes.",
  ].filter(Boolean).join("\n");
}

function isEnabled() {
  const flag = process.env.COURSE_BANNERS_ENABLED?.trim().toLowerCase();
  return flag !== "false" && Boolean(process.env.OPENAI_API_KEY);
}

export async function createOrReuseCourseBanner(
  client: OpenAI,
  input: CourseBannerInput,
): Promise<CourseBannerResult | null> {
  if (!isEnabled()) return null;

  const model = process.env.OPENAI_COURSE_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
  const fingerprint = await sha256([
    STYLE_VERSION,
    normalized(input.topic).toLowerCase(),
    normalized(input.category).toLowerCase(),
    normalized(input.outcome).toLowerCase(),
    normalized(input.mission).toLowerCase(),
  ].join("|"));
  const keyPath = `courseBannerKeys/${fingerprint}`;

  try {
    const existingKey = await getStoredDocument(keyPath);
    const existingAssetId = typeof existingKey?.assetId === "string" ? existingKey.assetId : "";
    if (/^[a-f0-9]{32}$/.test(existingAssetId)) {
      const asset = await getStoredDocument(`courseBannerAssets/${existingAssetId}`);
      if (typeof asset?.data === "string" && asset.contentType === "image/webp") {
        return {
          banner: {
            assetId: existingAssetId,
            version: 1,
            generatedAt: typeof asset.createdAt === "string" ? asset.createdAt : undefined,
          },
          generated: false,
          model: typeof asset.model === "string" ? asset.model : model,
          costMicros: 0,
        };
      }
    }

    const response = await client.images.generate({
      model,
      prompt: promptFor(input),
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

    const assetId = crypto.randomUUID().replaceAll("-", "");
    const createdAt = new Date().toISOString();
    await putStoredDocument(`courseBannerAssets/${assetId}`, {
      data,
      contentType: "image/webp",
      bytes,
      width: 1536,
      height: 1024,
      model,
      styleVersion: STYLE_VERSION,
      fingerprint,
      createdAt,
    });
    await putStoredDocument(keyPath, {
      assetId,
      styleVersion: STYLE_VERSION,
      updatedAt: createdAt,
    });

    return {
      banner: { assetId, version: 1, generatedAt: createdAt },
      generated: true,
      model,
      costMicros: generationCostMicros(model),
    };
  } catch (error) {
    console.error(
      "Course banner generation failed; the deterministic banner will be used.",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
