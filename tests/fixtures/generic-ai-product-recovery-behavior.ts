import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { ServerAccount } from "../../src/lib/account-server.ts";
import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
import {
  AiQuotaError,
  abandonAiUsage,
  aiUsageAttemptPath,
  checkpointAiUsageResult,
  finalizeAiUsage,
  recoverAiUsageResult,
  reconcileExpiredAiUsage,
  reserveAiUsage,
  settleAiUsageProduct,
} from "../../src/lib/ai-usage.ts";
import { getStoredDocument, putStoredDocument } from "../../src/lib/document-store.ts";
import { createGeneratedFlashcardDraft } from "../../src/lib/flashcards-server.ts";
import { publicationContentFingerprint } from "../../src/lib/publication-content.ts";
import { beginAccountDeletion, resumeAccountDeletion } from "../../src/lib/account-deletion.ts";

if (process.env.OPENAI_API_KEY || process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
  throw new Error("Generic product recovery fixtures require isolated local mode without provider credentials.");
}

const directory = mkdtempSync(join(tmpdir(), "generic-ai-product-recovery-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.FLASHCARD_DECKS_ENABLED = "true";
process.env.FLASHCARD_AI_GENERATION_ENABLED = "true";
after(() => rmSync(directory, { recursive: true, force: true }));

const actor: ServerAccount = {
  uid: "generic-product-recovery",
  plan: "plus",
  access: "plus",
  isOwner: false,
  accountStatus: "active",
  subscriptionStatus: "active",
};

async function expiredAt(requestPath: string) {
  const request = await getStoredDocument(requestPath);
  return new Date(Date.parse(String(request?.leaseUntil)) + 1);
}

async function expectSameKeyBlocked(work: () => Promise<unknown>) {
  await assert.rejects(work, (error: unknown) => (
    error instanceof AiQuotaError
    && error.code === "AI_OUTCOME_RECONCILIATION_REQUIRED"
  ));
}

test("an observed provider result lost before its durable checkpoint never makes the same key reusable", async () => {
  const generation = await captureAccountGeneration(actor.uid);
  await runWithAccountGeneration(generation, async () => {
    const key = "pre-checkpoint-observed-result";
    const fingerprint = "baseline:course-a:submission-a";
    const reservation = await reserveAiUsage(actor, "tutor", key, fingerprint, { allowCompletedReplay: true });
    let providerCalls = 1; // The provider response was observed, then the process stopped before any checkpoint.

    assert.equal(await reconcileExpiredAiUsage(reservation.requestId, true, await expiredAt(reservation.requestPath)), "contained_unknown_outcome");
    await expectSameKeyBlocked(async () => {
      await reserveAiUsage(actor, "tutor", key, fingerprint, { allowCompletedReplay: true });
      providerCalls += 1;
    });

    assert.equal(providerCalls, 1);
    assert.equal((await getStoredDocument(reservation.requestPath))?.terminalReason, "provider_outcome_unknown");
    assert.equal((await getStoredDocument(aiUsageAttemptPath(reservation)))?.status, "accounting_uncertain");
  });
});

test("a flashcard product committed before legacy finalization cannot trigger another paid provider call", async () => {
  const generation = await captureAccountGeneration(`${actor.uid}-flashcards`);
  const flashcardActor = { ...actor, uid: `${actor.uid}-flashcards` };
  await runWithAccountGeneration(generation, async () => {
    const key = "after-product-before-finalization";
    const fingerprint = "flashcards:course-a:balanced";
    const reservation = await reserveAiUsage(
      flashcardActor,
      "flashcard_generation",
      key,
      fingerprint,
      { allowCompletedReplay: true },
    );
    let providerCalls = 1;
    const deckId = reservation.requestId.slice(0, 40);
    const detail = await createGeneratedFlashcardDraft({
      account: flashcardActor,
      deckId,
      courseId: "course-a",
      courseTopic: "Careful evidence",
      moduleIndex: null,
      lessonIds: ["0-0"],
      scope: "course",
      depth: "balanced",
      emphasis: "balanced",
      includeAttemptedChecks: false,
      sourceFingerprint: "source-fingerprint-a",
      output: {
        title: "Original observed deck",
        description: "The immutable provider result.",
        cards: [
          { prompt: "What makes evidence relevant?", answer: "It bears on the claim being evaluated.", type: "recall", objectiveIds: ["objective-a"], sourceRefIds: ["source-a"] },
          { prompt: "What should remain visible?", answer: "The limits of the available evidence.", type: "application", objectiveIds: ["objective-a"], sourceRefIds: ["source-a"] },
        ],
      },
      sources: new Map([["source-a", { ref: "source-a", lessonId: "0-0", lessonTitle: "Evidence", field: "takeaway" }]]),
    });
    assert.equal(detail.deck.id, deckId);

    assert.equal(await reconcileExpiredAiUsage(reservation.requestId, true, await expiredAt(reservation.requestPath)), "contained_unknown_outcome");
    await expectSameKeyBlocked(async () => {
      await reserveAiUsage(flashcardActor, "flashcard_generation", key, fingerprint, { allowCompletedReplay: true });
      providerCalls += 1;
    });

    assert.equal(providerCalls, 1);
    const replayed = await createGeneratedFlashcardDraft({
      account: flashcardActor,
      deckId,
      courseId: "course-a",
      courseTopic: "Careful evidence",
      moduleIndex: null,
      lessonIds: ["0-0"],
      scope: "course",
      depth: "balanced",
      emphasis: "balanced",
      includeAttemptedChecks: false,
      sourceFingerprint: "source-fingerprint-a",
      output: {
        title: "A later result must not replace this deck",
        description: "This content must never be persisted.",
        cards: [
          { prompt: "Replacement?", answer: "No.", type: "recall", objectiveIds: [], sourceRefIds: ["source-a"] },
          { prompt: "Redispatched?", answer: "No.", type: "recall", objectiveIds: [], sourceRefIds: ["source-a"] },
        ],
      },
      sources: new Map([["source-a", { ref: "source-a", lessonId: "0-0", lessonTitle: "Evidence", field: "takeaway" }]]),
    });
    assert.equal(replayed.deck.title, "Original observed deck");
    assert.equal(replayed.cards.length, 2);
  });
});

test("checkpoint recovery enforces identity and settlement cannot clear a later attempt lock", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-identity` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const path = `users/${scopedActor.uid}/learningOutcomes/course-identity`;
    await putStoredDocument(path, { uid: scopedActor.uid, courseId: "course-identity", marker: "unchanged" });
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "checkpoint-identity-key",
      "checkpoint-payload-a",
      { allowCompletedReplay: true },
    );
    const result = {
      summary: "The immutable observed result.",
      criteria: [{ criterion: "Use evidence.", met: true, feedback: "Evidence was used." }],
      assessedAt: "2026-09-09T12:00:00.000Z",
      score: 100,
    };
    const checkpoint = await checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-identity",
      resultId: "course-identity",
      productGuard: publicationContentFingerprint(null),
      result,
      usage: { model: "gpt-5.6-luna", inputTokens: 100, outputTokens: 50, responseId: "identity-response" },
    });

    await assert.rejects(
      recoverAiUsageResult({ ...reservation, accountGeneration: "replacement-generation" }, { kind: "baseline_assessment", resourceId: "course-identity" }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "AI_OUTCOME_RECONCILIATION_REQUIRED",
    );
    await assert.rejects(
      recoverAiUsageResult({ ...reservation, uid: "another-account" }, { kind: "baseline_assessment", resourceId: "course-identity" }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "AI_OUTCOME_RECONCILIATION_REQUIRED",
    );
    await assert.rejects(
      recoverAiUsageResult(reservation, { kind: "baseline_assessment", resourceId: "another-course" }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "AI_OUTCOME_RECONCILIATION_REQUIRED",
    );
    await assert.rejects(
      reserveAiUsage(scopedActor, "tutor", "checkpoint-identity-key", "checkpoint-payload-b", { allowCompletedReplay: true }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "IDEMPOTENCY_CONFLICT",
    );

    const period = await getStoredDocument(reservation.periodPath);
    await putStoredDocument(reservation.periodPath, {
      ...period,
      activeRequestId: "replacement-request",
      activeAttemptToken: "replacement-attempt",
      activeUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    const settle = () => settleAiUsageProduct(reservation, checkpoint, [path], (documents, saved) => {
      const current = documents[path];
      assert(current);
      assert.equal(publicationContentFingerprint(current.baselineAssessment ?? null), saved.productGuard);
      return {
        writes: [{ path, data: { ...current, baselineAssessment: saved.result as Record<string, unknown>,
          mutationCount: Number(current.mutationCount ?? 0) + 1 } }],
        result: saved.result,
      };
    });
    assert.deepEqual(await settle(), result);
    const settled = {
      request: await getStoredDocument(reservation.requestPath),
      attempt: await getStoredDocument(aiUsageAttemptPath(reservation)),
      period: await getStoredDocument(reservation.periodPath),
      budget: await getStoredDocument(reservation.userBudgetPath),
      global: await getStoredDocument(reservation.globalPath),
    };
    assert.deepEqual(await settle(), result);
    assert.equal((await getStoredDocument(path))?.mutationCount, 1);
    assert.equal(settled.request?.status, "completed");
    assert.equal(settled.attempt?.status, "accounting_observed");
    assert.equal(settled.period?.activeRequestId, "replacement-request");
    assert.equal(settled.period?.activeAttemptToken, "replacement-attempt");
    assert.deepEqual({
      request: await getStoredDocument(reservation.requestPath),
      attempt: await getStoredDocument(aiUsageAttemptPath(reservation)),
      period: await getStoredDocument(reservation.periodPath),
      budget: await getStoredDocument(reservation.userBudgetPath),
      global: await getStoredDocument(reservation.globalPath),
    }, settled);
  });
});

test("a malformed saved checkpoint fails closed without becoming a reusable paid key", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-malformed` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "malformed-checkpoint-key",
      "malformed-payload",
      { allowCompletedReplay: true },
    );
    await checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-malformed",
      resultId: "course-malformed",
      productGuard: publicationContentFingerprint(null),
      result: { summary: "Saved" },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "malformed-response" },
    });
    const root = await getStoredDocument(reservation.requestPath);
    await putStoredDocument(reservation.requestPath, { ...root, resultCheckpoint: { version: 1, kind: "baseline_assessment" } });
    await expectSameKeyBlocked(() => reserveAiUsage(
      scopedActor,
      "tutor",
      "malformed-checkpoint-key",
      "malformed-payload",
      { allowCompletedReplay: true },
    ));
  });
});

test("account deletion settles a checkpoint globally and late completion never recreates private state", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-deletion`, subscriptionStatus: "none" as const };
  const generation = await captureAccountGeneration(scopedActor.uid);
  const reservation = await runWithAccountGeneration(generation, async () => {
    await putStoredDocument(`users/${scopedActor.uid}`, { ...scopedActor });
    const reserved = await reserveAiUsage(
      scopedActor,
      "tutor",
      "checkpoint-deletion-key",
      "checkpoint-deletion-payload",
      { allowCompletedReplay: true },
    );
    await checkpointAiUsageResult(reserved, {
      kind: "baseline_assessment",
      resourceId: "course-deletion",
      resultId: "course-deletion",
      productGuard: publicationContentFingerprint(null),
      result: { summary: "Private result removed during deletion." },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "deletion-response" },
    });
    return reserved;
  });
  const job = await runWithAccountGeneration(generation, () => beginAccountDeletion(scopedActor.uid));
  const deletion = await resumeAccountDeletion(job);
  assert.equal(deletion.status, 202, JSON.stringify(deletion.body));
  const receiptPath = `generationUsageReceipts/legacy-${reservation.requestId}-${reservation.attemptToken}`;
  const globalAfterDeletion = await getStoredDocument(reservation.globalPath);
  const receiptAfterDeletion = await getStoredDocument(receiptPath);
  assert.equal(receiptAfterDeletion?.status, "observed");
  assert.equal(globalAfterDeletion?.reservedCostMicros, 0);
  assert.equal(globalAfterDeletion?.actualCostMicros, 70);
  const personalPaths = [reservation.requestPath, aiUsageAttemptPath(reservation), reservation.periodPath, reservation.userBudgetPath];
  for (const path of personalPaths) assert.equal(await getStoredDocument(path), null);

  await runWithAccountGeneration(generation, () => finalizeAiUsage(reservation, {
    model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "deletion-response",
  }));
  await abandonAiUsage(reservation.requestId);
  for (const path of personalPaths) assert.equal(await getStoredDocument(path), null);
  assert.deepEqual(await getStoredDocument(reservation.globalPath), globalAfterDeletion);
  assert.deepEqual(await getStoredDocument(receiptPath), receiptAfterDeletion);
});
