import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
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
import { getStoredDocument, putStoredDocument, putStoredDocuments } from "../../src/lib/document-store.ts";
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

function contentHash(value: unknown) {
  return createHash("sha256").update(publicationContentFingerprint(value)).digest("hex");
}

function productGuard(value: unknown) {
  return contentHash(value);
}

function resignCheckpoint(value: Record<string, unknown>) {
  const checkpoint = structuredClone(value);
  const identity = { ...checkpoint };
  delete identity.checkpointFingerprint;
  checkpoint.checkpointFingerprint = contentHash(identity);
  return checkpoint;
}

async function replaceCheckpointCopies(
  reservation: { requestPath: string; requestId: string; attemptToken?: string },
  checkpoint: Record<string, unknown>,
  rootChanges: Record<string, unknown> = {},
  attemptChanges: Record<string, unknown> = {},
) {
  const attemptPath = aiUsageAttemptPath(reservation);
  const [root, attempt] = await Promise.all([
    getStoredDocument(reservation.requestPath),
    getStoredDocument(attemptPath),
  ]);
  assert(root);
  assert(attempt);
  await putStoredDocuments([
    { path: reservation.requestPath, data: { ...root, ...rootChanges, resultCheckpoint: checkpoint } },
    { path: attemptPath, data: { ...attempt, ...attemptChanges, resultCheckpoint: checkpoint } },
  ]);
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
      productGuard: productGuard(null),
      result,
      usage: { model: "gpt-5.6-luna", inputTokens: 100, outputTokens: 50, responseId: "identity-response" },
    });

    await assert.rejects(
      recoverAiUsageResult({ ...reservation, accountGeneration: "replacement-generation" }, { kind: "baseline_assessment", resourceId: "course-identity", resultId: "course-identity" }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "AI_OUTCOME_RECONCILIATION_REQUIRED",
    );
    await assert.rejects(
      recoverAiUsageResult({ ...reservation, uid: "another-account" }, { kind: "baseline_assessment", resourceId: "course-identity", resultId: "course-identity" }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "AI_OUTCOME_RECONCILIATION_REQUIRED",
    );
    await assert.rejects(
      recoverAiUsageResult(reservation, { kind: "baseline_assessment", resourceId: "another-course", resultId: "course-identity" }),
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
      assert.equal(productGuard(current.baselineAssessment ?? null), saved.productGuard);
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
      productGuard: productGuard(null),
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

test("a self-consistent checkpoint with negative usage fails closed", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-negative-checkpoint` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "negative-checkpoint-usage-key",
      "negative-checkpoint-payload",
      { allowCompletedReplay: true },
    );
    const saved = await checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-negative",
      resultId: "course-negative",
      productGuard: productGuard(null),
      result: { summary: "Saved" },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "negative-response" },
    });
    const malformed = structuredClone(saved) as unknown as Record<string, unknown>;
    const samples = malformed.usageSamples as Array<Record<string, unknown>>;
    samples[0].inputTokens = -1;
    (malformed.observed as Record<string, unknown>).inputTokens = -1;
    const resigned = resignCheckpoint(malformed);
    await replaceCheckpointCopies(reservation, resigned);
    await expectSameKeyBlocked(() => recoverAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-negative",
      resultId: "course-negative",
    }));
  });
});

test("a self-consistent checkpoint with an invalid timestamp fails closed", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-date-checkpoint` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "invalid-checkpoint-date-key",
      "invalid-checkpoint-date-payload",
      { allowCompletedReplay: true },
    );
    const saved = await checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-date",
      resultId: "course-date",
      productGuard: productGuard(null),
      result: { summary: "Saved" },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "date-response" },
    });
    const malformed = structuredClone(saved) as unknown as Record<string, unknown>;
    malformed.checkpointedAt = "not-a-date";
    const resigned = resignCheckpoint(malformed);
    await replaceCheckpointCopies(reservation, resigned);
    await expectSameKeyBlocked(() => recoverAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-date",
      resultId: "course-date",
    }));
  });
});

test("checkpoint recovery rejects root result identity drift", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-result-reference` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "checkpoint-result-reference-key",
      "checkpoint-result-reference-payload",
      { allowCompletedReplay: true },
    );
    const saved = await checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-reference",
      resultId: "course-reference",
      productGuard: productGuard(null),
      result: { summary: "Saved" },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "reference-response" },
    });
    await replaceCheckpointCopies(
      reservation,
      saved as unknown as Record<string, unknown>,
      { resultId: "another-course" },
    );
    await expectSameKeyBlocked(() => recoverAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-reference",
      resultId: "course-reference",
    }));
  });
});

test("checkpoint recovery rejects a self-consistent result identity for another product", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-self-consistent-result-reference` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "checkpoint-self-consistent-result-reference-key",
      "checkpoint-self-consistent-result-reference-payload",
      { allowCompletedReplay: true },
    );
    const saved = await checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-a",
      resultId: "course-a",
      productGuard: productGuard(null),
      result: { summary: "Course A result" },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "self-consistent-reference-response" },
    });
    const otherResult = structuredClone(saved) as unknown as Record<string, unknown>;
    otherResult.resultId = "course-b";
    (otherResult.details as Record<string, unknown>).resultId = "course-b";
    const resigned = resignCheckpoint(otherResult);
    await replaceCheckpointCopies(
      reservation,
      resigned,
      { resultId: "course-b" },
      { resultId: "course-b" },
    );

    await expectSameKeyBlocked(() => recoverAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-a",
      resultId: "course-a",
    }));
  });
});

test("a self-consistent checkpoint with contradictory bounded details fails closed", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-details-checkpoint` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "invalid-checkpoint-details-key",
      "invalid-checkpoint-details-payload",
      { allowCompletedReplay: true },
    );
    const saved = await checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-details",
      resultId: "course-details",
      productGuard: productGuard(null),
      result: { summary: "Saved" },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "details-response" },
    });
    const malformed = structuredClone(saved) as unknown as Record<string, unknown>;
    (malformed.details as Record<string, unknown>).attemptCount = 99;
    const resigned = resignCheckpoint(malformed);
    await replaceCheckpointCopies(reservation, resigned);
    await expectSameKeyBlocked(() => recoverAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-details",
      resultId: "course-details",
    }));
  });
});

test("checkpoint creation rejects an oversized full recovery envelope", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-oversized-create` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "oversized-checkpoint-create-key",
      "oversized-checkpoint-create-payload",
      { allowCompletedReplay: true },
    );
    await assert.rejects(
      checkpointAiUsageResult(reservation, {
        kind: "baseline_assessment",
        resourceId: "course-oversized-create",
        resultId: "course-oversized-create",
        productGuard: productGuard(null),
        // The result itself is below the historical 256 KB result-only cap;
        // the complete checkpoint envelope is not.
        result: { summary: "x".repeat(255_000) },
        usage: {
          responseId: "oversized-create-response",
          usageSamples: [{
            model: "gpt-5.6-luna", inputTokens: 1, cachedInputTokens: 0,
            cacheWriteTokens: 0, outputTokens: 1, responseId: "oversized-create-response",
          }],
        },
      }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "AI_RESULT_CHECKPOINT_INVALID",
    );
  });
});

test("a self-consistent oversized saved checkpoint fails closed on read", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-oversized-read` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "oversized-checkpoint-read-key",
      "oversized-checkpoint-read-payload",
      { allowCompletedReplay: true },
    );
    const saved = await checkpointAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-oversized-read",
      resultId: "course-oversized-read",
      productGuard: productGuard(null),
      result: { summary: "Saved" },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "oversized-read-response" },
    });
    const malformed = structuredClone(saved) as unknown as Record<string, unknown>;
    (malformed.details as Record<string, unknown>).padding = "x".repeat(300_000);
    const resigned = resignCheckpoint(malformed);
    await replaceCheckpointCopies(reservation, resigned);
    await expectSameKeyBlocked(() => recoverAiUsageResult(reservation, {
      kind: "baseline_assessment",
      resourceId: "course-oversized-read",
      resultId: "course-oversized-read",
    }));
  });
});

test("checkpoint creation rejects more than the bounded usage sample count", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-sample-count` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "checkpoint-sample-count-key",
      "checkpoint-sample-count-payload",
      { allowCompletedReplay: true },
    );
    await assert.rejects(
      checkpointAiUsageResult(reservation, {
        kind: "baseline_assessment",
        resourceId: "course-sample-count",
        resultId: "course-sample-count",
        productGuard: productGuard(null),
        result: { summary: "Saved" },
        usage: {
          responseId: "sample-count-response",
          usageSamples: Array.from({ length: 9 }, (_, index) => ({
            model: "gpt-5.6-luna",
            inputTokens: 1,
            cachedInputTokens: 0,
            cacheWriteTokens: 0,
            outputTokens: 1,
            responseId: `sample-count-${index}`,
          })),
        },
      }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "AI_RESULT_CHECKPOINT_INVALID",
    );
  });
});

test("a changed payload reports idempotency conflict before stale outcome reconciliation", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-stale-conflict` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      "stale-payload-conflict-key",
      "stale-payload-a",
      { allowCompletedReplay: true },
    );
    const root = await getStoredDocument(reservation.requestPath);
    await putStoredDocument(reservation.requestPath, { ...root, leaseUntil: "2000-01-01T00:00:00.000Z" });
    await assert.rejects(
      reserveAiUsage(scopedActor, "tutor", "stale-payload-conflict-key", "stale-payload-b", { allowCompletedReplay: true }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "IDEMPOTENCY_CONFLICT",
    );
  });
});

test("a changed payload reports idempotency conflict before outcome-unknown terminal handling", async () => {
  const scopedActor = { ...actor, uid: `${actor.uid}-unknown-conflict` };
  const generation = await captureAccountGeneration(scopedActor.uid);
  await runWithAccountGeneration(generation, async () => {
    const key = "unknown-payload-conflict-key";
    const reservation = await reserveAiUsage(
      scopedActor,
      "tutor",
      key,
      "unknown-payload-a",
      { allowCompletedReplay: true },
    );
    assert.equal(
      await reconcileExpiredAiUsage(reservation.requestId, true, await expiredAt(reservation.requestPath)),
      "contained_unknown_outcome",
    );
    await assert.rejects(
      reserveAiUsage(scopedActor, "tutor", key, "unknown-payload-b", { allowCompletedReplay: true }),
      (error: unknown) => error instanceof AiQuotaError && error.code === "IDEMPOTENCY_CONFLICT",
    );
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
      productGuard: productGuard(null),
      result: { summary: "Private result removed during deletion." },
      usage: { model: "gpt-5.6-luna", inputTokens: 10, outputTokens: 10, responseId: "deletion-response" },
    });
    return reserved;
  });
  const globalBeforeDeletion = await getStoredDocument(reservation.globalPath);
  const job = await runWithAccountGeneration(generation, () => beginAccountDeletion(scopedActor.uid));
  const deletion = await resumeAccountDeletion(job);
  assert.equal(deletion.status, 202, JSON.stringify(deletion.body));
  const receiptPath = `generationUsageReceipts/legacy-${reservation.requestId}-${reservation.attemptToken}`;
  const globalAfterDeletion = await getStoredDocument(reservation.globalPath);
  const receiptAfterDeletion = await getStoredDocument(receiptPath);
  assert.equal(receiptAfterDeletion?.status, "observed");
  assert.equal(
    globalAfterDeletion?.reservedCostMicros,
    Math.max(0, Number(globalBeforeDeletion?.reservedCostMicros ?? 0) - reservation.reserveCostMicros),
  );
  assert.equal(globalAfterDeletion?.actualCostMicros, Number(globalBeforeDeletion?.actualCostMicros ?? 0) + 70);
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
