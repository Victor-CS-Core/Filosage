import pg, { Pool, type PoolClient } from "pg";
import { readFile } from "node:fs/promises";

const defaultPool = new pg.Pool();
const namedPool = new Pool();

export async function unsafeDefaultImport(request: Request) {
  const body = await request.json();
  // ruleid: filosage-request-sql-injection
  return defaultPool.query(`SELECT * FROM courses WHERE title = '${body.title}'`);
}

export async function unsafeNamedImport(request: Request) {
  const title = new URL(request.url).searchParams.get("title");
  // ruleid: filosage-request-sql-injection
  return namedPool.query("SELECT * FROM courses WHERE title = '" + title + "'");
}

export async function unsafeTypedClient(client: PoolClient, request: Request) {
  const title = await request.text();
  // ruleid: filosage-request-sql-injection
  return client.query(`SELECT * FROM courses WHERE title = '${title}'`);
}

export async function safeParameters(client: PoolClient, request: Request) {
  const title = await request.text();
  // ok: filosage-request-sql-injection
  return client.query("SELECT * FROM courses WHERE title = $1", [title]);
}

export function safeConstantSql() {
  const sql = "SELECT " + "1 AS ready";
  // ok: filosage-request-sql-injection
  return defaultPool.query(sql);
}

export async function safeModuleRelativeMigration(client: PoolClient) {
  const migration = await readFile(new URL("../migrations/fixed.sql", import.meta.url), "utf8");
  // ok: filosage-request-sql-injection
  return client.query(migration);
}
