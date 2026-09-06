import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { roleStatements } from "../scripts/provision-azure-postgres-roles";
import { verifyAzureDatabaseSchema } from "../scripts/verify-azure-database";

type Resource = { type: string; scope?: string; properties: Record<string, unknown>; identity?: unknown };
const compile = (file: string) => {
  const result = spawnSync("az", ["bicep", "build", "--file", resolve(file), "--stdout"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  expect(result.status, result.stderr || String(result.error)).toBe(0);
  return JSON.parse(result.stdout) as { resources: Resource[]; variables: Record<string, unknown> };
};
test("normal runtime receives only explicit secret-scoped grants and cannot bootstrap", () => {
  const template = compile("infra/azure/main.bicep");
  const assignments = template.resources.filter((r) => r.type === "Microsoft.Authorization/roleAssignments" && JSON.stringify(r).includes("keyVaultSecretsUserRoleId"));
  expect(assignments.length).toBeGreaterThan(0);
  for (const assignment of assignments) expect(assignment.scope).toContain("Microsoft.KeyVault/vaults/secrets");
  const app = template.resources.find((r) => r.type === "Microsoft.App/containerApps");
  expect(app).toBeDefined();
  expect(JSON.stringify(app?.properties)).not.toMatch(/DATABASE_ADMIN_URL|POSTGRES_.*PASSWORD|database-admin-url|postgres-app-password/);
  const runtime = readFileSync("Dockerfile", "utf8").split("FROM node:22-bookworm-slim AS runtime")[1];
  expect(runtime).not.toContain("provision-azure-postgres-roles");
  expect(runtime).not.toContain("migrate-azure-database");
  expect(runtime).toContain("verify-azure-database");
});
test("application role statements allow bounded DML and deny schema creation", () => {
  const statements = roleStatements({ login: "filosage_app", password: "fixture", database: "filosage" });
  expect(statements.grantSchema).toBe('GRANT USAGE ON SCHEMA public TO "filosage_app"');
  expect(statements.revokeCreate).toBe('REVOKE CREATE ON SCHEMA public FROM "filosage_app"');
  expect(statements.grantTables).toBe('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.filosage_documents TO "filosage_app"');
  expect(Object.values(statements).join("\n")).not.toContain("ON ALL TABLES");
});
test("bootstrap fails closed without manual acknowledgement and administrator configuration", () => {
  for (const script of ["provision-azure-postgres-roles.ts", "migrate-azure-database.ts"]) {
    const result = spawnSync(process.execPath, [resolve(`scripts/${script}`)], { encoding: "utf8", env: { ...process.env, DATABASE_ADMIN_URL: "", DATABASE_BOOTSTRAP_AUTHORIZED: "" } });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toMatch(/SKIPPED|DEFERRED|OK/);
  }
});
test("bootstrap job has a separate identity, manual trigger and no retries", () => {
  const template = compile("infra/azure/bootstrap.bicep");
  expect(template.resources.some((r) => r.type === "Microsoft.App/containerApps")).toBe(false);
  const job = template.resources.find((r) => r.type === "Microsoft.App/jobs");
  expect(job?.properties.configuration).toMatchObject({ triggerType: "Manual", replicaRetryLimit: 0, replicaTimeout: 600, manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 } });
  expect(JSON.stringify(job?.identity)).toContain("parameters('jobName')");
  expect(JSON.stringify(job?.identity)).not.toContain("app-identity");
});
test("runtime schema verification runs only read-only SQL and rejects incomplete schemas", async () => {
  const calls: string[] = [];
  const client = { query: async (sql: string) => { calls.push(sql); return { rows: [{ compatible: true }] }; } };
  await verifyAzureDatabaseSchema(client);
  expect(calls[0]).toBe("BEGIN READ ONLY");
  expect(calls.at(-1)).toBe("ROLLBACK");
  expect(calls.join("\n")).not.toMatch(/CREATE TABLE|ALTER |GRANT |INSERT |DELETE |UPDATE /);
  await expect(verifyAzureDatabaseSchema({ query: async () => ({ rows: [{ compatible: false }] }) })).rejects.toThrow("incompatible");
});
