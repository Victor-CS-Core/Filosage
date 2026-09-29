import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { mock } from 'node:test';

// Tier C records (illustrations, per-course budgets, credit-back receipts)
// against the real local document store. Only Azure Blob calls are substituted.
const directory = await mkdtemp(join(tmpdir(), 'filosage-tier-c-deletion-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = ''; process.env.OPENAI_API_KEY = ''; process.env.STRIPE_SECRET_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const illustrationStorage = await import('../../src/lib/course-illustration-storage.ts');
const deletedIllustrations = [];
mock.module(new URL('../../src/lib/course-illustration-storage.ts', import.meta.url).href, { namedExports: {
  ...illustrationStorage,
  async deleteExclusiveCourseIllustrationObject(assetId, asset) { assert.equal(asset.ownership, 'exclusive'); deletedIllustrations.push(assetId); },
} });
const { DELETE } = await import('../../src/app/api/account/data/route.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');
const { refundCourseCreditForDeletedCourse } = await import('../../src/lib/course-credits.ts');

async function seed(extra = []) {
  const suffix = crypto.randomUUID(); const uid = `local-plus-learner-${suffix}`;
  const token = `playwright-plus-learner-${suffix}`;
  const generation = await lifecycle.captureAccountGeneration(uid);
  await lifecycle.runWithAccountGeneration(generation, () => documents.putStoredDocuments([
    { path: `users/${uid}`, data: { uid, plan: 'free', subscriptionStatus: 'none', acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION } },
    ...extra.map(entry => entry(uid, generation.generation)),
  ]));
  const headers = { authorization: `Bearer ${token}`, 'x-reauthentication-token': token, 'content-type': 'application/json', origin: 'https://filosage.invalid' };
  return { uid, generation, headers };
}
const deletion = async (account) => {
  const response = await DELETE(new Request('https://filosage.invalid/api/account/data', { method: 'DELETE', headers: account.headers, body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }) }));
  return { status: response.status, body: await response.json() };
};

try {
  // A Plus/Pro author with generated art, a spend ledger and a credit-back
  // receipt can delete their account without manual review.
  const heroId = '1'.repeat(32); const moduleId = '2'.repeat(32); const keyId = 'f'.repeat(64);
  const courseId = `tier-c-course-${crypto.randomUUID()}`;
  const author = await seed([
    uid => ({ path: `courses/${courseId}`, data: { authorId: uid, topic: 'Knife skills', banner: { assetId: heroId, version: 1 }, modules: [{ title: 'Grip', illustration: { assetId: moduleId, version: 1, kind: 'module' } }] } }),
    (uid, generation) => ({ path: `courseIllustrationAssets/${heroId}`, data: { ownerUid: uid, accountGeneration: generation, ownership: 'exclusive', status: 'uploaded', storage: 'azure-blob', kind: 'hero', contentType: 'image/webp' } }),
    (uid, generation) => ({ path: `courseIllustrationAssets/${moduleId}`, data: { ownerUid: uid, accountGeneration: generation, ownership: 'exclusive', status: 'uploaded', storage: 'azure-blob', kind: 'module', contentType: 'image/webp' } }),
    (uid, generation) => ({ path: `courseIllustrationKeys/${keyId}`, data: { ownerUid: uid, accountGeneration: generation, status: 'ready', assetId: heroId, kind: 'hero' } }),
    () => ({ path: `courseIllustrationBudgets/${courseId}`, data: { courseId, tier: 'pro', capMicros: 220_000, reservations: {}, spentMicros: 17_000 } }),
    uid => ({ path: `users/${uid}/courseCreditRefunds/old-course`, data: { uid, courseId: 'old-course', refundedAt: new Date().toISOString(), monthKey: '2026-09' } }),
    uid => ({ path: `users/${uid}/courseCreditRefundMonths/2026-09`, data: { uid, monthKey: '2026-09', refunds: 1 } }),
  ]);
  const removed = await deletion(author);
  assert.equal(removed.status, 202, JSON.stringify(removed));
  assert.equal(removed.body.activeDataRemoved, true);
  for (const path of [`courses/${courseId}`, `courseIllustrationAssets/${heroId}`, `courseIllustrationAssets/${moduleId}`, `courseIllustrationKeys/${keyId}`,
    `courseIllustrationBudgets/${courseId}`, `users/${author.uid}/courseCreditRefunds/old-course`, `users/${author.uid}/courseCreditRefundMonths/2026-09`]) {
    assert.equal(await documents.getStoredDocument(path), null, `${path} must be removed`);
  }
  assert.deepEqual([...deletedIllustrations].sort(), [heroId, moduleId]);

  // An in-flight upload holds deletion until its receipt lands. The receipt
  // scope may record only the upload outcome, even while the account is fenced.
  const uploadingId = '3'.repeat(32);
  const uploader = await seed([
    (uid, generation) => ({ path: `courseIllustrationAssets/${uploadingId}`, data: { ownerUid: uid, accountGeneration: generation, claimId: 'upload-claim', ownership: 'exclusive', status: 'uploading', storage: 'azure-blob', kind: 'lesson', contentType: 'image/webp' } }),
  ]);
  const waiting = await deletion(uploader);
  assert.equal(waiting.status, 409, JSON.stringify(waiting));
  assert.equal(waiting.body.code, 'ACCOUNT_DELETION_WAITING_FOR_ASSET_UPLOAD');
  const assetPath = `courseIllustrationAssets/${uploadingId}`;
  const receipt = (patch) => lifecycle.runWithIllustrationUploadReceipt({ ...uploader.generation, assetId: uploadingId, claimId: 'upload-claim' },
    () => documents.runStoredDocumentTransaction([assetPath], (current) => ({ writes: [{ path: assetPath, data: { ...current[assetPath], ...patch } }], result: undefined })));
  await assert.rejects(receipt({ status: 'uploaded', ownerUid: 'someone-else' }), lifecycle.AccountLifecycleError);
  await assert.rejects(lifecycle.runWithIllustrationUploadReceipt({ ...uploader.generation, assetId: uploadingId, claimId: 'upload-claim' },
    () => documents.putStoredDocument(`courseIllustrationKeys/${'e'.repeat(64)}`, { ownerUid: uploader.uid, accountGeneration: uploader.generation.generation, status: 'ready' })), lifecycle.AccountLifecycleError);
  await receipt({ status: 'uploaded' });
  const finished = await deletion(uploader);
  assert.equal(finished.status, 202, JSON.stringify(finished));
  assert.equal(await documents.getStoredDocument(assetPath), null);
  assert(deletedIllustrations.includes(uploadingId));

  // The credit-back commits with the course-root delete, exactly once.
  const refunder = await seed([
    uid => ({ path: `users/${uid}/courseCredits/current`, data: { uid, balance: 0, monthlyAllocation: 2, balanceCap: 4, schemaVersion: 'course-credits-v2' } }),
  ]);
  const refundAccount = { uid: refunder.uid, plan: 'plus', isOwner: false, accountStatus: 'active', subscriptionStatus: 'active', access: 'plus' };
  const refundCourse = `refund-course-${crypto.randomUUID()}`;
  await lifecycle.runWithAccountGeneration(refunder.generation, () => documents.putStoredDocument(`courses/${refundCourse}`, { authorId: refunder.uid, topic: 'Refundable' }));
  const redeemedAt = new Date().toISOString();
  const refundPath = `users/${refunder.uid}/courseCreditRefunds/${refundCourse}`;
  // A delete that fails before the root commit leaves the course and mints nothing.
  const failing = refundCourseCreditForDeletedCourse(refundAccount, { id: refundCourse, redeemedAt });
  await assert.rejects(lifecycle.runWithAccountGeneration(refunder.generation, () => documents.deleteCourse(refundCourse, {
    paths: failing.paths, apply: () => { throw new Error('interrupted before root commit'); },
  })), /interrupted/);
  assert(await documents.getStoredDocument(`courses/${refundCourse}`));
  assert.equal(await documents.getStoredDocument(refundPath), null);
  // The retry and a concurrent duplicate refund exactly once, with the root delete.
  const results = await lifecycle.runWithAccountGeneration(refunder.generation, () => Promise.all([
    documents.deleteCourse(refundCourse, refundCourseCreditForDeletedCourse(refundAccount, { id: refundCourse, redeemedAt })),
    documents.deleteCourse(refundCourse, refundCourseCreditForDeletedCourse(refundAccount, { id: refundCourse, redeemedAt })),
  ]));
  assert.equal(results.filter(({ rootResult }) => rootResult?.refunded).length, 1, JSON.stringify(results.map(({ rootResult }) => rootResult)));
  assert.equal(await documents.getStoredDocument(`courses/${refundCourse}`), null);
  assert(await documents.getStoredDocument(refundPath));
  assert.equal((await documents.getStoredDocument(`users/${refunder.uid}/courseCredits/current`)).balance, 1);
  console.log('TIER_C_DELETION_BEHAVIOR_OK');
} finally {
  await rm(directory, { recursive: true, force: true });
}
