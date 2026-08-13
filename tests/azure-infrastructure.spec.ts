import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { easyAuthIdentityFromHeaders } from "../src/lib/easy-auth-principal";
import { courseAuthorIdsForAccount } from "../src/lib/course-owner-identity";

const infrastructureSource = readFileSync("src/lib/azure-infrastructure.ts", "utf8");
const releaseSource = readFileSync("scripts/check-release-env.mjs", "utf8");
const identityClientSource = readFileSync("src/lib/identity-client.ts", "utf8");
const identityServerSource = readFileSync("src/lib/identity-server.ts", "utf8");
const accountServerSource = readFileSync("src/lib/account-server.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const runtimeConfigSource = readFileSync("src/lib/runtime-config.ts", "utf8");
const stagingWorkflowSource = readFileSync(".github/workflows/azure-staging.yml", "utf8");
const qaWorkflowSource = readFileSync(".github/workflows/azure-qa.yml", "utf8");
const promotionWorkflowSource = readFileSync(".github/workflows/azure-promote-staging.yml", "utf8");
const azureBicepSource = readFileSync("infra/azure/main.bicep", "utf8");
const qaBicepSource = readFileSync("infra/azure/qa.bicep", "utf8");
const robotsSource = readFileSync("src/app/robots.ts", "utf8");
const sitemapSource = readFileSync("src/app/sitemap.ts", "utf8");
const proxySourceWithQa = readFileSync("src/proxy.ts", "utf8");
const migrationVerifierSource = readFileSync("scripts/verify-azure-authored-courses.ts", "utf8");
const migrationCompletionSource = readFileSync("scripts/complete-azure-course-bundle.ts", "utf8");
const migrationImporterSource = readFileSync("scripts/import-azure-authored-courses.ts", "utf8");
const dockerfileSource = readFileSync("Dockerfile", "utf8");
const healthRouteSource = readFileSync("src/app/api/health/route.ts", "utf8");
const healthVerifierSource = readFileSync("scripts/check-production-health.mjs", "utf8");
const proxySource = readFileSync("src/proxy.ts", "utf8");
const rootLayoutSource = readFileSync("src/app/layout.tsx", "utf8");
const appShellSource = readFileSync("src/components/AppShell.tsx", "utf8");
const marketingNavigationSource = readFileSync("src/components/marketing/MarketingNavigation.tsx", "utf8");
const globalStylesSource = readFileSync("src/app/globals.css", "utf8");

test("the QA environment indicator participates in header layout instead of overlaying the interface", () => {
  const environmentPillRule = globalStylesSource.match(/\.environment-pill\s*\{([^}]*)\}/)?.[1];

  expect(rootLayoutSource).not.toContain("environment-banner");
  expect(appShellSource).toContain("<EnvironmentPill />");
  expect(marketingNavigationSource).toContain("<EnvironmentPill />");
  expect(globalStylesSource).toContain('html[data-environment="qa"] .environment-pill');
  expect(environmentPillRule).toBeDefined();
  expect(environmentPillRule).not.toMatch(/position:\s*(?:fixed|absolute)/);
});

test("Azure infrastructure inventory names every production platform service", () => {
  expect(infrastructureSource).toContain("Azure Container Apps Easy Auth (Google)");
  expect(infrastructureSource).toContain("Azure Database for PostgreSQL");
  expect(infrastructureSource).toContain("Azure Blob Storage");
  expect(infrastructureSource).toContain("Azure Container Apps");
  expect(infrastructureSource).toContain("Azure Monitor and Log Analytics");
});

test("production release validation requires Azure services and Easy Auth", () => {
  expect(releaseSource).toContain('"DATABASE_URL"');
  expect(releaseSource).toContain('"AZURE_EASY_AUTH_ENABLED"');
  expect(releaseSource).toContain('"AZURE_STORAGE_ACCOUNT_URL"');
  expect(releaseSource).not.toContain('"NEXT_PUBLIC_FIREBASE_API_KEY"');
  expect(releaseSource).not.toContain('"NEXT_PUBLIC_ENTRA_CLIENT_ID"');
  expect(releaseSource).not.toContain('"FIRESTORE_BACKUP_BUCKET"');
});

test("Azure status avoids presenting configuration as invoice or restore proof", () => {
  expect(infrastructureSource).toContain("not invoice-grade Azure cost");
  expect(infrastructureSource).toContain("configuration alone is not recovery proof");
});

test("customer sign-in delegates directly to Azure Container Apps Easy Auth", () => {
  expect(identityClientSource).toContain('fetch("/api/auth/session"');
  expect(identityClientSource).toContain('/.auth/login/google?post_login_redirect_uri=');
  expect(identityClientSource).toContain('/.auth/logout?post_logout_redirect_uri=');
  expect(identityClientSource).not.toContain("popup");
});

test("browser authentication uses the Azure-managed session without an auth SDK or client secret", () => {
  expect(packageSource).not.toContain('"firebase"');
  expect(packageSource).not.toContain('"@azure/msal-browser"');
  expect(identityClientSource).toContain('credentials: "same-origin"');
  expect(identityClientSource).not.toMatch(/client[_-]?secret/i);
});

test("the API trusts only Azure-injected Google claims and keeps owner access behind an exact verified email match", () => {
  expect(identityServerSource).toContain("easyAuthIdentityFromHeaders");
  expect(identityServerSource).toContain('AZURE_EASY_AUTH_ENABLED');
  expect(accountServerSource).toContain("user.email_verified");
  expect(accountServerSource).toContain("user.email?.trim().toLowerCase() === ownerEmail");
});

test("only the verified owner inherits the legacy Firebase course-author identity", () => {
  expect(courseAuthorIdsForAccount(
    { uid: "google-owner-subject", isOwner: true },
    "firebase-owner-uid",
  )).toEqual(["google-owner-subject", "firebase-owner-uid"]);
  expect(courseAuthorIdsForAccount(
    { uid: "google-learner-subject", isOwner: false },
    "firebase-owner-uid",
  )).toEqual(["google-learner-subject"]);
  expect(courseAuthorIdsForAccount(
    { uid: "same-id", isOwner: true },
    "same-id",
  )).toEqual(["same-id"]);
});

test("Easy Auth principal parsing fails closed and accepts only verified Google identity data", () => {
  const principal = Buffer.from(JSON.stringify({
    auth_typ: "google",
    claims: [
      { typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", val: "Owner@Example.com" },
      { typ: "name", val: "Owner" },
      { typ: "auth_time", val: "1750000000" },
      { typ: "email_verified", val: "true" },
    ],
  })).toString("base64");
  const headers = new Headers({
    "x-ms-client-principal": principal,
    "x-ms-client-principal-id": "google-subject",
    "x-ms-client-principal-idp": "google",
    "x-ms-client-principal-name": "Owner@Example.com",
  });
  expect(easyAuthIdentityFromHeaders(headers, true)).toEqual({
    uid: "google-subject",
    email: "owner@example.com",
    email_verified: true,
    auth_time: 1_750_000_000,
    name: "Owner",
    picture: undefined,
  });
  expect(easyAuthIdentityFromHeaders(headers, false)).toBeNull();
  headers.set("x-ms-client-principal-idp", "aad");
  expect(easyAuthIdentityFromHeaders(headers, true)).toBeNull();
});

test("Easy Auth principal parsing rejects unverified or malformed email claims", () => {
  const encoded = (email: string, verified: string) => Buffer.from(JSON.stringify({
    auth_typ: "google",
    claims: [
      { typ: "email", val: email },
      { typ: "email_verified", val: verified },
      { typ: "sub", val: "subject" },
    ],
  })).toString("base64");
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal": encoded("learner@example.com", "false"),
  }), true)).toBeNull();
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal": encoded("not-an-email", "true"),
  }), true)).toBeNull();
});

test("staging health does not claim production alert delivery is configured", () => {
  expect(runtimeConfigSource).toContain('OPERATIONS_ENVIRONMENT?.trim() === "production"');
  expect(runtimeConfigSource).toContain("requiredForProductionOperations");
});

test("isolated QA scales to zero and keeps its data stores separate", () => {
  expect(qaBicepSource).toContain("qaDatabaseName string = 'filosageqa'");
  expect(qaBicepSource).toContain("qaBannerContainerName string = 'qa-course-banners'");
  expect(qaBicepSource).toContain("minReplicas: 0");
  expect(qaBicepSource).toContain("maxReplicas: 1");
  expect(qaBicepSource).toContain("OPERATIONS_ENVIRONMENT', value: 'qa'");
  expect(qaBicepSource).toContain("param deploymentPrincipalId string = ''");
  expect(qaBicepSource).toContain("param deploymentRoleAssignmentName string = ''");
  expect(qaBicepSource).toContain("resource qaDeploymentContributor");
  expect(qaBicepSource).toContain("scope: app");
  expect(qaWorkflowSource).toContain("AZURE_QA_CONTAINER_APP_NAME");
  expect(qaWorkflowSource).toContain('npm run check:production -- "$QA_URL" "$GITHUB_SHA" "$QA_URL"');
  expect(robotsSource).toContain('disallow: "/"');
  expect(robotsSource).toContain('export const dynamic = "force-dynamic"');
  expect(sitemapSource).toContain('export const dynamic = "force-dynamic"');
  expect(proxySourceWithQa).toContain('X-Robots-Tag');
});

test("production staging accepts only the exact image already approved in QA", () => {
  expect(azureBicepSource).toContain("activeRevisionsMode: 'Multiple'");
  expect(stagingWorkflowSource).toContain("target_slot:");
  expect(stagingWorkflowSource).toContain("expected_sha:");
  expect(stagingWorkflowSource).toContain('npm run check:production -- "$QA_URL" "$EXPECTED_SHA" "$QA_URL"');
  expect(stagingWorkflowSource).toContain('az acr repository show');
  expect(stagingWorkflowSource).toContain('filosage@${DIGEST}');
  expect(stagingWorkflowSource).toContain('if [[ "${ACTIVE_WEIGHT:-0}" != "0" ]]');
  expect(stagingWorkflowSource).toContain("az containerapp revision label add");
  expect(stagingWorkflowSource).toContain('"AZURE_EASY_AUTH_ENABLED=true"');
  expect(stagingWorkflowSource).not.toContain("NEXT_PUBLIC_FIREBASE_API_KEY");
  expect(stagingWorkflowSource).not.toContain("docker build");
  expect(stagingWorkflowSource).toContain('npm run check:production -- "${TARGET_URL}" "${EXPECTED_SHA}" "${PUBLIC_SITE_URL}"');
});

test("custom-domain releases prove their canonical origin and redirect www to the apex", () => {
  expect(healthRouteSource).toContain("origin, checks:");
  expect(healthVerifierSource).toContain("EXPECTED_SITE_ORIGIN");
  expect(healthVerifierSource).toContain("body?.origin === expectedOrigin");
  expect(proxySource).toContain('host === "www.filosage.com"');
  expect(proxySource).toContain("securityHeaders(");
  expect(proxySource).toContain('destination.hostname = "filosage.com"');
  expect(proxySource).toContain("NextResponse.redirect(destination, 308)");
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

test("migration completion restores immutable release snapshots without overwriting source documents", () => {
  expect(migrationCompletionSource).toContain('flag: "wx"');
  expect(migrationCompletionSource).toContain("publicationContentFingerprint");
  expect(migrationCompletionSource).toContain("courseReleases/${releaseId}");
  expect(migrationCompletionSource).toContain("canonical-published-documents");
  expect(migrationImporterSource).toContain("--missing-only");
  expect(migrationImporterSource).toContain("conflicting data");
  expect(migrationVerifierSource).toContain("path LIKE 'courseReleases/%'");
});
