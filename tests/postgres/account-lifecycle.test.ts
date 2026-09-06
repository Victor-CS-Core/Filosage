import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPostgresFixture, waitForAdvisoryWaiter } from "./fixture.ts";

// Requires the guarded, explicitly named PostgreSQL 16 service. This file never
// falls back to the local adapter and never cleans up another fixture's records.
test("an actual PostgreSQL lifecycle lock fences a queued owned write and an ABA generation replay", async () => {
  const fixture = await createPostgresFixture();
  const { captureAccountGeneration, runWithAccountGeneration, accountLifecyclePath, AccountLifecycleError } = await import("../../src/lib/account-lifecycle.ts");
  const uid = `r04-${randomUUID()}`;
  const lifecyclePath = accountLifecyclePath(uid);
  const accountPath = `users/${uid}`;
  const notePath = `${accountPath}/lessonNotes/paused`;
  const exactPaths = [lifecyclePath, accountPath, notePath];
  let queued: Promise<unknown> | undefined;
  try {
    const generation = await captureAccountGeneration(uid);
    await runWithAccountGeneration(generation, () => fixture.store.putStoredDocument(accountPath, { uid }));
    await fixture.monitor.query("BEGIN");
    await fixture.monitor.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lifecyclePath]);
    const pid = await fixture.monitor.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    queued = runWithAccountGeneration(generation, () => fixture.store.putStoredDocument(notePath, { note: "late provider result" }));
    // Attach rejection handling before releasing the remote lock.
    const rejection = assert.rejects(queued, AccountLifecycleError);
    await waitForAdvisoryWaiter(fixture.monitor, pid.rows[0].pid);
    // This independent connection represents the deleting process's commit.
    await fixture.monitor.query("UPDATE filosage_documents SET data = data || $2::jsonb WHERE path = $1", [lifecyclePath, JSON.stringify({ state: "deleted" })]);
    await fixture.monitor.query("DELETE FROM filosage_documents WHERE path = $1", [accountPath]);
    await fixture.monitor.query("COMMIT");
    await rejection;
    assert.equal(await fixture.store.getStoredDocument(notePath), null);
    assert.equal(await fixture.store.getStoredDocument(accountPath), null);
    const capturedAfterDeletion = await captureAccountGeneration(uid);
    assert.equal(capturedAfterDeletion.generation, generation.generation);
    assert.equal(capturedAfterDeletion.state, "deleted");

    // Simulate a future separately reviewed reopen ONLY inside this disposable
    // database. No application API permits this operation or removes tombstones.
    const replacement = randomUUID();
    await fixture.monitor.query("UPDATE filosage_documents SET data = data || $2::jsonb WHERE path = $1", [lifecyclePath, JSON.stringify({ state: "active", generation: replacement })]);
    await assert.rejects(runWithAccountGeneration(generation, () => fixture.store.putStoredDocument(accountPath, { uid })), AccountLifecycleError);
    await runWithAccountGeneration({ uid, generation: replacement }, () => fixture.store.putStoredDocument(accountPath, { uid }));
    await assert.rejects(fixture.store.putStoredDocument(notePath, { note: "missing trusted scope" }), AccountLifecycleError);
    assert.equal(await fixture.store.getStoredDocument(notePath), null);
    assert.equal((await fixture.store.getStoredDocument(lifecyclePath))?.generation, replacement);
  } finally {
    await fixture.monitor.query("ROLLBACK").catch(() => undefined);
    await queued?.catch(() => undefined);
    await fixture.monitor.query("DELETE FROM filosage_documents WHERE path = ANY($1::text[])", [exactPaths]);
    await fixture.close();
  }
});
