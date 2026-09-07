import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import pg from "pg";
import { createPostgresFixture, validatePostgresTestUrl, POSTGRES_TEST_DATABASE } from "./fixture.ts";
import { bootstrapConfiguration, quotedIdentifier, roleStatements } from "../../scripts/provision-azure-postgres-roles.ts";
import { verifyAzureDatabaseSchema } from "../../scripts/verify-azure-database.ts";

const privilegeDenied = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "42501");

test("PostgreSQL bootstrap targets the app database and runtime can perform DML but cannot create or drop schema objects", { timeout: 30_000 }, async () => {
  const fixture = await createPostgresFixture();
  const roleName = `bff_runtime_${randomUUID().replaceAll("-", "")}`;
  const identifier = quotedIdentifier(roleName, "fixture role");
  const password = randomBytes(32).toString("hex");
  const testUrl = validatePostgresTestUrl(process.env.FILOSAGE_POSTGRES_TEST_URL);
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres"; // Deliberately exercise the old bootstrap URL shape.
  const variables = ["DATABASE_BOOTSTRAP_AUTHORIZED", "DATABASE_ADMIN_URL", "POSTGRES_APP_PASSWORD", "POSTGRES_APP_LOGIN", "POSTGRES_APP_DATABASE"] as const;
  const previousEnvironment = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
  let runtime: pg.Client | undefined;
  let roleCreated = false;
  try {
    Object.assign(process.env, { DATABASE_BOOTSTRAP_AUTHORIZED: "true", DATABASE_ADMIN_URL: adminUrl.toString(), POSTGRES_APP_PASSWORD: password, POSTGRES_APP_LOGIN: roleName, POSTGRES_APP_DATABASE: POSTGRES_TEST_DATABASE });
    const configuration = bootstrapConfiguration();
    assert.equal(new URL(configuration.connectionString).pathname, `/${POSTGRES_TEST_DATABASE}`);
    const actualBootstrap = new pg.Client({ connectionString: configuration.connectionString, ssl: false, connectionTimeoutMillis: 3_000, query_timeout: 5_000 });
    try {
      await actualBootstrap.connect();
      const target = await actualBootstrap.query("SELECT current_database() AS name");
      assert.equal(target.rows[0]?.name, POSTGRES_TEST_DATABASE);
    } finally { await actualBootstrap.end(); }
    const migration = spawnSync(process.execPath, [resolve("scripts/migrate-azure-database.ts")], {
      encoding: "utf8", timeout: 10_000, env: { ...process.env, DATABASE_SSL: "disable" },
    });
    assert.equal(migration.status, 0, "The actual additive migration must succeed on the explicit fixture app database.");
    assert.match(migration.stdout, /AZURE_DATABASE_MIGRATION_OK/);

    const statements = roleStatements(configuration.role);
    const formatted = await fixture.monitor.query(statements.createRole, [roleName, password]);
    assert.equal(typeof formatted.rows[0]?.stmt, "string");
    await fixture.monitor.query(formatted.rows[0].stmt);
    roleCreated = true;
    // Exercise the existing-role branch too, including its parameter typing and
    // password change before connecting as the restricted runtime role.
    const rotatedPassword = randomBytes(32).toString("hex");
    const altered = await fixture.monitor.query(statements.alterPassword, [roleName, rotatedPassword]);
    assert.equal(typeof altered.rows[0]?.stmt, "string");
    await fixture.monitor.query(altered.rows[0].stmt);
    // Exercise the same role-specific grants as bootstrap without changing PUBLIC
    // or other fixture roles. PostgreSQL 16 defaults already deny PUBLIC CREATE.
    for (const key of ["grantConnect", "revokeDatabaseCreate", "revokeCreate", "grantSchema", "grantTables"] as const) await fixture.monitor.query(statements[key]);
    const runtimeUrl = new URL(testUrl);
    runtimeUrl.username = roleName; runtimeUrl.password = rotatedPassword;
    runtime = new pg.Client({ connectionString: runtimeUrl.toString(), ssl: false, connectionTimeoutMillis: 3_000, query_timeout: 5_000 });
    await runtime.connect();
    await verifyAzureDatabaseSchema(runtime);

    const path = fixture.path("bootstrap-dml");
    await runtime.query("BEGIN");
    try {
      await runtime.query("INSERT INTO public.filosage_documents (path, collection_id, collection_path, document_id, data) VALUES ($1, $2, $2, 'bootstrap-dml', '{\"value\":1}'::jsonb)", [path, path.split("/")[0]]);
      const read = await runtime.query("SELECT data FROM public.filosage_documents WHERE path = $1", [path]);
      assert.deepEqual(read.rows[0]?.data, { value: 1 });
      assert.equal((await runtime.query("UPDATE public.filosage_documents SET data = '{\"value\":2}'::jsonb WHERE path = $1", [path])).rowCount, 1);
      assert.equal((await runtime.query("DELETE FROM public.filosage_documents WHERE path = $1", [path])).rowCount, 1);
    } finally { await runtime.query("ROLLBACK"); }

    for (const statement of [
      `CREATE SCHEMA ${identifier}`,
      `CREATE TABLE public.${identifier} (id integer)`,
      "ALTER TABLE public.filosage_documents ADD COLUMN forbidden_fixture_column text",
      "DROP TABLE public.filosage_documents",
    ]) {
      // Always roll back: even an unexpectedly permitted DDL cannot destroy the
      // shared test table or leave a test object behind.
      await runtime.query("BEGIN");
      try { await assert.rejects(runtime.query(statement), privilegeDenied); }
      finally { await runtime.query("ROLLBACK"); }
    }
    await fixture.monitor.query(`REVOKE DELETE ON TABLE public.filosage_documents FROM ${identifier}`);
    await assert.rejects(verifyAzureDatabaseSchema(runtime), /incompatible/);
    await fixture.monitor.query(statements.grantTables);
    await fixture.monitor.query(`GRANT CREATE ON SCHEMA public TO ${identifier}`);
    await assert.rejects(verifyAzureDatabaseSchema(runtime), /incompatible/);
    await fixture.monitor.query(statements.revokeCreate);
    await fixture.monitor.query(`GRANT filosage_test TO ${identifier}`);
    try { await assert.rejects(verifyAzureDatabaseSchema(runtime), /incompatible/); }
    finally { await fixture.monitor.query(`REVOKE filosage_test FROM ${identifier}`); }
    await verifyAzureDatabaseSchema(runtime);
  } finally {
    await runtime?.end().catch(() => undefined);
    try {
      if (roleCreated) {
        // This UUID role owns no objects. Only its fixture-target privileges and
        // memberships are removed; no database/schema/table is dropped.
        await fixture.monitor.query(`DROP OWNED BY ${identifier}`);
        await fixture.monitor.query(`DROP ROLE ${identifier}`);
      }
    } finally {
      for (const key of variables) {
        if (previousEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = previousEnvironment[key];
      }
      await fixture.close();
    }
  }
});
