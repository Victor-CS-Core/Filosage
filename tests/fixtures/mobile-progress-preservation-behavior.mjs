import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

// Web -> mobile -> web progress preservation against the real local store
// and the real route handlers. The seeded progress document is in the exact
// shape the web progress route persists (a completed lesson, a capstone
// assessment, and a recentOperations idempotency entry). A mobile
// completion must add its lesson without erasing the web-owned fields, and
// the web GET must keep serving the capstone afterwards.
const directory = await mkdtemp(join(tmpdir(), 'filosage-mobile-progress-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = ''; process.env.OPENAI_API_KEY = ''; process.env.STRIPE_SECRET_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const { POST: mobilePOST } = await import('../../src/app/api/progress/mobile/route.ts');
const { GET: webGET } = await import('../../src/app/api/progress/route.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');

try {
  const suffix = crypto.randomUUID();
  const uid = `local-plus-learner-${suffix}`;
  const token = `playwright-plus-learner-${suffix}`;
  const courseId = `mobile-progress-course-${suffix}`;
  const generation = await lifecycle.captureAccountGeneration(uid);
  const capstone = {
    status: 'passed',
    summary: 'Capstone accepted by the web assessment flow.',
    criteria: [{ criterion: 'Ships a working artifact', met: true, feedback: 'Complete.' }],
    assessedAt: '2026-10-01T12:00:00.000Z',
    attempts: 1,
    history: [{ status: 'needs_revision', summary: 'First attempt.', criteria: [], assessedAt: '2026-09-30T12:00:00.000Z', attempts: 1 }],
  };
  const recentOperations = [{
    id: 'web-operation-1', fingerprint: 'fingerprint-1', observedAt: '2026-10-01T12:05:00.000Z',
    response: { nextReviewAt: '2026-10-03T12:00:00.000Z', calibration: 'aligned' },
  }];
  const webProgress = {
    courseId, topic: 'Mobile preservation course',
    lastLessonId: '0-0', lastLessonTitle: 'Web lesson',
    nextLessonId: '0-1', nextLessonTitle: 'Mobile lesson',
    completedLessonIds: ['0-0'],
    lessons: {
      '0-0': {
        lessonId: '0-0', lessonTitle: 'Web lesson', objectiveId: 'objective-m0', status: 'learned',
        evidenceAuthority: 'server-verified', attempts: 1, totalQuestions: 3, firstAttemptCorrect: 3,
        score: 1, confidence: 'high', calibration: 'aligned', performanceBand: 'strong',
        intervalStage: 1, nextReviewAt: '2026-10-03T12:00:00.000Z', lastStudiedAt: '2026-10-01T12:00:00.000Z',
        completedAt: '2026-10-01T12:00:00.000Z', estimatedMinutes: 10,
      },
    },
    totalLessons: 3,
    lastActivityAt: '2026-10-01T12:00:00.000Z',
    startedAt: '2026-10-01T11:00:00.000Z',
    studyMinutes: 10,
    capstone,
    recentOperations,
  };
  const course = {
    authorId: uid, topic: 'Mobile preservation course', isPublic: false,
    modules: [{
      title: 'Foundations', objective: 'Learn the basics',
      lessons: [
        { title: 'Web lesson', estimatedMinutes: 10 },
        { title: 'Mobile lesson', estimatedMinutes: 12 },
        { title: 'Final lesson', estimatedMinutes: 8 },
      ],
    }],
  };
  await lifecycle.runWithAccountGeneration(generation, () => documents.putStoredDocuments([
    { path: `users/${uid}`, data: { uid, plan: 'free', subscriptionStatus: 'none', acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION } },
    { path: `courses/${courseId}`, data: course },
    { path: `users/${uid}/courseProgress/${courseId}`, data: webProgress },
  ]));
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'https://filosage.invalid' };
  const completeOnMobile = async (lessonId) => {
    const response = await mobilePOST(new Request('https://filosage.invalid/api/progress/mobile', {
      method: 'POST', headers, body: JSON.stringify({ courseId, lessonId }),
    }));
    return { status: response.status, body: await response.json() };
  };
  const storedProgress = () => documents.getStoredDocument(`users/${uid}/courseProgress/${courseId}`);

  // Mobile completes lesson 0-1: capstone and recentOperations survive.
  const first = await completeOnMobile('0-1');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.alreadyCompleted, false);
  let stored = await storedProgress();
  assert.deepEqual(stored.capstone, capstone, 'mobile completion must preserve the capstone assessment');
  assert.deepEqual(stored.recentOperations, recentOperations, 'mobile completion must preserve recentOperations');
  assert(stored.completedLessonIds.includes('0-1'), 'mobile lesson recorded');
  assert.equal(stored.lessons['0-1'].status, 'learned');
  assert.equal(stored.studyMinutes, 22, 'study minutes accumulate (10 web + 12 mobile)');

  // The web read path serves the preserved capstone after the mobile write.
  const webRead = await webGET(new Request(`https://filosage.invalid/api/progress?courseId=${courseId}`, { headers }));
  assert.equal(webRead.status, 200);
  const webBody = await webRead.json();
  assert.equal(webBody.progress.capstone.status, 'passed');
  assert.equal(webBody.progress.capstone.summary, capstone.summary);
  assert(webBody.progress.completedLessonIds.includes('0-1'));

  // A second mobile completion still preserves everything.
  const second = await completeOnMobile('0-2');
  assert.equal(second.status, 200, JSON.stringify(second.body));
  stored = await storedProgress();
  assert.deepEqual(stored.capstone, capstone);
  assert.deepEqual(stored.recentOperations, recentOperations);
  assert.deepEqual([...stored.completedLessonIds].sort(), ['0-0', '0-1', '0-2']);

  // Re-sending a completion is idempotent and rewrites nothing.
  const retry = await completeOnMobile('0-1');
  assert.equal(retry.status, 200);
  assert.equal(retry.body.alreadyCompleted, true);
  stored = await storedProgress();
  assert.deepEqual(stored.capstone, capstone);
  assert.deepEqual(stored.recentOperations, recentOperations);
  assert.equal(stored.lessons['0-1'].completedAt, first.body.progress.lessons['0-1'].completedAt ?? stored.lessons['0-1'].completedAt);

  console.log('MOBILE_PROGRESS_PRESERVATION_OK');
} finally {
  await rm(directory, { recursive: true, force: true });
}
