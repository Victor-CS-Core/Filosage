import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";

/**
 * Cloudflare R2 object storage via the Workers binding.
 *
 * When `CLOUDFLARE_R2_ENABLED=true` (or the FILOSAGE_R2 binding is present),
 * course images are stored in R2 instead of Azure Blob Storage. The R2
 * binding is resolved through the Cloudflare context (see cloudflare-context.ts).
 */

interface R2Object {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2Bucket {
  put(key: string, data: Uint8Array | ArrayBuffer, options?: {
    httpMetadata?: { contentType?: string; cacheControl?: string };
  }): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}

async function r2Bucket(): Promise<R2Bucket | null> {
  if (serverEnvironment.CLOUDFLARE_R2_ENABLED?.trim().toLowerCase() !== "true") return null;
  try {
    const { getR2Bucket } = await import("@/lib/cloudflare-context");
    const bucket = await getR2Bucket() as R2Bucket | null;
    return bucket;
  } catch {
    return null;
  }
}

export function isR2Enabled() {
  return serverEnvironment.CLOUDFLARE_R2_ENABLED?.trim().toLowerCase() === "true";
}

const IMAGE_METADATA = {
  httpMetadata: {
    contentType: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
  },
};

export async function storeR2Object(key: string, bytes: Uint8Array): Promise<"r2" | null> {
  const bucket = await r2Bucket();
  if (!bucket) return null;
  await bucket.put(key, bytes, IMAGE_METADATA);
  return "r2";
}

export async function readR2Object(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const bucket = await r2Bucket();
  if (!bucket) return null;
  const obj = await bucket.get(key);
  if (!obj) return null;
  const buffer = await obj.arrayBuffer();
  if (!buffer.byteLength) return null;
  return new Uint8Array(buffer);
}

export async function deleteR2Object(key: string): Promise<void> {
  const bucket = await r2Bucket();
  if (!bucket) throw new Error("R2 storage is unavailable for deletion.");
  await bucket.delete(key);
}
