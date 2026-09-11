import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostgresFixture, waitForAdvisoryWaiter } from "./fixture.ts";

// Real PostgreSQL 16 only. The explicit fixture guard runs before any connection.
// Bound failures independently so the pre-fix implementation cannot hang CI.
async function beforeDeadline<T>(operation: Promise<T>, milliseconds = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Database operation exceeded the test deadline.")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

test("PostgreSQL bounds advisory-lock acquisition and reuses the rolled-back connection", { timeout: 25_000 }, async () => {
  const fixture = await createPostgresFixture();
  let pending: Promise<unknown> | undefined;
  try {
    process.env.DATABASE_POOL_MAX = "1";
    const path = fixture.path("balance");
    await fixture.store.runStoredDocumentTransaction([path], () => ({ writes: [{ path, data: { credits: 100 } }], result: null }));
    const pool = globalThis.__FILOSAGE_POSTGRES_POOL__!;
    const initial = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    await fixture.monitor.query("BEGIN");
    await fixture.monitor.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [path]);
    const blocker = await fixture.monitor.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    let entered = false;
    pending = fixture.store.runStoredDocumentTransaction([path], () => {
      entered = true;
      return { writes: [{ path, data: { credits: 0 } }], result: null };
    });
    void pending.catch(() => undefined);
    await waitForAdvisoryWaiter(fixture.monitor, blocker.rows[0].pid);
    await assert.rejects(beforeDeadline(pending), { code: "55P03" });
    assert.equal(entered, false);
    assert.equal(globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.size ?? 0, 0);
    assert.deepEqual(await fixture.read("balance"), { credits: 100 });
    const recovered = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    assert.equal(recovered.rows[0].pid, initial.rows[0].pid, "A confirmed rollback permits connection reuse.");
    const settings = await pool.query<{ name: string; setting: string }>(
      "SELECT name, setting FROM pg_settings WHERE name IN ('statement_timeout', 'lock_timeout')",
    );
    assert.deepEqual(Object.fromEntries(settings.rows.map(({ name, setting }) => [name, setting])), {
      lock_timeout: "10000", statement_timeout: "30000",
    });
    await fixture.monitor.query("ROLLBACK");
    await fixture.store.runStoredDocumentTransaction([path], () => ({ writes: [{ path, data: { credits: 99 } }], result: null }));
    assert.deepEqual(await fixture.read("balance"), { credits: 99 });
  } finally {
    await fixture.monitor.query("ROLLBACK").catch(() => undefined);
    await pending?.catch(() => undefined);
    await fixture.close();
  }
});

for (const existingTransaction of [true, false]) {
  test(`PostgreSQL write lock timeout rolls back all writes with ${existingTransaction ? "an existing" : "a new"} transaction`, { timeout: 25_000 }, async () => {
    const fixture = await createPostgresFixture();
    let pending: Promise<unknown> | undefined;
    try {
      process.env.DATABASE_POOL_MAX = "1";
      const first = fixture.path("first");
      const second = fixture.path("second");
      await fixture.store.runStoredDocumentTransaction([first, second], () => ({
        writes: [first, second].map((path) => ({ path, data: { value: 1 } })), result: null,
      }));
      const pool = globalThis.__FILOSAGE_POSTGRES_POOL__!;
      const initial = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const batch = existingTransaction ? await fixture.request<Array<{ transaction?: string }>>("/documents:batchGet", {
        method: "POST", body: JSON.stringify({ documents: [fixture.name(first)] }),
      }) : null;
      const transaction = batch?.[0].transaction;
      if (existingTransaction) assert.ok(transaction);
      await fixture.monitor.query("BEGIN");
      await fixture.monitor.query("SELECT path FROM filosage_documents WHERE path = $1 FOR UPDATE", [second]);
      pending = fixture.request("/documents:commit", {
        method: "POST", body: JSON.stringify({ transaction, writes: [fixture.write(first, { value: 2 }), fixture.write(second, { value: 2 })] }),
      });
      void pending.catch(() => undefined);
      await assert.rejects(beforeDeadline(pending), { code: "55P03" });
      assert.deepEqual(await fixture.read("first"), { value: 1 }, "The earlier successful write must roll back.");
      assert.deepEqual(await fixture.read("second"), { value: 1 });
      assert.equal(globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.size ?? 0, 0);
      const recovered = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      assert.equal(recovered.rows[0].pid, initial.rows[0].pid);
      await fixture.monitor.query("ROLLBACK");
      await fixture.store.runStoredDocumentTransaction([first, second], () => ({
        writes: [first, second].map((path) => ({ path, data: { value: 3 } })), result: null,
      }));
      assert.deepEqual(await fixture.read("second"), { value: 3 });
    } finally {
      await fixture.monitor.query("ROLLBACK").catch(() => undefined);
      await pending?.catch(() => undefined);
      await fixture.close();
    }
  });
}

test("PostgreSQL statement timeout during COMMIT rolls back earlier writes and permits connection reuse", { timeout: 10_000 }, async () => {
  const fixture = await createPostgresFixture();
  try {
    process.env.DATABASE_POOL_MAX = "1";
    const first = fixture.path("first");
    const second = fixture.path("second");
    const batch = await fixture.request<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST", body: JSON.stringify({ documents: [fixture.name(first), fixture.name(second)] }),
    });
    const transaction = batch?.[0].transaction;
    assert.ok(transaction);
    const client = globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__!.get(transaction)!.client;
    const initial = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    // Session-local deferred work makes COMMIT itself time out, without modifying
    // shared tables/triggers or waiting for the production 30-second deadline.
    await client.query("CREATE TEMP TABLE deadline_commit (id integer) ON COMMIT DROP");
    await client.query(`CREATE FUNCTION pg_temp.deadline_commit_wait() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$`);
    await client.query(`CREATE CONSTRAINT TRIGGER deadline_commit_wait AFTER INSERT ON deadline_commit
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pg_temp.deadline_commit_wait()`);
    await client.query("INSERT INTO deadline_commit VALUES (1)");
    await client.query("SET LOCAL statement_timeout = '100ms'");
    await assert.rejects(beforeDeadline(fixture.request("/documents:commit", {
      method: "POST", body: JSON.stringify({ transaction, writes: [fixture.write(first, { value: 1 }), fixture.write(second, { value: 1 })] }),
    }), 5_000), { code: "57014" });
    assert.equal(await fixture.read("first"), null);
    assert.equal(await fixture.read("second"), null);
    assert.equal(globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.size, 0);
    const recovered = await globalThis.__FILOSAGE_POSTGRES_POOL__!.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    assert.equal(recovered.rows[0].pid, initial.rows[0].pid);
    await fixture.store.runStoredDocumentTransaction([first], () => ({ writes: [{ path: first, data: { value: 2 } }], result: null }));
    assert.deepEqual(await fixture.read("first"), { value: 2 });
  } finally { await fixture.close(); }
});

test("PostgreSQL client read timeout discards an uncertain transaction connection without committing partial writes", { timeout: 10_000 }, async () => {
  const fixture = await createPostgresFixture();
  let pending: Promise<unknown> | undefined;
  try {
    process.env.DATABASE_POOL_MAX = "1";
    const first = fixture.path("first");
    const second = fixture.path("second");
    await fixture.store.runStoredDocumentTransaction([first, second], () => ({
      writes: [first, second].map((path) => ({ path, data: { value: 1 } })), result: null,
    }));
    const pool = globalThis.__FILOSAGE_POSTGRES_POOL__!;
    // Use the real driver's shorter read timeout only for fresh test connections.
    // A server-side lock outlives it, reproducing the uncertain-response boundary.
    (await pool.connect()).release(true);
    pool.options.query_timeout = 250;
    const batch = await fixture.request<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST", body: JSON.stringify({ documents: [fixture.name(first)] }),
    });
    const transaction = batch?.[0].transaction;
    assert.ok(transaction);
    const client = globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__!.get(transaction)!.client;
    const initial = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    await fixture.monitor.query("BEGIN");
    await fixture.monitor.query("SELECT path FROM filosage_documents WHERE path = $1 FOR UPDATE", [second]);
    pending = fixture.request("/documents:commit", {
      method: "POST", body: JSON.stringify({ transaction, writes: [fixture.write(first, { value: 2 }), fixture.write(second, { value: 2 })] }),
    });
    void pending.catch(() => undefined);
    await assert.rejects(beforeDeadline(pending, 3_000), { message: "Query read timeout" });
    assert.equal(globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.size, 0);
    pool.options.query_timeout = 35_000;
    const recovered = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    assert.notEqual(recovered.rows[0].pid, initial.rows[0].pid, "An uncertain connection must never return to the pool.");
    await fixture.monitor.query("ROLLBACK");
    await fixture.store.runStoredDocumentTransaction([first, second], () => ({ writes: [], result: null }));
    assert.deepEqual(await fixture.read("first"), { value: 1 });
    assert.deepEqual(await fixture.read("second"), { value: 1 });
  } finally {
    await fixture.monitor.query("ROLLBACK").catch(() => undefined);
    await pending?.catch(() => undefined);
    await fixture.close();
  }
});
