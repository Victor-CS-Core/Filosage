import pg from "pg";
import { pathToFileURL } from "node:url";

export interface PostgresAppRole { login: string; password: string; database: string }
export function quotedIdentifier(value: string, label: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error(`Invalid PostgreSQL ${label}.`);
  return `"${value}"`;
}
export function bootstrapConfiguration() {
  if (process.env.DATABASE_BOOTSTRAP_AUTHORIZED !== "true") throw new Error("Explicit approved bootstrap execution is required.");
  const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
  const password = process.env.POSTGRES_APP_PASSWORD?.trim();
  if (!adminUrl || !password) throw new Error("Bootstrap administrator and runtime role credentials are required.");
  const role = { login: process.env.POSTGRES_APP_LOGIN?.trim() || "filosage_app", database: process.env.POSTGRES_APP_DATABASE?.trim() || "filosage", password };
  quotedIdentifier(role.login, "role"); quotedIdentifier(role.database, "database");
  const url = new URL(adminUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || decodeURIComponent(url.username) === role.login || ["postgres", "template0", "template1"].includes(role.database)) throw new Error("Use a separate bootstrap administrator and explicit application database.");
  url.pathname = `/${role.database}`;
  return { connectionString: url.toString(), role };
}
export function roleStatements(role: PostgresAppRole) {
  const login = quotedIdentifier(role.login, "role");
  const database = quotedIdentifier(role.database, "database");
  return {
    ensureRole: "SELECT 1 FROM pg_roles WHERE rolname = $1",
    createRole: "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS', $1::text, $2::text) AS stmt",
    alterPassword: "SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS', $1::text, $2::text) AS stmt",
    grantConnect: `GRANT CONNECT ON DATABASE ${database} TO ${login}`,
    revokePublic: `REVOKE CONNECT, CREATE ON DATABASE ${database} FROM PUBLIC`,
    revokeDatabaseCreate: `REVOKE CREATE ON DATABASE ${database} FROM ${login}`,
    revokePublicCreate: "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
    revokeCreate: `REVOKE CREATE ON SCHEMA public FROM ${login}`,
    grantSchema: `GRANT USAGE ON SCHEMA public TO ${login}`,
    grantTables: `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.filosage_documents TO ${login}`,
  };
}
export async function provisionAzurePostgresRoles() {
  const { connectionString, role } = bootstrapConfiguration();
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000, query_timeout: 30_000,
    ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: true } });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(671206, 1)");
    // An old runtime may own this table. Transferring ownership is an independently
    // reviewed live migration; never silently expand bootstrap into that operation.
    const owned = await client.query("SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE c.oid = to_regclass('public.filosage_documents') AND r.rolname = $1", [role.login]);
    if (owned.rowCount) throw new Error("Existing runtime ownership requires the separately reviewed ownership migration.");
    const statements = roleStatements(role);
    const exists = await client.query(statements.ensureRole, [role.login]);
    const formatted = await client.query(exists.rowCount ? statements.alterPassword : statements.createRole, [role.login, role.password]);
    if (typeof formatted.rows[0]?.stmt !== "string") throw new Error("Role SQL formatting failed.");
    await client.query(formatted.rows[0].stmt);
    for (const name of ["grantConnect", "revokePublic", "revokeDatabaseCreate", "revokePublicCreate", "revokeCreate", "grantSchema", "grantTables"] as const) await client.query(statements[name]);
    await client.query("COMMIT");
    console.log("AZURE_POSTGRES_ROLE_PROVISION_OK");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { await client.end().catch(() => undefined); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await provisionAzurePostgresRoles(); } catch { console.error("Approved bootstrap role provisioning failed."); process.exitCode = 1; }
}
