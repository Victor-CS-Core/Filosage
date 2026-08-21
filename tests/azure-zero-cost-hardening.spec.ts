import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");

const azureBicep = readFileSync("infra/azure/main.bicep", "utf8");
const qaBicep = readFileSync("infra/azure/qa.bicep", "utf8");
const backupWorkflow = readFileSync(".github/workflows/azure-backup-evidence.yml", "utf8");
const qaWorkflow = readFileSync(".github/workflows/azure-qa.yml", "utf8");
const securityDoc = readFileSync("docs/SECURITY_AND_LEGAL_READINESS.md", "utf8");
const productionOps = readFileSync("docs/PRODUCTION_OPERATIONS.md", "utf8");

const QA_OWNER_EMAIL = "ktr0nn@icloud.com";

test("blob storage keeps prior banner versions without a paid SKU change", () => {
  expect(azureBicep).toContain("isVersioningEnabled: true");
  expect(azureBicep).toContain("deleteRetentionPolicy: { enabled: true, days: 7 }");
  expect(azureBicep).toContain("sku: { name: 'Standard_LRS' }");
});

test("the production app identity cannot write the QA banner container", () => {
  expect(azureBicep).toContain("scope: bannerContainer");
  expect(azureBicep).not.toMatch(/resource blobContributor[\s\S]*scope: storage/);
});

test("PostgreSQL app and QA roles are distinct from the server admin", () => {
  expect(azureBicep).toContain("param postgresAppLogin string = 'filosage_app'");
  expect(azureBicep).toContain("@secure()");
  expect(azureBicep).toContain("param postgresAppPassword string");
  expect(qaBicep).toContain("param postgresQaAppLogin string = 'filosageqa_app'");
  expect(qaBicep).toContain("param postgresQaAppPassword string");
  expect(azureBicep).toMatch(/postgresql:\/\/\$\{postgresAppLogin\}:\$\{uriComponent\(postgresAppPassword\)\}/);
  expect(qaBicep).toMatch(/postgresql:\/\/\$\{postgresQaAppLogin\}:\$\{uriComponent\(postgresQaAppPassword\)\}/);
  expect(qaBicep).not.toMatch(/postgresql:\/\/\$\{postgresAdminLogin\}:\$\{uriComponent\(postgresAdminPassword\)\}/);
});

test("backup evidence uses the same GitHub OIDC environment as Azure deploys", () => {
  expect(backupWorkflow).toContain("environment: azure-staging");
  expect(backupWorkflow).not.toContain("environment: production-operations");
  expect(backupWorkflow).toContain("az postgres flexible-server list");
});

test("isolated QA owner is the Azure customer-account email", () => {
  expect(qaBicep).toContain(`param ownerEmail string = '${QA_OWNER_EMAIL}'`);
  expect(qaWorkflow).toContain(`"OWNER_EMAIL=${QA_OWNER_EMAIL}"`);
  expect(qaBicep).toContain("param externalIdAuthEnabled bool = true");
  expect(qaBicep).toContain("param externalIdNewAccountsEnabled bool = true");
  expect(qaWorkflow).toMatch(/external_id_auth_enabled:[\s\S]*default: true/);
  expect(qaWorkflow).toMatch(/external_id_new_accounts_enabled:[\s\S]*default: true/);
});

test("a verified External ID customer matching OWNER_EMAIL receives owner access", () => {
  const result = spawnSync(process.execPath, [tsxCli, "--conditions=react-server", "-e", `
    import { isOwnerUser } from "./src/lib/account-server.ts";
    const owner = isOwnerUser({
      uid: "external-id-subject",
      email: "Ktr0nn@icloud.com",
      email_verified: true,
      providerIdentity: {
        provider: "filosage",
        issuer: "https://qa.ciamlogin.com/tenant/v2.0",
        subject: "external-id-subject",
        email: "ktr0nn@icloud.com",
        emailVerified: true,
      },
      identityLinkRegistered: true,
    });
    const learner = isOwnerUser({
      uid: "other-subject",
      email: "learner@example.com",
      email_verified: true,
      providerIdentity: {
        provider: "filosage",
        issuer: "https://qa.ciamlogin.com/tenant/v2.0",
        subject: "other-subject",
        email: "learner@example.com",
        emailVerified: true,
      },
      identityLinkRegistered: true,
    });
    process.stdout.write(JSON.stringify({ owner, learner }));
  `], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      OWNER_EMAIL: QA_OWNER_EMAIL,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ owner: true, learner: false });
});

test("the PostgreSQL role provisioner keeps QA from connecting to production data", () => {
  expect(existsSync("scripts/provision-azure-postgres-roles.ts")).toBe(true);
  const source = readFileSync("scripts/provision-azure-postgres-roles.ts", "utf8");
  expect(source).toContain("REVOKE CONNECT ON DATABASE");
  expect(source).toContain("filosageqa_app");
  expect(source).toContain("filosage_app");
  expect(source).toContain("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L");
  expect(source).toContain("SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L'");
  expect(source).not.toContain("PASSWORD $1");
  expect(source).not.toContain("console.log(password");
  expect(source).not.toContain("process.stdout.write");
});

test("database migrations prefer the admin URL so app roles can stay least-privilege", () => {
  const source = readFileSync("scripts/migrate-azure-database.ts", "utf8");
  expect(source).toContain("DATABASE_ADMIN_URL");
  expect(source).toContain("DATABASE_URL");
});

test("security and operations docs describe Azure backups instead of Firestore", () => {
  expect(securityDoc).not.toContain("Managed Firestore export");
  expect(securityDoc).not.toContain("live Firestore probe");
  expect(securityDoc).toContain("PostgreSQL Flexible Server");
  expect(securityDoc).toContain("seven-day");
  expect(productionOps).toContain("Blob versioning");
});
