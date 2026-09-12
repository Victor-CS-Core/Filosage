import { expect, test } from "@playwright/test";
import { environmentReadiness, predecessorReadiness, runtimeSecretReadiness, maintenanceIngressInventory, releaseEnvironments } from "../scripts/release-prerequisites";
import { readFileSync } from "node:fs";
import { releaseEnvironment } from "../src/lib/release-capabilities";
import { collectRuntimeDatabaseInventory, sanitizePlan, runtimeDatabaseOptions } from "../scripts/inspect-runtime-database.mjs";
import { productionVaultStatusProbe } from "../scripts/production-vault-status-probe.mjs";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(readFileSync("config/release-capabilities.json", "utf8"));
const sha = "a".repeat(40);
const digest = `sha256:${"d".repeat(64)}`;
const protectedEnvironment = {
  name: "azure-staging", can_admins_bypass: false,
  protection_rules: [{ type: "required_reviewers", prevent_self_review: true, reviewers: [{ type: "User", reviewer: { id: 42 } }] }],
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
};
const branches = { total_count: 1, branch_policies: [{ name: "main", type: "branch" }] };
const variables = ["AZURE_RESOURCE_GROUP", "AZURE_CONTAINER_APP_NAME", "AZURE_ACR_NAME"];
const secrets = ["AZURE_CLIENT_ID", "AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID"];

test("maintenance inventory includes direct app, both labels and every active revision without claiming drain", () => {
  const state = { appId: "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/release/providers/Microsoft.App/containerApps/app", location: "centralus", mode: "Multiple", fqdn: "app.region.azurecontainerapps.io", authConfigSha256: "b".repeat(64), traffic: [
    { label: "blue", revisionName: "app--old", weight: 100 }, { label: "green", revisionName: "app--new", weight: 0 },
  ] };
  const revisions = ["old", "new", "unlabelled-writer"].map((name) => ({ name: `app--${name}`, properties: { active: true, fqdn: `app--${name}.region.azurecontainerapps.io` } }));
  const result = maintenanceIngressInventory(state, { customDomains: [{ name: "filosage.com" }] }, revisions);
  expect(result.httpOrigins).toEqual([
    "https://app---blue.region.azurecontainerapps.io", "https://app---green.region.azurecontainerapps.io",
    "https://app--new.region.azurecontainerapps.io", "https://app--old.region.azurecontainerapps.io", "https://app--unlabelled-writer.region.azurecontainerapps.io",
    "https://app.region.azurecontainerapps.io", "https://filosage.com", "https://www.filosage.com",
  ]);
  expect(result.maintenanceReady).toBe(false);
  expect(result.drainVerified).toBe(false);
  expect(result.activeRevisionCount).toBe(3);
  expect(() => maintenanceIngressInventory(state, {}, revisions.slice(1))).toThrow();
  expect(() => maintenanceIngressInventory(state, {}, [{ name: "app--old", properties: { active: true, fqdn: "invalid.example" } }])).toThrow();
});

test("main-restricted deployment metadata works without native review or bypass controls", () => {
  for (const environment of [protectedEnvironment,
    { ...protectedEnvironment, protection_rules: [], can_admins_bypass: true },
    { ...protectedEnvironment, protection_rules: undefined, can_admins_bypass: undefined },
    { ...protectedEnvironment, protection_rules: [{ type: "required_reviewers", prevent_self_review: false, reviewers: [] }] }]) {
    expect(environmentReadiness(environment, branches, variables, secrets).ready).toBe(true);
  }
});

test("manual release workflows use the existing main-restricted deployment configuration", () => {
  const configured: Record<string, unknown> = {
    "azure-staging": { ...protectedEnvironment, protection_rules: [], can_admins_bypass: true },
  };
  for (const name of releaseEnvironments) {
    expect(environmentReadiness(configured[name], branches, variables, secrets).ready).toBe(true);
  }
  for (const name of ["azure-staging", "azure-candidate-verification", "azure-promote-staging"]) {
    const workflow = readFileSync(`.github/workflows/${name}.yml`, "utf8");
    const environment = workflow.match(/^ {4}environment: ([a-z-]+)$/m)?.[1];
    expect(environment).toBeTruthy();
    expect(environmentReadiness(configured[environment!], branches, variables, secrets).ready).toBe(true);
    const triggers = workflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1];
    expect(triggers).toContain("  workflow_dispatch:");
    expect(triggers).not.toMatch(/^ {2}(push|pull_request|workflow_run|schedule):/m);
  }
});

test("missing or unrestricted deployment configuration remains blocked", () => {
  expect(environmentReadiness(protectedEnvironment, branches, variables, secrets).ready).toBe(true);
  for (const environment of [null, {}, { ...protectedEnvironment, deployment_branch_policy: null },
    { ...protectedEnvironment, deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }]) {
    expect(environmentReadiness(environment, branches, variables, secrets).ready).toBe(false);
  }
  for (const policy of [null, { total_count: 2, branch_policies: branches.branch_policies },
    { total_count: 1, branch_policies: [{ name: "*", type: "branch" }] },
    { total_count: 1, branch_policies: [{ name: "main", type: "tag" }] }]) {
    expect(environmentReadiness(protectedEnvironment, policy, variables, secrets).ready).toBe(false);
  }
  for (const variable of variables) {
    expect(environmentReadiness(protectedEnvironment, branches, variables.filter((name) => name !== variable), secrets).ready).toBe(false);
  }
  for (const secret of secrets) {
    expect(environmentReadiness(protectedEnvironment, branches, variables, secrets.filter((name) => name !== secret)).ready).toBe(false);
  }
  expect(environmentReadiness(protectedEnvironment, branches, [], []).missingVariables).toEqual(variables);
  expect(environmentReadiness(protectedEnvironment, branches, [], []).missingSecrets).toEqual(secrets);
});

test("legacy healthy responses never pass immutable predecessor identity and capability checks", () => {
  const env = Object.entries({ ...releaseEnvironment(manifest), SITE_VERSION: sha, NEXT_PUBLIC_SITE_URL: "https://filosage.com", RELEASE_IMAGE_DIGEST: digest }).map(([name, value]) => ({ name, value }));
  const revision = { properties: { active: true, template: { containers: [{ image: `registry.azurecr.io/filosage@${digest}`, env }] } } };
  const health = { ok: true, version: sha, imageDigest: digest, origin: "https://filosage.com", authenticationMode: "migration-dual", capabilities: manifest.capabilities,
    checks: { configuration: true, datastore: true, flashcardDecks: manifest.capabilities.flashcardDecks, flashcardGeneration: manifest.capabilities.flashcardGeneration } };
  expect(predecessorReadiness(revision, 200, health, "migration-dual").contractReady).toBe(true);
  for (const changed of [{ imageDigest: undefined }, { capabilities: undefined }, { version: "b".repeat(40) }, { ok: false }, { checks: {} }]) {
    expect(predecessorReadiness(revision, 200, { ...health, ...changed }, "migration-dual").contractReady).toBe(false);
  }
  expect(predecessorReadiness(revision, 503, health, "migration-dual").contractReady).toBe(false);
  expect(predecessorReadiness(revision, 200, health, "direct-google").contractReady).toBe(false);
  const duplicate = structuredClone(revision); duplicate.properties.template.containers[0].env.push({ name: "SITE_VERSION", value: sha });
  expect(predecessorReadiness(duplicate, 200, health, "migration-dual").contractReady).toBe(false);
  const secret = structuredClone(revision); secret.properties.template.containers[0].env.push({ name: "DATABASE_ADMIN_URL", value: "never-print-private-input" });
  const result = predecessorReadiness(secret, 200, health, "migration-dual");
  expect(result.contractReady).toBe(false);
  expect(JSON.stringify(result)).not.toContain("never-print-private-input");
});

test("vault-wide access and missing exact runtime secret grants remain blockers", () => {
  const vault = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/release/providers/Microsoft.KeyVault/vaults/vault";
  const required = [`${vault}/secrets/database-url-runtime`, `${vault}/secrets/openai-api-key`];
  const narrow = required.map((scope) => ({ roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/4633458b-17de-408a-b874-0445c86b69e6", scope }));
  expect(runtimeSecretReadiness(narrow, required).metadataReady).toBe(true);
  const broad = [...narrow, { roleDefinitionId: narrow[0].roleDefinitionId, scope: vault }];
  expect(runtimeSecretReadiness(broad, required).metadataReady).toBe(false);
  expect(runtimeSecretReadiness(narrow.slice(1), required).metadataReady).toBe(false);
  expect(runtimeSecretReadiness([], []).metadataReady).toBe(false);
  expect(runtimeSecretReadiness([{ roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/unknown", scope: vault }], required).metadataReady).toBe(false);
  expect(runtimeSecretReadiness(narrow, required).effectiveProbe).toBe("pending");
});

test("database plan evidence strips predicates and customer-shaped text recursively", () => {
  const plan = sanitizePlan({ "Node Type": "Limit", "Total Cost": 1.2, "Plan Rows": 12, "Plan Width": 50,
    Filter: "never-print-private-predicate", Plans: [{ "Node Type": "Index Scan", "Index Name": "filosage_documents_collection_idx", "Total Cost": 1, "Plan Rows": 30, "Plan Width": 50, "Index Cond": "never-print-private-predicate" }] });
  expect(plan).toEqual({ nodeType: "Limit", totalCost: 1.2, rows: 12, width: 50, plans: [{ nodeType: "Index Scan", indexName: "filosage_documents_collection_idx", totalCost: 1, rows: 30, width: 50, plans: [] }] });
  expect(JSON.stringify(plan)).not.toContain("never-print");
});

test("runtime database options reject URL target and TLS overrides before a client can connect", () => {
  const url = "postgresql://runtime:testfixture%2Fpassword@filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com:5432/filosage"; // secret-scan: allow-test-fixture
  const options = runtimeDatabaseOptions(`${url}?sslmode=verify-full`, "verify-full");
  expect(options).not.toHaveProperty("connectionString");
  expect(options).toMatchObject({ host: "filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com", port: 5432, database: "filosage", user: "runtime", password: "testfixture/password", ssl: { rejectUnauthorized: true } });
  for (const query of ["host=other.example", "port=6543", "user=other", "password=other", "database=other", "ssl=0", "sslmode=disable", "options=-c%20search_path=other", "sslmode=verify-full&host=other.example", "sslmode=verify-full&sslmode=require"]) {
    expect(() => runtimeDatabaseOptions(`${url}?${query}`, "verify-full")).toThrow();
  }
  expect(() => runtimeDatabaseOptions(url.replace("/filosage", "/filosageqa"), "verify-full")).toThrow();
  expect(() => runtimeDatabaseOptions(url, "disable")).toThrow();
});

test("database inventory rolls back on a catalog failure without querying application rows", async () => {
  const statements: string[] = [];
  const client = { query: async (sql: string) => {
    statements.push(sql);
    if (sql.startsWith("SELECT")) throw new Error("provider-private-error");
    return { rows: [] };
  } };
  await expect(collectRuntimeDatabaseInventory(client)).rejects.toThrow();
  expect(statements[0]).toBe("BEGIN READ ONLY");
  expect(statements.at(-1)).toBe("ROLLBACK");
  expect(statements.some((sql) => /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/.test(sql))).toBe(false);
  expect(statements.some((sql) => /SELECT\s+(?:\*|data|path)\s+FROM\s+public\.filosage_documents/i.test(sql))).toBe(false);
});

test("vault containment rejects broad-grant substitutions, extra consumers and duplicate secret grants offline", () => {
  const code = `import importlib.util
spec=importlib.util.spec_from_file_location('containment','scripts/contain-production-vault-access.py')
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
broad={'id':m.VAULT+'/providers/Microsoft.Authorization/roleAssignments/'+m.BROAD,'scope':m.VAULT,'principalId':m.PRINCIPAL,'roleDefinitionId':'/providers/Microsoft.Authorization/roleDefinitions/'+m.ROLE,'condition':None}
narrow=[dict(broad,id=name,scope=m.VAULT+'/secrets/'+name) for name in sorted(m.REQUIRED)]
assert len(m.validate_assignments([broad])[0])==1
assert set(m.validate_assignments(narrow)[1])==m.REQUIRED
for rows in [[],[dict(broad,id='other')],[dict(broad,principalId='other')],[dict(broad,condition='other')],[dict(broad,scope=m.VAULT+'/secrets/database-admin-url')],narrow+[narrow[0]]]:
 try:m.validate_assignments(rows)
 except RuntimeError:pass
 else:raise AssertionError('unsafe assignment accepted')
`;
  const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 3000 });
  expect(result.status, result.stderr).toBe(0);
});

test("managed-identity status probe never reads secret bodies and fails an unexpected access result", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { SITE_VERSION: process.env.SITE_VERSION, IDENTITY_ENDPOINT: process.env.IDENTITY_ENDPOINT, IDENTITY_HEADER: process.env.IDENTITY_HEADER };
  const expectedSha = "a".repeat(40);
  Object.assign(process.env, { SITE_VERSION: expectedSha, IDENTITY_ENDPOINT: "http://127.0.0.1:12345/msi", IDENTITY_HEADER: "fixture-identity-header" });
  let deniedStatus = 403;
  const required = [{ name: "database-url", url: "https://filosagestg-p4ujucgnxq3g.vault.azure.net/secrets/database-url/" + "b".repeat(32) }];
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    expect(options?.redirect).toBe("error");
    if (url.hostname === "127.0.0.1") return Response.json({ access_token: "fixture-access-token" });
    const response = new Response("never-publish-secret-body", { status: url.pathname.includes("database-admin-url") ? deniedStatus : 200 });
    response.json = async () => { throw new Error("secret body must not be read"); };
    response.text = async () => { throw new Error("secret body must not be read"); };
    return response;
  };
  try {
    const passed = await productionVaultStatusProbe({ expectedSha, required, denied: ["database-admin-url"] });
    expect(passed.passed).toBe(true);
    expect(JSON.stringify(passed)).not.toMatch(/never-publish|fixture-access-token|fixture-identity-header/);
    deniedStatus = 200;
    expect((await productionVaultStatusProbe({ expectedSha, required, denied: ["database-admin-url"] })).passed).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("read-only vault diagnostics retain a valid denied-access mismatch without accepting it", () => {
  const code = `import importlib.util
spec=importlib.util.spec_from_file_location('containment','scripts/contain-production-vault-access.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
expected={name:200 for name in m.REQUIRED}|{name:403 for name in m.DENIED}
checks=[{'name':name,'status':200,'expected':status} for name,status in expected.items()]
value={'operation':'production-vault-status-probe','sourceSha':m.EXPECTED_SHA,'checks':checks,'passed':False}
result=m.validate_probe_result(value,m.DENIED)
assert result['passed'] is False and len(result['checks'])==15
assert all(row['status']==200 for row in result['checks'])
for change in [{'checks':checks+checks[:1]},{'checks':[dict(row,status='private-input') for row in checks]},{'sourceSha':'wrong'},{'checks':[dict(row,body='private-input') for row in checks]}]:
 try:m.validate_probe_result(dict(value,**change),m.DENIED)
 except RuntimeError:pass
 else:raise AssertionError('invalid matrix accepted')
`;
  const result = spawnSync("python", ["-c", code], { encoding: "utf8", timeout: 3000 });
  expect(result.status, result.stderr).toBe(0);
});

test("modern database pool rejects coercion and settings above the approved per-process maximum", async () => {
  const { databasePoolMaximum, modernDatabasePoolMax } = await import("../src/lib/database-connection-budget");
  expect(databasePoolMaximum(undefined)).toBe(modernDatabasePoolMax);
  expect(databasePoolMaximum(String(modernDatabasePoolMax))).toBe(modernDatabasePoolMax);
  expect(databasePoolMaximum("1")).toBe(1);
  for (const value of ["", "0", "-1", "1.5", " 1", "1 ", "01", "1e0", "NaN", "Infinity", String(modernDatabasePoolMax + 1)]) {
    expect(() => databasePoolMaximum(value)).toThrow();
  }
});

test("release connection budget accounts every active revision and rejects unbounded or legacy pools", async () => {
  const { assertRevisionConnectionBudget } = await import("../scripts/database-connection-budget");
  const revision = (name: string, pool = "2", maximum = 3) => ({ name, properties: { active: true, template: { scale: { minReplicas: 0, maxReplicas: maximum }, containers: [{ env: [{ name: "DATABASE_POOL_MAX", value: pool }] }] } } });
  expect(() => assertRevisionConnectionBudget([revision("app--live")], true)).not.toThrow();
  expect(() => assertRevisionConnectionBudget([revision("app--live"), revision("app--candidate")], false)).not.toThrow();
  for (const rows of [[revision("app--live"), revision("app--old"), revision("app--unlabelled")], [revision("app--live", "10")], [revision("app--live", "2", 4)]]) {
    expect(() => assertRevisionConnectionBudget(rows, false)).toThrow();
  }
  expect(() => assertRevisionConnectionBudget([revision("app--live"), revision("app--old")], true)).toThrow();
  expect(() => assertRevisionConnectionBudget([], true)).toThrow();
  const missing = revision("app--live"); missing.properties.template.containers[0].env = [];
  expect(() => assertRevisionConnectionBudget([missing], false)).toThrow();
});

test("QA overlap cannot exceed the reserved eleven connections", async () => {
  const { assertQaConnectionBudget } = await import("../scripts/database-connection-budget");
  const qa = { name: "qa--one", properties: { active: true, template: { scale: { maxReplicas: 1 }, containers: [{ env: [] as Array<{ name: string; value: string }> }] } } };
  expect(assertQaConnectionBudget([qa]).maximumConnections).toBe(11);
  expect(assertQaConnectionBudget([]).maximumConnections).toBe(0);
  expect(() => assertQaConnectionBudget([qa, { ...qa, name: "qa--extra" }])).toThrow();
  qa.properties.template.scale.maxReplicas = 2;
  expect(() => assertQaConnectionBudget([qa])).toThrow();
  qa.properties.template.scale.maxReplicas = 1;
  qa.properties.template.containers[0].env = [{ name: "DATABASE_POOL_MAX", value: "Infinity" }];
  expect(() => assertQaConnectionBudget([qa])).toThrow();
});

test("startup capacity guard includes reserved settings and rolls back insufficient capacity", async () => {
  const { verifyDatabaseConnectionCapacity } = await import("../scripts/verify-azure-database");
  for (const compatible of [true, false]) {
    const queries: string[] = [];
    const client = { async query(sql: string) { queries.push(sql); return { rows: [{ compatible }] }; } };
    if (compatible) await verifyDatabaseConnectionCapacity(client);
    else await expect(verifyDatabaseConnectionCapacity(client)).rejects.toThrow();
    expect(queries[0]).toBe("BEGIN READ ONLY"); expect(queries.at(-1)).toBe("ROLLBACK");
    expect(queries[1]).toContain("current_setting('reserved_connections')");
    expect(queries[1]).toContain("current_setting('superuser_reserved_connections')");
    expect(queries[1]).toContain(">= 35");
  }
});

test("modern runtime configuration and real release paths enforce the shared capacity budget", () => {
  const runtime = readFileSync("src/lib/postgres-document-store.ts", "utf8");
  expect(runtime).toContain("max: databasePoolMaximum(serverEnvironment.DATABASE_POOL_MAX)");
  expect(runtime).toContain("max: databaseHealthPoolMax");
  expect(readFileSync("infra/azure/main.bicep", "utf8")).toContain("{ name: 'DATABASE_POOL_MAX', value: '2' }");
  expect(readFileSync("Dockerfile", "utf8")).toContain("./src/lib/database-connection-budget.ts");
  const release = readFileSync("scripts/azure-blue-green.mjs", "utf8");
  expect(release).toContain("DATABASE_POOL_MAX: String(modernDatabasePoolMax)");
  expect(release).toContain('connectionBudget(true);\n    mutate(["containerapp", "revision", "copy"');
  expect(release).toContain("const verify = (candidate, promoted = false) => {\n  connectionBudget();");
});
