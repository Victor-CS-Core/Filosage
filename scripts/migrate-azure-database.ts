import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");
const sslMode = process.env.DATABASE_SSL?.trim().toLowerCase() ?? "verify-full";
const client = new pg.Client({
  connectionString,
  ssl: sslMode === "disable" ? false : { rejectUnauthorized: sslMode !== "require" },
});

try {
  await client.connect();
  const migration = await readFile(new URL("../infra/azure/database/001_document_store.sql", import.meta.url), "utf8");
  await client.query(migration);
  const result = await client.query<{ name: string | null }>("SELECT to_regclass('public.filosage_documents')::text AS name");
  if (result.rows[0]?.name !== "filosage_documents") throw new Error("Database migration verification failed.");
  console.log("AZURE_DATABASE_MIGRATION_OK");
} finally {
  await client.end().catch(() => undefined);
}
