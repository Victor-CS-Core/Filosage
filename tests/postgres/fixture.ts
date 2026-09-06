import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

export const POSTGRES_TEST_DATABASE = "filosage_integration_test";

export function validatePostgresTestUrl(value: string | undefined): string {
  const invalid = () => new Error("FILOSAGE_POSTGRES_TEST_URL must explicitly use the filosage_test role, a loopback IP and port, and the filosage_integration_test database without URL options.");
  if (!value) throw invalid();
  let url: URL;
  try { url = new URL(value); } catch { throw invalid(); }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol)
    || !["127.0.0.1", "[::1]"].includes(url.hostname)
    || url.pathname !== `/${POSTGRES_TEST_DATABASE}`
    || url.username !== "filosage_test" || !url.password || !url.port
    || url.search || url.hash
  ) throw invalid();
  return value;
}

/** Uses real PostgreSQL only. No general DATABASE_URL or local-store fallback is accepted. */
export async function createPostgresFixture() {
  const connectionString = validatePostgresTestUrl(process.env.FILOSAGE_POSTGRES_TEST_URL);
  if (globalThis.__FILOSAGE_POSTGRES_POOL__ || globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.size) {
    throw new Error("PostgreSQL fixtures require an unused application connection pool.");
  }
  const monitor = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 3_000, query_timeout: 5_000 });
  const namespace = `postgres_fixture_${randomUUID().replaceAll("-", "")}`;
  const environment = {
    NODE_ENV: process.env.NODE_ENV, DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_SSL: process.env.DATABASE_SSL, DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
  };
  const restoreEnvironment = () => {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  let connected = false;
  try {
    await monitor.connect();
    connected = true;
    const identity = await monitor.query<{ database: string; role: string; version: number }>(
      "SELECT current_database() AS database, current_user AS role, current_setting('server_version_num')::int AS version",
    );
    assert.equal(identity.rows[0]?.database, POSTGRES_TEST_DATABASE, "Database identity must match the explicit test target.");
    assert.equal(identity.rows[0]?.role, "filosage_test", "Connected role must match the explicit test role.");
    assert.equal(Math.floor(identity.rows[0]?.version / 10_000), 16, "Transaction evidence requires PostgreSQL 16.");
    const migration = await readFile(new URL("../../infra/azure/database/001_document_store.sql", import.meta.url), "utf8");
    await monitor.query(migration);
    const table = await monitor.query<{ name: string | null }>("SELECT to_regclass('public.filosage_documents')::text AS name");
    assert.equal(table.rows[0]?.name, "filosage_documents");
    // Set application routing only after validating the explicit test target and live database.
    Object.assign(process.env, { NODE_ENV: "production", DATABASE_URL: connectionString, DATABASE_SSL: "disable", DATABASE_POOL_MAX: "8" });
    const store = await import("../../src/lib/document-store.ts");
    const { postgresDocumentStoreJson } = await import("../../src/lib/postgres-document-store.ts");
    const { toDocumentFields } = await import("../../src/lib/document-values.ts");
    const path = (id: string) => `${namespace}/${id}`;
    const name = (documentPath: string) => `projects/azure/databases/(default)/documents/${documentPath}`;
    return {
      store, monitor, path, name,
      request: postgresDocumentStoreJson,
      write: (documentPath: string, data: Record<string, unknown>) => ({ update: { name: name(documentPath), fields: toDocumentFields(data) } }),
      async read(id: string) {
        const result = await monitor.query<{ data: Record<string, unknown> }>("SELECT data FROM filosage_documents WHERE path = $1", [path(id)]);
        return result.rows[0]?.data ?? null;
      },
      async close() {
        for (const [id, active] of globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__ ?? []) {
          clearTimeout(active.timeout);
          await active.client.query("ROLLBACK").catch(() => undefined);
          active.client.release();
          globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__?.delete(id);
        }
        await globalThis.__FILOSAGE_POSTGRES_POOL__?.end();
        globalThis.__FILOSAGE_POSTGRES_POOL__ = undefined;
        await globalThis.__FILOSAGE_POSTGRES_HEALTH_POOL__?.end();
        globalThis.__FILOSAGE_POSTGRES_HEALTH_POOL__ = undefined;
        try {
          // Delete only this fixture's UUID namespace, never truncate shared data or drop schemas.
          await monitor.query("DELETE FROM filosage_documents WHERE left(path, length($1)) = $1", [`${namespace}/`]);
        } finally {
          await monitor.end();
          restoreEnvironment();
        }
      },
    };
  } catch (error) {
    if (connected) await monitor.end().catch(() => undefined);
    restoreEnvironment();
    throw error;
  }
}

/** Observe an actual blocked PostgreSQL advisory lock instead of assuming timing implies contention. */
export async function waitForAdvisoryWaiter(monitor: pg.Client, blockerPid: number, deadlineMs = 3_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const result = await monitor.query<{ waiting: number }>(`SELECT count(*)::int AS waiting
      FROM pg_locks locks JOIN pg_stat_activity activity ON activity.pid = locks.pid
      WHERE locks.locktype = 'advisory' AND NOT locks.granted AND activity.datname = current_database()
        AND $1 = ANY(pg_blocking_pids(locks.pid))`, [blockerPid]);
    if (result.rows[0]?.waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Expected a real PostgreSQL advisory-lock waiter before the bounded deadline.");
}
