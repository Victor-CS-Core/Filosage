import { createRequire } from "node:module";

const roleName = (value) => typeof value === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(value) ? value : null;
const number = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const setting = (value) => typeof value === "string" && /^\d+(?:ms|s|min|h|d)?$/.test(value) ? value : null;

/** Keep only estimates and node/index names; never publish expressions or rows. */
export function sanitizePlan(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 20) throw new Error("Invalid plan metadata.");
  const node = value["Node Type"];
  if (typeof node !== "string" || !/^[A-Za-z ]{1,60}$/.test(node)) throw new Error("Invalid plan node.");
  const index = value["Index Name"];
  if (index !== undefined && (typeof index !== "string" || !/^[a-z0-9_]{1,63}$/.test(index))) throw new Error("Invalid index metadata.");
  return { nodeType: node, ...(index ? { indexName: index } : {}), totalCost: number(value["Total Cost"]),
    rows: number(value["Plan Rows"]), width: number(value["Plan Width"]),
    plans: Array.isArray(value.Plans) ? value.Plans.map((child) => sanitizePlan(child, depth + 1)) : [] };
}

export async function collectRuntimeDatabaseInventory(client) {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    const { rows } = await client.query(`SELECT current_database() = 'filosage' AS correct_database,
      current_user AS runtime_role,
      (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS database_owner,
      (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'public') AS schema_owner,
      (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass('public.filosage_documents')) AS table_owner,
      has_table_privilege(current_user, 'public.filosage_documents', 'SELECT') AS can_select,
      has_table_privilege(current_user, 'public.filosage_documents', 'INSERT') AS can_insert,
      has_table_privilege(current_user, 'public.filosage_documents', 'UPDATE') AS can_update,
      has_table_privilege(current_user, 'public.filosage_documents', 'DELETE') AS can_delete,
      has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
      has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
      EXISTS (SELECT 1 FROM pg_roles WHERE pg_has_role(current_user, oid, 'MEMBER') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)) AS elevated_membership,
      EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.filosage_documents') AND pg_has_role(current_user, relowner, 'MEMBER')) AS table_owner_membership,
      (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = current_user) AS direct_memberships,
      EXISTS (SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a WHERE d.datname = current_database() AND a.grantee = 0 AND a.privilege_type = 'CREATE') AS public_database_create,
      EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname = 'public' AND a.grantee = 0 AND a.privilege_type = 'CREATE') AS public_schema_create,
      (SELECT count(*) = 8 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filosage_documents'
        AND is_nullable = 'NO' AND (column_name, data_type) IN (('path','text'), ('collection_id','text'), ('collection_path','text'), ('document_id','text'), ('data','jsonb'), ('version','bigint'), ('created_at','timestamp with time zone'), ('updated_at','timestamp with time zone'))) AS schema_columns_compatible,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.filosage_documents') AND contype = 'p' AND pg_get_constraintdef(oid) = 'PRIMARY KEY (path)') AS primary_key_compatible,
      current_setting('max_connections') AS max_connections,
      current_setting('idle_in_transaction_session_timeout') AS idle_transaction_timeout,
      current_setting('idle_session_timeout', true) AS idle_session_timeout,
      (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS database_sessions,
      (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND usename = current_user) AS runtime_sessions`);
    const row = rows[0];
    if (!row || row.correct_database !== true || !roleName(row.runtime_role)) throw new Error("Wrong database metadata target.");
    const booleanKeys = ["correct_database", "can_select", "can_insert", "can_update", "can_delete", "schema_create", "database_create", "elevated_membership", "table_owner_membership", "public_database_create", "public_schema_create", "schema_columns_compatible", "primary_key_compatible"];
    if (booleanKeys.some((key) => typeof row[key] !== "boolean")) throw new Error("Incomplete privilege metadata.");
    const counts = await client.query("SELECT count(*) AS document_rows, count(*) FILTER (WHERE collection_path = 'courses') AS course_rows FROM public.filosage_documents");
    // Representative collection equality emitted by queryParts; EXPLAIN does not
    // execute the query. No ANALYZE, user input, document fields or raw plan output.
    const plan = await client.query(`EXPLAIN (FORMAT JSON) SELECT path, data FROM public.filosage_documents
      WHERE collection_path = 'courses' AND data #> '{isPublic}' = 'true'::jsonb LIMIT 20`);
    const rawPlan = plan.rows[0]?.["QUERY PLAN"]?.[0]?.Plan;
    return { schemaVersion: 1, operation: "read-only-production-database-catalog", observedAt: new Date().toISOString(),
      roles: Object.fromEntries(["runtime_role", "database_owner", "schema_owner", "table_owner"].map((key) => [key, roleName(row[key])])),
      privileges: Object.fromEntries(booleanKeys.map((key) => [key, row[key]])), directMemberships: number(row.direct_memberships),
      counts: { documents: number(counts.rows[0]?.document_rows), courses: number(counts.rows[0]?.course_rows), databaseSessions: number(row.database_sessions), runtimeSessions: number(row.runtime_sessions) },
      settings: { maxConnections: number(row.max_connections), idleTransactionTimeout: setting(row.idle_transaction_timeout), idleSessionTimeout: setting(row.idle_session_timeout), probeStatementTimeoutMs: 15000, probeLockTimeoutMs: 3000 },
      publicCoursePlan: sanitizePlan(rawPlan), dmlExecution: "not-performed", modelTelemetry: "not-collected", restoreRehearsal: false };
  } finally { await client.query("ROLLBACK"); }
}

/** Reject libpq URL option overrides before constructing a database client. */
export function runtimeDatabaseOptions(connectionString, sslMode) {
  const target = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(target.protocol)
    || target.hostname !== "filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com"
    || target.pathname !== "/filosage" || !target.username || !target.password || target.hash
    || (target.port && target.port !== "5432") || sslMode === "disable") throw new Error("Unapproved database target.");
  const options = [...target.searchParams];
  if (options.length > 1 || options.some(([key, value]) => key !== "sslmode" || !["require", "verify-full"].includes(value))) throw new Error("Unapproved database URL options.");
  // No connectionString reaches pg: it can override host, port, credentials and
  // the explicit SSL object with query parameters after our URL checks.
  return { host: target.hostname, port: 5432, database: "filosage", user: decodeURIComponent(target.username), password: decodeURIComponent(target.password),
    connectionTimeoutMillis: 15000, query_timeout: 20000, ssl: { rejectUnauthorized: true }, application_name: "filosage-readonly-release-inventory" };
}

/** Called only by the reviewed transport in the exact selected runtime revision. */
export async function runRuntimeDatabaseInventory(expectedSha) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || process.env.SITE_VERSION !== expectedSha) throw new Error("Runtime identity mismatch.");
  const options = runtimeDatabaseOptions(process.env.DATABASE_URL, process.env.DATABASE_SSL);
  const require = createRequire(`${process.cwd()}/package.json`);
  const pg = require("pg");
  const client = new pg.Client(options);
  try {
    await client.connect();
    const result = await collectRuntimeDatabaseInventory(client);
    result.sourceSha = expectedSha;
    const pool = process.env.DATABASE_POOL_MAX;
    result.configuredPoolMax = pool === undefined ? null : /^(?:[1-9]|[1-9][0-9]{1,2})$/.test(pool) ? Number(pool) : null;
    result.poolDefaultSourceReviewRequired = pool === undefined;
    return result;
  } finally { await client.end().catch(() => undefined); }
}
