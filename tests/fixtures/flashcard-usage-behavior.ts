import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
import type { ServerAccount } from "../../src/lib/account-server.ts";
import { aiUsageAttemptPath, finalizeAiUsage, reserveAiUsage, type AiReservation } from "../../src/lib/ai-usage.ts";
import { getStoredDocument } from "../../src/lib/document-store.ts";

// The local store resolves its directory relative to cwd. Keep the fixture on
// that drive: path.relative() cannot make a C: temp directory relative to D:.
const workspace = process.cwd();
const directory = mkdtempSync(join(workspace, ".flashcard-usage-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
after(() => {
  assert.equal(dirname(directory), workspace);
  rmSync(directory, { recursive: true, force: true });
});

const observedUsage = {
  model: "gpt-5.6-luna", inputTokens: 100, outputTokens: 50,
  responseId: "fixture-observed-flashcard-response",
};

async function accounting(reservation: AiReservation) {
  const [period, budget, global, request, attempt, receipt] = await Promise.all([
    getStoredDocument(reservation.periodPath), getStoredDocument(reservation.userBudgetPath),
    getStoredDocument(reservation.globalPath), getStoredDocument(reservation.requestPath),
    getStoredDocument(aiUsageAttemptPath(reservation)),
    getStoredDocument(`generationUsageReceipts/legacy-${reservation.requestId}-${reservation.attemptToken}`),
  ]);
  return { period, budget, global, request, attempt, receipt };
}

function account(uid: string): ServerAccount {
  return { uid, plan: "plus", access: "plus", isOwner: false, accountStatus: "active", subscriptionStatus: "active" };
}

test("failed flashcard generation refunds its count but retains observed provider cost exactly once", async () => {
  const actor = account("flashcard-failure");
  const generation = await captureAccountGeneration(actor.uid);
  await runWithAccountGeneration(generation, async () => {
    const reservation = await reserveAiUsage(actor, "flashcard_generation", "failed-flashcard-request");
    const reserved = await accounting(reservation);
    assert.equal(reserved.period?.requestCount, 1);
    assert.equal(reserved.request?.status, "reserved");
    for (const document of [reserved.period, reserved.budget, reserved.global]) {
      assert.equal(document?.reservedCostMicros, reservation.reserveCostMicros);
    }

    await finalizeAiUsage(reservation, { ...observedUsage, failed: true });
    const failed = await accounting(reservation);
    assert.equal(failed.period?.requestCount, 0);
    assert.equal(failed.request?.status, "failed");
    assert.equal(failed.receipt?.actualCostMicros, 400);
    for (const key of ["period", "budget", "global"] as const) {
      assert.equal(failed[key]?.reservedCostMicros, 0);
      assert.equal(Number(failed[key]?.actualCostMicros) - Number(reserved[key]?.actualCostMicros), 400);
    }
    assert.equal(failed.period?.inputTokens, 100);
    assert.equal(failed.period?.outputTokens, 50);

    await finalizeAiUsage(reservation, { ...observedUsage, failed: true });
    assert.deepEqual(await accounting(reservation), failed);
  });
});

test("completed flashcard replay returns the saved deck without another metered event or cost", async () => {
  const actor = account("flashcard-replay");
  const generation = await captureAccountGeneration(actor.uid);
  await runWithAccountGeneration(generation, async () => {
    const key = "completed-flashcard-request";
    const fingerprint = "same-course-source-and-generation-settings";
    const legacyReplay = { profile: "flashcard.standard", resultId: "saved-flashcard-deck" };
    const reservation = await reserveAiUsage(actor, "flashcard_generation", key, fingerprint, { allowCompletedReplay: true });
    const reserved = await accounting(reservation);
    assert.equal(reservation.recovered, false);
    assert.equal(reserved.period?.requestCount, 1);
    await finalizeAiUsage(reservation, { ...observedUsage, resultId: "saved-flashcard-deck", profile: legacyReplay.profile });
    const completed = await accounting(reservation);
    assert.equal(completed.request?.status, "completed");
    assert.equal(completed.request?.resultId, "saved-flashcard-deck");
    assert.equal(completed.period?.requestCount, 1);
    for (const name of ["period", "budget", "global"] as const) {
      assert.equal(completed[name]?.reservedCostMicros, 0);
      assert.equal(Number(completed[name]?.actualCostMicros) - Number(reserved[name]?.actualCostMicros), 400);
    }
    await finalizeAiUsage(reservation, { ...observedUsage, resultId: "saved-flashcard-deck", profile: legacyReplay.profile });
    assert.deepEqual(await accounting(reservation), completed);

    const replay = await reserveAiUsage(actor, "flashcard_generation", key, fingerprint, { allowCompletedReplay: true, legacyReplay });
    assert.equal(replay.recovered, true);
    assert.equal(replay.recoveredResultId, "saved-flashcard-deck");
    assert.equal(replay.requestId, reservation.requestId);
    assert.equal(replay.attemptToken, reservation.attemptToken);
    assert.deepEqual(await accounting(reservation), completed);
    assert.deepEqual(await getStoredDocument(aiUsageAttemptPath(replay)), completed.attempt);
    await finalizeAiUsage(replay, { ...observedUsage, resultId: "saved-flashcard-deck" });
    assert.deepEqual(await accounting(reservation), completed);
  });
});
