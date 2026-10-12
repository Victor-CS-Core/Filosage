import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { mock } from 'node:test';

// Interruption recovery for course-deletion credit-back. The document
// store's deleteCourse is stubbed to throw (a deletion that fails before
// committing); every other store function and all credit logic is real.
// Proofs: a failed deletion preserves the credit and mints no refund; the
// recovery path refuses to refund while the course still exists; once the
// course is actually gone (deletion committed, process died before the
// refund), a retry settles the pending intent exactly once.
const directory = await mkdtemp(join(tmpdir(), 'filosage-credit-recovery-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = ''; process.env.OPENAI_API_KEY = ''; process.env.STRIPE_SECRET_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const credits = await import('../../src/lib/course-credits.ts');
mock.module(new URL('../../src/lib/document-store.ts', import.meta.url).href, {
  namedExports: {
    ...documents,
    async deleteCourse() { throw new Error('Simulated deletion failure before commit.'); },
  },
});
const { DELETE } = await import('../../src/app/api/courses/[courseId]/route.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');

const now = new Date();
const iso = (date) => date.toISOString();
const plusThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

try {
  const suffix = crypto.randomUUID();
  const uid = `local-plus-learner-${suffix}`;
  const token = `playwright-plus-learner-${suffix}`;
  const courseId = `refund-interrupted-course-${suffix}`;
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
    {
      path: `courses/${courseId}`,
      data: {
        authorId: uid, topic: 'Interrupted course', isPublic: false,
        modules: [{ title: 'Only module', lessons: [{ title: 'Only lesson' }] }],
        generationGrant: { version: 'course-credits-v2', claimId: `claim-${courseId}`, lessonIds: ['0-0'], redeemedAt: iso(now), status: 'active' },
      },
    },
  ]));
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'https://filosage.invalid' };
  const deleteRequest = () => DELETE(
    new Request(`https://filosage.invalid/api/courses/${courseId}`, { method: 'DELETE', headers }),
    { params: Promise.resolve({ courseId }) },
  );
  const balance = async () => (await documents.getStoredDocument(`users/${uid}/courseCredits/current`))?.balance;
  const account = { uid, plan: 'plus', accountStatus: 'active', isOwner: false };

  // 1. The deletion fails before committing: no refund, course intact,
  //    but a durable pending intent records that a deletion was attempted.
  const failed = await deleteRequest();
  assert.equal(failed.status, 500, 'failed deletion surfaces an error');
  assert(await documents.getStoredDocument(`courses/${courseId}`), 'course survives a failed deletion');
  assert.equal(await balance(), 1, 'failed deletion preserves the credit balance');
  assert.equal(await documents.getStoredDocument(`users/${uid}/courseCreditRefunds/${courseId}`), null, 'no refund receipt is minted');
  const intent = await documents.getStoredDocument(`users/${uid}/courseCreditRefundIntents/${courseId}`);
  assert.equal(intent?.status, 'pending', 'a pending intent survives for recovery');

  // 2. Recovery refuses to refund while the course still exists.
  const refused = await credits.settlePendingCourseCreditRefund(account, courseId);
  assert.equal(refused?.refunded, false);
  assert.equal(refused?.reason, 'course_not_deleted');
  assert.equal(await balance(), 1, 'recovery cannot mint a credit for a live course');

  // 3. The deletion later commits but the process dies before the refund
  //    (simulated by removing the course directly). A retry of the DELETE
  //    request now finds no course, follows the intent, and settles once.
  await lifecycle.runWithAccountGeneration(generation, () => documents.deleteStoredDocuments([`courses/${courseId}`]));
  const recovered = await deleteRequest();
  assert.equal(recovered.status, 200, 'retry after interruption succeeds via recovery');
  const recoveredBody = await recovered.json();
  assert.equal(recoveredBody.recovered, true);
  assert.equal(recoveredBody.creditBack?.refunded, true, JSON.stringify(recoveredBody));
  assert.equal(await balance(), 2, 'recovered refund lands exactly once');
  assert.equal((await documents.getStoredDocument(`users/${uid}/courseCreditRefundMonths/${monthKey}`))?.refunds, 1);
  assert.equal((await documents.getStoredDocument(`users/${uid}/courseCreditRefundIntents/${courseId}`))?.status, 'settled');

  // 4. Further retries are plain 404s and never refund again.
  const afterRecovery = await deleteRequest();
  assert.equal(afterRecovery.status, 404);
  assert.equal(await balance(), 2, 'no double refund after recovery');

  console.log('COURSE_CREDIT_REFUND_RECOVERY_OK');
} finally {
  await rm(directory, { recursive: true, force: true });
}
