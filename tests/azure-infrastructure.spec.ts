import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const infrastructureSource = readFileSync("src/lib/azure-infrastructure.ts", "utf8");
const releaseSource = readFileSync("scripts/check-release-env.mjs", "utf8");
const identityClientSource = readFileSync("src/lib/identity-client.ts", "utf8");
const identityServerSource = readFileSync("src/lib/identity-server.ts", "utf8");
const accountServerSource = readFileSync("src/lib/account-server.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const runtimeConfigSource = readFileSync("src/lib/runtime-config.ts", "utf8");
const stagingWorkflowSource = readFileSync(".github/workflows/azure-staging.yml", "utf8");
const promotionWorkflowSource = readFileSync(".github/workflows/azure-promote-staging.yml", "utf8");
const azureBicepSource = readFileSync("infra/azure/main.bicep", "utf8");
const migrationVerifierSource = readFileSync("scripts/verify-azure-authored-courses.ts", "utf8");
const dockerfileSource = readFileSync("Dockerfile", "utf8");

test("Azure infrastructure inventory names every production platform service", () => {
  expect(infrastructureSource).toContain("Microsoft Entra External ID");
  expect(infrastructureSource).toContain("Azure Database for PostgreSQL");
  expect(infrastructureSource).toContain("Azure Blob Storage");
  expect(infrastructureSource).toContain("Azure Container Apps");
  expect(infrastructureSource).toContain("Azure Monitor and Log Analytics");
});

test("production release validation requires Azure and does not require Firebase", () => {
  expect(releaseSource).toContain('"DATABASE_URL"');
  expect(releaseSource).toContain('"NEXT_PUBLIC_ENTRA_CLIENT_ID"');
  expect(releaseSource).toContain('"AZURE_STORAGE_ACCOUNT_URL"');
  expect(releaseSource).not.toContain('"FIREBASE_PROJECT_ID"');
  expect(releaseSource).not.toContain('"FIRESTORE_BACKUP_BUCKET"');
});

test("Azure status avoids presenting configuration as invoice or restore proof", () => {
  expect(infrastructureSource).toContain("not invoice-grade Azure cost");
  expect(infrastructureSource).toContain("configuration alone is not recovery proof");
});

test("customer sign-in accelerates to Google while retaining the External ID flow", () => {
  expect(identityClientSource).toContain('domain_hint: "google"');
  expect(identityClientSource).toContain("extraQueryParameters: googleIssuerHint");
  expect(identityClientSource).toContain('prompt: "select_account"');
});

test("browser authentication delegates the SPA OAuth lifecycle to MSAL without a client secret", () => {
  expect(packageSource).toContain('"@azure/msal-browser"');
  expect(identityClientSource).toContain("new PublicClientApplication");
  expect(identityClientSource).toContain("instance.handleRedirectPromise()");
  expect(identityClientSource).toContain("instance.acquireTokenSilent");
  expect(identityClientSource).toContain('cacheLocation: "sessionStorage"');
  expect(identityClientSource).not.toMatch(/client[_-]?secret/i);
});

test("the API verifies Entra tokens and keeps owner access behind an exact verified email match", () => {
  expect(identityServerSource).toContain("createRemoteJWKSet");
  expect(identityServerSource).toContain("jwtVerify(idToken, remoteKeys(uri), { issuer, audience })");
  expect(accountServerSource).toContain("user.email_verified");
  expect(accountServerSource).toContain("user.email?.trim().toLowerCase() === ownerEmail");
});

test("staging health does not claim production alert delivery is configured", () => {
  expect(runtimeConfigSource).toContain('OPERATIONS_ENVIRONMENT?.trim() === "production"');
  expect(runtimeConfigSource).toContain("requiredForProductionOperations");
});

test("staging deploys only to an inactive blue or green revision label", () => {
  expect(azureBicepSource).toContain("activeRevisionsMode: 'Multiple'");
  expect(stagingWorkflowSource).toContain("target_slot:");
  expect(stagingWorkflowSource).toContain('if [[ "${ACTIVE_WEIGHT:-0}" != "0" ]]');
  expect(stagingWorkflowSource).toContain("az containerapp revision label add");
  expect(stagingWorkflowSource).toContain('npm run check:production -- "${TARGET_URL}" "${GITHUB_SHA}"');
});

test("staging promotion verifies an exact commit before changing traffic", () => {
  expect(promotionWorkflowSource).toContain("expected_sha:");
  expect(promotionWorkflowSource).toContain("^[a-fA-F0-9]{40}$");
  expect(promotionWorkflowSource).toContain('npm run check:production -- "$TARGET_URL" "$EXPECTED_SHA"');
  expect(promotionWorkflowSource).toContain('az containerapp ingress traffic set');
  expect(promotionWorkflowSource).toContain('"${TARGET_SLOT}=100" "${OTHER_SLOT}=0"');
});

test("authored-course migration verification compares content rather than counts alone", () => {
  expect(migrationVerifierSource).toContain("canonical(actual.get(path)) !== canonical(expected.get(path))");
  expect(migrationVerifierSource).toContain("actualHash !== expectedHash");
  expect(migrationVerifierSource).toContain("properties.contentType !== object.contentType");
  expect(migrationVerifierSource).toContain("AZURE_COURSE_MIGRATION_CONTENT_VERIFIED");
  expect(dockerfileSource).toContain("scripts/verify-azure-authored-courses.ts");
});
