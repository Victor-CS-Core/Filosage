import pg from "pg";

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const DEFAULT_PRODUCTION_LOGIN = "filosage_app";
const DEFAULT_QA_LOGIN = "filosageqa_app";
const DEFAULT_PRODUCTION_DATABASE = "filosage";
const DEFAULT_QA_DATABASE = "filosageqa";

export interface PostgresAppRole {
  login: string;
  password: string;
  database: string;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sslConfig() {
  const sslMode = process.env.DATABASE_SSL?.trim().toLowerCase() ?? "verify-full";
  return sslMode === "disable" ? false : { rejectUnauthorized: sslMode !== "require" };
}

export function quotedIdentifier(value: string, label: string) {
  if (!IDENTIFIER.test(value)) throw new Error(`Invalid PostgreSQL ${label}.`);
  return `"${value}"`;
}

export function roleStatements(role: PostgresAppRole, productionDatabase: string) {
  const login = quotedIdentifier(role.login, "role");
  const database = quotedIdentifier(role.database, "database");
  const production = quotedIdentifier(productionDatabase, "database");
  return {
    ensureRole: `SELECT 1 FROM pg_roles WHERE rolname = $1`,
    createRole: `CREATE ROLE ${login} LOGIN PASSWORD $1 NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
    alterPassword: `ALTER ROLE ${login} WITH LOGIN PASSWORD $1`,
    grantConnect: `GRANT CONNECT ON DATABASE ${database} TO ${login}`,
    revokePublic: `REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`,
    revokeProduction: role.database === productionDatabase
      ? null
      : `REVOKE CONNECT ON DATABASE ${production} FROM ${login}`,
    grantSchema: `GRANT USAGE, CREATE ON SCHEMA public TO ${login}`,
    grantTables: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${login}`,
    grantSequences: `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${login}`,
    defaultTables: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${login}`,
    defaultSequences: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${login}`,
  };
}

function appRole(prefix: "APP" | "QA_APP"): PostgresAppRole {
  const loginDefault = prefix === "APP" ? DEFAULT_PRODUCTION_LOGIN : DEFAULT_QA_LOGIN;
  const databaseDefault = prefix === "APP" ? DEFAULT_PRODUCTION_DATABASE : DEFAULT_QA_DATABASE;
  return {
    login: process.env[`POSTGRES_${prefix}_LOGIN`]?.trim() || loginDefault,
    password: required(`POSTGRES_${prefix}_PASSWORD`),
    database: process.env[`POSTGRES_${prefix}_DATABASE`]?.trim() || databaseDefault,
  };
}

function databaseUrl(adminUrl: string, database: string) {
  quotedIdentifier(database, "database");
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function applyRole(adminUrl: string, role: PostgresAppRole, productionDatabase: string) {
  const statements = roleStatements(role, productionDatabase);
  const admin = new pg.Client({ connectionString: adminUrl, ssl: sslConfig() });
  await admin.connect();
  try {
    const existing = await admin.query(statements.ensureRole, [role.login]);
    if (existing.rowCount) {
      await admin.query(statements.alterPassword, [role.password]);
    } else {
      await admin.query(statements.createRole, [role.password]);
    }
    await admin.query(statements.grantConnect);
    await admin.query(statements.revokePublic);
    if (statements.revokeProduction) await admin.query(statements.revokeProduction);
  } finally {
    await admin.end().catch(() => undefined);
  }

  const database = new pg.Client({
    connectionString: databaseUrl(adminUrl, role.database),
    ssl: sslConfig(),
  });
  try {
    await database.connect();
  } catch {
    console.log("AZURE_POSTGRES_ROLE_GRANTS_DEFERRED");
    return;
  }
  try {
    await database.query(statements.grantSchema);
    await database.query(statements.grantTables);
    await database.query(statements.grantSequences);
    await database.query(statements.defaultTables);
    await database.query(statements.defaultSequences);
  } finally {
    await database.end().catch(() => undefined);
  }
}

export async function provisionAzurePostgresRoles() {
  const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
  if (!adminUrl) {
    console.log("AZURE_POSTGRES_ROLE_PROVISION_SKIPPED");
    return;
  }
  const production = appRole("APP");
  const qa = appRole("QA_APP");
  if (production.database === qa.database) {
    throw new Error("Production and QA databases must be distinct.");
  }
  if (production.login === qa.login) {
    throw new Error("Production and QA database roles must be distinct.");
  }
  await applyRole(adminUrl, production, production.database);
  await applyRole(adminUrl, qa, production.database);
  console.log("AZURE_POSTGRES_ROLE_PROVISION_OK");
}

const invokedDirectly = process.argv[1]?.includes("provision-azure-postgres-roles");
if (invokedDirectly) {
  await provisionAzurePostgresRoles();
}
