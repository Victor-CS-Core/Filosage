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
