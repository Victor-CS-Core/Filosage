import "server-only";

const OBJECT_PREFIX = "course-banners";

interface StoredR2Object {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface CourseBannerBucket {
  get(key: string): Promise<StoredR2Object | null>;
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
}

declare global {
  // Set by the Sites worker before the application handles a request.
  // It remains undefined in the regular Next.js runtime, where Firestore is
  // retained as a backwards-compatible fallback.
  var __ERUDOZA_COURSE_BANNERS__: CourseBannerBucket | undefined;
}

function objectKey(assetId: string) {
  return `${OBJECT_PREFIX}/${assetId}.webp`;
}

export async function storeCourseBannerObject(assetId: string, bytes: Uint8Array) {
  const bucket = globalThis.__ERUDOZA_COURSE_BANNERS__;
  if (!bucket) return false;
  await bucket.put(objectKey(assetId), bytes, {
    httpMetadata: {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return true;
}

export async function readCourseBannerObject(assetId: string) {
  const bucket = globalThis.__ERUDOZA_COURSE_BANNERS__;
  if (!bucket) return null;
  const object = await bucket.get(objectKey(assetId));
  if (!object || object.size <= 0) return null;
  return new Uint8Array(await object.arrayBuffer());
}
