import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { mock } from 'node:test';
const directory = await mkdtemp(join(tmpdir(), 'filosage-lifecycle-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = ''; process.env.OPENAI_API_KEY = ''; process.env.STRIPE_SECRET_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const runtime = await import('../../src/lib/runtime-config.ts');
const stripe = await import('../../src/lib/stripe-server.ts');
const bannerStorage = await import('../../src/lib/course-banner-storage.ts');
let interruptStage = null; let incompleteScan = false; let stripeUnknown = false;
let interruptUsageReconciliation = false;
let deletedAssets = []; let cancellationInputs = [];
let pauseStage = null; let paused; let release;
mock.module(new URL('../../src/lib/document-store.ts', import.meta.url).href, { namedExports: {
  ...documents,
  async scanStoredDocuments(maximum) { return documents.scanStoredDocuments(incompleteScan ? 1 : maximum); },
  async runStoredDocumentTransaction(paths, update) {
    let nextStage;
    let usageReconciled = false;
    const result = await documents.runStoredDocumentTransaction(paths, (current) => {
      const next = update(current);
      nextStage = next.writes.find((write) => write.path.startsWith('accountDeletionJobs/'))?.data.stage;
      usageReconciled = next.writes.some((write) => write.path.startsWith('generationUsageReceipts/') && write.data.status === 'account_removed');
      return next;
    });
    if (usageReconciled && interruptUsageReconciliation) { interruptUsageReconciliation = false; throw new Error('fixture crash after global usage was durably reconciled'); }
    if (nextStage === interruptStage) { interruptStage = null; throw new Error('fixture crash immediately after durable stage commit'); }
    if (nextStage === pauseStage) { pauseStage = null; paused(); await new Promise(resolve => { release = resolve; }); }
    return result;
  },
} });
mock.module(new URL('../../src/lib/runtime-config.ts', import.meta.url).href, { namedExports: { ...runtime, billingConfiguration: () => ({ ...runtime.billingConfiguration(), apiReady: true, managementReady: false, portalReady: false }) } });
mock.module(new URL('../../src/lib/stripe-server.ts', import.meta.url).href, { namedExports: { ...stripe, async cancelStripeBillingForAccountDeletion(input) { cancellationInputs.push(input); if (stripeUnknown) throw new Error('provider outcome unknown'); return { confirmed: true }; } } });
mock.module(new URL('../../src/lib/course-banner-storage.ts', import.meta.url).href, { namedExports: { ...bannerStorage, async deleteExclusiveCourseBannerObject(assetId, asset) { assert.equal(asset.ownership, 'exclusive'); deletedAssets.push(assetId); } } });
const { DELETE } = await import('../../src/app/api/account/data/route.ts');
const { POST: accept } = await import('../../src/app/api/legal/acceptance/route.ts');
const { withAccountRequest, requireUser } = await import('../../src/lib/auth-server.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');
const { accountSessionMarker } = await import('../../src/lib/account-session.ts');
const { beginAccountDeletion } = await import('../../src/lib/account-deletion.ts');
const { createEvidenceShare, listEvidenceShares, readEvidenceShare, revokeEvidenceShare } = await import('../../src/lib/evidence-shares.ts');
const { beginGenerationOperation, runGenerationProviderCall, abandonGenerationUsage } = await import('../../src/lib/generation-operations.ts');
const { reserveAiUsage, finalizeAiUsage, aiUsageAttemptPath } = await import('../../src/lib/ai-usage.ts');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function seed(extra = [], profile = {}) {
  const suffix = crypto.randomUUID(); const uid = `local-plus-learner-${suffix}`;
  const token = `playwright-plus-learner-${suffix}`;
  const generation = await lifecycle.captureAccountGeneration(uid);
  await lifecycle.runWithAccountGeneration(generation, () => documents.putStoredDocuments([
    { path: `users/${uid}`, data: { uid, plan: 'free', subscriptionStatus: 'none', acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION, ...profile } },
    ...extra.map(entry => typeof entry === 'function' ? entry(uid, generation.generation) : entry),
  ]));
  const headers = { authorization: `Bearer ${token}`, 'x-reauthentication-token': token, 'content-type': 'application/json', origin: 'https://filosage.invalid' };
  return { uid, token, generation, headers };
}
const deletion = async (account) => {
  const response = await DELETE(new Request('https://filosage.invalid/api/account/data', { method: 'DELETE', headers: account.headers, body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }) }));
  return { status: response.status, body: await response.json() };
};
try {
  // A fresh process can resume after the acknowledge point for every durable stage.
  for (const stage of ['checkout', 'inventory', 'billing', 'documents', 'assets', 'verify', 'retention_review']) {
    const account = await seed([uid => ({ path: `users/${uid}/lessonNotes/note`, data: { note: 'private' } })]);
    interruptStage = stage;
    const interrupted = await deletion(account);
    assert.equal(interrupted.status, 500, `${stage}: ${JSON.stringify(interrupted)}`);
    const resumed = await deletion(account);
    assert.equal(resumed.status, 202, `${stage}: ${JSON.stringify(resumed)}`);
    assert.equal(resumed.body.activeDataRemoved, true);
    assert.equal(resumed.body.deleted, false);
    assert.equal((await documents.getStoredDocument(lifecycle.accountLifecyclePath(account.uid))).state, 'deleted');
    assert.equal(await documents.getStoredDocument(`users/${account.uid}`), null);
  }
  // A second deletion caller cannot take over a live worker's lease.
  const concurrent = await seed(); pauseStage = 'inventory';
  const stagePaused = new Promise(resolve => { paused = resolve; });
  const first = deletion(concurrent); await stagePaused;
  const second = await deletion(concurrent);
  assert.equal(second.status, 409); assert.equal(second.body.code, 'ACCOUNT_DELETION_RETRY_IN_PROGRESS');
  release(); assert.equal((await first).status, 202);
  // Inventory overflow and unknown subcollections remain manual, with the account preserved.
  const overflow = await seed(); incompleteScan = true;
  const bounded = await deletion(overflow); assert.equal(bounded.status, 409);
  assert.equal(bounded.body.code, 'ACCOUNT_DELETION_INVENTORY_OVERFLOW');
  assert(await documents.getStoredDocument(`users/${overflow.uid}`)); incompleteScan = false;
  assert.equal((await deletion(overflow)).status, 202);
  const unknown = await seed([uid => ({ path: `users/${uid}/unregisteredPrivateData/record`, data: { content: 'must not be silently missed' } })]);
  const manual = await deletion(unknown); assert.equal(manual.status, 409);
  assert.equal(manual.body.code, 'ACCOUNT_DELETION_UNKNOWN_SUBCOLLECTION');
  assert(await documents.getStoredDocument(`users/${unknown.uid}`));
  // API-only billing readiness allows cancellation while Portal remains unavailable.
  const paid = await seed([], { billingCustomerId: 'cus_fixture', billingSubscriptionId: 'sub_fixture', subscriptionStatus: 'active' });
  stripeUnknown = true; const pending = await deletion(paid); assert.equal(pending.status, 409);
  assert.equal(pending.body.code, 'SUBSCRIPTION_CANCELLATION_UNCONFIRMED');
  assert.equal((await documents.getStoredDocument(`users/${paid.uid}`)).billingSubscriptionId, 'sub_fixture');
  const paidJob = await documents.getStoredDocument(`accountDeletionJobs/${pending.body.jobId}`);
  assert.equal(paidJob.billingCustomerId, 'cus_fixture');
  stripeUnknown = false; const reconciled = await deletion(paid); assert.equal(reconciled.status, 202);
  assert.equal(cancellationInputs.at(-1).jobId, pending.body.jobId);
  // A confirmed provider-containment receipt can finish only the existing claim.
  const checkoutAccount = await seed([uid => ({ path: `users/${uid}/billingCheckout/current`, data: { status: 'creating', claimId: 'exact-checkout-claim', customerId: 'cus_owned', planId: 'plus' } })]);
  const checkoutPending = await deletion(checkoutAccount); assert.equal(checkoutPending.body.code, 'ACCOUNT_DELETION_WAITING_FOR_CHECKOUT');
  const checkoutJob = await documents.getStoredDocument(`accountDeletionJobs/${checkoutPending.body.jobId}`);
  const checkoutPath = `users/${checkoutAccount.uid}/billingCheckout/current`;
  const existingClaim = await documents.getStoredDocument(checkoutPath);
  const receipt = { ...existingClaim, status: 'canceled', containmentOutcome: 'contained', sessionId: 'cs_confirmed_expired', containmentConfirmedAt: new Date().toISOString(), containmentJobId: checkoutJob.jobId, updatedAt: new Date().toISOString() };
  await lifecycle.runWithBillingContainment(checkoutJob, async () => {
    await assert.rejects(documents.putStoredDocument(checkoutPath, { ...receipt, claimId: 'replaced-claim' }), lifecycle.AccountLifecycleError);
    await assert.rejects(documents.putStoredDocument(checkoutPath, { ...receipt, customerId: 'cus_other' }), lifecycle.AccountLifecycleError);
    await assert.rejects(documents.putStoredDocument(checkoutPath, { ...receipt, containmentJobId: 'other-job' }), lifecycle.AccountLifecycleError);
    await assert.rejects(documents.putStoredDocument(checkoutPath, { ...receipt, sessionId: null }), lifecycle.AccountLifecycleError);
    await documents.putStoredDocument(checkoutPath, receipt);
  });
  assert.equal((await deletion(checkoutAccount)).status, 202);
  await assert.rejects(lifecycle.runWithBillingContainment(checkoutJob, () => documents.putStoredDocument(checkoutPath, receipt)), lifecycle.AccountLifecycleError);
  const notStarted = await seed([uid => ({ path: `users/${uid}/billingCheckout/current`, data: { status: 'creating', claimId: 'never-started-claim' } })]);
  const notStartedResult = await deletion(notStarted);
  const notStartedJob = await documents.getStoredDocument(`accountDeletionJobs/${notStartedResult.body.jobId}`);
  const notStartedPath = `users/${notStarted.uid}/billingCheckout/current`;
  await lifecycle.runWithBillingContainment(notStartedJob, () => documents.runStoredDocumentTransaction([notStartedPath], (current) => ({ writes: [{ path: notStartedPath, data: { ...current[notStartedPath], status: 'canceled', containmentOutcome: 'not_created', sessionId: null, containmentConfirmedAt: new Date().toISOString(), containmentJobId: notStartedJob.jobId, updatedAt: new Date().toISOString() } }], result: undefined })));
  assert.equal((await deletion(notStarted)).status, 202);
  // Exclusive assets are removed only after upload is terminal; shared assets survive explicitly.
  const exclusiveId = 'a'.repeat(32); const sharedId = 'b'.repeat(32);
  await documents.putStoredDocument(`courseBannerAssets/${sharedId}`, { contentType: 'image/webp', storage: 'azure-blob' });
  const assets = await seed([
    (uid, generation) => ({ path: `courseBannerAssets/${exclusiveId}`, data: { ownerUid: uid, accountGeneration: generation, ownership: 'exclusive', status: 'uploading', storage: 'azure-blob' } }),
    uid => ({ path: `courses/shared-asset-course`, data: { authorId: uid, banner: { assetId: sharedId } } }),
  ]);
  const uploading = await deletion(assets); assert.equal(uploading.status, 409);
  assert.equal(uploading.body.code, 'ACCOUNT_DELETION_WAITING_FOR_ASSET_UPLOAD');
  await lifecycle.runWithBannerUploadReceipt({ ...assets.generation, assetId: exclusiveId }, () => documents.runStoredDocumentTransaction([`courseBannerAssets/${exclusiveId}`], (current) => ({
    writes: [{ path: `courseBannerAssets/${exclusiveId}`, data: { ...current[`courseBannerAssets/${exclusiveId}`], status: 'uploaded' } }], result: undefined,
  })));
  assert.equal((await deletion(assets)).status, 202);
  assert.deepEqual(deletedAssets, [exclusiveId]);
  assert(await documents.getStoredDocument(`courseBannerAssets/${sharedId}`));
  // Author deletion preserves another learner's evidence and reference together.
  // Public sharing becomes unavailable when the source course is removed, while
  // the learner can still list/revoke their own retained share.
  const author = await seed(); const learner = await seed();
  const courseId = `author-course-${crypto.randomUUID()}`;
  const retainedAssetId = 'c'.repeat(32);
  await lifecycle.runWithAccountGeneration(author.generation, () => documents.putStoredDocuments([
    { path: `courses/${courseId}`, data: { authorId: author.uid, topic: 'Shared course', banner: { assetId: retainedAssetId } } },
    { path: `courseBannerAssets/${retainedAssetId}`, data: { ownerUid: author.uid, accountGeneration: author.generation.generation, ownership: 'exclusive', status: 'uploaded', storage: 'azure-blob' } },
  ]));
  const snapshot = { course: { topic: 'Shared course' }, generatedAt: new Date().toISOString(), learnerWork: 'private learner B work' };
  const share = await lifecycle.runWithAccountGeneration(learner.generation, async () => {
    await documents.putStoredDocuments([
      { path: `courses/retained-${courseId}`, data: { authorId: learner.uid, banner: { assetId: retainedAssetId } } },
      { path: `users/${learner.uid}/masteryEvidence/evidence`, data: { courseId, learnerWork: 'retain this' } },
      { path: `outcomeFeedback/feedback-${courseId}`, data: { uid: learner.uid, courseId, feedback: 'retain this too' } },
    ]);
    return createEvidenceShare(learner.uid, courseId, snapshot);
  });
  const authorJob = await lifecycle.runWithAccountGeneration(author.generation, () => beginAccountDeletion(author.uid));
  // Even an erroneous saved inventory cannot authorize removal of B's work.
  await lifecycle.runWithAccountDeletion(authorJob, async () => {
    await documents.putStoredDocument(`accountDeletionJobs/${authorJob.jobId}`, { ...authorJob, documentPaths: [`evidenceShares/${share.id}`] });
    await assert.rejects(documents.deleteStoredDocuments([`evidenceShares/${share.id}`]), lifecycle.AccountLifecycleError);
  });
  const authorResult = await deletion(author); assert.equal(authorResult.status, 202, JSON.stringify(authorResult));
  assert.equal(authorResult.body.activeDataRemoved, true);
  assert.equal(await documents.getStoredDocument(`courses/${courseId}`), null);
  assert.deepEqual((await documents.getStoredDocument(`evidenceShares/${share.id}`)).snapshot, snapshot);
  assert(await documents.getStoredDocument(`users/${learner.uid}/evidenceShareRefs/${share.id}`));
  assert(await documents.getStoredDocument(`users/${learner.uid}/masteryEvidence/evidence`));
  assert(await documents.getStoredDocument(`outcomeFeedback/feedback-${courseId}`));
  assert(await documents.getStoredDocument(`courses/retained-${courseId}`));
  assert(await documents.getStoredDocument(`courseBannerAssets/${retainedAssetId}`));
  assert.equal(deletedAssets.includes(retainedAssetId), false);
  assert.equal((await listEvidenceShares(learner.uid)).length, 1);
  assert.equal(await readEvidenceShare(share.token), null);
  assert.equal(await lifecycle.runWithAccountGeneration(learner.generation, () => revokeEvidenceShare(learner.uid, share.id)), true);
  // The actual generation operation is reconciled before private deletion.
  // Crash after that global commit, resume, then observe a late provider result.
  const generator = await seed();
  const lease = await lifecycle.runWithAccountGeneration(generator.generation, () => beginGenerationOperation({ uid: generator.uid, plan: 'pro', access: 'pro', isOwner: false, accountStatus: 'active', subscriptionStatus: 'none' }, crypto.randomUUID(), { topic: 'Deletion during real operation' }));
  const providerStarted = deferred(); const providerResult = deferred();
  const lateGeneration = runGenerationProviderCall(lease, { model: 'gpt-5.6-luna' }, () => { providerStarted.resolve(); return providerResult.promise; });
  await providerStarted.promise;
  interruptUsageReconciliation = true;
  const usagePending = await deletion(generator);
  assert.equal(usagePending.status, 409, JSON.stringify(usagePending));
  assert.equal(usagePending.body.code, 'ACCOUNT_DELETION_USAGE_RECONCILIATION_UNCONFIRMED');
  assert(await documents.getStoredDocument(lease.operationPath));
  assert.equal((await documents.getStoredDocument(lease.receiptPath)).remainingReserveMicros, 0);
  assert.equal((await deletion(generator)).status, 202);
  assert.equal(await documents.getStoredDocument(lease.operationPath), null);
  assert.equal(await documents.getStoredDocument(lease.operation.accounting.requestPath), null);
  assert.equal(await documents.getStoredDocument(`users/${generator.uid}/courseCredits/current`), null);
  const uncertainReceipt = await documents.getStoredDocument(lease.receiptPath);
  assert(uncertainReceipt.uncertainCostMicros > 0);
  providerResult.resolve({ id: 'late-deleted-operation-response', usage: { input_tokens: 100, output_tokens: 50 } });
  await assert.rejects(lateGeneration);
  const finalReceipt = await documents.getStoredDocument(lease.receiptPath);
  assert.equal(finalReceipt.actualCostMicros, 400); assert.equal(finalReceipt.uncertainCostMicros, 0);
  assert.equal(finalReceipt.uid, undefined); assert.equal(finalReceipt.request, undefined);
  const finalGlobal = await documents.getStoredDocument(lease.operation.accounting.globalPath);
  await abandonGenerationUsage(lease.operationId);
  assert.deepEqual(await documents.getStoredDocument(lease.operation.accounting.globalPath), finalGlobal);
  assert.equal(await documents.getStoredDocument(`users/${generator.uid}`), null);
  const missingUsage = await seed([uid => ({ path: `generationOperations/${'d'.repeat(64)}`, data: { uid } })]);
  const usageReview = await deletion(missingUsage); assert.equal(usageReview.status, 409);
  assert.equal(usageReview.body.code, 'ACCOUNT_DELETION_USAGE_RECONCILIATION_REQUIRED');
  assert(await documents.getStoredDocument(`users/${missingUsage.uid}`));
  // Generic lesson/tutor reservations have no generationOperations parent, but
  // their exact attempt must also retain uncertain global cost before removal.
  const generic = await seed();
  const reservation = await lifecycle.runWithAccountGeneration(generic.generation, () => reserveAiUsage({ uid: generic.uid, plan: 'pro', access: 'pro', isOwner: false, accountStatus: 'active', subscriptionStatus: 'none' }, 'lesson_generation', crypto.randomUUID()));
  const genericResult = await deletion(generic); assert.equal(genericResult.status, 202, JSON.stringify(genericResult));
  const genericGlobal = await documents.getStoredDocument(reservation.globalPath);
  assert(genericGlobal.uncertainCostMicros >= reservation.reserveCostMicros);
  const genericPersonalPaths = [reservation.requestPath, aiUsageAttemptPath(reservation), reservation.periodPath, reservation.userBudgetPath];
  for (const path of genericPersonalPaths) assert.equal(await documents.getStoredDocument(path), null);
  await lifecycle.runWithAccountGeneration(generic.generation, () => finalizeAiUsage(reservation, { model: 'gpt-5.6-luna', inputTokens: 10, outputTokens: 10 }));
  await lifecycle.runWithAccountGeneration(generic.generation, () => finalizeAiUsage(reservation, { model: 'gpt-5.6-luna', inputTokens: 10, outputTokens: 10 }));
  const genericSettled = await documents.getStoredDocument(reservation.globalPath);
  assert.equal(genericSettled.actualCostMicros, (genericGlobal.actualCostMicros ?? 0) + 70);
  assert.equal(genericSettled.uncertainCostMicros, genericGlobal.uncertainCostMicros - reservation.reserveCostMicros);
  for (const path of genericPersonalPaths) assert.equal(await documents.getStoredDocument(path), null);
  const legacyUsage = await seed([uid => ({ path: `aiRequests/unreconciled-${uid}`, data: { uid, status: 'reserved', reservedCostMicros: 100 } })]);
  const legacyUsageReview = await deletion(legacyUsage); assert.equal(legacyUsageReview.status, 409);
  assert.equal(legacyUsageReview.body.code, 'ACCOUNT_DELETION_USAGE_RECONCILIATION_REQUIRED');
  assert(await documents.getStoredDocument(`users/${legacyUsage.uid}`));
  // Two full asynchronous authenticated handlers retain separate generations across waits.
  const a = await seed(); const b = await seed(); const both = deferred(); let arrived = 0;
  const handler = withAccountRequest(async request => {
    const user = await requireUser(request); const before = lifecycle.currentAccountGeneration();
    if (++arrived === 2) both.resolve(); await both.promise;
    assert.deepEqual(lifecycle.currentAccountGeneration(), before); assert.equal(before.uid, user.uid);
    await documents.putStoredDocument(`users/${user.uid}/lessonNotes/isolated`, { note: user.uid });
    return new Response(null, { status: 204 });
  });
  const responses = await Promise.all([a, b].map(account => handler(new Request('https://filosage.invalid/api/fixture', { headers: account.headers }))));
  assert(responses.every(response => response.status === 204));
  // Deletion invalidates every central writer family and late personal AI completion.
  const barrier = deferred();
  const late = lifecycle.runWithAccountGeneration(a.generation, async () => {
    await barrier.promise;
    await assert.rejects(documents.putStoredDocument(`aiRequests/late-${a.uid}`, { uid: a.uid }), lifecycle.AccountLifecycleError);
    await lifecycle.runWithGlobalUsageAccounting(() => documents.putStoredDocument('generationUsageReceipts/late-global', { actualCostMicros: 73 }));
  });
  assert.equal((await deletion(a)).status, 202); barrier.resolve(); await late;
  const writers = [
    () => documents.putStoredDocument(`users/${a.uid}`, { uid: a.uid }),
    () => documents.putStoredDocuments([{ path: `users/${a.uid}/lessonNotes/late`, data: { note: 'late' } }]),
    () => documents.createStoredDocument(`users/${a.uid}/masteryEvidence`, { text: 'late' }),
    () => documents.runStoredDocumentTransaction([`users/${a.uid}/courseCredits/current`], () => ({ writes: [{ path: `users/${a.uid}/courseCredits/current`, data: { balance: 2 } }], result: null })),
    () => documents.createCourse({ authorId: a.uid, topic: 'late' }, `late-${a.uid}`),
    () => documents.saveLesson(`late-${a.uid}`, '0-0', { content: 'late' }),
    () => documents.updateCourseBanner(`late-${a.uid}`, { assetId: exclusiveId, version: 1, generatedAt: new Date().toISOString() }),
  ];
  for (const writer of writers) await assert.rejects(lifecycle.runWithAccountGeneration(a.generation, writer));
  await assert.rejects(documents.putStoredDocument(`users/${b.uid}/lessonNotes/unscoped`, { note: 'unscoped' }), lifecycle.AccountLifecycleError);
  await assert.rejects(lifecycle.runWithAccountGeneration(b.generation, () => documents.putStoredDocument(`users/${a.uid}/lessonNotes/changed-owner`, { uid: b.uid })), lifecycle.AccountLifecycleError);
  await assert.rejects(lifecycle.runWithGlobalUsageAccounting(() => documents.putStoredDocument('generationUsageReceipts/personal', { uid: b.uid })), lifecycle.AccountLifecycleError);
  // No automatic UID reopen, and a forged/new generation cannot stand in for the captured one.
  const tombstone = await lifecycle.captureAccountGeneration(a.uid);
  assert.equal(tombstone.generation, a.generation.generation); assert.equal(tombstone.state, 'deleted');
  await assert.rejects(lifecycle.runWithAccountGeneration({ uid: b.uid, generation: crypto.randomUUID() }, () => documents.putStoredDocument(`users/${b.uid}`, { uid: b.uid })), lifecycle.AccountLifecycleError);
  const replay = await accept(new Request('https://filosage.invalid/api/legal/acceptance', { method: 'POST', headers: a.headers, body: JSON.stringify({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageEligibilityConfirmed: true, source: 'signup' }) }));
  assert.equal(replay.status, 403); assert.equal(await documents.getStoredDocument(`users/${a.uid}`), null);
  const wrongClaim = new Request('https://filosage.invalid/api/fixture', { headers: { ...b.headers, 'x-filosage-expected-generation': crypto.randomUUID() } });
  assert.equal((await handler(wrongClaim)).status, 403);
  assert.match(accountSessionMarker(b.uid, b.generation.generation), /\.v2:/);
  console.log('ACCOUNT_LIFECYCLE_BEHAVIOR_OK stages=7 race=real-ALS inventory=complete-or-manual billing=api-only assets=exclusive-or-retained');
} finally { release?.(); mock.restoreAll(); await rm(directory, { recursive: true, force: true }); }
