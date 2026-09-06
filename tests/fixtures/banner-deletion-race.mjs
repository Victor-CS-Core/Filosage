import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { mock } from 'node:test';
const directory = await mkdtemp(join(tmpdir(), 'filosage-banner-deletion-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = '';
process.env.OPENAI_API_KEY = 'fixture-only-no-network'; process.env.COURSE_BANNERS_ENABLED = 'true';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const storage = await import('../../src/lib/course-banner-storage.ts');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const started = [deferred(), deferred()]; const finish = [deferred(), deferred()];
const objects = new Set(); const uploads = [];
mock.module(new URL('../../src/lib/course-banner-storage.ts', import.meta.url).href, { namedExports: {
  ...storage,
  async storeCourseBannerObject(assetId) {
    const index = uploads.length; uploads.push(assetId); started[index].resolve();
    await finish[index].promise; objects.add(assetId); return 'azure-blob';
  },
  async deleteExclusiveCourseBannerObject(assetId, asset) { assert.equal(asset.ownership, 'exclusive'); objects.delete(assetId); },
} });
const { createOrReuseCourseBanner } = await import('../../src/lib/course-banners.ts');
const { beginAccountDeletion, resumeAccountDeletion } = await import('../../src/lib/account-deletion.ts');
const uid = `banner-race-${crypto.randomUUID()}`;
const account = await lifecycle.captureAccountGeneration(uid);
const input = { topic: 'Race safety', safetyIdentifier: 'fixture-only' };
const client = { images: { generate: async () => ({ data: [{ b64_json: 'dGVzdA==' }] }) } };
try {
  await lifecycle.runWithAccountGeneration(account, () => documents.putStoredDocument(`users/${uid}`, { uid, plan: 'free', subscriptionStatus: 'none' }));
  const first = lifecycle.runWithAccountGeneration(account, () => createOrReuseCourseBanner(client, input));
  await started[0].promise;
  const key = (await documents.listAllStoredDocuments('courseBannerKeys', 10))[0];
  const keyPath = `courseBannerKeys/${key.id}`;
  await lifecycle.runWithAccountGeneration(account, () => documents.putStoredDocument(keyPath, { ...key, leaseUntil: new Date(0).toISOString() }));
  const second = lifecycle.runWithAccountGeneration(account, () => createOrReuseCourseBanner(client, input));
  await started[1].promise;
  assert.notEqual(uploads[0], uploads[1], 'Expired attempts must have separate remote object keys');
  const currentKey = await documents.getStoredDocument(keyPath);
  const firstAssetPath = `courseBannerAssets/${uploads[0]}`;
  await assert.rejects(lifecycle.runWithBannerUploadReceipt({ ...account, assetId: uploads[0], claimId: currentKey.claimId }, () => documents.runStoredDocumentTransaction([firstAssetPath], (current) => ({
    writes: [{ path: firstAssetPath, data: { ...current[firstAssetPath], status: 'uploaded' } }], result: undefined,
  }))), lifecycle.AccountLifecycleError);
  finish[0].resolve(); assert((await first)?.generated);
  assert.equal((await documents.getStoredDocument(keyPath)).claimId, currentKey.claimId, 'Old completion must not replace the new claim');
  const job = await lifecycle.runWithAccountGeneration(account, () => beginAccountDeletion(uid));
  const pending = await resumeAccountDeletion(job);
  assert.equal(pending.status, 409); assert.equal(pending.body.activeDataRemoved, false);
  assert.equal(pending.body.code, 'ACCOUNT_DELETION_WAITING_FOR_ASSET_UPLOAD');
  assert.equal((await documents.getStoredDocument(`courseBannerAssets/${uploads[1]}`)).status, 'uploading');
  finish[1].resolve(); await second;
  assert.equal((await documents.getStoredDocument(`courseBannerAssets/${uploads[1]}`)).status, 'uploaded', 'The exact late receipt must survive the account fence');
  const completed = await resumeAccountDeletion(job);
  assert.equal(completed.status, 202); assert.equal(completed.body.activeDataRemoved, true);
  assert.equal(objects.size, 0, 'All completed remote uploads must be removed before success');
  for (const assetId of uploads) assert.equal(await documents.getStoredDocument(`courseBannerAssets/${assetId}`), null);
  console.log('BANNER_DELETION_RACE_OK attempts=2 distinct-object-keys=true late-receipt=claim-bound no-remote-resurrection=true');
} finally { finish.forEach(item => item.resolve()); mock.restoreAll(); await rm(directory, { recursive: true, force: true }); }
