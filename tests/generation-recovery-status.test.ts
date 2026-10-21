import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

// Route-level regression for the 2026-10-16 staging incident: a course
// generation whose provider call died mid-flight left the operation running
// with an in-flight stage. After the lease expired, resuming reconciled the
// operation to failed and restored the credit, but the error response omitted
// the operation's terminal status, so the create page kept offering "Resume"
// instead of "Start a new request". The provider exception was also discarded
// silently; it must be logged in sanitized form under the operation id.

const directory = mkdtempSync(join(tmpdir(), "generation-recovery-status-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.OPENAI_API_KEY = "test-provider-key";
process.env.SITE_VERSION = "a".repeat(40);
process.env.COURSE_PIPELINE_V2 = "false";
after(() => rmSync(directory, { recursive: true, force: true }));

const { POST } = await import("../src/app/api/generate-course/route.ts");
const { captureAccountGeneration, runWithAccountGeneration } = await import("../src/lib/account-lifecycle.ts");
const { getStoredDocument, putStoredDocument } = await import("../src/lib/document-store.ts");
const { generationOperationId } = await import("../src/lib/generation-operations.ts");
const { TERMS_VERSION, PRIVACY_VERSION } = await import("../src/lib/legal.ts");

const KEY = "recovery-status-fixture-key";
const operationId = generationOperationId("local-owner", KEY);
const body = JSON.stringify({
  topic: "Scientific reasoning",
  goal: "Compare evidence behind everyday claims.",
  application: "Evaluate a health headline.",
  background: "Comfortable with basic statistics.",
  level: "Intermediate",
  weeklyMinutes: 60,
  targetWeeks: 4,
  courseStyle: "Balanced",
  language: "English",
});
const request = () => new Request("https://fixture.invalid/api/generate-course", {
  method: "POST",
  headers: {
    Authorization: "Bearer local-dev-token",
    "Content-Type": "application/json",
    "Idempotency-Key": KEY,
  },
  body,
});

test("a reconciled provider failure reports the terminal status and logs the sanitized exception", async () => {
  const actor = await captureAccountGeneration("local-owner");
  await runWithAccountGeneration(actor, () => putStoredDocument("users/local-owner", {
    uid: "local-owner", plan: "pro", accountStatus: "active",
    acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION,
  }));

  const errorLines: string[] = [];
  const errorSpy = mock.method(console, "error", (...args: unknown[]) => {
    errorLines.push(args.map((arg) => String(arg)).join(" "));
  });
  // The provider answers HTTP 500 (its error body deliberately contains
  // prompt-like text that must never reach the logs).
  const fetchSpy = mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify({ error: { message: "provider exploded with prompt text that must never be logged", type: "api_error", code: "server_error" } }),
    { status: 500, headers: { "Content-Type": "application/json", "x-request-id": "req_fixture_123" } },
  ));
  try {
    // First attempt: the provider call dies after admission, leaving the
    // operation running with an in-flight stage (the staging state).
    const first = await POST(request());
    assert.equal(first.status, 409, await first.clone().text().catch(() => ""));
    const stuck = await getStoredDocument(`generationOperations/${operationId}`);
    assert.equal(stuck?.status, "running");
    assert.ok(Array.isArray(stuck?.pendingCalls) && stuck.pendingCalls.length > 0, "stage left in flight");

    // The sanitized provider log line was emitted under the operation id,
    // carrying only allow-listed fields (never the error message/prompt).
    const providerLog = errorLines.map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .find((entry) => entry?.event === "generation_provider_outcome_unknown");
    assert.ok(providerLog, `expected a generation_provider_outcome_unknown log line, got: ${errorLines.join(" | ")}`);
    assert.equal(providerLog.operationId, operationId);
    assert.equal(providerLog.status, 500);
    assert.equal(providerLog.requestId, "req_fixture_123");
    assert.ok(!JSON.stringify(providerLog).includes("prompt text"), "log line must not contain prompt/message text");

    // Expire the lease (the fixture equivalent of the staging wait), then
    // resume: reconciliation closes the operation as failed, and the error
    // response must carry that terminal status to the client.
    await runWithAccountGeneration(actor, () => putStoredDocument(`generationOperations/${operationId}`, { ...stuck, leaseUntil: new Date(Date.now() - 1_000).toISOString() }));
    const resumed = await POST(request());
    const resumedBody = await resumed.json() as Record<string, unknown>;
    assert.equal(resumedBody.code, "GENERATION_OUTCOME_UNKNOWN", JSON.stringify(resumedBody));
    assert.equal(resumedBody.status, "failed", `terminal status must be present, got: ${JSON.stringify(resumedBody)}`);
    assert.equal(resumedBody.operationId, operationId);
    const settled = await getStoredDocument(`generationOperations/${operationId}`);
    assert.equal(settled?.status, "failed");
  } finally {
    fetchSpy.mock.restore();
    errorSpy.mock.restore();
  }
});

test("an explicit invalid-key rejection ends immediately without uncertain cost or a repeated call", async () => {
  const key = "invalid-key-rejection-fixture";
  const id = generationOperationId("local-owner", key);
  let calls = 0;
  const fetchSpy = mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "private-key-text", type: "invalid_request_error", code: "invalid_api_key" } }), {
      status: 401, headers: { "Content-Type": "application/json", "x-request-id": "req_rejected_fixture" },
    });
  });
  const rejectedRequest = () => new Request("https://fixture.invalid/api/generate-course", {
    method: "POST", headers: { Authorization: "Bearer local-dev-token", "Content-Type": "application/json", "Idempotency-Key": key }, body,
  });
  try {
    const response = await POST(rejectedRequest());
    const result = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 503);
    assert.equal(result.code, "GENERATION_PROVIDER_UNAVAILABLE");
    assert.equal(result.status, "failed");
    assert.ok(!JSON.stringify(result).includes("private-key-text"));
    const operation = await getStoredDocument(`generationOperations/${id}`);
    assert.equal(operation?.status, "failed");
    assert.deepEqual(operation?.pendingCalls, []);
    const receipt = await getStoredDocument(`generationUsageReceipts/${id}`);
    assert.equal(receipt?.uncertainCostMicros, 0);
    assert.equal(receipt?.remainingReserveMicros, 0);
    await POST(rejectedRequest());
    assert.equal(calls, 1, "a terminal saved identity must not redispatch");
  } finally { fetchSpy.mock.restore(); }
});

test("invalid-key rejection restores a paid learner's reserved course credit exactly once", async () => {
  const { beginGenerationOperation, runGenerationProviderCall, finishGenerationOperation } = await import("../src/lib/generation-operations.ts");
  const uid = "rejected-paid-learner";
  const account = { uid, plan: "pro", access: "pro", isOwner: false, accountStatus: "active", subscriptionStatus: "active" } as const;
  const lease = await beginGenerationOperation(account, "paid-rejected-request", { topic: "Evidence" });
  const balance = async () => (await getStoredDocument(`users/${uid}/courseCredits/current`))?.balance;
  assert.equal(await balance(), 4);
  await assert.rejects(runGenerationProviderCall(lease, { model: "fixture" }, async () => {
    throw Object.assign(new Error("private credential text"), { status: 401, code: "invalid_api_key" });
  }), (error: unknown) => (error as { code?: string }).code === "GENERATION_PROVIDER_UNAVAILABLE");
  assert.equal(await balance(), 5);
  await finishGenerationOperation(lease, { failed: true });
  assert.equal(await balance(), 5);
});

test("concurrent authentication rejections clear late uncertainty without double refunds", async () => {
  const { beginGenerationOperation, runGenerationProviderCall } = await import("../src/lib/generation-operations.ts");
  const uid = "concurrent-rejected-learner";
  const account = { uid, plan: "pro", access: "pro", isOwner: false, accountStatus: "active", subscriptionStatus: "active" } as const;
  const lease = await beginGenerationOperation(account, "concurrent-auth-rejected", { topic: "Evidence" });
  let rejectLate!: (error: Error) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const lateProvider = new Promise<never>((_, reject) => { rejectLate = reject; });
  const late = runGenerationProviderCall(lease, { model: "fixture-late" }, () => { started(); return lateProvider; });
  const lateResult = assert.rejects(late, (error: unknown) => (error as { code?: string }).code === "GENERATION_PROVIDER_UNAVAILABLE");
  await ready;
  const rejection = () => Object.assign(new Error("private credential"), { status: 401, code: "invalid_api_key" });
  await assert.rejects(runGenerationProviderCall(lease, { model: "fixture-first" }, async () => { throw rejection(); }));
  assert.ok(Number((await getStoredDocument(lease.receiptPath))?.uncertainCostMicros) > 0);
  rejectLate(rejection());
  await lateResult;
  for (const path of [lease.receiptPath, lease.operation.accounting.globalPath, lease.operation.accounting.userBudgetPath, lease.operation.accounting.periodPath]) {
    assert.equal((await getStoredDocument(path))?.uncertainCostMicros, 0, path);
  }
  assert.equal((await getStoredDocument(`users/${uid}/courseCredits/current`))?.balance, 5);
});

test("authentication rejection retains sibling uncertainty and accounts for a late success", async () => {
  const { beginGenerationOperation, runGenerationProviderCall } = await import("../src/lib/generation-operations.ts");
  for (const outcome of ["success", "timeout"] as const) {
    const uid = `rejection-with-late-${outcome}`;
    const account = { uid, plan: "pro", access: "pro", isOwner: false, accountStatus: "active", subscriptionStatus: "active" } as const;
    const lease = await beginGenerationOperation(account, `reject-late-${outcome}`, { topic: "Evidence" });
    let resolveLate!: (value: { id: string; usage: { input_tokens: number; output_tokens: number } }) => void;
    let rejectLate!: (error: Error) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const provider = new Promise<{ id: string; usage: { input_tokens: number; output_tokens: number } }>((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
    const late = runGenerationProviderCall(lease, { model: "gpt-5.6-luna" }, () => { started(); return provider; });
    const lateResult = assert.rejects(late);
    await ready;
    await assert.rejects(runGenerationProviderCall(lease, { model: "auth-rejected" }, async () => {
      throw Object.assign(new Error("rejected"), { status: 401, code: "invalid_api_key" });
    }));
    assert.ok(Number((await getStoredDocument(lease.receiptPath))?.uncertainCostMicros) > 0);
    if (outcome === "success") resolveLate({ id: "late-success", usage: { input_tokens: 100, output_tokens: 50 } });
    else rejectLate(new Error("transport timeout"));
    await lateResult;
    const receipt = await getStoredDocument(lease.receiptPath);
    if (outcome === "success") {
      assert.equal(receipt?.uncertainCostMicros, 0);
      assert.ok(Number(receipt?.actualCostMicros) > 0);
    } else assert.ok(Number(receipt?.uncertainCostMicros) > 0, "unknown sibling outcome must remain reserved as uncertainty");
    assert.equal((await getStoredDocument(`users/${uid}/courseCredits/current`))?.balance, 5);
  }
});
