import pg from "pg";
import { databasePoolMaximum, requiredUnreservedConnections } from "../src/lib/database-connection-budget.ts";
import { pathToFileURL } from "node:url";

export interface SchemaClient { query(sql: string): Promise<{ rows: Array<{ compatible: boolean }> }> }
export async function verifyDatabaseConnectionCapacity(client: SchemaClient) {
  await client.query("BEGIN READ ONLY");
  try {
    const result = await client.query(`SELECT (
      current_setting('max_connections')::integer >= 50
      AND current_setting('max_connections')::integer - current_setting('reserved_connections')::integer
        - current_setting('superuser_reserved_connections')::integer >= ${requiredUnreservedConnections}
    ) AS compatible`);
    if (result.rows[0]?.compatible !== true) throw new Error("Server connection capacity is below the reviewed runtime/QA/operator budget.");
  } finally { await client.query("ROLLBACK"); }
}
/** Read-only startup contract; overlapping revisions use the additive document schema. */
export async function verifyAzureDatabaseSchema(client: SchemaClient) {
  await client.query("BEGIN READ ONLY");
  try {
    const result = await client.query(`SELECT (
      (SELECT count(*) = 8 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filosage_documents'
        AND is_nullable = 'NO' AND (column_name, data_type) IN (
          ('path','text'), ('collection_id','text'), ('collection_path','text'), ('document_id','text'),
          ('data','jsonb'), ('version','bigint'), ('created_at','timestamp with time zone'), ('updated_at','timestamp with time zone')))
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.filosage_documents') AND contype = 'p' AND pg_get_constraintdef(oid) = 'PRIMARY KEY (path)')
      AND has_table_privilege(current_user, 'public.filosage_documents', 'SELECT')
AND has_table_privilege(current_user, 'public.filosage_documents', 'INSERT')
AND has_table_privilege(current_user, 'public.filosage_documents', 'UPDATE')
AND has_table_privilege(current_user, 'public.filosage_documents', 'DELETE')
      AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
      AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE pg_has_role(current_user, oid, 'MEMBER') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
      AND NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.filosage_documents') AND pg_has_role(current_user, relowner, 'MEMBER'))
    ) AS compatible`);
    if (result.rows[0]?.compatible !== true) throw new Error("Runtime database schema or privileges are incompatible; complete the approved bootstrap first.");
  } finally { await client.query("ROLLBACK"); }
}

export async function verifyAzureDatabase() {
  if (process.env.DATABASE_ADMIN_URL || process.env.POSTGRES_APP_PASSWORD || process.env.POSTGRES_QA_APP_PASSWORD) throw new Error("Runtime must not receive bootstrap credentials.");
  databasePoolMaximum(process.env.DATABASE_POOL_MAX);
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000, query_timeout: 15_000,
    ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: true } });
  try { await client.connect(); await verifyAzureDatabaseSchema(client); await verifyDatabaseConnectionCapacity(client); console.log("AZURE_DATABASE_SCHEMA_VERIFIED"); }
  finally { await client.end().catch(() => undefined); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await verifyAzureDatabase(); } catch { console.error("Runtime database schema/privilege verification failed."); process.exitCode = 1; }
}
