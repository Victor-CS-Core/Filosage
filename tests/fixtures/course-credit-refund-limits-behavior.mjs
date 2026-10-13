import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

// The two credit-back limits the review left code-verified only:
//  - monthly-cap: with the month's two refunds already used, deleting an
//    eligible course settles the intent as monthly_cap_reached, mints no
//    refund document, and leaves the balance and counter untouched.
//  - recorded-at-window: an interrupted deletion recovered long after the
//    24-hour window (measured from redemption to settlement) still refunds,
//    because the window is judged from the intent's recordedAt; the control
//    course without an intent is refused as outside_window.
// Scenario selected by argv[2]: "monthly-cap" | "recorded-at-window".
const scenario = process.argv[2];
assert(scenario === 'monthly-cap' || scenario === 'recorded-at-window', `unknown scenario ${scenario}`);

const directory = await mkdtemp(join(tmpdir(), 'filosage-credit-limits-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = ''; process.env.OPENAI_API_KEY = ''; process.env.STRIPE_SECRET_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const { DELETE } = await import('../../src/app/api/courses/[courseId]/route.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');

const now = new Date();
const iso = (date) => date.toISOString();
const hoursAgo = (hours) => new Date(now.getTime() - hours * 60 * 60 * 1000);
const plusThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

async function seedAccount(extraDocs = []) {
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
    ...extraDocs.map((doc) => ({ ...doc, path: doc.path.replaceAll('{uid}', uid) })),
  ]));
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'https://filosage.invalid' };
  return { uid, generation, headers };
}

async function seedCourse(account, courseId, redeemedAt) {
  await lifecycle.runWithAccountGeneration(account.generation, () => documents.putStoredDocument(`courses/${courseId}`, {
    authorId: account.uid, topic: 'Limited refund course', isPublic: false,
    modules: [{ title: 'Only module', lessons: [{ title: 'Only lesson' }] }],
    generationGrant: { version: 'course-credits-v2', claimId: `claim-${courseId}`, lessonIds: ['0-0'], redeemedAt: iso(redeemedAt), status: 'active' },
  }));
}

const deleteCourse = (account, courseId) => DELETE(
  new Request(`https://filosage.invalid/api/courses/${courseId}`, { method: 'DELETE', headers: account.headers }),
  { params: Promise.resolve({ courseId }) },
);
const balance = async (uid) => (await documents.getStoredDocument(`users/${uid}/courseCredits/current`))?.balance;
const monthRefunds = async (uid) => (await documents.getStoredDocument(`users/${uid}/courseCreditRefundMonths/${monthKey}`))?.refunds ?? 0;
const intentOf = (uid, courseId) => documents.getStoredDocument(`users/${uid}/courseCreditRefundIntents/${courseId}`);
const refundOf = (uid, courseId) => documents.getStoredDocument(`users/${uid}/courseCreditRefunds/${courseId}`);

try {
  if (scenario === 'monthly-cap') {
    const account = await seedAccount();
    // The month's two refunds are already used before this deletion.
    await lifecycle.runWithAccountGeneration(account.generation, () => documents.putStoredDocument(
      `users/${account.uid}/courseCreditRefundMonths/${monthKey}`,
      { uid: account.uid, monthKey, refunds: 2, updatedAt: iso(now) },
    ));
    const courseId = `cap-course-${crypto.randomUUID()}`;
    await seedCourse(account, courseId, now);
    const deleted = await deleteCourse(account, courseId);
    assert.equal(deleted.status, 200, await deleted.clone().text().catch(() => ''));
    const body = await deleted.json();
    assert.equal(body.creditBack?.refunded, false, JSON.stringify(body));
    assert.equal(body.creditBack?.reason, 'monthly_cap_reached', JSON.stringify(body));
    assert.equal(await documents.getStoredDocument(`courses/${courseId}`), null, 'course is deleted');
    assert.equal(await balance(account.uid), 1, 'cap refusal leaves the balance unchanged');
    assert.equal(await monthRefunds(account.uid), 2, 'cap refusal leaves the monthly counter unchanged');
    assert.equal(await refundOf(account.uid, courseId), null, 'cap refusal mints no refund document');
    const intent = await intentOf(account.uid, courseId);
    assert.equal(intent?.status, 'settled', 'intent settles even when the cap refuses');
    assert.equal(intent?.outcome, 'monthly_cap_reached');
    console.log('COURSE_CREDIT_MONTHLY_CAP_OK');
  } else {
    // Interrupted deletion: intent recorded 30h ago for a course redeemed
    // 50h ago (deletion began 20h after redemption, inside the window),
    // the course is gone, and settlement only happens now — 50h after
    // redemption, outside any settlement-time window.
    const account = await seedAccount();
    const courseId = `window-course-${crypto.randomUUID()}`;
    const redeemedAt = hoursAgo(50);
    const recordedAt = hoursAgo(30);
    await seedCourse(account, courseId, redeemedAt);
    await lifecycle.runWithAccountGeneration(account.generation, () => documents.putStoredDocuments([
      {
        path: `users/${account.uid}/courseCreditRefundIntents/${courseId}`,
        data: { uid: account.uid, courseId, redeemedAt: iso(redeemedAt), recordedAt: iso(recordedAt), status: 'pending', updatedAt: iso(recordedAt) },
      },
    ]));
    await lifecycle.runWithAccountGeneration(account.generation, () => documents.deleteStoredDocuments([`courses/${courseId}`]));
    const recovered = await deleteCourse(account, courseId);
    assert.equal(recovered.status, 200, await recovered.clone().text().catch(() => ''));
    const recoveredBody = await recovered.json();
    assert.equal(recoveredBody.recovered, true, JSON.stringify(recoveredBody));
    assert.equal(recoveredBody.creditBack?.refunded, true, `window judged from recordedAt must refund: ${JSON.stringify(recoveredBody)}`);
    assert.equal(await balance(account.uid), 2, 'recovered refund adds exactly one credit');
    assert.equal(await monthRefunds(account.uid), 1);
    assert(await refundOf(account.uid, courseId), 'recovered refund document exists');
    const intent = await intentOf(account.uid, courseId);
    assert.equal(intent?.status, 'settled');
    assert.equal(intent?.outcome, 'refunded');

    // Control: same redemption age, no intent — judged at settlement time
    // the window has expired, so the plain delete path refuses.
    const control = await seedAccount();
    const controlCourseId = `window-control-${crypto.randomUUID()}`;
    await seedCourse(control, controlCourseId, redeemedAt);
    const controlDeleted = await deleteCourse(control, controlCourseId);
    assert.equal(controlDeleted.status, 200, await controlDeleted.clone().text().catch(() => ''));
    const controlBody = await controlDeleted.json();
    assert.equal(controlBody.creditBack?.refunded, false, JSON.stringify(controlBody));
    assert.equal(controlBody.creditBack?.reason, 'outside_window', JSON.stringify(controlBody));
    assert.equal(await balance(control.uid), 1, 'control balance unchanged');
    assert.equal(await refundOf(control.uid, controlCourseId), null, 'control mints no refund document');
    console.log('COURSE_CREDIT_RECORDED_AT_WINDOW_OK');
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
