import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { courseAuthorIdsForAccount } from "../src/lib/course-owner-identity";

type ArmTemplate = {
  parameters: Record<string, { type: string; defaultValue?: unknown }>;
  resources: Array<{ type: string; properties?: Record<string, unknown> }>;
  variables?: Record<string, unknown>;
};

const root = process.cwd();
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const azureCli = process.platform === "win32"
  ? "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd"
  : "az";

function compileBicep(relativePath: string): ArmTemplate {
  const templatePath = resolve(root, relativePath);
  const command = process.platform === "win32"
    ? ["powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `& '${azureCli}' bicep build --file '${templatePath.replaceAll("'", "''")}' --stdout`,
      ]] as const
    : [azureCli, ["bicep", "build", "--file", templatePath, "--stdout"]] as const;
  const result = spawnSync(command[0], command[1], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Unable to compile ${relativePath}: ${result.stderr || result.error?.message || "unknown error"}`);
  }
  return JSON.parse(result.stdout) as ArmTemplate;
}

function runTypeScript(
  source: string,
  reactServer = true,
  environment: Record<string, string> = {},
) {
  return spawnSync(process.execPath, [tsxCli, ...(reactServer ? ["--conditions=react-server"] : []), "-e", source], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      AZURE_EASY_AUTH_ENABLED: "true",
      DIRECT_GOOGLE_AUTH_ENABLED: "true",
      EXTERNAL_ID_AUTH_ENABLED: "false",
      EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "false",
      DATABASE_URL: "postgresql://placeholder.invalid/filosage",
      AZURE_STORAGE_ACCOUNT_URL: "https://placeholder.blob.core.windows.net/",
      AZURE_STORAGE_BANNER_CONTAINER: "course-banners",
      NEXT_PUBLIC_SITE_URL: "https://release.example",
      OPENAI_API_KEY: "release-check-placeholder",
      OWNER_EMAIL: "owner@release.example",
      ACTIVITY_RECEIPT_SECRET: "activity-receipt-secret-at-least-32-characters",
      IDENTITY_LINK_HMAC_SECRET: "identity-link-hmac-secret-at-least-32-characters",
      AZURE_POSTGRES_SERVER_NAME: "filosage-release",
      AZURE_RESOURCE_GROUP: "filosage-release-rg",
      OPERATIONS_ENVIRONMENT: "qa",
      ...environment,
    },
    encoding: "utf8",
  });
}

function compiledContainerEnvironment(template: ArmTemplate): unknown {
  const app = template.resources.find((resource) => resource.type === "Microsoft.App/containerApps");
  const properties = app?.properties as {
    template?: { containers?: Array<{ env?: unknown }> };
  } | undefined;
  return properties?.template?.containers?.[0]?.env;
}

const compiledProductionTemplate = compileBicep("infra/azure/main.bicep");
const compiledQaTemplate = compileBicep("infra/azure/qa.bicep");
const compiledProductionJson = JSON.stringify(compiledProductionTemplate);
const compiledQaJson = JSON.stringify(compiledQaTemplate);

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
const environmentExampleSource = readFileSync(".env.example", "utf8");

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
  expect(infrastructureSource).toContain("Azure Container Apps Easy Auth");
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

test("Azure identity inventory exposes a bounded mode without learner account counts", () => {
  expect(infrastructureSource).toContain("mode: AuthenticationMode");
  expect(infrastructureSource).not.toContain("measuredAccounts");
  expect(healthRouteSource).toContain("authenticationMode: authenticationMode()");
});

test("the executable auth inventory DTO and admin UI reveal only provider, mode, and readiness", () => {
  const dto = runTypeScript(`
    import { azureInfrastructure } from "./src/lib/azure-infrastructure.ts";
    process.stdout.write(JSON.stringify(azureInfrastructure().authentication));
  `);
  expect(dto.status, dto.stderr).toBe(0);
  expect(JSON.parse(dto.stdout)).toEqual({
    provider: "Azure Container Apps Easy Auth",
    mode: "direct-google",
    configured: true,
  });
  expect(dto.stdout).not.toMatch(/account|issuer|client|tenant|secret/i);

  const ui = runTypeScript(`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    void (async () => {
      const { AuthenticationInventorySummary } = await import("./src/app/admin/AuthenticationInventorySummary.tsx");
      process.stdout.write(renderToStaticMarkup(React.createElement(AuthenticationInventorySummary, {
        authentication: { provider: "Azure Container Apps Easy Auth", mode: "direct-google", configured: true }
      })));
    })();
  `, false);
  expect(ui.status, ui.stderr).toBe(0);
  expect(ui.stdout).toContain("Mode: direct-google");
  expect(ui.stdout).not.toMatch(/account|issuer|client|tenant|secret/i);
});

test("runtime health configuration fails closed on unsafe authentication settings without exposing values", () => {
  const valid = runTypeScript(`
    import { missingRuntimeConfiguration } from "./src/lib/runtime-config.ts";
    process.stdout.write(JSON.stringify(missingRuntimeConfiguration()));
  `);
  expect(valid.status, valid.stderr).toBe(0);
  expect(JSON.parse(valid.stdout)).toEqual([]);

  const invalid = runTypeScript(`
    import { missingRuntimeConfiguration } from "./src/lib/runtime-config.ts";
    process.stdout.write(JSON.stringify(missingRuntimeConfiguration()));
  `, true, {
    DIRECT_GOOGLE_AUTH_ENABLED: "false",
    EXTERNAL_ID_AUTH_ENABLED: "false",
    EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "true",
    IDENTITY_LINK_HMAC_SECRET: "do-not-print-this",
  });
  expect(invalid.status, invalid.stderr).toBe(0);
  expect(JSON.parse(invalid.stdout)).toEqual(expect.arrayContaining([
    "authentication: At least one production authentication provider must be enabled.",
    "authentication: EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED.",
    "IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters",
  ]));
  expect(invalid.stdout).not.toContain("do-not-print-this");
});

test("customer sign-in delegates directly to Azure Container Apps Easy Auth", () => {
  expect(identityClientSource).toContain('fetch("/api/auth/session"');
  expect(identityClientSource).toContain('/.auth/login/${provider}?post_login_redirect_uri=');
  expect(identityClientSource).toContain('/.auth/logout?post_logout_redirect_uri=');
  expect(identityClientSource).not.toContain("popup");
});

test("browser authentication uses the Azure-managed session without an auth SDK or client secret", () => {
  expect(packageSource).not.toContain('"firebase"');
  expect(packageSource).not.toContain('"@azure/msal-browser"');
  expect(identityClientSource).toContain('credentials: "same-origin"');
  expect(identityClientSource).not.toMatch(/client[_-]?secret/i);
});

test("the API reads managed Easy Auth identities and keeps owner access behind an exact verified email match", () => {
  expect(identityServerSource).toContain("easyAuthIdentityFromHeaders");
  expect(identityServerSource).toContain("authenticationRuntimeConfiguration");
  expect(identityServerSource).toContain("verifiedEasyAuthIdentity");
  expect(accountServerSource).toContain("user.email_verified");
  expect(accountServerSource).toContain("user.email?.trim().toLowerCase() === ownerEmail");
});

test("compiled Azure templates provision direct Google and an inactive Filosage OIDC provider", () => {
  for (const [template, compiled] of [
    [compiledProductionTemplate, compiledProductionJson],
    [compiledQaTemplate, compiledQaJson],
  ] as const) {
    expect(template.parameters.directGoogleAuthEnabled.defaultValue).toBe(true);
    expect(template.parameters.externalIdAuthEnabled.defaultValue).toBe(false);
    expect(template.parameters.externalIdNewAccountsEnabled.defaultValue).toBe(false);
    expect(compiled).toContain("customOpenIdConnectProviders");
    expect(compiled).toContain("filosage");
    expect(compiled).toContain("ClientSecretPost");
    expect(compiled).toContain("wellKnownOpenIdConfiguration");
    expect(compiled).toContain("allowedAudiences");
    expect(compiled).toContain("external-id-oauth-secret");
    expect(compiled).toContain("identity-link-hmac-secret");
    expect(compiled).toContain("DIRECT_GOOGLE_AUTH_ENABLED");
    expect(compiled).toContain("EXTERNAL_ID_AUTH_ENABLED");
    expect(compiled).toContain("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED");
    expect(compiled).toContain("BILLING_ENABLED");
    expect(String(template.variables?.configuredIdentityProviders)).toContain("variables('externalIdRuntimeEnabled')");
    const environment = compiledContainerEnvironment(template);
    if (Array.isArray(environment)) {
      expect(environment).toContainEqual({ name: "BILLING_ENABLED", value: "false" });
    } else {
      expect(String(environment)).toContain("'BILLING_ENABLED', 'value', 'false'");
    }

    const authConfig = template.resources.find((resource) => resource.type === "Microsoft.App/containerApps/authConfigs");
    expect(authConfig).toBeDefined();
    expect(authConfig?.properties).toMatchObject({
      platform: { enabled: true },
      globalValidation: { unauthenticatedClientAction: "AllowAnonymous" },
      httpSettings: { requireHttps: true },
      login: {
        preserveUrlFragmentsForLogins: true,
        tokenStore: { enabled: false },
      },
    });
  }
});

test("compiled identity secrets remain server-only and use Key Vault references", () => {
  expect(compiledProductionTemplate.parameters.externalIdClientSecret.type).toBe("securestring");
  expect(compiledProductionTemplate.parameters.identityLinkHmacSecret.type).toBe("securestring");
  expect(compiledQaTemplate.parameters.externalIdClientSecretName.defaultValue).toBe("external-id-client-secret-qa");
  expect(compiledQaTemplate.parameters.identityLinkHmacSecretName.defaultValue).toBe("identity-link-hmac-secret-qa");
  expect(compiledQaJson).toContain("secrets/");
  expect(compiledQaJson).toContain("externalIdClientSecretName");
  expect(compiledQaJson).toContain("identityLinkHmacSecretName");
  expect(compiledProductionJson).not.toContain("NEXT_PUBLIC_EXTERNAL_ID");
  expect(compiledQaJson).not.toContain("NEXT_PUBLIC_EXTERNAL_ID");
  expect(environmentExampleSource).not.toContain("EXTERNAL_ID_CLIENT_SECRET");
  expect(environmentExampleSource).not.toContain("NEXT_PUBLIC_EXTERNAL_ID");
  expect(releaseSource).not.toContain("EXTERNAL_ID_CLIENT_SECRET");
});

test("QA activation is explicit while production staging cannot enable External ID", () => {
  expect(qaWorkflowSource).toContain("external_id_auth_enabled:");
  expect(qaWorkflowSource).toContain("external_id_new_accounts_enabled:");
  expect(qaWorkflowSource).toContain("inputs.external_id_auth_enabled");
  expect(qaWorkflowSource).toContain("inputs.external_id_new_accounts_enabled");
  expect(qaWorkflowSource).not.toContain("Enable the already-configured QA custom OIDC provider for acceptance");
  expect(qaWorkflowSource).toContain("Open the application acceptance gate only after the filosage Easy Auth provider is separately approved, configured, and enabled");
  expect(qaWorkflowSource).toContain("New External ID accounts require the QA External ID provider to be enabled.");
  expect(qaWorkflowSource).toContain('"DIRECT_GOOGLE_AUTH_ENABLED=true"');
  expect(qaWorkflowSource).toContain("customOpenIdConnectProviders.filosage.enabled");
  expect(qaWorkflowSource).toContain("check-qa-auth-provider-state.mjs");
  expect(qaWorkflowSource).toContain('"BILLING_ENABLED=false"');
  expect(qaWorkflowSource).not.toMatch(/az containerapp auth (?:openid-connect )?(?:update|set|delete)/);
  expect(stagingWorkflowSource).toContain('"DIRECT_GOOGLE_AUTH_ENABLED=true"');
  expect(stagingWorkflowSource).toContain('"EXTERNAL_ID_AUTH_ENABLED=false"');
  expect(stagingWorkflowSource).toContain('"EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false"');
  expect(stagingWorkflowSource).toContain('"BILLING_ENABLED=false"');
  expect(stagingWorkflowSource).not.toContain("external_id_auth_enabled:");
  expect(stagingWorkflowSource).not.toContain("external_id_new_accounts_enabled:");
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
  expect(qaWorkflowSource).toContain('--build-arg "NEXT_PUBLIC_COMMAND_CENTER_V2=true"');
  expect(qaWorkflowSource).toContain('"NEXT_PUBLIC_COMMAND_CENTER_V2=true"');
  expect(qaBicepSource).toContain("NEXT_PUBLIC_COMMAND_CENTER_V2', value: 'true'");
  expect(dockerfileSource).toContain("ARG NEXT_PUBLIC_COMMAND_CENTER_V2=false");
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
  expect(healthRouteSource).toContain("origin,");
  expect(healthRouteSource).toContain("checks:");
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
