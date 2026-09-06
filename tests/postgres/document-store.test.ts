import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostgresFixture, waitForAdvisoryWaiter } from "./fixture.ts";

const timeout = 30_000;

test("PostgreSQL concurrent duplicate operations update balance, ledger and receipts exactly once", { timeout }, async () => {
  const fixture = await createPostgresFixture();
  try {
    const balance = fixture.path("balance");
    const ledger = fixture.path("ledger");
    await fixture.store.runStoredDocumentTransaction([balance, ledger], () => ({
      writes: [{ path: balance, data: { credits: 100 } }, { path: ledger, data: { applied: 0 } }], result: null,
    }));
    const settled = await Promise.allSettled(Array.from({ length: 24 }, (_, index) => {
      const receipt = fixture.path(`receipt-${index % 4}`);
      const paths = index % 2 ? [receipt, ledger, balance] : [balance, ledger, receipt];
      return fixture.store.runStoredDocumentTransaction(paths, (documents) => {
        if (documents[receipt]) return { writes: [], result: "replayed" };
        return {
          writes: [
            { path: balance, data: { credits: Number(documents[balance]?.credits) - 3 } },
            { path: ledger, data: { applied: Number(documents[ledger]?.applied) + 1 } },
            { path: receipt, data: { applied: true } },
          ], result: "applied",
        };
      });
    }));
    const outcomes = settled.map((outcome) => {
      assert.equal(outcome.status, "fulfilled", outcome.status === "rejected" ? String(outcome.reason) : undefined);
      return outcome.status === "fulfilled" ? outcome.value : null;
    });
    assert.equal(outcomes.filter((outcome) => outcome === "applied").length, 4);
    assert.equal(outcomes.filter((outcome) => outcome === "replayed").length, 20);
    assert.deepEqual(await fixture.read("balance"), { credits: 88 });
    assert.deepEqual(await fixture.read("ledger"), { applied: 4 });
    for (let index = 0; index < 4; index += 1) assert.deepEqual(await fixture.read(`receipt-${index}`), { applied: true });
  } finally { await fixture.close(); }
});

test("PostgreSQL rolls back earlier writes when a later write fails a real database constraint", { timeout }, async () => {
  const fixture = await createPostgresFixture();
  try {
    const balance = fixture.path("balance");
    await fixture.store.runStoredDocumentTransaction([balance], () => ({ writes: [{ path: balance, data: { credits: 100 } }], result: null }));
    // An invalid collection ID reaches the real SQL CHECK after the earlier valid write.
    const invalid = `${fixture.path("invalid-parent")}/invalid.collection/entry`;
    await assert.rejects(fixture.store.runStoredDocumentTransaction([balance, invalid], () => ({
      writes: [{ path: balance, data: { credits: 0 } }, { path: invalid, data: { applied: true } }], result: null,
    })), /filosage_documents_collection_shape/);
    assert.deepEqual(await fixture.read("balance"), { credits: 100 });
    const invalidRows = await fixture.monitor.query<{ count: number }>("SELECT count(*)::int AS count FROM filosage_documents WHERE path = $1", [invalid]);
    assert.equal(invalidRows.rows[0].count, 0);
    assert.equal(globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.size, 0);
  } finally { await fixture.close(); }
});

test("PostgreSQL callback rollback releases locks and leaves existing and missing records unchanged", { timeout }, async () => {
  const fixture = await createPostgresFixture();
  try {
    const existing = fixture.path("existing");
    const missing = fixture.path("missing");
    await fixture.store.runStoredDocumentTransaction([existing], () => ({ writes: [{ path: existing, data: { value: 1 } }], result: null }));
    await assert.rejects(fixture.store.runStoredDocumentTransaction([existing, missing], () => { throw new Error("abort fixture mutation"); }), /abort fixture mutation/);
    assert.deepEqual(await fixture.read("existing"), { value: 1 });
    assert.equal(await fixture.read("missing"), null);
    // A new transaction completing on the same paths proves rollback released its locks.
    await fixture.store.runStoredDocumentTransaction([missing, existing], () => ({ writes: [{ path: existing, data: { value: 2 } }], result: null }));
    assert.deepEqual(await fixture.read("existing"), { value: 2 });
    assert.equal(globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.size, 0);
  } finally { await fixture.close(); }
});

test("PostgreSQL deferred COMMIT failure rolls back all document writes and releases its connection", { timeout }, async () => {
  const fixture = await createPostgresFixture();
  try {
    const existing = fixture.path("existing");
    const missing = fixture.path("missing");
    await fixture.store.runStoredDocumentTransaction([existing], () => ({
      writes: [{ path: existing, data: { value: 1 } }], result: null,
    }));
    const batch = await fixture.request<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST", body: JSON.stringify({ documents: [fixture.name(existing), fixture.name(missing)] }),
    });
    const transaction = batch?.[0].transaction;
    assert.ok(transaction);
    const holder = globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.get(transaction);
    assert.ok(holder);
    // Session-local, transaction-owned table: both inserts succeed; PostgreSQL rejects COMMIT itself.
    await holder.client.query(`CREATE TEMP TABLE fixture_deferred_commit (
      id integer CONSTRAINT fixture_commit_unique UNIQUE DEFERRABLE INITIALLY DEFERRED
    ) ON COMMIT DROP`);
    await holder.client.query("INSERT INTO fixture_deferred_commit VALUES (1), (1)");
    await assert.rejects(fixture.request("/documents:commit", {
      method: "POST", body: JSON.stringify({
        transaction, writes: [fixture.write(existing, { value: 2 }), fixture.write(missing, { value: 2 })],
      }),
    }), /fixture_commit_unique/);
    assert.deepEqual(await fixture.read("existing"), { value: 1 });
    assert.equal(await fixture.read("missing"), null);
    assert.equal(globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.size, 0);
    await fixture.store.runStoredDocumentTransaction([missing, existing], () => ({
      writes: [{ path: missing, data: { value: 3 } }], result: null,
    }));
    assert.deepEqual(await fixture.read("missing"), { value: 3 });
  } finally { await fixture.close(); }
});

test("PostgreSQL advisory locks serialize missing-row creation and reversed multi-record path order", { timeout }, async () => {
  const fixture = await createPostgresFixture();
  let second: Promise<unknown> | undefined;
  let heldTransaction: string | undefined;
  try {
    const firstPath = fixture.path("first");
    const secondPath = fixture.path("second");
    const batch = await fixture.request<Array<{ transaction?: string; missing?: string }>>("/documents:batchGet", {
      method: "POST", body: JSON.stringify({ documents: [fixture.name(firstPath), fixture.name(secondPath)] }),
    });
    const transaction = batch?.[0].transaction;
    assert.ok(transaction);
    heldTransaction = transaction;
    assert.equal(batch?.filter((entry) => entry.missing).length, 2);
    const holder = globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.get(transaction);
    assert.ok(holder);
    const backend = await holder.client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    let entered = false;
    second = fixture.store.runStoredDocumentTransaction([secondPath, firstPath], (documents) => {
      entered = true;
      assert.equal(documents[firstPath]?.value, 1);
      assert.equal(documents[secondPath]?.value, 1);
      return { writes: [firstPath, secondPath].map((path) => ({ path, data: { value: 2 } })), result: "serialized" };
    });
    // Attach a rejection handler immediately while lock introspection is pending.
    void second.catch(() => undefined);
    await waitForAdvisoryWaiter(fixture.monitor, backend.rows[0].pid);
    assert.equal(entered, false);
    await fixture.request("/documents:commit", {
      method: "POST", body: JSON.stringify({ transaction, writes: [fixture.write(firstPath, { value: 1 }), fixture.write(secondPath, { value: 1 })] }),
    });
    heldTransaction = undefined;
    assert.equal(await second, "serialized");
    assert.deepEqual(await fixture.read("first"), { value: 2 });
    assert.deepEqual(await fixture.read("second"), { value: 2 });
  } finally {
    if (heldTransaction) await fixture.request("/documents:rollback", {
      method: "POST", body: JSON.stringify({ transaction: heldTransaction }),
    }).catch(() => undefined);
    await second?.catch(() => undefined);
    await fixture.close();
  }
});
