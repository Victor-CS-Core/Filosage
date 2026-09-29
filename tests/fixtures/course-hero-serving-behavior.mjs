import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

// The banner route serves legacy banners and Tier B/C illustration heroes from
// the real local store (inline bytes; no Blob storage configured).
const directory = await mkdtemp(join(tmpdir(), 'filosage-hero-serving-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = '';
const documents = await import('../../src/lib/document-store.ts');
const { GET } = await import('../../src/app/api/course-banners/[assetId]/route.ts');

const payload = 'dGllci1jLWhlcm8='; // "tier-c-hero"
const asset = (extra) => ({ contentType: 'image/webp', bytes: 11, data: payload, ...extra });
const fetchBanner = async (assetId) => {
  const response = await GET(new Request(`https://filosage.invalid/api/course-banners/${assetId}`), { params: Promise.resolve({ assetId }) });
  return { status: response.status, body: response.status === 200 ? Buffer.from(await response.arrayBuffer()).toString() : null };
};
const [legacy, hero, moduleArt, uploading] = ['a', 'b', 'c', 'd'].map((char) => char.repeat(32));

try {
  await documents.putStoredDocuments([
    { path: `courseBannerAssets/${legacy}`, data: asset({}) },
    { path: `courseIllustrationAssets/${hero}`, data: asset({ kind: 'hero', status: 'uploaded' }) },
    { path: `courseIllustrationAssets/${moduleArt}`, data: asset({ kind: 'module', status: 'uploaded' }) },
    { path: `courseIllustrationAssets/${uploading}`, data: asset({ kind: 'hero', status: 'uploading' }) },
  ]);
  assert.deepEqual(await fetchBanner(legacy), { status: 200, body: 'tier-c-hero' });
  assert.deepEqual(await fetchBanner(hero), { status: 200, body: 'tier-c-hero' });
  assert.equal((await fetchBanner(moduleArt)).status, 404);
  assert.equal((await fetchBanner(uploading)).status, 404);
  assert.equal((await fetchBanner('e'.repeat(32))).status, 404);
  console.log('COURSE_HERO_SERVING_BEHAVIOR_OK');
} finally {
  await rm(directory, { recursive: true, force: true });
}
