import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

// Course-deletion credit-back against the real DELETE route and the real
// local document store: a successful deletion refunds exactly once, a
// retry does not refund again, and concurrent duplicate deletes cannot
// double-refund. (Failure/interruption recovery lives in
// course-credit-refund-recovery-behavior.mjs, which needs a failing
// deleteCourse stub.)
const directory = await mkdtemp(join(tmpdir(), 'filosage-credit-refund-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = ''; process.env.OPENAI_API_KEY = ''; process.env.STRIPE_SECRET_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const { DELETE } = await import('../../src/app/api/courses/[courseId]/route.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');

const now = new Date();
const iso = (date) => date.toISOString();
const plusThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

async function seedAccount() {
  const suffix = crypto.randomUUID();
  const uid = `local-plus-learner-${suffix}`;
  const token = `playwright-plus-learner-${suffix}`;
  const generation = await lifecycle.captureAccountGeneration(uid);
  await lifecycle.runWithAccountGeneration(generation, () => documents.putStoredDocuments([
    {
      path: `users/${uid}`,
      data: {
        uid, plan: 'plus', access: 'plus', accountStatus: 'active', subscriptionStatus: 'active', billingPlan: 'plus',
        currentPeriodEnd: iso(plusThirtyDays),
        acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION,
      },
    },
    {
      path: `users/${uid}/courseCredits/current`,
      data: {
        uid, schemaVersion: 'course-credits-v2', plan: 'plus', balance: 1,
        monthlyAllocation: 2, balanceCap: 24, periodGranted: 2,
        nextAccrualAt: iso(plusThirtyDays), frozenAt: null, frozenUntil: null, updatedAt: iso(now),
      },
    },
  ]));
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'https://filosage.invalid' };
  return { uid, generation, headers };
}

async function seedCourse(account, courseId) {
  await lifecycle.runWithAccountGeneration(account.generation, () => documents.putStoredDocument(`courses/${courseId}`, {
    authorId: account.uid, topic: 'Refundable course', isPublic: false,
    modules: [{ title: 'Only module', lessons: [{ title: 'Only lesson' }] }],
    generationGrant: { version: 'course-credits-v2', claimId: `claim-${courseId}`, lessonIds: ['0-0'], redeemedAt: iso(now), status: 'active' },
  }));
}

const deleteCourse = (account, courseId) => DELETE(
  new Request(`https://filosage.invalid/api/courses/${courseId}`, { method: 'DELETE', headers: account.headers }),
  { params: Promise.resolve({ courseId }) },
);
const balance = async (uid) => (await documents.getStoredDocument(`users/${uid}/courseCredits/current`))?.balance;
const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const monthRefunds = async (uid) => (await documents.getStoredDocument(`users/${uid}/courseCreditRefundMonths/${monthKey}`))?.refunds ?? 0;

try {
  // 1. Successful deletion refunds exactly once.
  const account = await seedAccount();
  const courseId = `refund-course-${crypto.randomUUID()}`;
  await seedCourse(account, courseId);
  const deleted = await deleteCourse(account, courseId);
  assert.equal(deleted.status, 200, await deleted.clone().text().catch(() => ''));
  const deletedBody = await deleted.json();
  assert.equal(deletedBody.creditBack?.refunded, true, JSON.stringify(deletedBody));
  assert.equal(await documents.getStoredDocument(`courses/${courseId}`), null, 'course is deleted');
  assert.equal(await balance(account.uid), 2, 'balance increases by exactly one');
  assert.equal(await monthRefunds(account.uid), 1, 'monthly counter is one');
  assert(await documents.getStoredDocument(`users/${account.uid}/courseCreditRefunds/${courseId}`), 'refund receipt exists');
  const intent = await documents.getStoredDocument(`users/${account.uid}/courseCreditRefundIntents/${courseId}`);
  assert.equal(intent?.status, 'settled', 'intent is settled after a clean refund');
  assert.equal(intent?.outcome, 'refunded');

  // 2. Retrying the same delete cannot refund again.
  const retry = await deleteCourse(account, courseId);
  assert.equal(retry.status, 404, 'already-deleted course stays deleted');
  assert.equal(await balance(account.uid), 2, 'retry does not double-refund');
  assert.equal(await monthRefunds(account.uid), 1);

  // 3. Concurrent duplicate deletes refund exactly once in total.
  const raceAccount = await seedAccount();
  const raceCourseId = `refund-race-course-${crypto.randomUUID()}`;
  await seedCourse(raceAccount, raceCourseId);
  const [first, second] = await Promise.all([deleteCourse(raceAccount, raceCourseId), deleteCourse(raceAccount, raceCourseId)]);
  const bodies = await Promise.all([first, second].map(async (response) => {
    try { return await response.json(); } catch { return {}; }
  }));
  const refundedCount = bodies.filter((body) => body.creditBack?.refunded === true).length;
  assert.equal(refundedCount, 1, `exactly one concurrent response reports the refund: ${JSON.stringify(bodies)}`);
  assert.equal(await balance(raceAccount.uid), 2, 'concurrent deletes add exactly one credit');
  assert.equal(await monthRefunds(raceAccount.uid), 1, 'monthly counter cannot be doubled by racing deletes');

  console.log('COURSE_CREDIT_REFUND_BEHAVIOR_OK');
} finally {
  await rm(directory, { recursive: true, force: true });
}
