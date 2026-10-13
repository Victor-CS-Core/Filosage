import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

/**
 * Contract tests for the D1 document store backend.
 *
 * Uses Node's built-in SQLite wrapped in a D1-compatible interface, so the
 * actual SQL in d1-document-store.ts is exercised without a Cloudflare account.
 */

class D1Statement {
  private params: unknown[] = [];
  constructor(
    private db: DatabaseSync,
    private sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.params = values;
    return this;
  }

  first<T>(column?: string): T | null {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (column) return row[column] as T;
    return row as T;
  }

  all<T>(): { results: T[] } {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...this.params) as T[];
    return { results: rows };
  }

  run(): { success: boolean; meta: { changes: number } } {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...this.params);
    return { success: true, meta: { changes: Number(info.changes) } };
  }
}

class D1Database {
  constructor(private db: DatabaseSync) {}

  prepare(sql: string) {
    return new D1Statement(this.db, sql);
  }

  async batch(statements: D1Statement[]) {
    // SQLite transactions are atomic; emulate D1 batch atomicity.
    const results: unknown[] = [];
    this.db.exec("BEGIN");
    try {
      for (const stmt of statements) {
        results.push(stmt.run());
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return results;
  }
}

async function createD1Fixture() {
  const db = new DatabaseSync(":memory:");
  const schema = await readFile(
    new URL("../../infra/cloudflare/d1/001_document_store.sql", import.meta.url),
    "utf8",
  );
  db.exec(schema);
  const d1 = new D1Database(db);

  // Install the mock as the D1 binding for the module under test.
  const { setTestBindings, clearTestBindings } = await import("@/lib/cloudflare-context");
  const { d1DocumentStoreJson } = await import("@/lib/d1-document-store");
  setTestBindings({ FILOSAGE_D1: d1 });

  return {
    d1,
    store: { d1DocumentStoreJson },
    async close() {
      clearTestBindings();
      db.close();
    },
  };
}

function docName(path: string) {
  return `projects/cloudflare/databases/(default)/documents/${path}`;
}

test("D1 document store creates, reads, updates, and deletes documents", async () => {
  const fixture = await createD1Fixture();
  try {
    const { d1DocumentStoreJson } = fixture.store;

    // Create
    const created = await d1DocumentStoreJson<{ name: string }>(
      "/documents/users?documentId=abc",
      {
        method: "POST",
        body: JSON.stringify({
          fields: { name: { stringValue: "Test User" }, credits: { integerValue: "100" } },
        }),
      },
    );
    assert.ok(created?.name.includes("users/abc"));

    // Read
    const read = await d1DocumentStoreJson<{ fields: Record<string, { stringValue?: string }> }>(
      "/documents/users/abc",
      { method: "GET" },
    );
    assert.equal(read?.fields?.name?.stringValue, "Test User");

    // Update via PATCH
    await d1DocumentStoreJson("/documents/users/abc", {
      method: "PATCH",
      body: JSON.stringify({ fields: { credits: { integerValue: "50" } } }),
    });
    const updated = await d1DocumentStoreJson<{ fields: Record<string, { integerValue?: string }> }>(
      "/documents/users/abc",
      { method: "GET" },
    );
    assert.equal(updated?.fields?.credits?.integerValue, "50");

    // List collection
    const listed = await d1DocumentStoreJson<{ documents: Array<{ name: string }> }>(
      "/documents/users?pageSize=10",
      { method: "GET" },
    );
    assert.equal(listed?.documents.length, 1);

    // Delete via commit
    await d1DocumentStoreJson("/documents:commit", {
      method: "POST",
      body: JSON.stringify({ writes: [{ delete: docName("users/abc") }] }),
    });
    const deleted = await d1DocumentStoreJson(
      "/documents/users/abc",
      { method: "GET" },
      true,
    );
    assert.equal(deleted, null);
  } finally {
    await fixture.close();
  }
});

test("D1 document store runs structured queries with filters and ordering", async () => {
  const fixture = await createD1Fixture();
  try {
    const { d1DocumentStoreJson } = fixture.store;

    // Seed courses
    for (const [id, title, level] of [["c1", "Alpha", 1], ["c2", "Beta", 2], ["c3", "Gamma", 3]] as const) {
      await d1DocumentStoreJson("/documents/courses", {
        method: "POST",
        body: JSON.stringify({
          fields: {
            title: { stringValue: title },
            level: { integerValue: String(level) },
          },
        }),
      }, false);
      // Use explicit IDs via direct insert for determinism
      await fixture.d1.prepare(
        "UPDATE filosage_documents SET path = ? WHERE path LIKE ? AND data LIKE ?"
      ).bind(`courses/${id}`, "courses/%", `%"${title}"%`).run();
    }

    // Query with EQUAL filter
    const filtered = await d1DocumentStoreJson<{ document: { name: string } }[]>(
      "/documents:runQuery",
      {
        method: "POST",
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "courses" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "level" },
                op: "GREATER_THAN_OR_EQUAL",
                value: { integerValue: "2" },
              },
            },
            orderBy: [{ field: { fieldPath: "title" }, direction: "ASCENDING" }],
            limit: 10,
          },
        }),
      },
    );
    assert.equal(filtered?.length, 2);
    assert.ok(filtered?.[0]?.document.name.endsWith("courses/c2"));
    assert.ok(filtered?.[1]?.document.name.endsWith("courses/c3"));
  } finally {
    await fixture.close();
  }
});

test("D1 document store commits transactions atomically", async () => {
  const fixture = await createD1Fixture();
  try {
    const { d1DocumentStoreJson } = fixture.store;

    // Begin transaction (batchGet)
    const begun = await d1DocumentStoreJson<Array<{ transaction?: string; missing?: string }>>(
      "/documents:batchGet",
      {
        method: "POST",
        body: JSON.stringify({ documents: [docName("users/tx")] }),
      },
    );
    const txId = begun?.[0]?.transaction;
    assert.ok(txId, "transaction id returned");

    // Commit with writes
    await d1DocumentStoreJson("/documents:commit", {
      method: "POST",
      body: JSON.stringify({
        transaction: txId,
        writes: [
          {
            update: {
              name: docName("users/tx"),
              fields: { credits: { integerValue: "100" } },
            },
          },
        ],
      }),
    });

    const read = await d1DocumentStoreJson<{ fields: Record<string, { integerValue?: string }> }>(
      "/documents/users/tx",
      { method: "GET" },
    );
    assert.equal(read?.fields?.credits?.integerValue, "100");
  } finally {
    await fixture.close();
  }
});

test("D1 concurrent transactions: second update to same document fails", async () => {
  const fixture = await createD1Fixture();
  try {
    const { d1DocumentStoreJson } = fixture.store;

    // Create initial document
    await d1DocumentStoreJson("/documents/users?documentId=concurrent", {
      method: "POST",
      body: JSON.stringify({
        fields: { counter: { integerValue: "0" } },
      }),
    });

    // Begin two transactions reading the same document
    const begun1 = await d1DocumentStoreJson<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST",
      body: JSON.stringify({ documents: [docName("users/concurrent")] }),
    });
    const begun2 = await d1DocumentStoreJson<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST",
      body: JSON.stringify({ documents: [docName("users/concurrent")] }),
    });
    const tx1 = begun1?.[0]?.transaction;
    const tx2 = begun2?.[0]?.transaction;
    assert.ok(tx1 && tx2);

    // First transaction commits successfully
    await d1DocumentStoreJson("/documents:commit", {
      method: "POST",
      body: JSON.stringify({
        transaction: tx1,
        writes: [{ update: { name: docName("users/concurrent"), fields: { counter: { integerValue: "1" } } } }],
      }),
    });

    // Second transaction should fail with version conflict
    await assert.rejects(
      d1DocumentStoreJson("/documents:commit", {
        method: "POST",
        body: JSON.stringify({
          transaction: tx2,
          writes: [{ update: { name: docName("users/concurrent"), fields: { counter: { integerValue: "2" } } } }],
        }),
      }),
      /conflict/i,
    );

    // Verify first write won
    const read = await d1DocumentStoreJson<{ fields: Record<string, { integerValue?: string }> }>(
      "/documents/users/concurrent",
      { method: "GET" },
    );
    assert.equal(read?.fields?.counter?.integerValue, "1");
  } finally {
    await fixture.close();
  }
});

test("D1 concurrent transactions: second create of same document fails", async () => {
  const fixture = await createD1Fixture();
  try {
    const { d1DocumentStoreJson } = fixture.store;

    // Begin two transactions for a non-existent document
    const begun1 = await d1DocumentStoreJson<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST",
      body: JSON.stringify({ documents: [docName("users/newdoc")] }),
    });
    const begun2 = await d1DocumentStoreJson<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST",
      body: JSON.stringify({ documents: [docName("users/newdoc")] }),
    });
    const tx1 = begun1?.[0]?.transaction;
    const tx2 = begun2?.[0]?.transaction;
    assert.ok(tx1 && tx2);

    // First creates successfully
    await d1DocumentStoreJson("/documents:commit", {
      method: "POST",
      body: JSON.stringify({
        transaction: tx1,
        writes: [{ update: { name: docName("users/newdoc"), fields: { v: { integerValue: "1" } } } }],
      }),
    });

    // Second create should fail
    await assert.rejects(
      d1DocumentStoreJson("/documents:commit", {
        method: "POST",
        body: JSON.stringify({
          transaction: tx2,
          writes: [{ update: { name: docName("users/newdoc"), fields: { v: { integerValue: "2" } } } }],
        }),
      }),
      /conflict/i,
    );
  } finally {
    await fixture.close();
  }
});

test("D1 concurrent transactions: delete fails if document was modified", async () => {
  const fixture = await createD1Fixture();
  try {
    const { d1DocumentStoreJson } = fixture.store;

    await d1DocumentStoreJson("/documents/users?documentId=todelete", {
      method: "POST",
      body: JSON.stringify({ fields: { v: { integerValue: "0" } } }),
    });

    const begun1 = await d1DocumentStoreJson<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST",
      body: JSON.stringify({ documents: [docName("users/todelete")] }),
    });
    const begun2 = await d1DocumentStoreJson<Array<{ transaction?: string }>>("/documents:batchGet", {
      method: "POST",
      body: JSON.stringify({ documents: [docName("users/todelete")] }),
    });
    const tx1 = begun1?.[0]?.transaction;
    const tx2 = begun2?.[0]?.transaction;
    assert.ok(tx1 && tx2);

    // tx1 updates the document
    await d1DocumentStoreJson("/documents:commit", {
      method: "POST",
      body: JSON.stringify({
        transaction: tx1,
        writes: [{ update: { name: docName("users/todelete"), fields: { v: { integerValue: "1" } } } }],
      }),
    });

    // tx2 tries to delete with stale version — should fail
    await assert.rejects(
      d1DocumentStoreJson("/documents:commit", {
        method: "POST",
        body: JSON.stringify({
          transaction: tx2,
          writes: [{ delete: docName("users/todelete") }],
        }),
      }),
      /conflict/i,
    );

    // Document should still exist with tx1's update
    const read = await d1DocumentStoreJson<{ fields: Record<string, { integerValue?: string }> }>(
      "/documents/users/todelete",
      { method: "GET" },
    );
    assert.equal(read?.fields?.v?.integerValue, "1");
  } finally {
    await fixture.close();
  }
});

// ---------------------------------------------------------------------------
// Transaction-wide atomicity: the whole read set is validated and every
// mutation commits or none does. These cover the partial-commit defect in
// the previous implementation, which executed guarded writes one by one.
// ---------------------------------------------------------------------------

async function seedDoc(
  store: Awaited<ReturnType<typeof createD1Fixture>>["store"],
  id: string,
  value: string,
) {
  await store.d1DocumentStoreJson("/documents/users?documentId=" + id, {
    method: "POST",
    body: JSON.stringify({ fields: { v: { stringValue: value } } }),
  });
}

async function beginTx(
  store: Awaited<ReturnType<typeof createD1Fixture>>["store"],
  paths: string[],
) {
  const begun = await store.d1DocumentStoreJson<Array<{ transaction?: string }>>(
    "/documents:batchGet",
    { method: "POST", body: JSON.stringify({ documents: paths.map(docName) }) },
  );
  const tx = begun?.find((entry) => entry.transaction)?.transaction;
  assert.ok(tx, "transaction id returned");
  return tx;
}

async function commitTx(
  store: Awaited<ReturnType<typeof createD1Fixture>>["store"],
  tx: string,
  writes: Array<Record<string, unknown>>,
) {
  return store.d1DocumentStoreJson("/documents:commit", {
    method: "POST",
    body: JSON.stringify({ transaction: tx, writes }),
  });
}

function updateWrite(path: string, value: string) {
  return { update: { name: docName(path), fields: { v: { stringValue: value } } } };
}

async function readValue(
  store: Awaited<ReturnType<typeof createD1Fixture>>["store"],
  path: string,
) {
  const read = await store.d1DocumentStoreJson<{ fields: Record<string, { stringValue?: string }> }>(
    `/documents/${path}`,
    { method: "GET" },
    true,
  );
  return read?.fields?.v?.stringValue ?? null;
}

test("D1 transaction rolls back every write when a later write conflicts", async () => {
  const fixture = await createD1Fixture();
  try {
    const { store } = fixture;
    await seedDoc(store, "multi-a", "a0");
    await seedDoc(store, "multi-b", "b0");

    const tx = await beginTx(store, ["users/multi-a", "users/multi-b"]);
    // Concurrent commit changes B after tx began.
    const other = await beginTx(store, ["users/multi-b"]);
    await commitTx(store, other, [updateWrite("users/multi-b", "b1")]);

    // tx writes A first, then B. The batch must fail on B's guard and A
    // must NOT stay committed.
    await assert.rejects(
      commitTx(store, tx, [updateWrite("users/multi-a", "a1"), updateWrite("users/multi-b", "b2")]),
      /Document store request failed \(409\): document transaction conflict/i,
    );
    assert.equal(await readValue(store, "users/multi-a"), "a0", "earlier write rolled back");
    assert.equal(await readValue(store, "users/multi-b"), "b1", "concurrent write preserved");
  } finally {
    await fixture.close();
  }
});

test("D1 transaction fails when a read-only guard document changes", async () => {
  const fixture = await createD1Fixture();
  try {
    const { store } = fixture;
    await seedDoc(store, "guard", "g0");
    await seedDoc(store, "target", "t0");

    // The transaction reads the guard (e.g. an account-lifecycle or
    // publication record) but only writes the target.
    const tx = await beginTx(store, ["users/guard", "users/target"]);
    const other = await beginTx(store, ["users/guard"]);
    await commitTx(store, other, [updateWrite("users/guard", "g1")]);

    await assert.rejects(
      commitTx(store, tx, [updateWrite("users/target", "t1")]),
      /conflict/i,
    );
    assert.equal(await readValue(store, "users/target"), "t0", "guarded write not committed");
    assert.equal(await readValue(store, "users/guard"), "g1");
  } finally {
    await fixture.close();
  }
});

test("D1 transaction fails when a document absent at begin is created concurrently", async () => {
  const fixture = await createD1Fixture();
  try {
    const { store } = fixture;
    await seedDoc(store, "witness", "w0");

    // tx reads a missing document (absence is part of its read set) and an
    // existing one it intends to write.
    const tx = await beginTx(store, ["users/appears", "users/witness"]);
    await seedDoc(store, "appears", "created-concurrently");

    await assert.rejects(
      commitTx(store, tx, [updateWrite("users/witness", "w1")]),
      /conflict/i,
    );
    assert.equal(await readValue(store, "users/witness"), "w0", "write rolled back on absence-guard failure");
    assert.equal(await readValue(store, "users/appears"), "created-concurrently");
  } finally {
    await fixture.close();
  }
});

test("D1 transaction cannot delete a document created after it began", async () => {
  const fixture = await createD1Fixture();
  try {
    const { store } = fixture;
    // tx begins while the document is absent, then plans to delete it.
    const tx = await beginTx(store, ["users/late"]);
    await seedDoc(store, "late", "keep-me");

    await assert.rejects(
      commitTx(store, tx, [{ delete: docName("users/late") }]),
      /conflict/i,
    );
    assert.equal(await readValue(store, "users/late"), "keep-me", "concurrently created document survives");
  } finally {
    await fixture.close();
  }
});

test("D1 transaction rolls back earlier writes when a later statement errors (failure injection)", async () => {
  const fixture = await createD1Fixture();
  try {
    const { store } = fixture;
    await seedDoc(store, "atomic-a", "a0");
    await seedDoc(store, "atomic-existing", "here");

    const tx = await beginTx(store, ["users/atomic-a"]);
    // Second write creates a document that already exists outside the
    // read set: its plain INSERT hits the primary key mid-batch.
    await assert.rejects(
      commitTx(store, tx, [
        updateWrite("users/atomic-a", "a1"),
        updateWrite("users/atomic-existing", "overwrite"),
      ]),
      /conflict/i,
    );
    assert.equal(await readValue(store, "users/atomic-a"), "a0", "earlier write rolled back after mid-batch failure");
    assert.equal(await readValue(store, "users/atomic-existing"), "here");
  } finally {
    await fixture.close();
  }
});

function setEnv(name: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[name];
  else env[name] = value;
}

test("readiness probes D1 when D1 is enabled without DATABASE_URL (Workers shape)", async () => {
  const fixture = await createD1Fixture();
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    CLOUDFLARE_D1_ENABLED: process.env.CLOUDFLARE_D1_ENABLED,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  try {
    // The exact staging/production worker configuration: production mode,
    // D1 dispatch on, no PostgreSQL URL. Before the D1 branch existed,
    // readiness threw "Azure PostgreSQL is required" here while the store
    // itself served reads through the D1 dispatch.
    setEnv("NODE_ENV", "production");
    setEnv("CLOUDFLARE_D1_ENABLED", "true");
    setEnv("DATABASE_URL", undefined);
    const { checkDocumentStoreReadiness } = await import("@/lib/document-store");
    await checkDocumentStoreReadiness();
  } finally {
    for (const [key, value] of Object.entries(saved)) setEnv(key, value);
    await fixture.close();
  }
});

test("readiness fails when the enabled D1 backend is unavailable", async () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    CLOUDFLARE_D1_ENABLED: process.env.CLOUDFLARE_D1_ENABLED,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  const { setTestBindings, clearTestBindings } = await import("@/lib/cloudflare-context");
  try {
    setEnv("NODE_ENV", "production");
    setEnv("CLOUDFLARE_D1_ENABLED", "true");
    setEnv("DATABASE_URL", undefined);
    const unavailable = {
      prepare() { throw new Error("D1 unavailable (injected)"); },
      batch() { throw new Error("D1 unavailable (injected)"); },
    };
    setTestBindings({ FILOSAGE_D1: unavailable as never });
    const { checkDocumentStoreReadiness } = await import("@/lib/document-store");
    await assert.rejects(checkDocumentStoreReadiness(), /D1 unavailable/);
  } finally {
    for (const [key, value] of Object.entries(saved)) setEnv(key, value);
    clearTestBindings();
  }
});
