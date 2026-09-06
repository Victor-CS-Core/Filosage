import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { mock } from 'node:test';

// Route handlers and the real local document transaction adapter execute here.
// Only the writer pause point is substituted. This is not PostgreSQL evidence.
const directory = await mkdtemp(join(tmpdir(), 'filosage-account-deletion-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.OPENAI_API_KEY = '';
process.env.STRIPE_SECRET_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');
const uid = 'local-free-learner-api';
const courseId = 'deletion-race-course';
const latePath = `users/${uid}/learningOutcomes/${courseId}`;
const now = new Date().toISOString();
let paused;
const writerPaused = new Promise(resolve => { paused = resolve; });
let release;
const writerRelease = new Promise(resolve => { release = resolve; });
mock.module(new URL('../../src/lib/document-store.ts', import.meta.url).href, {
  namedExports: {
    ...documents,
    async putStoredDocument(path, data) {
      if (path === latePath) {
        paused();
        await writerRelease;
      }
      return documents.putStoredDocument(path, data);
    },
  },
});
const headers = {
  authorization: 'Bearer playwright-free-learner-api',
  'x-reauthentication-token': 'playwright-free-learner-api',
  'content-type': 'application/json',
  origin: 'https://filosage.invalid',
};
try {
  const generation = await lifecycle.captureAccountGeneration(uid);
  await lifecycle.runWithAccountGeneration(generation, () => documents.putStoredDocuments([
    { path: `users/${uid}`, data: { uid, email: 'learner-api@filosage.local', plan: 'free', subscriptionStatus: 'none', acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION, createdAt: now, updatedAt: now } },
    { path: `courses/${courseId}`, data: { authorId: uid, topic: 'Deletion race', isPublic: false, modules: [{ title: 'Evidence', lessons: [{ title: 'Observe', concept: 'Describe evidence.' }] }] } },
    { path: `courses/${courseId}/lessons/0-0`, data: { content: 'Private authored lesson' } },
    { path: `users/${uid}/lessonNotes/note-a`, data: { key: `${courseId}:0-0`, note: 'Private note' } },
    { path: `users/${uid}/courseProgress/${courseId}`, data: { courseId, completedLessonIds: ['0-0'] } },
    { path: `users/${uid}/masteryEvidence/evidence-a`, data: { courseId, label: 'Private evidence' } },
    { path: `users/${uid}/courseCredits/current`, data: { uid, balance: 2 } },
    { path: `users/${uid}/evidenceShareRefs/share-a`, data: { courseId, ownerUid: uid } },
    { path: 'evidenceShares/share-a', data: { courseId, ownerUid: uid, report: 'Private shared report' } },
    { path: 'commandCenterTickets/support-a', data: { relatedUserId: uid, source: 'user_support', title: 'Private support request', messages: [] } },
    { path: `users/${uid}/legalAcceptances/acceptance-a`, data: { uid, acceptedAt: now, termsVersion: TERMS_VERSION } },
  ]));
  const { PUT } = await import('../../src/app/api/mastery/route.ts');
  const { DELETE } = await import('../../src/app/api/account/data/route.ts');
  const pending = PUT(new Request('https://filosage.invalid/api/mastery', {
    method: 'PUT', headers, body: JSON.stringify({
      courseId, courseTopic: 'Deletion race', desiredOutcome: 'Explain private evidence', applicationContext: 'Private learning context',
      targetArtifact: 'An explanation', weeklyMinutes: 60,
      diagnostics: [{ objectiveId: 'objective-m0-l0', moduleIndex: 0, moduleTitle: 'Evidence', objective: 'Describe evidence.', level: 'new' }],
      recommendedLessonId: '0-0', explanation: 'Start with observation.', createdAt: now, updatedAt: now,
    }),
  }));
  await Promise.race([writerPaused, pending.then(async response => { throw new Error(`Writer did not reach pause: ${response.status} ${await response.text()}`); })]);
  const deletion = await DELETE(new Request('https://filosage.invalid/api/account/data', {
    method: 'DELETE', headers, body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
  }));
  const deletionBody = await deletion.json();
  assert.equal(deletion.status, 202, JSON.stringify(deletionBody));
  assert.equal(deletionBody.deleted, false);
  assert.equal(deletionBody.activeDataRemoved, true);
  assert.equal(deletionBody.stage, "retention_review");
  assert.equal(await documents.getStoredDocument(`users/${uid}`), null);
  release();
  const late = await pending;
  assert.equal(late.status, 403, 'A request authorized before deletion was allowed to commit after account removal');
  assert.equal(await documents.getStoredDocument(latePath), null, 'The late mastery write recreated deleted learner work');
  console.log('ACCOUNT_DELETION_RECOVERY_BEHAVIOR_OK');
} finally {
  release();
  mock.restoreAll();
  await rm(directory, { recursive: true, force: true });
}
