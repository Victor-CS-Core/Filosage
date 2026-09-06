import { readFile } from "node:fs/promises";
import pg from "pg";
import { bootstrapConfiguration } from "./provision-azure-postgres-roles.ts";

try {
  const { connectionString } = bootstrapConfiguration();
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000, query_timeout: 60_000,
    ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: true } });
  try {
    await client.connect();
    const migration = await readFile(new URL("../infra/azure/database/001_document_store.sql", import.meta.url), "utf8");
    await client.query(migration);
    const result = await client.query("SELECT to_regclass('public.filosage_documents')::text AS name");
    if (result.rows[0]?.name !== "filosage_documents") throw new Error("Migration verification failed.");
    console.log("AZURE_DATABASE_MIGRATION_OK");
  } finally { await client.end().catch(() => undefined); }
} catch { console.error("Approved application database migration failed."); process.exitCode = 1; }
