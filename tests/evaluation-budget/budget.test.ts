import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
import { beginGenerationOperation, configureGenerationOperation, generationFingerprint } from "../../src/lib/generation-operations.ts";
import { getStoredDocument, runStoredDocumentTransaction } from "../../src/lib/document-store.ts";
import { aiClient } from "../../src/lib/local-ai.ts";
import { bindEvaluationOperation, evaluationBudgetErrorFrom, readEvaluationBudgetEvidence, runWithEvaluationCall, runWithEvaluationRequest } from "../../src/lib/evaluation-budget.ts";
import type { ServerAccount } from "../../src/lib/account-server.ts";

const directory = mkdtempSync(join(tmpdir(), "evaluation-budget-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
// Isolate evaluation-ceiling tests from unrelated aggregate shard limits; no real transport.
process.env.OPENAI_OWNER_MONTHLY_BUDGET_USD = "100000";
process.env.OPENAI_API_KEY = "synthetic-evaluation-key";
process.env.SITE_VERSION = "a".repeat(40);
after(() => rmSync(directory, { recursive: true, force: true }));
const configuration = { provider: "openai", stub: false, profiles: [{ id: "course.standard", model: "gpt-5.6-luna", promptVersion: "test-version" }] };
const cap = 2112;
function approval(uid: string, ceiling = cap) {
  return { version: 1, uid, buildSha: "a".repeat(40), profile: "reviewed-profile", operationCeilingMicros: ceiling,
    expiresAt: "2099-01-01T00:00:00Z", rateVersion: "synthetic-test-rates",
    configurationFingerprints: { course: generationFingerprint(configuration), lesson: generationFingerprint(configuration) },
    models: { "gpt-5.6-luna": { maxInputTokens: 1024, maxOutputTokens: 64,
      inputMicrosPerMillion: 1_000_000, cachedInputMicrosPerMillion: 500_000,
      cacheWriteInputMicrosPerMillion: 2_000_000, outputMicrosPerMillion: 1_000_000,
      maxToolCalls: 0, webSearchCallMicros: 10_000 } },
    moderation: { model: "omni-moderation-latest", maxInputBytes: 4096, requestCostMicros: 1 },
  };
}
function headers(ceiling = cap) {
  return new Headers({ "x-filosage-model-evaluation": "1", "x-filosage-evaluation-build-sha": "a".repeat(40),
    "x-filosage-evaluation-profile": "reviewed-profile", "x-filosage-evaluation-max-cost-micros": String(ceiling) });
}
async function fixture(label: string, ceiling = cap) {
  const account: ServerAccount = { uid: `budget-${label}`, plan: "pro", access: "owner", isOwner: true, accountStatus: "active", subscriptionStatus: "active" };
  const actor = await captureAccountGeneration(account.uid);
  const lease = await runWithAccountGeneration(actor, () => beginGenerationOperation(account, `evaluation-${label}`, { topic: "Synthetic" }));
  await configureGenerationOperation(lease, configuration);
  process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify(approval(account.uid, ceiling));
  const run = async <T>(work: () => Promise<T>, requestHeaders = headers(ceiling)) => runWithAccountGeneration(actor, () => runWithEvaluationRequest(requestHeaders, async () => {
    await bindEvaluationOperation(account, lease);
    return work();
  }));
  const evidence = () => runWithAccountGeneration(actor, () => readEvaluationBudgetEvidence(lease.operationId));
  return { account, actor, lease, run, evidence };
}
function response(overrides: Record<string, unknown> = {}) {
  return Response.json({ id: "resp_abc123", status: "completed", model: "gpt-5.6-luna", output: [], service_tier: "default",
    usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 2, cache_write_tokens: 3 }, output_tokens: 5, total_tokens: 15 }, ...overrides });
}
const create = () => runWithEvaluationCall({ kind: "generation", profile: "course.standard", promptVersion: "test-version" }, () =>
  aiClient().responses.create({ model: "gpt-5.6-luna", input: "Synthetic", max_output_tokens: 64, store: false, service_tier: "default" }));

test("actual SDK transport reserves the full upper bound before dispatch and stops the next call", async () => {
  const f = await fixture("ceiling");
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => {
    dispatches++;
    assert.equal((await f.evidence())?.uncertainCostMicros, cap);
    return response();
  });
  try {
    await f.run(create);
    const evidence = await f.evidence();
    assert.equal(evidence?.actualCostMicros, 17);
    assert.equal(evidence?.uncertainCostMicros, 0);
    assert.equal(evidence?.calls[0].samples[0].cacheWriteTokens, 3);
    await assert.rejects(f.run(create), (error) => evaluationBudgetErrorFrom(error)?.code === "EVALUATION_BUDGET_EXHAUSTED");
    assert.equal(dispatches, 1);
  } finally { transport.mock.restore(); }
});

test("competing calls cannot both consume the same operation ceiling", async () => {
  const f = await fixture("concurrent");
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  let observed!: () => void;
  const admitted = new Promise<void>((resolve) => { observed = resolve; });
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => { dispatches++; observed(); await barrier; return response(); });
  try {
    const first = f.run(create);
    await admitted;
    await assert.rejects(f.run(create), (error) => evaluationBudgetErrorFrom(error)?.code === "EVALUATION_BUDGET_EXHAUSTED");
    release(); await first;
    assert.equal(dispatches, 1);
  } finally { release(); transport.mock.restore(); }
});

test("nonterminal and malformed provider usage retain exposure and prohibit another dispatch", async () => {
  for (const [label, override] of [["progress", { status: "in_progress" }], ["missing", { status: undefined }], ["usage", { usage: null }]] as const) {
    const f = await fixture(label);
    let dispatches = 0;
    const transport = mock.method(globalThis, "fetch", async () => { dispatches++; return response(override); });
    try {
      await assert.rejects(f.run(create));
      assert.equal((await f.evidence())?.uncertainCostMicros, cap);
      assert.equal((await f.evidence())?.reconciliationRequired, true);
      await assert.rejects(f.run(create));
      assert.equal(dispatches, 1);
    } finally { transport.mock.restore(); }
  }
});

test("ambiguous network failure is not automatically retried by the actual SDK", async () => {
  const f = await fixture("network");
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => { dispatches++; throw new Error("synthetic transport failure"); });
  try {
    await assert.rejects(f.run(create));
    assert.equal(dispatches, 1);
    assert.equal((await f.evidence())?.uncertainCostMicros, cap);
    await assert.rejects(f.run(create));
    assert.equal(dispatches, 1);
  } finally { transport.mock.restore(); }
});

test("incomplete approvals and changed configuration fail before transport", async () => {
  const f = await fixture("approval");
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => { dispatches++; return response(); });
  try {
    const invalid = approval(f.account.uid) as Record<string, unknown>;
    const models = invalid.models as Record<string, Record<string, unknown>>;
    delete models["gpt-5.6-luna"].cacheWriteInputMicrosPerMillion;
    process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify(invalid);
    await assert.rejects(f.run(create));
    const changed = approval(f.account.uid);
    changed.configurationFingerprints.course = "b".repeat(64);
    process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify(changed);
    await assert.rejects(f.run(create));
    assert.equal(dispatches, 0);
  } finally { transport.mock.restore(); }
});

test("nonowners and changed build/profile/ceiling cannot use evaluation approval", async () => {
  const f = await fixture("identity");
  const transport = mock.method(globalThis, "fetch", async () => { assert.fail("unapproved dispatch"); });
  try {
    for (const key of ["x-filosage-evaluation-build-sha", "x-filosage-evaluation-profile", "x-filosage-evaluation-max-cost-micros"]) {
      const h = headers(); h.set(key, "invalid");
      await assert.rejects(f.run(create, h));
    }
    await assert.rejects(runWithAccountGeneration(f.actor, () => runWithEvaluationRequest(headers(), () => bindEvaluationOperation({ ...f.account, isOwner: false }, f.lease))));
  } finally { transport.mock.restore(); }
});

test("deletion fences new admissions while late observed cost remains globally reconcilable", async () => {
  const f = await fixture("deletion");
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  let admitted!: () => void;
  const started = new Promise<void>((resolve) => { admitted = resolve; });
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => { dispatches++; admitted(); await barrier; return response(); });
  try {
    const first = f.run(create); await started;
    const path = `accountLifecycles/${f.account.uid}`;
    await runWithAccountGeneration(f.actor, () => runStoredDocumentTransaction([path], (docs) => ({
      writes: [{ path, data: { ...docs[path], state: "deleting", jobId: "synthetic-job" } }], result: undefined,
    })));
    release(); await first;
    const global = await getStoredDocument(`generationUsageReceipts/${f.lease.operationId}__evaluation`);
    assert.equal(global?.actualCostMicros, 17);
    assert.equal(global?.uid, undefined);
    await assert.rejects(f.run(create));
    assert.equal(dispatches, 1);
  } finally { release(); transport.mock.restore(); }
});


test("expired, completed and replaced operation attempts never dispatch", async () => {
  for (const [label, change] of [["expired", { leaseUntil: "2000-01-01T00:00:00Z" }], ["completed", { status: "completed" }], ["replaced", { attemptToken: "replacement" }]] as const) {
    const f = await fixture(label);
    const transport = mock.method(globalThis, "fetch", async () => { assert.fail("stale attempt dispatched"); });
    try {
      await runWithAccountGeneration(f.actor, () => runStoredDocumentTransaction([f.lease.operationPath], (docs) => ({
        writes: [{ path: f.lease.operationPath, data: { ...docs[f.lease.operationPath], ...change } }], result: undefined,
      })));
      await assert.rejects(f.run(create));
    } finally { transport.mock.restore(); }
  }
});

test("lost accounting lock after binding prevents provider admission", async () => {
  const f = await fixture("lost-lock");
  const transport = mock.method(globalThis, "fetch", async () => { assert.fail("unowned accounting dispatched"); });
  try {
    await assert.rejects(f.run(async () => {
      const path = f.lease.operation.accounting.periodPath;
      await runStoredDocumentTransaction([path], (docs) => ({ writes: [{ path, data: { ...docs[path], activeAttemptToken: "replacement" } }], result: undefined }));
      return create();
    }));
  } finally { transport.mock.restore(); }
});

test("fractional input tariffs round together within the reserved upper bound", async () => {
  const f = await fixture("fractional");
  const approved = approval(f.account.uid);
  const rate = approved.models["gpt-5.6-luna"];
  rate.inputMicrosPerMillion = 1;
  rate.cachedInputMicrosPerMillion = 1;
  rate.cacheWriteInputMicrosPerMillion = 1;
  rate.outputMicrosPerMillion = 0;
  process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify(approved);
  const transport = mock.method(globalThis, "fetch", async () => response());
  try {
    await f.run(create);
    assert.equal((await f.evidence())?.actualCostMicros, 1);
    assert.equal((await f.evidence())?.reconciliationRequired, false);
  } finally { transport.mock.restore(); }
});

test("moderation has its own durable reservation and provider receipt", async () => {
  const f = await fixture("moderation");
  const transport = mock.method(globalThis, "fetch", async () => {
    assert.equal((await f.evidence())?.uncertainCostMicros, 1);
    return Response.json({ id: "modr-123abc", model: "omni-moderation-latest", results: [{ flagged: false }] });
  });
  try {
    await f.run(() => aiClient().moderations.create({ model: "omni-moderation-latest", input: "Synthetic" }));
    const evidence = await f.evidence();
    assert.equal(evidence?.actualCostMicros, 1);
    assert.equal(evidence?.calls[0].kind, "moderation");
    assert.equal(evidence?.calls[0].samples[0].responseId, "modr-123abc");
  } finally { transport.mock.restore(); }
});

test("unsupported unbounded request variants fail before transport", async () => {
  const f = await fixture("unbounded");
  const transport = mock.method(globalThis, "fetch", async () => { assert.fail("unsupported request dispatched"); });
  try {
    for (const extra of [{ stream: true }, { background: true }, { previous_response_id: "resp_abc" },
      { service_tier: "priority" }, { tools: [{ type: "web_search" }] }, { max_output_tokens: 65 },
      { model: "unapproved-model" }, { store: true }]) {
      await assert.rejects(f.run(() => runWithEvaluationCall({ kind: "generation", profile: "course.standard", promptVersion: "test-version" }, () =>
        aiClient().responses.create({ model: "gpt-5.6-luna", input: "Synthetic", max_output_tokens: 64, store: false, service_tier: "default", ...extra } as Parameters<ReturnType<typeof aiClient>["responses"]["create"]>[0]))));
    }
  } finally { transport.mock.restore(); }
});

test("an operation cannot change approval rates after the first admission", async () => {
  const f = await fixture("immutable");
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => { dispatches++; return response(); });
  try {
    await f.run(create);
    const changed = approval(f.account.uid);
    changed.rateVersion = "changed-rates";
    process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify(changed);
    await assert.rejects(f.run(create));
    assert.equal(dispatches, 1);
  } finally { transport.mock.restore(); }
});


test("unknown cache usage, unexpected tool inventory and changed service tier retain full exposure", async () => {
  for (const [label, override] of [["cache-missing", { usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 2 }, output_tokens: 5 } }],
    ["tool-unknown", { output: [{ type: "code_interpreter_call" }] }], ["tier-changed", { service_tier: "priority" }]] as const) {
    const f = await fixture(label);
    const transport = mock.method(globalThis, "fetch", async () => response(override));
    try {
      await assert.rejects(f.run(create));
      assert.equal((await f.evidence())?.uncertainCostMicros, cap);
      assert.equal((await f.evidence())?.reconciliationRequired, true);
    } finally { transport.mock.restore(); }
  }
});

test("review: an unresolved admission from a replaced attempt blocks new transport", async () => {
  const f = await fixture("review-lost-process", cap * 2);
  let release!: () => void;
  let admitted!: () => void;
  const started = new Promise<void>((resolve) => { admitted = resolve; });
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => {
    dispatches++;
    if (dispatches === 1) { admitted(); await barrier; }
    return response();
  });
  let first: Promise<unknown> | undefined;
  try {
    first = f.run(create); await started;
    const before = await f.evidence();
    assert.equal(before?.uncertainCostMicros, 2112);
    assert.equal(before?.reconciliationRequired, false);
    // Advance the operation clock beyond its lease to model a process that
    // disappeared after transport admission without a catch/finally callback.
    const renewed = await runWithAccountGeneration(f.actor, () => beginGenerationOperation(
      f.account, "evaluation-review-lost-process", { topic: "Synthetic" }, new Date(Date.now() + 600_000)));
    assert.notEqual(renewed.attemptToken, f.lease.attemptToken);
    const next = runWithAccountGeneration(f.actor, () => runWithEvaluationRequest(headers(cap * 2), async () => {
      await bindEvaluationOperation(f.account, renewed);
      return create();
    }));
    await assert.rejects(next, (error) => evaluationBudgetErrorFrom(error)?.code === "EVALUATION_RECONCILIATION_REQUIRED");
    assert.equal(dispatches, 1);
  } finally { release(); await first; transport.mock.restore(); }
});

test("review: an ordinary SDK call without evaluation headers retains default retry behavior", async () => {
  delete process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL;
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => {
    dispatches++;
    return dispatches === 1 ? Response.json({ error: { message: "synthetic retry" } }, { status: 503, headers: { "retry-after-ms": "1" } }) : response();
  });
  try {
    const result = await runWithEvaluationRequest(new Headers(), () => aiClient().responses.create({ model: "gpt-5.6-luna", input: "Synthetic" }));
    assert.equal(result.id, "resp_abc123");
    assert.equal(dispatches, 2);
  } finally { transport.mock.restore(); }
});

test("review: a client created outside evaluation preserves ambiguous classification after SDK retries", async () => {
  const f = await fixture("review-client-scope");
  const client = aiClient();
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async () => { dispatches++; throw new Error("synthetic ambiguous failure"); });
  try {
    await assert.rejects(f.run(() => runWithEvaluationCall({ kind: "generation", profile: "course.standard", promptVersion: "test-version" }, () =>
      client.responses.create({ model: "gpt-5.6-luna", input: "Synthetic", max_output_tokens: 64, store: false, service_tier: "default" }, { maxRetries: 1 }))),
      (error) => evaluationBudgetErrorFrom(error)?.preDispatch === false);
    assert.equal(dispatches, 1);
    assert.equal((await f.evidence())?.reconciliationRequired, true);
  } finally { transport.mock.restore(); }
});
