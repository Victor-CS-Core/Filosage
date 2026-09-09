import assert from "node:assert/strict";
import { after, mock, test, type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { NextResponse } from "next/server";

if (process.env.OPENAI_API_KEY || process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
  throw new Error("Generic route recovery fixtures require isolated local mode without provider credentials.");
}

const directory = mkdtempSync(join(tmpdir(), "generic-ai-route-recovery-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.FLASHCARD_DECKS_ENABLED = "true";
process.env.FLASHCARD_AI_GENERATION_ENABLED = "true";
after(() => rmSync(directory, { recursive: true, force: true }));

const documents = await import("../../src/lib/document-store.ts");
const lifecycle = await import("../../src/lib/account-lifecycle.ts");
const originalAuth = await import("../../src/lib/auth-server.ts");
const originalLocalAi = await import("../../src/lib/local-ai.ts");
const originalLocalStore = await import("../../src/lib/local-store.ts");
const documentValues = await import("../../src/lib/document-values.ts");

type FaultStage = "after_checkpoint" | "before_global" | "after_global" | "before_personal" | "after_personal" | "after_response";
type Product = "baseline" | "capstone" | "flashcards";

let activeAccount: {
  uid: string;
  plan: "pro";
  access: "pro";
  isOwner: false;
  accountStatus: "active";
  subscriptionStatus: "active";
};
let activeGeneration: Awaited<ReturnType<typeof lifecycle.captureAccountGeneration>>;
let activeFault: FaultStage | null = null;
let providerCalls = 0;
let pausedGlobalRead: {
  reached: () => void;
  resume: Promise<void>;
} | null = null;

function pauseNextGlobalSettlementRead() {
  let reached!: () => void;
  let resume!: () => void;
  const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
  const resumePromise = new Promise<void>((resolve) => { resume = resolve; });
  pausedGlobalRead = { reached, resume: resumePromise };
  return { reached: reachedPromise, resume };
}

const isGlobalSettlement = (paths: string[]) => (
  paths.some((path) => path.startsWith("generationUsageReceipts/legacy-"))
  && paths.some((path) => path.startsWith("systemUsageShards/"))
  && !paths.some((path) => path.startsWith("usagePeriods/"))
);
const isPersonalProductSettlement = (paths: string[]) => (
  paths.some((path) => path.startsWith("usagePeriods/"))
  && paths.some((path) => path.startsWith("userAiBudgets/"))
  && paths.some((path) => path.startsWith(`users/${activeAccount?.uid}/`))
);
const writesCheckpoint = (writes: Array<{ path: string; data: Record<string, unknown> }>) => writes.some(({ path, data }) => (
  path.startsWith("aiRequests/")
  && !path.includes("__attempt__")
  && data.status === "result_checkpointed"
));

const transactionPaths = new Map<string, string[]>();
function storedPath(name: string) {
  const marker = "/documents/";
  const index = name.indexOf(marker);
  return index < 0 ? name : name.slice(index + marker.length);
}

mock.module("../../src/lib/local-store.ts", {
  namedExports: {
    ...originalLocalStore,
    async localDocumentStoreJson<T>(path: string, init: RequestInit = {}, allowNotFound = false) {
      const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      if (path === "/documents:batchGet") {
        const paths = ((body.documents as string[] | undefined) ?? []).map(storedPath);
        if ((activeFault === "before_global" && isGlobalSettlement(paths))
          || (activeFault === "before_personal" && isPersonalProductSettlement(paths))) {
          const boundary = activeFault;
          activeFault = null;
          throw new Error(`fixture hard stop ${boundary}`);
        }
        const result = await originalLocalStore.localDocumentStoreJson<T>(path, init, allowNotFound);
        const transaction = Array.isArray(result)
          ? (result as Array<{ transaction?: string }>).find((entry) => entry.transaction)?.transaction
          : undefined;
        if (transaction) transactionPaths.set(transaction, paths);
        if (pausedGlobalRead && isGlobalSettlement(paths)) {
          const pause = pausedGlobalRead;
          pausedGlobalRead = null;
          pause.reached();
          await pause.resume;
        }
        return result;
      }
      if (path === "/documents:commit") {
        const transaction = typeof body.transaction === "string" ? body.transaction : "";
        const paths = transactionPaths.get(transaction) ?? [];
        const writes = ((body.writes as Array<Record<string, unknown>> | undefined) ?? []).flatMap((write) => {
          const update = write.update as { name?: string; fields?: Record<string, Parameters<typeof documentValues.fromDocumentFields>[0][string]> } | undefined;
          return update?.name ? [{ path: storedPath(update.name), data: documentValues.fromDocumentFields(update.fields ?? {}) }] : [];
        });
        const result = await originalLocalStore.localDocumentStoreJson<T>(path, init, allowNotFound);
        transactionPaths.delete(transaction);
        const checkpoint = writesCheckpoint(writes);
        const globalSettlement = isGlobalSettlement(paths);
        const personalSettlement = isPersonalProductSettlement(paths);
        if ((activeFault === "after_checkpoint" && checkpoint)
          || (activeFault === "after_global" && globalSettlement)
          || (activeFault === "after_personal" && personalSettlement)) {
          const boundary = activeFault;
          activeFault = null;
          throw new Error(`fixture hard stop ${boundary}`);
        }
        return result;
      }
      return originalLocalStore.localDocumentStoreJson<T>(path, init, allowNotFound);
    },
  },
});

mock.module("../../src/lib/auth-server.ts", {
  namedExports: {
    ...originalAuth,
    requireAcceptedAccount: async () => activeAccount,
    withAccountRequest: <R extends Request, Args extends unknown[]>(handler: (request: R, ...args: Args) => Promise<Response>) => (
      (request: R, ...args: Args) => lifecycle.runWithAccountGeneration(activeGeneration, () => handler(request, ...args))
    ),
  },
});

mock.module("../../src/lib/local-ai.ts", {
  namedExports: {
    ...originalLocalAi,
    aiClient: () => {
      const client = originalLocalAi.aiClient();
      const parse = client.responses.parse.bind(client.responses);
      client.responses.parse = (async (...args: Parameters<typeof parse>) => {
        providerCalls += 1;
        const parameters = args[0] as { text?: { format?: { name?: string } } };
        const response = parameters.text?.format?.name === "baseline_verdict"
          ? {
              id: `local-baseline-${providerCalls}`,
              output_parsed: {
                summary: "The starting sample connects its claim to evidence and preserves a material limitation.",
                criteria: [
                  { criterion: "Identify the claim and relevant evidence.", met: true, feedback: "The claim and evidence are explicit." },
                  { criterion: "Explain one material limitation.", met: true, feedback: "The limitation is explicit and affects confidence." },
                ],
              },
            }
          : await parse(...args);
        return {
          ...response,
          id: `fixture-observed-response-${providerCalls}`,
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          },
        };
      }) as typeof client.responses.parse;
      return client;
    },
  },
});

const aiUsage = await import("../../src/lib/ai-usage.ts");
const publication = await import("../../src/lib/publication-content.ts");
const flashcards = await import("../../src/lib/flashcards-server.ts");
const { POST: assessBaseline } = await import("../../src/app/api/assess-baseline/route.ts");
const { POST: assessCapstone } = await import("../../src/app/api/assess-capstone/route.ts");
const { POST: generateFlashcards } = await import("../../src/app/api/flashcards/generate/route.ts");

const stages: FaultStage[] = [
  "after_checkpoint",
  "before_global",
  "after_global",
  "before_personal",
  "after_personal",
  "after_response",
];

function submission(label: string) {
  return `${label}: ${"The work identifies the claim, compares the available evidence, explains the chosen method, records a concrete limitation, and shows how the conclusion changes when that limitation matters. ".repeat(5)}`;
}

function bodyFor(product: Product, courseId: string) {
  return product === "flashcards"
    ? { courseId, scope: "course", depth: "balanced", emphasis: "balanced", includeAttemptedChecks: false }
    : { courseId, submission: submission(product) };
}

async function seed(product: Product, stage: string) {
  const uid = `f6-${product}-${stage.replaceAll("_", "-")}`;
  const courseId = `course-${product}-${stage.replaceAll("_", "-")}`;
  activeAccount = {
    uid,
    plan: "pro",
    access: "pro",
    isOwner: false,
    accountStatus: "active",
    subscriptionStatus: "active",
  };
  activeGeneration = await lifecycle.captureAccountGeneration(uid);
  const now = "2026-09-09T12:00:00.000Z";
  const course = {
    topic: "Careful evidence",
    authorId: uid,
    isPublic: false,
    modules: [{
      title: "Evidence module",
      objective: "Evaluate a claim with bounded evidence.",
      objectiveId: "objective-evidence",
      lessons: [{ title: "Evidence lesson", concept: "Relevant evidence", objectiveId: "objective-evidence" }],
    }],
    capstone: {
      title: "Evidence decision",
      brief: "Evaluate one claim and make a bounded decision.",
      deliverable: "An evidence-linked decision record.",
      successCriteria: ["Identify the claim and relevant evidence.", "Explain one material limitation."],
      objectiveIds: ["objective-evidence"],
    },
  };
  await lifecycle.runWithAccountGeneration(activeGeneration, () => documents.putStoredDocuments([
    { path: `users/${uid}`, data: { ...activeAccount } },
    { path: `courses/${courseId}`, data: course },
    { path: `users/${uid}/learningOutcomes/${courseId}`, data: { uid, courseId, createdAt: now, updatedAt: now } },
    { path: `users/${uid}/courseProgress/${courseId}`, data: { uid, courseId, topic: course.topic, completedLessonIds: ["0-0"], lessons: {}, lastLessonId: "0-0", lastLessonTitle: "Evidence lesson", lastActivityAt: now, startedAt: now } },
    { path: `courses/${courseId}/lessons/0-0`, data: {
      authorId: uid,
      learningObjective: "Evaluate a claim by connecting each conclusion to relevant evidence.",
      content: `${"Relevant evidence bears directly on the claim and its alternatives. ".repeat(10)}\n\n${"A limitation matters when it can change the decision or confidence. ".repeat(10)}`,
      keyTakeaways: ["Match each claim to evidence that could change it.", "Keep material limitations visible in the conclusion."],
      guidedPractice: { modelAnswer: "Compare the claim with each observation and state what remains unknown." },
      transferTask: { modelResponse: "Apply the same evidence check to a new decision and preserve its limitation." },
      quizzes: [],
    } },
  ]));
  return { uid, courseId };
}

function requestFor(product: Product, courseId: string, key: string) {
  return new Request(`https://fixture.invalid/api/${product}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(bodyFor(product, courseId)),
  });
}

function routeFor(product: Product) {
  if (product === "baseline") return assessBaseline;
  if (product === "capstone") return assessCapstone;
  return generateFlashcards;
}

function installResponseFault(product: Product, context: TestContext) {
  if (product === "flashcards") {
    const original = Response.json;
    context.mock.method(Response, "json", (...args: Parameters<typeof Response.json>) => {
      const body = args[0] as { deck?: unknown };
      if (activeFault === "after_response" && body?.deck) {
        activeFault = null;
        throw new Error("fixture hard stop after final durable commit before HTTP response");
      }
      return original(...args);
    });
    return;
  }
  const original = NextResponse.json;
  context.mock.method(NextResponse, "json", (...args: Parameters<typeof NextResponse.json>) => {
    const body = args[0] as { assessment?: unknown };
    if (activeFault === "after_response" && body?.assessment) {
      activeFault = null;
      throw new Error("fixture hard stop after final durable commit before HTTP response");
    }
    return original(...args);
  });
}

async function accounting(uid: string, feature: "tutor" | "flashcard_generation", key: string) {
  const requestId = await aiUsage.aiUsageRequestId(uid, feature, key);
  const request = await documents.getStoredDocument(`aiRequests/${requestId}`);
  assert(request);
  const attemptToken = String(request.attemptToken);
  const attempt = await documents.getStoredDocument(aiUsage.aiUsageAttemptPath({ requestId, attemptToken }));
  const period = await documents.getStoredDocument(String(request.periodPath));
  const budget = await documents.getStoredDocument(String(request.userBudgetPath));
  const global = await documents.getStoredDocument(String(request.globalPath));
  const receipt = await documents.getStoredDocument(`generationUsageReceipts/legacy-${requestId}-${attemptToken}`);
  return { requestId, request, attempt, period, budget, global, receipt };
}

function productGuard(value: unknown) {
  return createHash("sha256").update(publication.publicationContentFingerprint(value)).digest("hex");
}

async function completeLegacyBaseline(courseId: string, key: string) {
  const reservation = await lifecycle.runWithAccountGeneration(activeGeneration, () => aiUsage.reserveAiUsage(
    activeAccount,
    "tutor",
    key,
    undefined,
    { allowCompletedReplay: true },
  ));
  const outcomePath = `users/${activeAccount.uid}/learningOutcomes/${courseId}`;
  const outcome = await documents.getStoredDocument(outcomePath);
  await lifecycle.runWithAccountGeneration(activeGeneration, () => documents.putStoredDocument(outcomePath, {
    ...outcome,
    baselineAssessment: {
      summary: `Legacy baseline for ${courseId}.`,
      criteria: [{ criterion: "Use evidence.", met: true, feedback: "Evidence is explicit." }],
      assessedAt: "2026-09-09T12:00:00.000Z",
      score: 100,
    },
  }));
  await lifecycle.runWithAccountGeneration(activeGeneration, () => aiUsage.finalizeAiUsage(reservation, {
    model: "gpt-5.6-luna",
    inputTokens: 100,
    outputTokens: 50,
    responseId: `legacy-baseline-${courseId}`,
    resultId: courseId,
    profile: "baseline.standard",
  }));
  return reservation;
}

async function assertConverged(product: Product, uid: string, courseId: string, key: string, body: Record<string, unknown>) {
  const feature = product === "flashcards" ? "flashcard_generation" : "tutor";
  const state = await accounting(uid, feature, key);
  assert.equal(state.request.status, "completed");
  assert(state.attempt);
  assert.equal(state.attempt.status, "accounting_observed");
  assert.equal(state.request.resultCheckpoint && typeof state.request.resultCheckpoint, "object");
  assert.equal(
    (state.request.resultCheckpoint as { checkpointFingerprint?: string }).checkpointFingerprint,
    (state.attempt.resultCheckpoint as { checkpointFingerprint?: string }).checkpointFingerprint,
  );
  assert.equal(state.attempt.resultId, state.request.resultId);
  assert.equal(state.attempt.actualCostMicros, state.request.actualCostMicros);
  assert.equal(state.period?.requestCount, 1);
  assert.equal(state.period?.reservedCostMicros, 0);
  assert.equal(state.budget?.reservedCostMicros, 0);
  assert.equal(state.global?.reservedCostMicros, 0);
  assert.equal(state.period?.uncertainCostMicros ?? 0, 0);
  assert.equal(state.budget?.uncertainCostMicros ?? 0, 0);
  assert.equal(state.global?.uncertainCostMicros ?? 0, 0);
  assert.equal(state.period?.actualCostMicros, state.request.actualCostMicros);
  assert.equal(state.budget?.actualCostMicros, state.request.actualCostMicros);
  const scan = await documents.scanStoredDocuments();
  const shardObservedCost = scan.documents
    .filter(({ path, data }) => path.startsWith("generationUsageReceipts/")
      && data.status === "observed" && data.globalPath === state.request.globalPath)
    .reduce((total, { data }) => total + Number(data.actualCostMicros ?? 0), 0);
  assert.equal(state.global?.actualCostMicros, shardObservedCost);
  assert.equal(state.receipt?.status, "observed");
  assert.equal(state.receipt?.actualCostMicros, state.request.actualCostMicros);
  assert.equal(state.receipt?.uid, undefined);
  assert.equal(state.receipt?.resultCheckpoint, undefined);
  assert.equal(state.period?.activeRequestId, null);
  assert.equal(state.period?.activeAttemptToken, null);

  if (product === "baseline") {
    const outcome = await documents.getStoredDocument(`users/${uid}/learningOutcomes/${courseId}`);
    assert.deepEqual(outcome?.baselineAssessment, body.assessment);
    assert.equal(state.request.resultId, courseId);
  } else if (product === "capstone") {
    const progress = await documents.getStoredDocument(`users/${uid}/courseProgress/${courseId}`);
    const assessment = progress?.capstone as { attempts?: number; history?: unknown[] };
    assert.equal(assessment.attempts, 1);
    assert.equal(assessment.history?.length, 1);
    assert.deepEqual(progress?.capstone, body.assessment);
    assert.equal(scan.documents.filter(({ path }) => path.startsWith(`users/${uid}/masteryEvidence/`)).length, 1);
    assert.equal(state.request.resultId, courseId);
  } else {
    const deckId = state.requestId.slice(0, 40);
    assert.equal((body.deck as { id: string }).id, deckId);
    assert.equal(state.request.resultId, deckId);
    const storedDeck = scan.documents.filter(({ path }) => path === `users/${uid}/flashcardDecks/${deckId}`);
    const storedCards = scan.documents
      .filter(({ path }) => path.startsWith(`users/${uid}/flashcards/`))
      .map(({ data }) => data)
      .sort((left, right) => Number(left.position) - Number(right.position));
    assert.equal(storedDeck.length, 1);
    assert.deepEqual(storedDeck[0].data, body.deck);
    assert.deepEqual(storedCards, body.cards);
  }
}

for (const product of ["baseline", "capstone", "flashcards"] as const) {
  for (const stage of stages) {
    test(`${product} recovers exactly once after ${stage}`, async (context) => {
      const { uid, courseId } = await seed(product, stage);
      const key = `${product}-${stage}-idempotency-key`;
      providerCalls = 0;
      activeFault = stage;
      if (stage === "after_response") installResponseFault(product, context);
      const route = routeFor(product);
      const first = await route(requestFor(product, courseId, key));
      const firstBody = await first.json();
      assert.equal(first.status, 500, JSON.stringify(firstBody));
      const callsAfterStop = providerCalls;
      assert(callsAfterStop > 0);
      assert.equal(activeFault, null, `The ${stage} boundary was not reached.`);

      if (stage === "after_global") {
        const interrupted = await accounting(uid, product === "flashcards" ? "flashcard_generation" : "tutor", key);
        assert.equal(
          await aiUsage.reconcileExpiredAiUsage(`${interrupted.requestId}__attempt__${interrupted.request.attemptToken}`, true),
          "none",
          "Maintenance must leave a checkpointed attempt for the owning route to finish with its product.",
        );
      }

      const replay = await route(requestFor(product, courseId, key));
      const replayBody = await replay.json() as Record<string, unknown>;
      assert.equal(replay.status, 200, JSON.stringify(replayBody));
      assert.equal(providerCalls, callsAfterStop, `${product}/${stage} redispatched the provider.`);
      await assertConverged(product, uid, courseId, key, replayBody);

      const repeated = await route(requestFor(product, courseId, key));
      const repeatedBody = await repeated.json() as Record<string, unknown>;
      assert.equal(repeated.status, 200, JSON.stringify(repeatedBody));
      assert.deepEqual(repeatedBody, replayBody);
      assert.equal(providerCalls, callsAfterStop);
      await assertConverged(product, uid, courseId, key, repeatedBody);
    });
  }
}

test("capstone recovery persists the checkpointed mastery evidence after the course objectives change", async () => {
  const { uid, courseId } = await seed("capstone", "mutable_course_evidence");
  const key = "capstone-mutable-course-evidence-key";
  providerCalls = 0;
  activeFault = "after_checkpoint";
  const first = await assessCapstone(requestFor("capstone", courseId, key));
  assert.equal(first.status, 500, JSON.stringify(await first.clone().json()));
  const callsAfterCheckpoint = providerCalls;
  assert(callsAfterCheckpoint > 0);

  const coursePath = `courses/${courseId}`;
  const course = await documents.getStoredDocument(coursePath);
  assert(course);
  const modules = structuredClone(course.modules) as Array<Record<string, unknown>>;
  modules[0] = {
    ...modules[0],
    title: "Mutated module",
    objective: "A post-checkpoint objective must not receive evidence.",
    objectiveId: "objective-mutated",
  };
  await lifecycle.runWithAccountGeneration(activeGeneration, () => documents.putStoredDocument(coursePath, {
    ...course,
    modules,
    capstone: {
      ...(course.capstone as Record<string, unknown>),
      title: "Mutated capstone",
      objectiveIds: ["objective-mutated"],
    },
  }));

  const replay = await assessCapstone(requestFor("capstone", courseId, key));
  const replayBody = await replay.json() as Record<string, unknown>;
  assert.equal(replay.status, 200, JSON.stringify(replayBody));
  assert.equal(providerCalls, callsAfterCheckpoint);
  const evidence = (await documents.scanStoredDocuments()).documents
    .filter(({ path }) => path.startsWith(`users/${uid}/masteryEvidence/`))
    .map(({ data }) => data);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].objectiveId, "objective-evidence");
  assert.match(String(evidence[0].label), /Evaluate a claim with bounded evidence/);
  assert.equal(evidence[0].criterion, "Evidence decision");
  assert.equal(evidence.some((item) => item.objectiveId === "objective-mutated"), false);
});

test("legacy finalization interleaved after a result checkpoint cannot strand checkpoint recovery", async () => {
  const { uid, courseId } = await seed("baseline", "finalization_interleave");
  const key = "baseline-finalization-interleave-key";
  const fingerprint = await publication.publicationContentHash(bodyFor("baseline", courseId));
  const reservation = await lifecycle.runWithAccountGeneration(activeGeneration, () => aiUsage.reserveAiUsage(
    activeAccount,
    "tutor",
    key,
    fingerprint,
    { allowCompletedReplay: true },
  ));
  const assessment = {
    summary: "The checkpointed assessment remains recoverable.",
    criteria: [{ criterion: "Use evidence.", met: true, feedback: "Evidence is explicit." }],
    assessedAt: "2026-09-09T12:00:00.000Z",
    score: 100,
  };
  const pause = pauseNextGlobalSettlementRead();
  const finalization = lifecycle.runWithAccountGeneration(activeGeneration, () => aiUsage.finalizeAiUsage(reservation, {
    model: "gpt-5.6-luna",
    inputTokens: 100,
    outputTokens: 50,
    responseId: "interleaved-response",
    resultId: courseId,
    profile: "baseline.standard",
  }));
  await pause.reached;
  let checkpoint: Awaited<ReturnType<typeof aiUsage.checkpointAiUsageResult<typeof assessment>>>;
  try {
    checkpoint = await lifecycle.runWithAccountGeneration(activeGeneration, () => aiUsage.checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: courseId,
      resultId: courseId,
      productGuard: productGuard(null),
      result: assessment,
      usage: {
        model: "gpt-5.6-luna",
        inputTokens: 100,
        outputTokens: 50,
        responseId: "interleaved-response",
        resultId: courseId,
        profile: "baseline.standard",
      },
    }));
  } finally {
    pause.resume();
  }
  await finalization;

  const interrupted = await accounting(uid, "tutor", key);
  assert.equal(interrupted.request.status, "result_checkpointed");
  assert.equal(interrupted.attempt?.status, "result_checkpointed");
  assert.equal(interrupted.receipt, null);
  const outcomePath = `users/${uid}/learningOutcomes/${courseId}`;
  const settled = await aiUsage.settleAiUsageProduct(reservation, checkpoint!, [outcomePath], (stored, saved) => {
    const outcome = stored[outcomePath];
    assert(outcome);
    assert.equal(productGuard(outcome.baselineAssessment ?? null), saved.productGuard);
    return {
      writes: [{ path: outcomePath, data: { ...outcome, baselineAssessment: saved.result as Record<string, unknown> } }],
      result: saved.result,
    };
  });
  assert.deepEqual(settled, assessment);
  await assertConverged("baseline", uid, courseId, key, { assessment });
});

test("a checkpoint product guard is a fixed digest and does not expose private prior product JSON", async () => {
  const { uid, courseId } = await seed("baseline", "private_product_guard");
  const outcomePath = `users/${uid}/learningOutcomes/${courseId}`;
  const outcome = await documents.getStoredDocument(outcomePath);
  const privateMarker = "PRIVATE-PRIOR-ASSESSMENT-MARKER";
  await lifecycle.runWithAccountGeneration(activeGeneration, () => documents.putStoredDocument(outcomePath, {
    ...outcome,
    baselineAssessment: {
      summary: privateMarker,
      criteria: [],
      assessedAt: "2026-09-08T12:00:00.000Z",
      score: 0,
    },
  }));
  const key = "baseline-private-product-guard-key";
  activeFault = "after_checkpoint";
  const first = await assessBaseline(requestFor("baseline", courseId, key));
  assert.equal(first.status, 500, JSON.stringify(await first.clone().json()));
  const state = await accounting(uid, "tutor", key);
  const guard = String((state.request.resultCheckpoint as { productGuard?: string }).productGuard);
  assert.match(guard, /^[a-f0-9]{64}$/);
  assert.equal(guard.includes(privateMarker), false);
});

test("a checkpointless legacy baseline cannot replay as a capstone under the shared tutor key", async () => {
  const { uid, courseId } = await seed("baseline", "legacy_cross_product");
  const key = "legacy-cross-product-tutor-key";
  await completeLegacyBaseline(courseId, key);
  const progressPath = `users/${uid}/courseProgress/${courseId}`;
  const progress = await documents.getStoredDocument(progressPath);
  const revision = {
    status: "passed",
    summary: "This unrelated capstone must not be replayed.",
    criteria: [{ criterion: "Use evidence.", met: true, feedback: "Evidence is explicit." }],
    assessedAt: "2026-09-09T12:00:00.000Z",
    attempt: 1,
  };
  await lifecycle.runWithAccountGeneration(activeGeneration, () => documents.putStoredDocument(progressPath, {
    ...progress,
    capstone: { ...revision, attempts: 1, history: [revision] },
  }));
  const before = await accounting(uid, "tutor", key);
  providerCalls = 0;
  const response = await assessCapstone(requestFor("capstone", courseId, key));
  const body = await response.json() as { code?: string };
  assert.equal(response.status, 409, JSON.stringify(body));
  assert.equal(body.code, "AI_OUTCOME_RECONCILIATION_REQUIRED");
  assert.equal(providerCalls, 0);
  assert.deepEqual(await accounting(uid, "tutor", key), before);
});

test("a checkpointless legacy baseline cannot replay another course under the same key", async () => {
  const { uid, courseId } = await seed("baseline", "legacy_cross_resource");
  const key = "legacy-cross-resource-tutor-key";
  await completeLegacyBaseline(courseId, key);
  const otherCourseId = `${courseId}-other`;
  const course = await documents.getStoredDocument(`courses/${courseId}`);
  await lifecycle.runWithAccountGeneration(activeGeneration, () => documents.putStoredDocuments([
    { path: `courses/${otherCourseId}`, data: { ...course, authorId: uid } },
    { path: `users/${uid}/learningOutcomes/${otherCourseId}`, data: {
      uid,
      courseId: otherCourseId,
      baselineAssessment: {
        summary: "The other course result must not be replayed.",
        criteria: [{ criterion: "Use evidence.", met: true, feedback: "Evidence is explicit." }],
        assessedAt: "2026-09-09T12:00:00.000Z",
        score: 100,
      },
    } },
  ]));
  const before = await accounting(uid, "tutor", key);
  providerCalls = 0;
  const response = await assessBaseline(requestFor("baseline", otherCourseId, key));
  const body = await response.json() as { code?: string };
  assert.equal(response.status, 409, JSON.stringify(body));
  assert.equal(body.code, "AI_OUTCOME_RECONCILIATION_REQUIRED");
  assert.equal(providerCalls, 0);
  assert.deepEqual(await accounting(uid, "tutor", key), before);
});

for (const product of ["baseline", "capstone", "flashcards"] as const) {
  test(`${product} rejects a different payload under its completed key without provider or product mutation`, async () => {
    const { uid, courseId } = await seed(product, "payload_conflict");
    const key = `${product}-payload-conflict-key`;
    providerCalls = 0;
    activeFault = null;
    const route = routeFor(product);
    const first = await route(requestFor(product, courseId, key));
    assert.equal(first.status, product === "flashcards" ? 201 : 200, JSON.stringify(await first.clone().json()));
    const initialBody = await first.json() as Record<string, unknown>;
    const calls = providerCalls;
    const before = await accounting(uid, product === "flashcards" ? "flashcard_generation" : "tutor", key);
    const changedBody = product === "flashcards"
      ? { ...bodyFor(product, courseId), emphasis: "application" }
      : { ...bodyFor(product, courseId), submission: `${submission(product)} Materially changed.` };
    const conflict = await route(new Request(`https://fixture.invalid/api/${product}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(changedBody),
    }));
    const conflictBody = await conflict.json() as { code?: string };
    assert.equal(conflict.status, 409, JSON.stringify(conflictBody));
    assert.equal(conflictBody.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(providerCalls, calls);
    assert.deepEqual(await accounting(uid, product === "flashcards" ? "flashcard_generation" : "tutor", key), before);
    const replay = await route(requestFor(product, courseId, key));
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { ...initialBody, ...(product === "flashcards" ? { replayed: true } : {}) });
  });
}

for (const product of ["baseline", "capstone", "flashcards"] as const) {
  test(`${product} replays a valid completed pre-checkpoint product without provider or accounting mutation`, async () => {
    const { uid, courseId } = await seed(product, "legacy_completed");
    const key = `${product}-legacy-completed-key`;
    const feature = product === "flashcards" ? "flashcard_generation" : "tutor";
    const requestBody = bodyFor(product, courseId);
    // The pre-F6 assessment routes did not persist a payload fingerprint;
    // flashcard generation already did.
    const fingerprint = product === "flashcards"
      ? await publication.publicationContentHash(requestBody)
      : undefined;
    providerCalls = 0;
    activeFault = null;
    const reservation = await lifecycle.runWithAccountGeneration(activeGeneration, () => aiUsage.reserveAiUsage(
      activeAccount,
      feature,
      key,
      fingerprint,
      { allowCompletedReplay: true },
    ));

    if (product === "baseline") {
      const path = `users/${uid}/learningOutcomes/${courseId}`;
      const current = await documents.getStoredDocument(path);
      await lifecycle.runWithAccountGeneration(activeGeneration, () => documents.putStoredDocument(path, {
        ...current,
        baselineAssessment: {
          summary: "Legacy completed baseline.",
          criteria: [{ criterion: "Use evidence.", met: true, feedback: "Evidence is explicit." }],
          assessedAt: "2026-09-09T12:00:00.000Z",
          score: 100,
        },
      }));
    } else if (product === "capstone") {
      const path = `users/${uid}/courseProgress/${courseId}`;
      const current = await documents.getStoredDocument(path);
      const revision = {
        status: "passed" as const,
        summary: "Legacy completed capstone.",
        criteria: [{ criterion: "Use evidence.", met: true, feedback: "Evidence is explicit." }],
        assessedAt: "2026-09-09T12:00:00.000Z",
        attempt: 1,
      };
      await lifecycle.runWithAccountGeneration(activeGeneration, () => documents.putStoredDocument(path, {
        ...current,
        capstone: { ...revision, attempts: 1, history: [revision] },
      }));
    } else {
      await lifecycle.runWithAccountGeneration(activeGeneration, () => flashcards.createGeneratedFlashcardDraft({
        account: activeAccount,
        deckId: reservation.requestId.slice(0, 40),
        courseId,
        courseTopic: "Careful evidence",
        moduleIndex: null,
        lessonIds: ["0-0"],
        scope: "course",
        depth: "balanced",
        emphasis: "balanced",
        includeAttemptedChecks: false,
        sourceFingerprint: "legacy-source-fingerprint",
        output: {
          title: "Legacy generated deck",
          description: "A valid completed deck from before result checkpoints.",
          cards: [
            { prompt: "What makes evidence relevant?", answer: "It bears on the claim.", type: "recall", objectiveIds: ["objective-evidence"], sourceRefIds: ["legacy-source"] },
            { prompt: "Why preserve limitations?", answer: "They bound confidence.", type: "application", objectiveIds: ["objective-evidence"], sourceRefIds: ["legacy-source"] },
          ],
        },
        sources: new Map([["legacy-source", { ref: "legacy-source", lessonId: "0-0", lessonTitle: "Evidence lesson", field: "takeaway" }]]),
      }));
    }

    await lifecycle.runWithAccountGeneration(activeGeneration, () => aiUsage.finalizeAiUsage(reservation, {
      model: "gpt-5.6-luna",
      inputTokens: 100,
      outputTokens: 50,
      responseId: `legacy-${product}-response`,
      resultId: product === "flashcards" ? reservation.requestId.slice(0, 40) : courseId,
      profile: product === "baseline" ? "baseline.standard"
        : product === "capstone" ? "capstone.standard" : "flashcard.standard",
    }));
    const before = await accounting(uid, feature, key);
    assert.equal(before.request.resultCheckpoint, undefined);

    const replay = await routeFor(product)(requestFor(product, courseId, key));
    const replayBody = await replay.json() as Record<string, unknown>;
    assert.equal(replay.status, 200, JSON.stringify(replayBody));
    assert.equal(providerCalls, 0);
    assert.deepEqual(await accounting(uid, feature, key), before);
    if (product === "baseline") assert.equal((replayBody.assessment as { summary: string }).summary, "Legacy completed baseline.");
    else if (product === "capstone") assert.equal((replayBody.assessment as { attempts: number }).attempts, 1);
    else {
      assert.equal((replayBody.deck as { title: string }).title, "Legacy generated deck");
      assert.equal(replayBody.replayed, true);
    }
  });
}

for (const product of ["baseline", "capstone", "flashcards"] as const) {
  test(`${product} fails closed after a hard stop before its result checkpoint`, async () => {
    const { uid, courseId } = await seed(product, "pre_checkpoint");
    const key = `${product}-pre-checkpoint-hard-stop-key`;
    const counterPath = join(directory, `${product}-pre-checkpoint-provider-count.txt`);
    writeFileSync(counterPath, "");
    providerCalls = 0;
    activeFault = null;
    const child = spawnSync(process.execPath, [
      "--conditions=react-server",
      "--import", "tsx",
      "--experimental-test-module-mocks",
      "tests/fixtures/generic-ai-route-precheckpoint-child.ts",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: "",
        OPENAI_API_KEY: "",
        F6_PRODUCT: product,
        F6_UID: uid,
        F6_KEY: key,
        F6_BODY: JSON.stringify(bodyFor(product, courseId)),
        F6_COUNTER_PATH: counterPath,
      },
    });
    assert.equal(child.status, 86, `${child.stdout}\n${child.stderr}`);
    const observedCalls = readFileSync(counterPath, "utf8").trim().split("\n").filter(Boolean).length;
    assert(observedCalls > 0);

    const feature = product === "flashcards" ? "flashcard_generation" : "tutor";
    const requestId = await aiUsage.aiUsageRequestId(uid, feature, key);
    assert.equal(await aiUsage.reconcileExpiredAiUsage(requestId, true, new Date(Date.now() + 10 * 60_000)), "contained_unknown_outcome");
    assert.equal(await aiUsage.reconcileExpiredAiUsage(requestId, true, new Date(Date.now() + 10 * 60_000)), "none");
    const replay = await routeFor(product)(requestFor(product, courseId, key));
    const replayBody = await replay.json() as { code?: string };
    assert.equal(replay.status, 409, JSON.stringify(replayBody));
    assert.equal(replayBody.code, "AI_OUTCOME_RECONCILIATION_REQUIRED");
    assert.equal(providerCalls, 0);
    assert.equal(readFileSync(counterPath, "utf8").trim().split("\n").filter(Boolean).length, observedCalls);

    const state = await accounting(uid, feature, key);
    assert.equal(state.request.status, "failed");
    assert.equal(state.request.terminalReason, "provider_outcome_unknown");
    assert.equal(state.attempt?.status, "accounting_uncertain");
    assert.equal(state.period?.requestCount, 0);
    assert.equal(state.period?.reservedCostMicros, 0);
    assert.equal(state.budget?.reservedCostMicros, 0);
    assert.equal(state.global?.reservedCostMicros, 0);
    assert.equal(state.period?.uncertainCostMicros, state.request.reservedCostMicros);
    assert.equal(state.budget?.uncertainCostMicros, state.request.reservedCostMicros);
    assert.equal(state.global?.uncertainCostMicros, state.request.reservedCostMicros);
    assert.equal(state.period?.actualCostMicros, 0);
    assert.equal(state.budget?.actualCostMicros, 0);
    assert.equal(state.receipt?.actualCostMicros, 0);
    assert.equal(state.request.resultCheckpoint, undefined);
    assert.equal(state.receipt?.status, "uncertain");
    assert.equal(state.receipt?.uncertainCostMicros, state.request.reservedCostMicros);
    assert.equal(state.period?.activeRequestId, null);
    assert.equal(state.period?.activeAttemptToken, null);

    const scan = await documents.scanStoredDocuments();
    const observedOnShard = scan.documents
      .filter(({ path, data }) => path.startsWith("generationUsageReceipts/")
        && data.status === "observed" && data.globalPath === state.request.globalPath)
      .reduce((total, { data }) => total + Number(data.actualCostMicros ?? 0), 0);
    assert.equal(state.global?.actualCostMicros, observedOnShard);
    if (product === "baseline") {
      const outcome = await documents.getStoredDocument(`users/${uid}/learningOutcomes/${courseId}`);
      assert.equal(outcome?.baselineAssessment, undefined);
    } else if (product === "capstone") {
      const progress = await documents.getStoredDocument(`users/${uid}/courseProgress/${courseId}`);
      assert.equal(progress?.capstone, undefined);
      assert.equal(scan.documents.filter(({ path }) => path.startsWith(`users/${uid}/masteryEvidence/`)).length, 0);
    } else {
      assert.equal(scan.documents.filter(({ path }) => path.startsWith(`users/${uid}/flashcardDecks/`)).length, 0);
      assert.equal(scan.documents.filter(({ path }) => path.startsWith(`users/${uid}/flashcards/`)).length, 0);
    }
  });
}

for (const [decksEnabled, generationEnabled, code] of [
  [false, false, "FLASHCARDS_DISABLED"],
  [true, false, "FLASHCARD_GENERATION_DISABLED"],
] as const) {
  test(`flashcards ${decksEnabled}/${generationEnabled} rejects before reservation, provider, or product mutation`, async () => {
    const { uid, courseId } = await seed("flashcards", `configuration_${decksEnabled}_${generationEnabled}`);
    const key = `flashcard-configuration-${decksEnabled}-${generationEnabled}`;
    providerCalls = 0;
    activeFault = null;
    process.env.FLASHCARD_DECKS_ENABLED = String(decksEnabled);
    process.env.FLASHCARD_AI_GENERATION_ENABLED = String(generationEnabled);
    try {
      const accountingPrefixes = ["aiRequests/", "usagePeriods/", "userAiBudgets/", "systemUsageShards/", "generationUsageReceipts/"];
      const beforeAccounting = (await documents.scanStoredDocuments()).documents
        .filter(({ path }) => accountingPrefixes.some((prefix) => path.startsWith(prefix)));
      const response = await generateFlashcards(requestFor("flashcards", courseId, key));
      const responseBody = await response.json() as { code?: string };
      assert.equal(response.status, 503, JSON.stringify(responseBody));
      assert.equal(responseBody.code, code);
      assert.equal(providerCalls, 0);
      const requestId = await aiUsage.aiUsageRequestId(uid, "flashcard_generation", key);
      assert.equal(await documents.getStoredDocument(`aiRequests/${requestId}`), null);
      const scan = await documents.scanStoredDocuments();
      assert.deepEqual(
        scan.documents.filter(({ path }) => accountingPrefixes.some((prefix) => path.startsWith(prefix))),
        beforeAccounting,
      );
      assert.equal(scan.documents.filter(({ path }) => path.startsWith(`users/${uid}/flashcardDecks/`)).length, 0);
      assert.equal(scan.documents.filter(({ path }) => path.startsWith(`users/${uid}/flashcards/`)).length, 0);
    } finally {
      process.env.FLASHCARD_DECKS_ENABLED = "true";
      process.env.FLASHCARD_AI_GENERATION_ENABLED = "true";
    }
  });
}
