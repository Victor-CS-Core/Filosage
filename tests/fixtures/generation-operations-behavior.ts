import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { getStoredDocument, putStoredDocument as rawPutStoredDocument, runStoredDocumentTransaction } from "../../src/lib/document-store.ts";
import { beginGenerationOperation, finishGenerationOperation, pauseGenerationOperation, runGenerationProviderCall, getGenerationOperation, GENERATION_LEASE_MS } from "../../src/lib/generation-operations.ts";
import type { ServerAccount } from "../../src/lib/account-server.ts";

const directory = mkdtempSync(join(tmpdir(), "generation-operations-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
after(() => rmSync(directory, { recursive: true, force: true }));
const account: ServerAccount = { uid: "recovery-owner", plan: "pro", access: "owner", isOwner: true, accountStatus: "active", subscriptionStatus: "active" };
const paid: ServerAccount = { ...account, uid: "recovery-paid", access: "pro", isOwner: false, plan: "pro" };

async function begin(key: string, actor = account, payload = { topic: "Evidence" }, now = new Date()) {
  return beginGenerationOperation(actor, key.padEnd(12, "x"), payload, now);
}

async function putStoredDocument(path: string, data: Record<string, unknown>) {
  const uid = typeof data.uid === "string" ? data.uid : path.startsWith("users/") ? path.split("/")[1] : currentAccountGeneration()?.uid;
  if (!uid) return rawPutStoredDocument(path, data);
  return runWithAccountGeneration(await captureAccountGeneration(uid), () => rawPutStoredDocument(path, data));
}

async function deleteAccountRecords(uid: string, paths: string[]) {
  const scope = await captureAccountGeneration(uid);
  const lifecyclePath = `accountLifecycles/${uid}`;
  const jobId = `fixture-${uid}`;
  const jobPath = `accountDeletionJobs/${jobId}`;
  await runWithAccountGeneration(scope, () => runStoredDocumentTransaction([lifecyclePath, jobPath], (documents) => ({
    writes: [
      { path: lifecyclePath, data: { ...documents[lifecyclePath], state: "deleting", jobId } },
      { path: jobPath, data: { uid, generation: scope.generation, documentPaths: paths } },
    ], result: undefined,
  })));
  await runWithAccountDeletion({ ...scope, jobId }, () => deleteStoredDocuments(paths));
}

test("credit reservation, request fingerprint and operation commit as one admission", async () => {
  const lease = await begin("atomic", paid);
  assert.equal((await getStoredDocument(`users/${paid.uid}/courseCredits/current`))?.balance, 4);
  await assert.rejects(begin("atomic", paid, { topic: "Different" }), /different request/);
  assert.equal((await getStoredDocument(`users/${paid.uid}/courseCredits/current`))?.balance, 4);
  await finishGenerationOperation(lease, { failed: true, reason: "test" });
  await finishGenerationOperation(lease, { failed: true, reason: "test" });
  assert.equal((await getStoredDocument(`users/${paid.uid}/courseCredits/current`))?.balance, 5);
});

test("saved provider output resumes without another call and terminal commit grants all lessons", async () => {
  let calls = 0;
  const first = await begin("checkpoint");
  const input = { model: "gpt-5.6-luna", text: { format: { name: "course_outline" } } };
  const provider = async () => { calls += 1; return { id: "response-1", usage: { input_tokens: 100, output_tokens: 50 }, output_parsed: { title: "Evidence" } }; };
  await runGenerationProviderCall(first, input, provider);
  await pauseGenerationOperation(first);
  const second = await begin("checkpoint");
  assert.equal((await runGenerationProviderCall(second, input, provider)).id, "response-1");
  assert.equal(calls, 1);
  const course = await finishGenerationOperation(second, { course: { topic: "Evidence", authorId: account.uid, modules: [{ lessons: [{ title: "One" }, { title: "Two" }] }] } });
  assert.ok(course);
  assert.deepEqual((course.generationGrant as { lessonIds: string[] }).lessonIds, ["0-0", "0-1"]);
  const replay = await begin("checkpoint");
  assert.equal(replay.operation.status, "completed");
  assert.equal((await getGenerationOperation(account.uid, replay.operationId))?.resultId, course?.id);
});

test("expired reservation reclaims in its original month and rejects stale owner", async () => {
  const first = await begin("rollover", account, { topic: "Time" }, new Date("2026-01-31T23:59:00Z"));
  const second = await begin("rollover", account, { topic: "Time" }, new Date("2026-02-01T00:05:00Z"));
  assert.match(second.operation.accounting.periodPath, /2026-01$/);
  await assert.rejects(finishGenerationOperation(first, { failed: true, reason: "stale" }), /ownership/);
  await finishGenerationOperation(second, { failed: true, reason: "test" }, new Date("2026-02-01T00:05:01Z"));
  assert.equal((await getStoredDocument(second.operation.accounting.globalPath))?.reservedCostMicros, 0);
});

test("overlapping attempt cannot reclaim an unexpired lease", async () => {
  const first = await begin("overlap");
  await assert.rejects(begin("overlap"), /already running/);
  await finishGenerationOperation(first, { failed: true, reason: "test" });
  assert.ok(GENERATION_LEASE_MS > 120_000);
});

test("unknown provider outcome refunds once; a late response replaces uncertainty exactly once", async () => {
  const actor = { ...paid, uid: "late-paid" };
  const lease = await begin("late-provider", actor);
  let release!: (value: { id: string; usage: { input_tokens: number; output_tokens: number } }) => void;
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => { started = resolve; });
  const response = new Promise<{ id: string; usage: { input_tokens: number; output_tokens: number } }>((resolve) => { release = resolve; });
  const work = runGenerationProviderCall(lease, { model: "gpt-5.6-luna" }, () => { started(); return response; });
  await didStart;
  const operation = await getGenerationOperation(actor.uid, lease.operationId);
  assert.equal(operation?.pendingCalls.length, 1);
  const expired = new Date(Date.parse(operation!.leaseUntil) + 1);
  await finishGenerationOperation(lease, { failed: true, reconcile: true, reason: "provider_outcome_unknown" }, expired);
  const before = await getStoredDocument(lease.receiptPath);
  assert.equal(before?.uncertainCostMicros, lease.operation.accounting.reserveCostMicros);
  assert.equal(before?.actualCostMicros, 0);
  assert.equal((await getStoredDocument(`users/${actor.uid}/courseCredits/current`))?.balance, 5);
  release({ id: "late-response", usage: { input_tokens: 100, output_tokens: 50 } });
  await assert.rejects(work, /ownership/);
  const receipt = await getStoredDocument(lease.receiptPath);
  assert.equal(receipt?.uncertainCostMicros, 0);
  assert.equal(receipt?.actualCostMicros, 400);
  assert.equal(receipt?.remainingReserveMicros, 0);
  await finishGenerationOperation(lease, { failed: true, reconcile: true }, expired);
  assert.equal((await getStoredDocument(`users/${actor.uid}/courseCredits/current`))?.balance, 5);
});

test("new-key operation keeps its lock when an abandoned older request is refunded", async () => {
  const actor = { ...paid, uid: "abandoned-paid" };
  const first = await begin("abandon-one", actor);
  await pauseGenerationOperation(first);
  const second = await begin("abandon-two", actor);
  await finishGenerationOperation(first, { failed: true, reason: "abandoned", reconcile: true });
  const period = await getStoredDocument(second.operation.accounting.periodPath);
  assert.equal(period?.activeRequestId, second.operationId);
  assert.equal(period?.activeAttemptToken, second.attemptToken);
  assert.equal((await getStoredDocument(`users/${actor.uid}/courseCredits/current`))?.balance, 4);
  await finishGenerationOperation(second, { failed: true });
});

test("recovery is allowed when the reserved credit was the final available credit", async () => {
  const actor = { ...paid, uid: "last-credit" };
  const first = await begin("last-credit", actor);
  const path = `users/${actor.uid}/courseCredits/current`;
  const ledger = await getStoredDocument(path);
  await putStoredDocument(path, { ...ledger, balance: 0 });
  await pauseGenerationOperation(first);
  const recovered = await begin("last-credit", actor);
  assert.equal((await getStoredDocument(path))?.balance, 0);
  await finishGenerationOperation(recovered, { failed: true });
  assert.equal((await getStoredDocument(path))?.balance, 1);
});

test("exhausted course credits remain actionable during minute throttling without weakening the throttle", async () => {
  const actor: ServerAccount = { ...paid, uid: "plus-exhausted-throttle", plan: "plus", access: "plus" };
  const now = new Date("9405-01-01T12:00:00.000Z");
  const first = await begin("plus-throttle-first", actor, { topic: "Evidence" }, now);
  await finishGenerationOperation(first, { failed: true }, now);
  const creditPath = `users/${actor.uid}/courseCredits/current`;
  const periodPath = first.operation.accounting.periodPath;
  const credit = await getStoredDocument(creditPath);
  const period = await getStoredDocument(periodPath);
  await putStoredDocument(creditPath, { ...credit, balance: 0 });
  await putStoredDocument(periodPath, { ...period, minuteKey: now.toISOString().slice(0, 16), minuteCount: first.operation.accounting.maxPerMinute });
  const exhausted = await getStoredDocument(creditPath);
  const throttled = await getStoredDocument(periodPath);
  await assert.rejects(begin("plus-throttle-empty", actor, { topic: "Evidence" }, now), (error: unknown) => (error as { code?: string }).code === "COURSE_CREDITS_EXHAUSTED");
  assert.deepEqual(await getStoredDocument(creditPath), exhausted);
  assert.deepEqual(await getStoredDocument(periodPath), throttled);
  await putStoredDocument(creditPath, { ...credit, balance: 2 });
  await assert.rejects(begin("plus-throttle-funded", actor, { topic: "Evidence" }, now), (error: unknown) => (error as { code?: string }).code === "RATE_LIMITED");
  assert.equal((await getStoredDocument(creditPath))?.balance, 2);
  assert.deepEqual(await getStoredDocument(periodPath), throttled);
});

test("provider failure is ambiguous and cannot issue the same paid call again", async () => {
  const lease = await begin("timeout");
  let calls = 0;
  const provider = async () => { calls += 1; throw new Error("timeout"); };
  await assert.rejects(runGenerationProviderCall(lease, { model: "gpt-5.6-luna" }, provider), /unconfirmed/);
  await assert.rejects(runGenerationProviderCall(lease, { model: "gpt-5.6-luna" }, provider), /unconfirmed/);
  assert.equal(calls, 1);
  await finishGenerationOperation(lease, { failed: true, reason: "timeout" });
});

import { POST as actualGenerateCourse } from "../../src/app/api/generate-course/route.ts";
import { TERMS_VERSION, PRIVACY_VERSION } from "../../src/lib/legal.ts";
import { generationOperationId, abandonGenerationUsage, prepareGenerationCourse } from "../../src/lib/generation-operations.ts";
import { createGenerationSafetyProof, generationSafetyProofStatus } from "../../src/lib/publication-proofs.ts";
import { deleteStoredDocuments } from "../../src/lib/document-store.ts";

test("real route saves its local provider result and recovers the committed course", async () => {
  await putStoredDocument("users/local-owner", { uid: "local-owner", plan: "pro", accountStatus: "active", acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION });
  const payload = { topic: "Scientific reasoning", goal: "Compare evidence behind everyday claims.", language: "English" };
  const key = "actual-route-checkpoint";
  const request = () => new Request("https://fixture.invalid/api/generate-course", { method: "POST", headers: { Authorization: "Bearer local-dev-token", "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
  const result = await actualGenerateCourse(request());
  const body = await result.json();
  assert.equal(result.status, 200, JSON.stringify(body));
  assert.equal(body.operationId, generationOperationId("local-owner", key));
  const operation = await getGenerationOperation("local-owner", body.operationId);
  assert.equal(operation?.status, "completed");
  const course = await getStoredDocument(`courses/${body.courseId}`);
  assert.equal(course?.generationSafetyProof, undefined, "A local stub cannot certify remote moderation.");
  const replay = await actualGenerateCourse(request());
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).courseId, body.courseId);
});

test("final payload preparation preserves real output moderation proof across atomic commit", async () => {
  const lease = await begin("proof-binding");
  const payload = prepareGenerationCourse(lease, { topic: "Proof", modules: [{ lessons: [{ title: "Proof" }] }], sourceResearchArtifactId: lease.operationId,
    sourceResearchRequestFingerprint: lease.operation.requestFingerprint, sourceResearchResponseId: "fixture-source-response" });
  // This pure proof fixture tests binding only; it is not provider moderation evidence.
  payload.generationSafetyProof = await createGenerationSafetyProof(payload, "course");
  await finishGenerationOperation(lease, { course: payload });
  const saved = await getStoredDocument(`courses/${lease.operationId}`);
  assert.equal(await generationSafetyProofStatus(saved!, "course"), "passed");
});

test("late completion after private deletion changes global cost without recreating account data", async () => {
  const actor = { ...paid, uid: "deleted-generation" };
  const lease = await begin("deleted-late", actor);
  let release!: (value: { usage: { input_tokens: number; output_tokens: number } }) => void;
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => { started = resolve; });
  const response = new Promise<{ usage: { input_tokens: number; output_tokens: number } }>((resolve) => { release = resolve; });
  const work = runGenerationProviderCall(lease, { model: "gpt-5.6-luna" }, () => { started(); return response; });
  await didStart;
  await abandonGenerationUsage(lease.operationId);
  await abandonGenerationUsage(lease.operationId);
  const toRemove = [lease.operationPath, lease.operation.accounting.requestPath, lease.operation.accounting.periodPath, lease.operation.accounting.userBudgetPath,
    `users/${actor.uid}/courseCredits/current`, `users/${actor.uid}/courseCreditClaims/${lease.operationId}`];
  await deleteAccountRecords(actor.uid, toRemove);
  release({ usage: { input_tokens: 10, output_tokens: 10 } });
  await assert.rejects(work, /ownership/);
  for (const path of toRemove) assert.equal(await getStoredDocument(path), null);
  assert.equal((await getStoredDocument(lease.receiptPath))?.actualCostMicros, 70);
  assert.equal((await getStoredDocument(lease.receiptPath))?.uncertainCostMicros, 0);
});

import { reserveAiUsage, finalizeAiUsage, reconcileExpiredAiUsage } from "../../src/lib/ai-usage.ts";
import { captureAccountGeneration, runWithAccountGeneration, runWithAccountDeletion, currentAccountGeneration } from "../../src/lib/account-lifecycle.ts";

test("generic AI settlement retains original paths and cannot clear a replacement token", async () => {
  const actor = { ...account, uid: "generic-owner" };
  const generation = await captureAccountGeneration(actor.uid);
  const reservation = await runWithAccountGeneration(generation, () => reserveAiUsage(actor, "lesson_generation", "generic-identity"));
  const globalBefore = Number((await getStoredDocument(reservation.globalPath))?.actualCostMicros ?? 0);
  const period = await getStoredDocument(reservation.periodPath);
  const request = await getStoredDocument(reservation.requestPath);
  assert.equal(request?.periodPath, reservation.periodPath);
  assert.equal(request?.globalPath, reservation.globalPath);
  assert.equal(request?.attemptToken, reservation.attemptToken);
  await putStoredDocument(reservation.periodPath, { ...period, activeRequestId: "replacement-request", activeAttemptToken: "replacement-token" });
  await runWithAccountGeneration(generation, () => finalizeAiUsage(reservation, { model: "gpt-5.6-luna", inputTokens: 100, outputTokens: 50 }));
  await runWithAccountGeneration(generation, () => finalizeAiUsage(reservation, { model: "gpt-5.6-luna", inputTokens: 100, outputTokens: 50 }));
  const finalPeriod = await getStoredDocument(reservation.periodPath);
  assert.equal(finalPeriod?.activeRequestId, "replacement-request");
  assert.equal(finalPeriod?.activeAttemptToken, "replacement-token");
  assert.equal(finalPeriod?.actualCostMicros, 400);
  assert.equal(Number((await getStoredDocument(reservation.globalPath))?.actualCostMicros) - globalBefore, 400);
});

test("generic expired reservation reconciles unknown cost and late usage without double release", async () => {
  const actor = { ...account, uid: "generic-expired" };
  const generation = await captureAccountGeneration(actor.uid);
  const reservation = await runWithAccountGeneration(generation, () => reserveAiUsage(actor, "lesson_generation", "generic-expired-id"));
  const request = await getStoredDocument(reservation.requestPath);
  const expired = new Date(Date.parse(String(request?.leaseUntil)) + 1);
  assert.equal(await reconcileExpiredAiUsage(reservation.requestId, false, expired), "would_contain_unknown_outcome");
  assert.equal(await reconcileExpiredAiUsage(reservation.requestId, true, expired), "contained_unknown_outcome");
  assert.equal(await reconcileExpiredAiUsage(reservation.requestId, true, expired), "none");
  const before = await getStoredDocument(reservation.globalPath);
  assert.equal(before?.uncertainCostMicros, reservation.reserveCostMicros);
  const actualBefore = Number(before?.actualCostMicros ?? 0);
  await runWithAccountGeneration(generation, () => finalizeAiUsage(reservation, { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10 }));
  await runWithAccountGeneration(generation, () => finalizeAiUsage(reservation, { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10 }));
  const after = await getStoredDocument(reservation.globalPath);
  assert.equal(after?.uncertainCostMicros, 0);
  assert.equal(after?.reservedCostMicros, 0);
  assert.equal(Number(after?.actualCostMicros) - actualBefore, 70);
});

import { NextResponse } from "next/server";

test("lost HTTP response after the course transaction recovers without another provider cost", async (context) => {
  const key = "lost-response-operation";
  const originalJson = NextResponse.json;
  let failResponse = true;
  context.mock.method(NextResponse, "json", (...args: Parameters<typeof NextResponse.json>) => {
    const body = args[0] as { courseId?: string; recovered?: boolean };
    if (body?.courseId && !body.recovered && failResponse) { failResponse = false; throw new Error("fixture response transport failed"); }
    return originalJson(...args);
  });
  const request = () => new Request("https://fixture.invalid/api/generate-course", { method: "POST", headers: { Authorization: "Bearer local-dev-token", "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ topic: "Careful reasoning", goal: "Compare the evidence behind a claim.", language: "English" }) });
  const first = await actualGenerateCourse(request());
  assert.equal(first.status, 500);
  const id = generationOperationId("local-owner", key);
  const before = await getStoredDocument(`generationUsageReceipts/${id}`);
  assert.equal((await getGenerationOperation("local-owner", id))?.status, "completed");
  const replay = await actualGenerateCourse(request());
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).courseId, id);
  assert.deepEqual(await getStoredDocument(`generationUsageReceipts/${id}`), before);
});

test("generic retry keeps the original accounting month after a failed attempt", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-31T23:50:00Z") });
  const actor = { ...account, uid: "generic-month" };
  const generation = await captureAccountGeneration(actor.uid);
  const first = await runWithAccountGeneration(generation, () => reserveAiUsage(actor, "lesson_generation", "month-rollover-key"));
  await runWithAccountGeneration(generation, () => finalizeAiUsage(first, { failed: true }));
  context.mock.timers.tick(60 * 60_000);
  const next = await runWithAccountGeneration(generation, () => reserveAiUsage(actor, "lesson_generation", "month-rollover-key"));
  assert.equal(next.periodPath, first.periodPath);
  assert.equal(next.globalPath, first.globalPath);
  assert.equal((await getStoredDocument(next.globalPath))?.periodKey, "2026-01");
  await runWithAccountGeneration(generation, () => finalizeAiUsage(next, { failed: true }));
});

import { GET as operationStatus, POST as operationResume } from "../../src/app/api/generation-operations/[operationId]/route.ts";
import { GET as operationList } from "../../src/app/api/generation-operations/route.ts";

test("real status/resume APIs are private, recover committed results, and reject another account", async () => {
  const id = generationOperationId("local-owner", "actual-route-checkpoint");
  const request = (token: string, method = "GET") => new Request(`https://fixture.invalid/api/generation-operations/${id}`, { method, headers: { Authorization: `Bearer ${token}` } });
  const context = { params: Promise.resolve({ operationId: id }) };
  const status = await operationStatus(request("local-dev-token"), context);
  assert.equal(status.status, 200);
  assert.equal(status.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await status.json()).status, "completed");
  const replay = await operationResume(request("local-dev-token", "POST"), context);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).courseId, id);
  const list = await operationList(request("local-dev-token"));
  assert.equal(list.status, 200);
  assert.ok((await list.json()).operations.some((operation: { operationId: string }) => operation.operationId === id));
  await putStoredDocument("users/local-plus-learner", { uid: "local-plus-learner", plan: "plus", manualPlan: "plus", manualPlanUntil: new Date(Date.now() + 86_400_000).toISOString(), accountStatus: "active", acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION });
  const other = await operationStatus(request("playwright-plus-learner"), context);
  assert.equal(other.status, 404);
});

import { spawnSync } from "node:child_process";
test('late generic response after a replacement token reconciles individual uncertainty', async () => {
 const actor = { uid: 'review-late-retry', plan: 'pro', access: 'owner', isOwner: true, accountStatus: 'active', subscriptionStatus: 'active' } as const;
 const generation = await captureAccountGeneration(actor.uid);
 await runWithAccountGeneration(generation, async () => {
  const first = await reserveAiUsage(actor, 'lesson_generation', 'review-late-same-key');
  await finalizeAiUsage(first, {failed:true});
  const second = await reserveAiUsage(actor, 'lesson_generation', 'review-late-same-key');
  await finalizeAiUsage(second, {model:'gpt-5.6-luna', inputTokens:10, outputTokens:10});
  await finalizeAiUsage(first, {model:'gpt-5.6-luna', inputTokens:10, outputTokens:10});
  const global = await getStoredDocument(first.globalPath);
  const personal = await getStoredDocument(first.userBudgetPath);
  console.log(JSON.stringify({case:'late-after-retry', globalActual:global?.actualCostMicros,globalUncertain:global?.uncertainCostMicros,personalActual:personal?.actualCostMicros,personalUncertain:personal?.uncertainCostMicros,maintenance:await reconcileExpiredAiUsage(first.requestId,true)}));
  assert.equal(personal?.uncertainCostMicros,0,'Both observed calls must release their own individual uncertainty');
  assert.equal(personal?.actualCostMicros,140);
 });
});

test('maintenance exits nonzero when a legacy AI request requires manual reconciliation', async () => {
 await putStoredDocument('aiRequests/review-legacy-missing-paths', {uid:'review-legacy',status:'reserved',leaseUntil:'2020-01-01T00:00:00Z',reservedCostMicros:1000});
 const result=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','scripts/reconcile-generation-operations.ts','--dry-run'],{encoding:'utf8',timeout:15_000,env:{...process.env,NODE_ENV:'test',DATABASE_URL:''}});
 console.log(JSON.stringify({case:'manual-maintenance',exit:result.status,stdout:result.stdout}));
 assert.notEqual(result.status,0,'Unresolved legacy accounting is a blocked gate');
});

import { retainCreationIdentity } from "../../src/lib/course-creation-identity.ts";
import { aiUsageAttemptPath, abandonAiUsage } from "../../src/lib/ai-usage.ts";

test("lost first POST retains the client identity even if the form changes", async () => {
  let keys = 0;
  const identity = retainCreationIdentity(null, JSON.stringify({ topic: "Inference", goal: "Interpret evidence carefully.", language: "English" }), () => `client-identity-${++keys}`);
  const request = (saved: typeof identity) => new Request("https://fixture.invalid/api/generate-course", { method: "POST", headers: { Authorization: "Bearer local-dev-token", "Content-Type": "application/json", "Idempotency-Key": saved.key }, body: saved.signature });
  await actualGenerateCourse(request(identity)); // Simulate losing the entire response.
  const replayIdentity = retainCreationIdentity(identity, JSON.stringify({ topic: "Changed form" }), () => `client-identity-${++keys}`);
  const replay = await actualGenerateCourse(request(replayIdentity));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).courseId, generationOperationId("local-owner", identity.key));
  assert.equal(keys, 1);
});

test("late usage settles once without clearing the replacement attempt's lock", async () => {
  const actor = { ...account, uid: "same-key-active-lock" };
  const generation = await captureAccountGeneration(actor.uid);
  await runWithAccountGeneration(generation, async () => {
    const first = await reserveAiUsage(actor, "lesson_generation", "same-key-active-lock");
    await finalizeAiUsage(first, { failed: true });
    const second = await reserveAiUsage(actor, "lesson_generation", "same-key-active-lock");
    await finalizeAiUsage(first, { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10 });
    await finalizeAiUsage(first, { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10 });
    const period = await getStoredDocument(first.periodPath);
    assert.equal(period?.activeAttemptToken, second.attemptToken);
    assert.equal(period?.reservedCostMicros, second.reserveCostMicros);
    assert.equal(period?.actualCostMicros, 70);
    assert.equal(period?.uncertainCostMicros, 0);
    await finalizeAiUsage(second, { failed: true });
  });
});

test("maintenance can settle a retained attempt after the global checkpoint alone", async () => {
  const actor = { ...account, uid: "late-maintenance" };
  const generation = await captureAccountGeneration(actor.uid);
  await runWithAccountGeneration(generation, async () => {
    const first = await reserveAiUsage(actor, "lesson_generation", "late-maintenance");
    await finalizeAiUsage(first, { failed: true });
    const second = await reserveAiUsage(actor, "lesson_generation", "late-maintenance");
    const receiptPath = `generationUsageReceipts/legacy-${first.requestId}-${first.attemptToken}`;
    await putStoredDocument(receiptPath, { version: 1, kind: "legacy-ai-completion", status: "observed", actualCostMicros: 70, inputTokens: 10, outputTokens: 10, globalPath: first.globalPath });
    const id = aiUsageAttemptPath(first).split("/")[1];
    assert.equal(await reconcileExpiredAiUsage(id, true), "reconciled_observed_attempt");
    assert.equal(await reconcileExpiredAiUsage(id, true), "none");
    assert.equal((await getStoredDocument(first.periodPath))?.activeAttemptToken, second.attemptToken);
    assert.equal((await getStoredDocument(first.userBudgetPath))?.actualCostMicros, 70);
    assert.equal((await getStoredDocument(first.userBudgetPath))?.uncertainCostMicros, 0);
    await finalizeAiUsage(second, { failed: true });
  });
});

test("generic deletion retains uncertain cost and late completion cannot recreate personal records", async () => {
  const actor = { ...account, uid: "generic-delete" };
  const generation = await captureAccountGeneration(actor.uid);
  const first = await runWithAccountGeneration(generation, () => reserveAiUsage(actor, "lesson_generation", "generic-delete"));
  await abandonAiUsage(first.requestId);
  await abandonAiUsage(first.requestId);
  const before = await getStoredDocument(first.globalPath);
  assert.equal(before?.reservedCostMicros, 0);
  const uncertainty = Number(before?.uncertainCostMicros);
  const personalPaths = [first.requestPath, aiUsageAttemptPath(first), first.periodPath, first.userBudgetPath];
  await deleteAccountRecords(actor.uid, personalPaths);
  await runWithAccountGeneration(generation, () => finalizeAiUsage(first, { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10 }));
  for (const path of personalPaths) assert.equal(await getStoredDocument(path), null);
  assert.equal(Number((await getStoredDocument(first.globalPath))?.uncertainCostMicros), uncertainty - first.reserveCostMicros);
});

import { denyGenerationAdmission } from "../../src/lib/generation-operations.ts";

test("confirmed admission denial closes its key before a new request can be permitted", async () => {
  const actor = { ...paid, uid: "local-plus-learner", plan: "plus" as const };
  const generation = await captureAccountGeneration(actor.uid);
  const initial = await begin("deny-seed", actor);
  await finishGenerationOperation(initial, { failed: true });
  const ledgerPath = `users/${actor.uid}/courseCredits/current`;
  const ledger = await getStoredDocument(ledgerPath);
  await putStoredDocument(ledgerPath, { ...ledger, balance: 0 });
  const key = "confirmed-denial-key";
  const request = () => new Request("https://fixture.invalid/api/generate-course", { method: "POST", headers: { Authorization: "Bearer playwright-plus-learner", "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ topic: "Evidence", goal: "Interpret research claims.", language: "English" }) });
  const denied = await actualGenerateCourse(request());
  assert.equal(denied.status, 409);
  assert.equal((await denied.json()).admitted, false);
  const id = generationOperationId(actor.uid, key);
  assert.equal(await getGenerationOperation(actor.uid, id), null);
  assert.equal((await getStoredDocument(`aiRequests/${id}`))?.status, "not_admitted");
  await putStoredDocument(ledgerPath, { ...ledger, balance: 1 });
  const delayed = await actualGenerateCourse(request());
  assert.equal((await delayed.json()).admitted, false, "An older queued POST cannot admit the closed key after credit changes.");
  const next = await begin("new-after-denial", actor);
  assert.equal(await runWithAccountGeneration(generation, () => denyGenerationAdmission(next.operationId)), false, "An admitted key cannot be declared unadmitted.");
  await finishGenerationOperation(next, { failed: true });
});
