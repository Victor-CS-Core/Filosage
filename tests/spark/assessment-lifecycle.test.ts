import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import type { ServerAccount } from "../../src/lib/account-server.ts";
import type { SparkLessonContext } from "../../src/lib/spark/access.ts";
import type { SparkSessionRecord } from "../../src/lib/spark/repository.ts";

if (process.env.OPENAI_API_KEY || process.env.CLOUDFLARE_D1_ENABLED === "true" || process.env.NODE_ENV === "production") throw new Error("Spark lifecycle tests require isolated fixtures.");
mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-30T12:00:00.000Z") });
after(() => mock.timers.reset());
const directory = mkdtempSync(join(tmpdir(), "spark-assessment-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.OPENAI_API_KEY = "testfixture-spark-never-sent";
process.env.SPARK_ENABLED = "true";
process.env.SPARK_LIVE_AI_ENABLED = "true";
after(() => rmSync(directory, { recursive: true, force: true }));

const { setTestBindings, clearTestBindings } = await import("../../src/lib/cloudflare-context.ts");
const { captureAccountGeneration, runWithAccountGeneration } = await import("../../src/lib/account-lifecycle.ts");
const { putStoredDocument, listAllStoredDocuments } = await import("../../src/lib/document-store.ts");
const { configureSparkBudget } = await import("../../src/lib/spark/budget.ts");
const { assessSparkAttempt } = await import("../../src/lib/spark/assessment.ts");
const { orchestrateSparkTurn, sparkOrchestrationErrorResponse } = await import("../../src/lib/spark/orchestration.ts");
const { appendSparkTurn } = await import("../../src/lib/spark/repository.ts");
const { savedTextFallback } = await import("../../src/lib/spark/contracts.ts");

class Statement {
  private values: unknown[] = [];
  constructor(private database: DatabaseSync, private sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return this.database.prepare(this.sql).get(...this.values) as T | null; }
  async all<T>() { return { results: this.database.prepare(this.sql).all(...this.values) as T[] }; }
  runSync() { return { success: true, meta: { changes: Number(this.database.prepare(this.sql).run(...this.values).changes) } }; }
  async run() { return this.runSync(); }
}

async function fixture(options: { rejectRelease?: boolean } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(readFileSync("infra/cloudflare/d1/002_spark_budget.sql", "utf8"));
  setTestBindings({ FILOSAGE_D1: {
    prepare: (sql: string) => {
      if (options.rejectRelease && sql.includes("SET status = 'released'")) throw new Error("Fixture ledger write failure");
      return new Statement(database, sql);
    },
    batch: async (statements: Statement[]) => {
      database.exec("BEGIN");
      try { const result = statements.map((statement) => statement.runSync()); database.exec("COMMIT"); return result; }
      catch (error) { database.exec("ROLLBACK"); throw error; }
    },
  } });
  const uid = `spark-fixture-${randomUUID()}`;
  const scope = await captureAccountGeneration(uid);
  const owned = <T>(work: () => T) => runWithAccountGeneration(scope, work);
  const account: ServerAccount = { uid, isOwner: true, plan: "pro", access: "owner", accountStatus: "active", subscriptionStatus: "active" };
  const context: SparkLessonContext = {
    courseId: "fixture-course", lessonId: "0-0", lessonVersion: "lesson-fixture", contentHash: "a".repeat(64),
    course: { topic: "Evidence", modules: [] }, summary: { title: "Use evidence", concept: "Separate evidence from inference." },
    lesson: { content: "An observation records what was measured; an inference proposes an explanation.", quizzes: [] },
  };
  const session = { id: "session-fixture", courseId: context.courseId, lessonId: context.lessonId, lessonVersion: context.lessonVersion, ownerUid: uid, stage: "practice" } as SparkSessionRecord;
  const attempt = { id: `attempt-${"a".repeat(24)}`, requestId: randomUUID(), ownerUid: uid, sessionId: session.id, taskVersion: "task-fixture", payloadHash: "payload-fixture", gradingMethod: "pending_ai", committedAnswer: { kind: "text", text: "The measurement is an observation and the explanation is an inference." } };
  await owned(async () => {
    await putStoredDocument(`users/${uid}`, { uid, accountStatus: "active" });
    await putStoredDocument(`sparkSessions/${session.id}`, session);
    await putStoredDocument(`sparkTasks/${attempt.taskVersion}`, { ...context, taskId: "transfer", taskVersion: attempt.taskVersion, objectiveIds: ["objective-evidence"], kind: "text", rubricVersion: "rubric-fixture", criteria: ["Distinguishes observation from inference."], grading: "ai_rubric" });
    await putStoredDocument(`sparkAttempts/${attempt.id}`, attempt);
    await configureSparkBudget({ actorUid: uid, mode: "live", liveAiEnabled: true, preparationEnabled: false, concurrencyLimit: 4, aiCapMicros: 17_000_000, categoryCaps: { tutoring: 12_000_000, preparation: 3_000_000, assessment: 2_000_000, summary: 0, embedding: 0 }, reason: "Isolated SDK lifecycle fixture" });
  });
  const run = () => owned(() => assessSparkAttempt({ request: new Request("https://fixture.invalid/spark"), account, context, session, attempt }));
  const runTurn = (message = "Explain the distinction.") => owned(() => orchestrateSparkTurn({ request: new Request("https://fixture.invalid/spark"), account, context, session, requestId: attempt.requestId, action: "explain", message }));
  const saveTurn = () => owned(() => appendSparkTurn({ session, requestId: attempt.requestId, action: "explain", message: "Explain the distinction.", response: savedTextFallback(context.lessonVersion, context.lesson.content), sourceIds: [] }));
  return { database, run, runTurn, saveTurn, owned, uid, close: () => { clearTestBindings(); database.close(); } };
}

function provider(onCount: () => Promise<number>, onInference?: () => void) {
  let inferences = 0;
  const transport = mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    const path = String(url);
    if (path.endsWith("/moderations")) return Response.json({ id: "modr-fixture", model: "omni-moderation-latest", results: [{ flagged: false }] });
    if (path.endsWith("/responses/input_tokens")) return Response.json({ object: "response.input_tokens", input_tokens: await onCount() });
    assert.ok(path.endsWith("/responses"), "Unexpected endpoint; fixture never permits real network access");
    inferences += 1;
    onInference?.();
    const output = { outcome: "demonstrated", summary: "The distinction is supported.", criteria: [{ criterionIndex: 0, met: true, feedback: "Separates observation and explanation." }] };
    return Response.json({ id: "resp-fixture", object: "response", status: "completed", model: "gpt-4.1-mini-2025-04-14", output: [{ id: "msg-fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }], usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } } });
  });
  return { count: () => inferences, restore: () => transport.mock.restore() };
}

test("concurrent assessment requests dispatch one paid inference and preserve the winner", async () => {
  const f = await fixture();
  let started!: () => void; let secondCount!: () => void; let release!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const duplicate = new Promise<void>((resolve) => { secondCount = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  let counts = 0;
  const p = provider(async () => { counts += 1; started(); if (counts === 2) secondCount(); await held; return 100; });
  try {
    const first = f.run();
    await entered;
    const second = f.run();
    await Promise.race([second.catch(() => undefined), duplicate]);
    release();
    const outcomes = await Promise.allSettled([first, second]);
    assert.equal(p.count(), 1);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    const row = f.database.prepare("SELECT status FROM spark_usage_reservation").get();
    assert.equal(row?.status, "committed");
    const evidence = await f.owned(() => listAllStoredDocuments(`users/${f.uid}/masteryEvidence`, 20));
    assert.equal(evidence.length, 1);
    await f.run();
    assert.equal(p.count(), 1, "A saved assessment replays without another inference");
  } finally { release(); p.restore(); f.close(); }
});

for (const failure of ["ledger_release", "personal_settlement"] as const) test(`turn ${failure} failure withholds permission for a new request identity`, async () => {
  const f = await fixture({ rejectRelease: failure === "ledger_release" });
  let restoreDisk: (() => void) | undefined;
  const p = provider(async () => {
    if (failure === "personal_settlement") {
      const fault = mock.method(fs, "writeFileSync", () => { throw new Error("Fixture disk write failure"); });
      syncBuiltinESMExports();
      restoreDisk = () => { fault.mock.restore(); syncBuiltinESMExports(); };
    }
    throw new TypeError("Fixture counter unavailable");
  });
  try {
    let caught: unknown;
    try { await f.runTurn(); } catch (error) { caught = error; }
    const response = sparkOrchestrationErrorResponse(caught);
    assert.equal((await response?.json())?.retryWithNewRequest, false);
    assert.equal(p.count(), 0);
    assert.equal(f.database.prepare("SELECT status FROM spark_usage_reservation").get()?.status, failure === "ledger_release" ? "reserved" : "released");
  } finally { restoreDisk?.(); p.restore(); f.close(); }
});

test("a saved turn replays only for the same learner payload", async () => {
  const f = await fixture();
  try {
    await f.saveTurn();
    assert.equal((await f.runTurn()).replayed, true);
    await assert.rejects(f.runTurn("A different question using the same request identity."), { code: "IDEMPOTENCY_CONFLICT" });
    assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM spark_usage_reservation").get()?.count, 0);
  } finally { f.close(); }
});

for (const failure of ["count_failure", "ambiguous_inference"] as const) test(`turn ${failure} exposes a new retry identity only after confirmed no dispatch`, async () => {
  const f = await fixture();
  const p = provider(async () => { if (failure === "count_failure") throw new TypeError("fixture count failure"); return 100; }, () => { throw new TypeError("fixture connection lost"); });
  try {
    let caught: unknown;
    try { await f.runTurn(); } catch (error) { caught = error; }
    assert.ok(caught);
    const response = sparkOrchestrationErrorResponse(caught);
    if (failure === "count_failure") {
      assert.equal(response?.status, 503);
      assert.equal((await response?.json())?.retryWithNewRequest, true);
      let replayError: unknown;
      try { await f.runTurn(); } catch (error) { replayError = error; }
      const replayResponse = sparkOrchestrationErrorResponse(replayError);
      const body = await replayResponse?.json();
      assert.equal(body?.code, "SPARK_REQUEST_NOT_STARTED");
      assert.equal(body?.retryWithNewRequest, true, "A lost preflight response can be recovered without dispatching the released identity");
    } else {
      assert.equal(response, null);
    }
    assert.equal(p.count(), failure === "ambiguous_inference" ? 1 : 0);
    assert.equal(f.database.prepare("SELECT status FROM spark_usage_reservation").get()?.status, failure === "ambiguous_inference" ? "unknown" : "released");
  } finally { p.restore(); f.close(); }
});

for (const failure of ["over_limit", "count_failure", "ambiguous_inference"] as const) test(`assessment ${failure} retains accurate exposure without automatic inference retry`, async () => {
  const f = await fixture();
  const p = provider(async () => { if (failure === "count_failure") throw new TypeError("fixture count failure"); return failure === "over_limit" ? 4_001 : 100; }, () => { if (failure === "ambiguous_inference") throw new TypeError("fixture connection lost"); });
  try {
    await assert.rejects(f.run());
    assert.equal(p.count(), failure === "ambiguous_inference" ? 1 : 0);
    const row = f.database.prepare("SELECT status FROM spark_usage_reservation").get();
    assert.equal(row?.status, failure === "ambiguous_inference" ? "unknown" : "released");
    const exposure = f.database.prepare("SELECT reserved_microusd, unknown_microusd FROM spark_month_budget").get();
    assert.equal(exposure?.reserved_microusd, 0);
    assert.equal(exposure?.unknown_microusd, failure === "ambiguous_inference" ? 3_040 : 0);
    await assert.rejects(f.run());
    assert.equal(p.count(), failure === "ambiguous_inference" ? 1 : 0);
  } finally { p.restore(); f.close(); }
});
