import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPostgresFixture } from "./fixture.ts";

test("PostgreSQL competing generation connections keep one claim and one committed grant", { timeout: 30_000 }, async () => {
  const fixture = await createPostgresFixture();
  const uid = `generation-pg-${randomUUID()}`;
  const exactPaths = new Set<string>([`accountLifecycles/${uid}`]);
  try {
    const operations = await import("../../src/lib/generation-operations.ts");
    const { captureAccountGeneration, runWithAccountGeneration } = await import("../../src/lib/account-lifecycle.ts");
    const actor = await captureAccountGeneration(uid);
    const account = { uid, plan: "pro" as const, isOwner: false, access: "pro" as const, accountStatus: "active" as const, subscriptionStatus: "active" as const };
    const id = operations.generationOperationId(uid, "postgres-competing-operation");
    const now = new Date(Date.UTC(10_000 + Math.floor(Math.random() * 100_000), 1, 1));
    const operationPath = `generationOperations/${id}`;
    const admission = () => runWithAccountGeneration(actor, () => operations.beginGenerationOperation(account, "postgres-competing-operation", { topic: "Competing connections" }, now));
    // Both promises execute the actual transaction adapter using separate pool
    // connections. One admission succeeds; its competing owner must fail closed.
    const results = await Promise.allSettled([admission(), admission()]);
    const admitted = results.filter((result) => result.status === "fulfilled");
    assert.equal(admitted.length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const lease = (admitted[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof admission>>>).value;
    const accounting = lease.operation.accounting;
    for (const path of [operationPath, lease.receiptPath, accounting.requestPath, accounting.periodPath, accounting.userBudgetPath, accounting.globalPath,
      `courses/${id}`, `users/${uid}/courseCredits/current`, `users/${uid}/courseCreditClaims/${id}`, `accountLifecycles/${uid}`]) exactPaths.add(path);
    const ledger = await fixture.store.getStoredDocument(`users/${uid}/courseCredits/current`);
    assert.equal(ledger?.balance, 4);
    const result = { course: { topic: "Competing connections", modules: [{ lessons: [{ title: "One" }, { title: "Two" }] }] } };
    const settled = await Promise.all([operations.finishGenerationOperation(lease, result, now), operations.finishGenerationOperation(lease, result, now)]);
    assert.equal(settled[0]?.id, id);
    assert.equal(settled[1]?.id, id);
    const course = await fixture.store.getStoredDocument(`courses/${id}`);
    assert.ok(course);
    assert.deepEqual((course.generationGrant as { lessonIds: string[] }).lessonIds, ["0-0", "0-1"]);
    assert.equal((await fixture.store.getStoredDocument(accounting.globalPath))?.reservedCostMicros, 0);
    const replay = await admission();
    assert.equal(replay.operation.status, "completed");
    assert.equal((await fixture.store.getStoredDocument(`users/${uid}/courseCredits/current`))?.balance, 4);
  } finally {
    // Exact UUID-owned paths, including the unique far-future accounting window;
    // no table-wide cleanup and no shared production account or data can match.
    if (exactPaths.size) await fixture.monitor.query("DELETE FROM filosage_documents WHERE path = ANY($1::text[])", [[...exactPaths]]);
    await fixture.close();
  }
});
