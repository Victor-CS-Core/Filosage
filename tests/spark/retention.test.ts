import assert from "node:assert/strict";
import test from "node:test";
import { pruneSparkTurnsMain, type PruneSparkTurnsDependencies } from "../../scripts/prune-spark-turns.ts";

function fixture() {
  const deleted: string[][] = [];
  const output: string[] = [];
  const pages = [
    {
      documents: [
        { id: "expired", expiresAt: "2026-10-08T00:00:00.000Z" },
        { id: "active", expiresAt: "2026-10-10T00:00:00.000Z" },
        { id: "educational-attempt", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      nextAfterId: "active",
    },
    {
      documents: [
        { id: "expired-later-page", expiresAt: "2026-10-09T00:00:00.000Z" },
        { id: "../unsafe", expiresAt: "2026-10-01T00:00:00.000Z" },
      ],
      nextAfterId: null,
    },
  ];
  let page = 0;
  const dependencies: PruneSparkTurnsDependencies = {
    async deleteStoredDocuments(paths) { deleted.push(paths); },
    async listCollectionDocumentsPage(collectionId) {
      assert.equal(collectionId, "sparkTurns");
      return pages[page++];
    },
    now: () => Date.parse("2026-10-09T00:00:00.000Z"),
    writeOutput: (line) => output.push(line),
  };
  return { deleted, output, dependencies };
}

test("Spark retention is dry-run by default and counts only expired raw turns", async () => {
  const value = fixture();
  const result = await pruneSparkTurnsMain([], value.dependencies);
  assert.deepEqual(result, { mode: "dry-run", eligible: 2, retentionDays: 30, pruned: 0 });
  assert.deepEqual(value.deleted, []);
  assert.equal(value.output.length, 1);
});

test("Spark retention requires explicit confirmation and deletes only eligible turn paths", async () => {
  await assert.rejects(pruneSparkTurnsMain(["--apply"], fixture().dependencies), /confirm-30-day-retention/);
  const value = fixture();
  const result = await pruneSparkTurnsMain(["--apply", "--confirm-30-day-retention"], value.dependencies);
  assert.deepEqual(result, { mode: "write", eligible: 2, retentionDays: 30, pruned: 2 });
  assert.deepEqual(value.deleted, [["sparkTurns/expired", "sparkTurns/expired-later-page"]]);
});