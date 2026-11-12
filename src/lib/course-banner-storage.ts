import "server-only";

import { deleteR2Object, isR2Enabled, readR2Object, storeR2Object } from "@/lib/r2-storage";

const OBJECT_PREFIX = "course-banners";

function objectKey(assetId: string) {
  return `${OBJECT_PREFIX}/${assetId}.webp`;
}

export async function storeCourseBannerObject(assetId: string, bytes: Uint8Array) {
  if (!isR2Enabled()) return null;
  return storeR2Object(objectKey(assetId), bytes);
}

export async function readCourseBannerObject(assetId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!isR2Enabled()) return null;
  return readR2Object(objectKey(assetId));
}

// Caller proves the asset is exclusive and no surviving course references it.
// Deletion is idempotent; an unknown remote result keeps the durable job.
export async function deleteExclusiveCourseBannerObject(assetId: string, asset: Record<string, unknown>) {
  if (!/^[a-f0-9]{32}$/.test(assetId) || asset.ownership !== "exclusive" || typeof asset.ownerUid !== "string") throw new Error("Banner ownership is unverified.");
  if (asset.storage !== "r2") return;
  if (!isR2Enabled()) throw new Error("Banner storage is unavailable for deletion.");
  await deleteR2Object(objectKey(assetId));
}
