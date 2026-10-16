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
