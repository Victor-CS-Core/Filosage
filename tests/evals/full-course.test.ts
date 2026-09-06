import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fullCourseCases } from "../../evals/course-pipeline/catalog.ts";
import { budgetState, callCounts, fingerprint, newRun, runFullCourseEvaluation, type EvaluationBackend, type EvaluationConfig, type OperationStatus, type ProviderCall, type RunCheckpoint } from "../../evals/course-pipeline/full-course-runner.ts";
import { openCheckpointDirectory } from "../../evals/course-pipeline/checkpoints.ts";
import { normalizeOperationEvidence, validateEvaluationOrigin } from "../../evals/course-pipeline/http-backend.ts";

const config: EvaluationConfig = {
  runId: "offline-regression", origin: "http://127.0.0.1:3000", buildSha: "a".repeat(40),
  profile: "product-default", evidenceKind: "offline_fixture", budgetMicros: 1_000,
  operationCeilingMicros: 100, callDeadlineMs: 1_000, caseDeadlineMs: 30_000,
};
const chosen = fullCourseCases.slice(0, 1);
function call(id: string, kind: ProviderCall["kind"] = "generation", cost = 4): ProviderCall {
  return { id, kind, status: "completed", costMicros: cost, samples: [{
    model: "gpt-5.6-luna", responseId: `resp_${id}`, promptVersion: "synthetic-offline-only",
    inputTokens: 1, outputTokens: 1,
  }] };
}
function observed(id: string, overrides: Partial<OperationStatus> = {}): OperationStatus {
  return {
    operationId: fingerprint(id), status: "completed", stage: "saved", resultId: id,
    evaluation: { provider: "openai", stub: false, profile: config.profile, actualCostMicros: 4, uncertainCostMicros: 0, calls: [call(id)], versions: { prompt: "synthetic-offline-only" } },
    ...overrides,
  };
}
function fixture() {
  const starts: string[] = [];
  const statuses = new Map<string, OperationStatus>();
  const backend: EvaluationBackend = {
    evidenceKind: "offline_fixture",
    async preflight() { return { version: 1, provider: "openai", stub: false, buildSha: config.buildSha, profile: config.profile, operationUsage: true, lessonOperations: true, enforcedOperationCeilingMicros: 100 }; },
    async start(kind, payload) {
      const id = kind === "course" ? "course1" : String(payload.lessonId).replace("-", "x");
      starts.push(id);
      const response = observed(id);
      statuses.set(response.operationId, response);
      return response;
    },
    async status(id) { const value = statuses.get(id); assert.ok(value); return value; },
    async resume(id) { return this.status(id, new AbortController().signal); },
    async artifact(_course, lesson) {
      return lesson ? { content: `Synthetic fixture lesson ${lesson}`, id: lesson }
        : { id: "course1", modules: [0, 1].map(() => ({ lessons: [{ title: "First" }, { title: "Second" }] })) };
    },
  };
  const snapshots: RunCheckpoint[] = [];
  const run = newRun(config, chosen);
  const execute = (extra: Partial<Parameters<typeof runFullCourseEvaluation>[0]> = {}) => runFullCourseEvaluation({
    run, cases: chosen, backend, save: async (value) => { snapshots.push(structuredClone(value)); },
    validate: async () => ({ issues: [], label: "synthetic fixture validation; not real quality" }), ...extra,
  });
  return { run, backend, starts, statuses, snapshots, execute };
}

test("dry-run lists the approved 12-case evaluation distribution and preserves the 100-case invariant corpus", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/evaluate-model-quality.ts", "--dry-run"], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.cases.length, 12);
  assert.deepEqual(plan.languageDistribution, { English: 8, Spanish: 2, Japanese: 1, "English and Spanish": 1 });
  assert.equal(plan.deterministicInvariantCases, 100);
  assert.equal(plan.providerCalls, 0);
  assert.equal(plan.realCoursesGenerated, 0);
  assert.equal(plan.evidenceKind, "planning_only");
});

test("live mode without exact approval fails before reading credentials or issuing requests", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/evaluate-model-quality.ts", "--live"], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, MODEL_QUALITY_EVAL_LIVE: undefined, OPENAI_API_KEY: "never-print-private-value" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing provider spend/);
  assert.doesNotMatch(result.stdout + result.stderr, /never-print-private-value/);
});

test("missing or stub runtime capability prevents every mutation", async () => {
  for (const missing of [true, false]) {
    const f = fixture();
    const real = await f.backend.preflight(new AbortController().signal);
    f.backend.preflight = async () => missing ? undefined : { ...real!, stub: true } as unknown as typeof real;
    await assert.rejects(f.execute(), /LIVE_CAPABILITY_UNAVAILABLE/);
    assert.deepEqual(f.starts, []);
  }
});

test("a server ceiling different from the approved reservation prevents every mutation", async () => {
  for (const ceiling of [config.operationCeilingMicros - 1, config.operationCeilingMicros + 1]) {
    const f = fixture();
    const real = await f.backend.preflight(new AbortController().signal);
    f.backend.preflight = async () => ({ ...real!, enforcedOperationCeilingMicros: ceiling });
    await assert.rejects(f.execute(), /LIVE_CAPABILITY_UNAVAILABLE/);
    assert.deepEqual(f.starts, []);
    assert.equal(budgetState(f.run).actualMicros, 0);
  }
});

test("retains every planned lesson and never calls offline fixture completion a live pass", async () => {
  const f = fixture();
  await f.execute();
  assert.deepEqual(f.starts, ["course1", "0x0", "0x1", "1x0", "1x1"]);
  const result = f.run.cases[0];
  assert.deepEqual(result.lessonIds, ["0-0", "0-1", "1-0", "1-1"]);
  assert.equal(Object.keys(result.artifacts).length, 5);
  assert.equal(result.status, "fixture_complete");
  assert.equal(result.review.status, "not_reviewed");
  assert.equal(f.run.acceptance, "human_review_required");
  assert.equal(budgetState(f.run).actualMicros, 20);
  assert.equal(f.snapshots[1].cases[0].steps.outline.status, "intent");
  assert.equal(f.snapshots[1].cases[0].steps.outline.operationId, undefined);
});

test("a later-lesson failure fails the case while preserving preceding lessons and all cost", async () => {
  const f = fixture();
  const start = f.backend.start.bind(f.backend);
  f.backend.start = async (...args) => {
    const result = await start(...args);
    return args[1].lessonId === "1-1" ? { ...result, status: "failed" } : result;
  };
  await f.execute();
  assert.equal(f.run.cases[0].status, "blocked");
  assert.equal(f.run.cases[0].error, "GENERATION_FAILED");
  assert.ok(f.run.cases[0].artifacts["1-0"]);
  assert.equal(f.run.cases[0].artifacts["1-1"], undefined);
  assert.equal(budgetState(f.run).actualMicros, 20);
  assert.equal(f.run.cases[0].steps["lesson:1-1"].status, "failed");
});

test("early research survives failed outline; sample count is not retry count", async () => {
  const f = fixture();
  f.backend.start = async () => observed("failedoutline", {
    status: "failed", stage: "outline",
    evaluation: { provider: "openai", stub: false, profile: config.profile, actualCostMicros: 10, uncertainCostMicros: 0,
      calls: [call("research", "research", 2), call("verify", "verifier", 3), call("outline", "generation", 5)], versions: { sourcePolicy: "synthetic-v1" } },
  });
  await f.execute();
  assert.equal(budgetState(f.run).actualMicros, 10);
  assert.deepEqual(callCounts(f.run.cases[0].steps.outline), { generationAttempts: 1, generationRetries: 0, researchCalls: 1, verifierCalls: 1, fallbackCalls: 0, recoveryCalls: 0 });
});

test("resumes a known operation without another creation or duplicate accounting", async () => {
  const f = fixture();
  const original = f.backend.start.bind(f.backend);
  f.backend.start = async (...args) => {
    const result = await original(...args);
    return args[0] === "course" ? { ...result, status: "pending", resumable: true } : result;
  };
  f.backend.resume = async () => { throw new Error("simulated lost resume response"); };
  await f.execute();
  assert.equal(f.run.cases[0].status, "blocked");
  assert.equal(f.run.cases[0].steps.outline.operationId, fingerprint("course1"));
  await f.execute();
  assert.equal(f.starts.filter((id) => id === "course1").length, 1);
  assert.equal(f.run.cases[0].status, "fixture_complete");
  assert.equal(budgetState(f.run).actualMicros, 20);
});

test("a mutation response lacking owner telemetry saves its identity and recovers the durable receipt", async () => {
  const f = fixture();
  const start = f.backend.start.bind(f.backend);
  f.backend.start = async (...args) => ({ ...await start(...args), evaluation: undefined });
  await f.execute();
  assert.equal(f.run.cases[0].status, "fixture_complete");
  assert.equal(budgetState(f.run).actualMicros, 20);
  assert.ok(f.snapshots.some((snapshot) => snapshot.cases[0].steps.outline?.operationId && !snapshot.cases[0].steps.outline.evidence));
});

test("completed-operation stub samples and contradictory receipts cannot receive completion", async () => {
  for (const sampleModel of ["local-stub", "gpt-5.6-luna"]) {
    const f = fixture();
    f.backend.start = async () => {
      const result = observed("badreceipt");
      result.evaluation!.calls[0].samples[0].model = sampleModel;
      if (sampleModel === "gpt-5.6-luna") result.evaluation!.calls[0].costMicros = 0;
      return result;
    };
    await f.execute();
    assert.equal(f.run.cases[0].status, "blocked");
    assert.equal(f.run.cases[0].steps.outline.status, "active");
    assert.equal(budgetState(f.run).reservedMicros, 100);
  }
});

test("lost initial response and failed intent persistence never create another course", async () => {
  const f = fixture();
  let starts = 0;
  f.backend.start = async () => { starts += 1; throw new Error("lost initial response"); };
  await f.execute();
  await f.execute();
  assert.equal(starts, 1);
  assert.equal(f.run.cases[0].error, "UNKNOWN_OPERATION");
  assert.equal(budgetState(f.run).reservedMicros, 100);
  const g = fixture();
  await assert.rejects(g.execute({ save: async () => { throw new Error("disk unavailable"); } }), /disk unavailable/);
  assert.equal(g.starts.length, 0);
});

test("admission reserves the full operation ceiling and unknown cost halts the run", async () => {
  const f = fixture();
  f.run.config.budgetMicros = 100;
  await f.execute();
  assert.deepEqual(f.starts, ["course1"]);
  assert.equal(f.run.cases[0].error, "BUDGET_EXHAUSTED");
  const g = fixture();
  g.backend.start = async () => {
    const result = observed("uncertain");
    result.evaluation!.uncertainCostMicros = 20;
    return result;
  };
  await g.execute();
  assert.equal(g.run.cases[0].error, "UNKNOWN_COST");
  assert.equal(budgetState(g.run).uncertainMicros, 20);
  assert.equal(g.run.cases[0].status, "blocked");
});

test("case deadline persists across resume and per-call abort prevents indefinite waiting", async () => {
  const f = fixture();
  f.run.cases[0].deadlineAt = new Date(0).toISOString();
  await f.execute();
  assert.equal(f.starts.length, 0);
  assert.equal(f.run.cases[0].error, "CASE_DEADLINE_EXPIRED");
  const g = fixture();
  g.run.config.callDeadlineMs = 20;
  let aborted = false;
  g.backend.start = async (_kind, _payload, _key, _cap, signal) => {
    signal.addEventListener("abort", () => { aborted = true; });
    return new Promise(() => undefined);
  };
  await g.execute();
  assert.equal(aborted, true);
  assert.equal(g.run.cases[0].error, "CALL_DEADLINE_EXPIRED");
  assert.equal(budgetState(g.run).reservedMicros, 100);
});

test("disk checkpoints preserve partial evidence, reject concurrent writers and detect corruption", async () => {
  const directory = await mkdtemp(join(tmpdir(), "filosage-evaluation-"));
  try {
    const storage = await openCheckpointDirectory(directory);
    await assert.rejects(openCheckpointDirectory(directory), /EEXIST/);
    const f = fixture();
    await f.execute({ save: storage.save });
    await storage.close();
    const resumed = await openCheckpointDirectory(directory);
    assert.equal((await resumed.load())?.cases[0].status, "fixture_complete");
    await resumed.close();
    const path = join(directory, "checkpoint.json");
    const text = await readFile(path, "utf8");
    await writeFile(path, text.replace('"fixture_complete"', '"awaiting_review"'));
    const corrupted = await openCheckpointDirectory(directory);
    await assert.rejects(corrupted.load(), /checksum mismatch/);
    await corrupted.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("owner operation telemetry mapping preserves separate research and verifier calls", () => {
  const telemetry = normalizeOperationEvidence({ evaluation: {
    actualCostMicros: 10, uncertainCostMicros: 0, configuration: { provider: "openai", stub: false, profiles: [{ id: "course.research", promptVersion: "v1" }] },
    calls: [{ callId: "research1", status: "observed", costMicros: 10, samples: [{ ...call("research").samples[0], profile: "course.research" }] }],
  } }, "product-default");
  assert.equal(telemetry?.calls[0].kind, "research");
  assert.equal(telemetry?.calls[0].costMicros, 10);
  assert.throws(() => validateEvaluationOrigin("https://filosage.com"), /Production/);
  assert.throws(() => validateEvaluationOrigin("https://user:password@example.com"), /credentials/);
  assert.throws(() => validateEvaluationOrigin("http://example.com"), /literal loopback/);
});
