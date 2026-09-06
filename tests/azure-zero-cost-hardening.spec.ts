import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { RETIRED_SYSTEM_NAMES } from "./fixtures/retired-system-names";


const azureBicep = readFileSync("infra/azure/main.bicep", "utf8");
const backupWorkflow = readFileSync(".github/workflows/azure-backup-evidence.yml", "utf8");
const securityDoc = readFileSync("docs/SECURITY_AND_LEGAL_READINESS.md", "utf8");
const productionOps = readFileSync("docs/PRODUCTION_OPERATIONS.md", "utf8");

const QA_OWNER_EMAIL = "ktr0nn@icloud.com";

test("blob storage keeps prior banner versions without a paid SKU change", () => {
  expect(azureBicep).toContain("isVersioningEnabled: true");
  expect(azureBicep).toContain("deleteRetentionPolicy: { enabled: true, days: 7 }");
  expect(azureBicep).toContain("sku: { name: 'Standard_LRS' }");
});

test("the runtime Blob identity is scoped to the approved banner container", () => {
  expect(azureBicep).toContain("scope: bannerContainer");
  expect(azureBicep).not.toMatch(/resource blobContributor[\s\S]*scope: storage/);
});

test("PostgreSQL runtime and bootstrap remain distinct within the single application", () => {
  expect(azureBicep).toContain("param postgresAppLogin string = 'filosage_app'");
  expect(azureBicep).toContain("param postgresAppPassword string");
  expect(azureBicep).not.toContain("postgresQaApp");
  expect(azureBicep).toContain("scope: databaseUrlSecret");
  expect(azureBicep).not.toContain("{ name: 'DATABASE_ADMIN_URL'");
});

test("backup evidence uses the same GitHub OIDC environment as Azure deploys", () => {
  expect(backupWorkflow).toContain("environment: azure-staging");
  expect(backupWorkflow).not.toContain("environment: production-operations");
  expect(backupWorkflow).toContain('AZURE_POSTGRES_RESOURCE_ID');
  expect(backupWorkflow).not.toContain("az postgres flexible-server list");
});

test("candidate releases inherit approved ownership rather than hard-code test accounts", () => {
  const release = readFileSync("scripts/azure-blue-green.mjs", "utf8");
  expect(release).toContain('"--from-revision", live.revisionName');
  expect(release).not.toContain("OWNER_EMAIL=");
  expect(release).not.toContain(QA_OWNER_EMAIL);
});

test("a verified External ID customer matching OWNER_EMAIL receives owner access", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--conditions=react-server", "-e", `
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

test("the explicit provisioner restricts the runtime role without requiring a QA role", () => {
  expect(existsSync("scripts/provision-azure-postgres-roles.ts")).toBe(true);
  const source = readFileSync("scripts/provision-azure-postgres-roles.ts", "utf8");
  expect(source).toContain("REVOKE CREATE ON SCHEMA public");
  expect(source).not.toContain("filosageqa_app");
  expect(source).toContain("filosage_app");
  expect(source).toContain("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L");
  expect(source).not.toContain("PASSWORD $1");
  expect(source).not.toContain("console.log(password");
});

test("database migrations require explicit bootstrap configuration without runtime fallback", () => {
  const source = readFileSync("scripts/migrate-azure-database.ts", "utf8");
  expect(source).toContain("bootstrapConfiguration");
  expect(source).not.toContain("process.env.DATABASE_URL");
});

test("security and operations docs describe Azure backups instead of the retired document store", () => {
  expect(securityDoc).not.toContain(`Managed ${RETIRED_SYSTEM_NAMES[1][0].toUpperCase()}${RETIRED_SYSTEM_NAMES[1].slice(1)} export`);
  expect(securityDoc).not.toContain(`live ${RETIRED_SYSTEM_NAMES[1][0].toUpperCase()}${RETIRED_SYSTEM_NAMES[1].slice(1)} probe`);
  expect(securityDoc).toContain("PostgreSQL Flexible Server");
  expect(securityDoc).toContain("seven-day");
  expect(productionOps).toContain("Blob versioning");
});
