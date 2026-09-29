import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { mock } from 'node:test';

// Illustration generation against the real local store and per-course budget
// ledger. The image client, Blob upload and AI-usage ledger are substituted so
// each provider outcome can be forced and its accounting observed.
const directory = await mkdtemp(join(tmpdir(), 'filosage-illustration-accounting-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = '';
process.env.OPENAI_API_KEY = 'fixture-only-no-network'; process.env.COURSE_ILLUSTRATIONS_ENABLED = 'true';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const storage = await import('../../src/lib/course-illustration-storage.ts');
const aiUsage = await import('../../src/lib/ai-usage.ts');
let uploadFails = false;
const finalizations = [];
mock.module(new URL('../../src/lib/course-illustration-storage.ts', import.meta.url).href, { namedExports: {
  ...storage,
  async storeCourseIllustrationObject() { if (uploadFails) throw new Error('blob upload failed'); return null; },
} });
mock.module(new URL('../../src/lib/ai-usage.ts', import.meta.url).href, { namedExports: {
  ...aiUsage,
  async reserveAiUsage(_account, feature, requestId) { return { feature, requestId }; },
  async finalizeAiUsage(reservation, result) { finalizations.push({ reservation, result }); },
} });
const { createOrReuseCourseIllustration } = await import('../../src/lib/course-illustrations.ts');

const uid = `illustration-accounting-${crypto.randomUUID()}`;
const generation = await lifecycle.captureAccountGeneration(uid);
const account = { uid, plan: 'pro', isOwner: false };
const courseId = `accounting-course-${crypto.randomUUID()}`;
const budget = () => documents.getStoredDocument(`courseIllustrationBudgets/${courseId}`);
const generate = (client, subjectKey) => lifecycle.runWithAccountGeneration(generation, () => createOrReuseCourseIllustration(client, account, {
  kind: 'lesson', subjectKey, prompt: 'fixture prompt', fingerprintMaterial: subjectKey, safetyIdentifier: 'fixture', courseId, budgetTier: 'pro',
}));
const imageClient = { images: { generate: async () => ({ created: 1, data: [{ b64_json: 'dGVzdA==' }] }) } };

try {
  await lifecycle.runWithAccountGeneration(generation, () => documents.putStoredDocuments([
    { path: `users/${uid}`, data: { uid, plan: 'pro', subscriptionStatus: 'active' } },
    { path: `courses/${courseId}`, data: { authorId: uid, topic: 'Accounting' } },
  ]));

  // The call was dispatched but never answered: spend is uncertain, not "not started".
  const unanswered = await generate({ images: { generate: async () => { throw new Error('socket hang up'); } } }, 'lesson:0-0');
  assert.equal(unanswered, null);
  assert.equal(finalizations.length, 1);
  assert.equal(finalizations[0].result.failed, true);
  assert.equal(finalizations[0].result.providerOutcome, undefined);
  assert.equal(finalizations[0].result.usageSamples, undefined);
  assert.equal((await budget()).spentMicros, 0);
  assert.deepEqual((await budget()).reservations, {});

  // An image came back but storage failed: the provider billed it.
  uploadFails = true;
  const billedFailure = await generate(imageClient, 'lesson:0-1');
  assert.equal(billedFailure, null);
  assert.equal(finalizations.length, 2);
  assert.equal(finalizations[1].result.failed, true);
  assert.equal(finalizations[1].result.providerOutcome, undefined);
  assert.equal(finalizations[1].result.usageSamples[0].fixedCostMicros, 6_300);
  assert.equal((await budget()).spentMicros, 6_300);
  assert.deepEqual((await budget()).reservations, {});

  // Success finalizes exactly once, as billed and not failed.
  uploadFails = false;
  const success = await generate(imageClient, 'lesson:0-2');
  assert.equal(success.generated, true);
  assert.equal(finalizations.length, 3);
  assert.equal(finalizations[2].result.failed, undefined);
  assert.equal(finalizations[2].result.usageSamples[0].fixedCostMicros, 6_300);
  assert.equal((await budget()).spentMicros, 12_600);
  console.log('ILLUSTRATION_ACCOUNTING_BEHAVIOR_OK');
} finally {
  await rm(directory, { recursive: true, force: true });
}
