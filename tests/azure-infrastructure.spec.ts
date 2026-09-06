import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { courseAuthorIdsForAccount } from "../src/lib/course-owner-identity";
import { RETIRED_SYSTEM_NAMES } from "./fixtures/retired-system-names";

type ArmTemplate = {
  parameters: Record<string, { type: string; defaultValue?: unknown }>;
  resources: Array<{ type: string; properties?: Record<string, unknown> }>;
  variables?: Record<string, unknown>;
};

const root = process.cwd();
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
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", ...(reactServer ? ["--conditions=react-server"] : []), "-e", source], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      AZURE_EASY_AUTH_ENABLED: "true",
      DIRECT_GOOGLE_AUTH_ENABLED: "true",
      EXTERNAL_ID_AUTH_ENABLED: "false",
      EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "false",
      BILLING_ENABLED: "false",
      BILLING_ROLLOUT_MODE: "closed",
      STRIPE_TAX_READY: "false",
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

function compiledContainerProbes(template: ArmTemplate): unknown {
  const app = template.resources.find((resource) => resource.type === "Microsoft.App/containerApps");
  const properties = app?.properties as {
    template?: { containers?: Array<{ probes?: unknown }> };
  } | undefined;
  return properties?.template?.containers?.[0]?.probes;
}

const compiledProductionTemplate = compileBicep("infra/azure/main.bicep");
const compiledProductionJson = JSON.stringify(compiledProductionTemplate);

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
const robotsSource = readFileSync("src/app/robots.ts", "utf8");
const sitemapSource = readFileSync("src/app/sitemap.ts", "utf8");
const proxySourceWithQa = readFileSync("src/proxy.ts", "utf8");
const migrationVerifierSource = readFileSync("scripts/verify-azure-authored-courses.ts", "utf8");
const migrationCompletionSource = readFileSync("scripts/complete-azure-course-bundle.ts", "utf8");
const migrationImporterSource = readFileSync("scripts/import-azure-authored-courses.ts", "utf8");
const dockerfileSource = readFileSync("Dockerfile", "utf8");
const healthRouteSource = readFileSync("src/app/api/health/route.ts", "utf8");
const healthVerifierSource = readFileSync("scripts/check-production-health.mjs", "utf8");
const featuredCourseVerifierSource = readFileSync("scripts/check-featured-course.mjs", "utf8");
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
  expect(releaseSource).not.toContain(`"NEXT_PUBLIC_${RETIRED_SYSTEM_NAMES[2].toUpperCase()}_API_KEY"`);
  expect(releaseSource).not.toContain('"NEXT_PUBLIC_ENTRA_CLIENT_ID"');
  expect(releaseSource).not.toContain(`"${RETIRED_SYSTEM_NAMES[1].toUpperCase()}_BACKUP_BUCKET"`);
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

  const invalidDto = runTypeScript(`
    import { azureInfrastructure } from "./src/lib/azure-infrastructure.ts";
    process.stdout.write(JSON.stringify(azureInfrastructure().authentication));
  `, true, {
    DIRECT_GOOGLE_AUTH_ENABLED: "not-a-boolean",
  });
  expect(invalidDto.status, invalidDto.stderr).toBe(0);
  expect(JSON.parse(invalidDto.stdout)).toEqual({
    provider: "Azure Container Apps Easy Auth",
    mode: "unavailable",
    configured: false,
  });

  const invalidUi = runTypeScript(`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    void (async () => {
      const { AuthenticationInventorySummary } = await import("./src/app/admin/AuthenticationInventorySummary.tsx");
      process.stdout.write(renderToStaticMarkup(React.createElement(AuthenticationInventorySummary, {
        authentication: { provider: "Azure Container Apps Easy Auth", mode: "unavailable", configured: true }
      })));
    })();
  `, false);
  expect(invalidUi.status, invalidUi.stderr).toBe(0);
  expect(invalidUi.stdout).toContain("Missing");
  expect(invalidUi.stdout).not.toContain("Ready");
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

  for (const [name, value] of [
    ["AZURE_EASY_AUTH_ENABLED", "yes"],
    ["DIRECT_GOOGLE_AUTH_ENABLED", "1"],
    ["EXTERNAL_ID_AUTH_ENABLED", "enabled"],
    ["EXTERNAL_ID_NEW_ACCOUNTS_ENABLED", "TRUE"],
    ["BILLING_ENABLED", "FALSE"],
  ] as const) {
    const malformed = runTypeScript(`
      import { missingRuntimeConfiguration } from "./src/lib/runtime-config.ts";
      process.stdout.write(JSON.stringify(missingRuntimeConfiguration()));
    `, true, { [name]: value });
    expect(malformed.status, malformed.stderr).toBe(0);
    const expectedIssue = `${name} must be exactly true or false`;
    expect(JSON.parse(malformed.stdout), name).toContain(
      name === "BILLING_ENABLED" ? expectedIssue : `authentication: ${expectedIssue}`,
    );
  }

  for (const [label, environment, expectedIssue] of [
    ["Easy Auth disabled", { AZURE_EASY_AUTH_ENABLED: "false" }, "AZURE_EASY_AUTH_ENABLED must be exactly true"],
    ["billing enabled", { BILLING_ENABLED: "true" }, "BILLING_ENABLED must be false while BILLING_ROLLOUT_MODE is closed"],
    ["External ID client missing", {
      DIRECT_GOOGLE_AUTH_ENABLED: "false",
      EXTERNAL_ID_AUTH_ENABLED: "true",
      EXTERNAL_ID_CLIENT_ID: "",
      EXTERNAL_ID_ISSUER: "https://tenant.example/v2.0",
      EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "https://tenant.example/.well-known/openid-configuration",
    }, "EXTERNAL_ID_CLIENT_ID is required when External ID is enabled"],
    ["External ID issuer insecure", {
      DIRECT_GOOGLE_AUTH_ENABLED: "false",
      EXTERNAL_ID_AUTH_ENABLED: "true",
      EXTERNAL_ID_CLIENT_ID: "external-client-id",
      EXTERNAL_ID_ISSUER: "http://tenant.example/v2.0",
      EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "https://tenant.example/.well-known/openid-configuration",
    }, "EXTERNAL_ID_ISSUER must be a valid HTTPS URL"],
    ["External ID discovery insecure", {
      DIRECT_GOOGLE_AUTH_ENABLED: "false",
      EXTERNAL_ID_AUTH_ENABLED: "true",
      EXTERNAL_ID_CLIENT_ID: "external-client-id",
      EXTERNAL_ID_ISSUER: "https://tenant.example/v2.0",
      EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "http://tenant.example/.well-known/openid-configuration",
    }, "EXTERNAL_ID_WELL_KNOWN_CONFIGURATION must be a valid HTTPS URL"],
  ] as const) {
    const result = runTypeScript(`
      import { authenticationMode, missingRuntimeConfiguration } from "./src/lib/runtime-config.ts";
      process.stdout.write(JSON.stringify({
        issues: missingRuntimeConfiguration(),
        mode: authenticationMode(),
      }));
    `, true, environment);
    expect(result.status, `${label}: ${result.stderr}`).toBe(0);
    const body = JSON.parse(result.stdout) as { issues: string[]; mode: string };
    expect(body.issues, label).toContain(
      label === "billing enabled" ? expectedIssue : `authentication: ${expectedIssue}`,
    );
    if (label !== "billing enabled") expect(body.mode, label).toBe("unavailable");
  }
});

test("bounded authentication modes require complete valid provider configuration", () => {
  for (const [label, environment, expectedMode] of [
    ["direct Google", {}, "direct-google"],
    ["External ID", {
      DIRECT_GOOGLE_AUTH_ENABLED: "false",
      EXTERNAL_ID_AUTH_ENABLED: "true",
      EXTERNAL_ID_CLIENT_ID: "external-client-id",
      EXTERNAL_ID_ISSUER: "https://tenant.example/v2.0",
      EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "https://tenant.example/.well-known/openid-configuration",
    }, "external-id"],
    ["migration dual", {
      EXTERNAL_ID_AUTH_ENABLED: "true",
      EXTERNAL_ID_CLIENT_ID: "external-client-id",
      EXTERNAL_ID_ISSUER: "https://tenant.example/v2.0",
      EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "https://tenant.example/.well-known/openid-configuration",
    }, "migration-dual"],
  ] as const) {
    const result = runTypeScript(`
      import { authenticationMode, missingRuntimeConfiguration } from "./src/lib/runtime-config.ts";
      process.stdout.write(JSON.stringify({
        issues: missingRuntimeConfiguration(),
        mode: authenticationMode(),
      }));
    `, true, environment);
    expect(result.status, `${label}: ${result.stderr}`).toBe(0);
    expect(JSON.parse(result.stdout), label).toEqual({ issues: [], mode: expectedMode });
  }
});

test("public health fails closed without publishing authentication issue details", () => {
  const result = runTypeScript(`
    import { GET } from "./src/app/api/health/route.ts";
    void GET().then(async (response) => {
      process.stdout.write(JSON.stringify({ status: response.status, body: await response.json() }));
    });
  `, true, {
    EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "true",
  });
  expect(result.status, result.stderr).toBe(0);
  const response = JSON.parse(result.stdout) as {
    status: number;
    body: Record<string, unknown> & { checks: { configuration: boolean }; authenticationMode: string };
  };
  expect(response.status).toBe(503);
  expect(response.body.checks.configuration).toBe(false);
  expect(response.body.authenticationMode).toBe("unavailable");
  expect(JSON.stringify(response.body)).not.toMatch(/issue|EXTERNAL_ID|client|issuer|secret/i);
});

test("container health probes separate process liveness from dependency readiness", () => {
  const livenessSource = readFileSync("src/app/api/health/live/route.ts", "utf8");
  const readinessSource = readFileSync("src/app/api/health/ready/route.ts", "utf8");
  const startupSource = readFileSync("src/app/api/health/startup/route.ts", "utf8");

  expect(livenessSource).not.toContain("getStoredDocument");
  expect(startupSource).not.toContain("getStoredDocument");
  expect(readinessSource).toContain("checkDocumentStoreReadiness");
  expect(readinessSource).toContain("DATASTORE_READINESS_DEADLINE_MS = 3_500");
  expect(readinessSource).not.toContain("reportOperationalEvent");
  for (const source of [livenessSource, readinessSource, startupSource]) {
    expect(source).toContain("Cache-Control");
    expect(source).toContain("no-store");
  }

  const expectedProbes = [
    {
      type: "Startup",
      httpGet: { path: "/api/health/startup", port: 3000, scheme: "HTTP" },
      initialDelaySeconds: 5,
      periodSeconds: 10,
      timeoutSeconds: 5,
      failureThreshold: 10,
      successThreshold: 1,
    },
    {
      type: "Liveness",
      httpGet: { path: "/api/health/live", port: 3000, scheme: "HTTP" },
      initialDelaySeconds: 10,
      periodSeconds: 30,
      timeoutSeconds: 5,
      failureThreshold: 3,
      successThreshold: 1,
    },
    {
      type: "Readiness",
      httpGet: { path: "/api/health/ready", port: 3000, scheme: "HTTP" },
      initialDelaySeconds: 5,
      periodSeconds: 15,
      timeoutSeconds: 5,
      failureThreshold: 3,
      successThreshold: 1,
    },
  ];
  expect(compiledContainerProbes(compiledProductionTemplate)).toEqual(expectedProbes);

  for (const [name, modulePath, expectedStatus] of [
    ["liveness", "live", 200],
    ["startup", "startup", 200],
    ["readiness", "ready", 503],
  ] as const) {
    const result = runTypeScript(`
      import { GET } from "./src/app/api/health/${modulePath}/route.ts";
      void GET().then(async (response) => {
        process.stdout.write(JSON.stringify({
          status: response.status,
          cacheControl: response.headers.get("cache-control"),
          body: await response.json(),
        }));
      });
    `, true, { EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "true" });
    expect(result.status, `${name}: ${result.stderr}`).toBe(0);
    const response = JSON.parse(result.stdout) as {
      status: number;
      cacheControl: string;
      body: Record<string, unknown>;
    };
    expect(response.status, name).toBe(expectedStatus);
    expect(response.cacheControl, name).toBe("no-store");
    expect(JSON.stringify(response.body), name).not.toMatch(/issue|EXTERNAL_ID|client|issuer|secret/i);
  }
});

test("readiness returns before the platform probe deadline when a dependency never settles", () => {
  const result = runTypeScript(`
    import { checkWithinDeadline } from "./src/lib/readiness-deadline.ts";
    const startedAt = Date.now();
    void checkWithinDeadline(() => new Promise(() => {}), 25).then((ready) => {
      process.stdout.write(JSON.stringify({ ready, elapsedMs: Date.now() - startedAt }));
    });
  `, false);
  expect(result.status, result.stderr).toBe(0);
  const response = JSON.parse(result.stdout) as { ready: boolean; elapsedMs: number };
  expect(response.ready).toBe(false);
  expect(response.elapsedMs).toBeGreaterThanOrEqual(20);
  expect(response.elapsedMs).toBeLessThan(500);
});

test("customer sign-in delegates directly to Azure Container Apps Easy Auth", () => {
  expect(identityClientSource).toContain('fetch("/api/auth/session"');
  expect(identityClientSource).toContain('/.auth/login/${provider}?post_login_redirect_uri=');
  expect(identityClientSource).toContain('/.auth/logout?post_logout_redirect_uri=');
  expect(identityClientSource).not.toContain("popup");
});

test("browser authentication uses the Azure-managed session without an auth SDK or client secret", () => {
  expect(packageSource).not.toContain(`"${RETIRED_SYSTEM_NAMES[2]}"`);
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
  expect(compiledProductionTemplate.parameters.directGoogleAuthEnabled.defaultValue).toBe(true);
  expect(compiledProductionTemplate.parameters.externalIdAuthEnabled.defaultValue).toBe(false);
  expect(compiledProductionTemplate.parameters.externalIdNewAccountsEnabled.defaultValue).toBe(false);
  for (const [template, compiled] of [
    [compiledProductionTemplate, compiledProductionJson],
  ] as const) {
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
    const configuredIdentityProviders = String(template.variables?.configuredIdentityProviders);
    expect(configuredIdentityProviders).toContain("variables('externalIdRuntimeEnabled')");
    expect(configuredIdentityProviders.split("customOpenIdConnectProviders")[1]).not.toContain("'validation'");
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
  expect(compiledProductionJson).not.toContain("NEXT_PUBLIC_EXTERNAL_ID");
  expect(environmentExampleSource).not.toContain("EXTERNAL_ID_CLIENT_SECRET");
  expect(environmentExampleSource).not.toContain("NEXT_PUBLIC_EXTERNAL_ID");
  expect(releaseSource).not.toContain("EXTERNAL_ID_CLIENT_SECRET");
});

test("release workflows preserve shared authentication without provider mutation", () => {
  const deployment = readFileSync("scripts/azure-blue-green.mjs", "utf8");
  for (const workflow of [stagingWorkflowSource, promotionWorkflowSource]) {
    expect(workflow).toContain("expected_auth_mode:");
    expect(workflow).toContain("EXPECTED_AUTH_MODE: ${{ inputs.expected_auth_mode }}");
    expect(workflow).not.toContain("external_id_new_accounts_enabled:");
    expect(workflow).not.toContain("qa_run_id");
  }
  expect(deployment).toContain('authConfigurationHash(auth.properties || auth, expectedMode)');
  expect(deployment).toContain('"--from-revision", live.revisionName');
  expect(deployment).not.toMatch(/"auth", "(?:update|set|delete)"/);
  expect(deployment).not.toContain('"revision", "set-mode"');
});

test("only the verified owner inherits the migrated course-author identity", () => {
  expect(courseAuthorIdsForAccount(
    { uid: "google-owner-subject", isOwner: true },
    "migrated-owner-uid",
  )).toEqual(["google-owner-subject", "migrated-owner-uid"]);
  expect(courseAuthorIdsForAccount(
    { uid: "google-learner-subject", isOwner: false },
    "migrated-owner-uid",
  )).toEqual(["google-learner-subject"]);
  expect(courseAuthorIdsForAccount(
    { uid: "same-id", isOwner: true },
    "same-id",
  )).toEqual(["same-id"]);
});

test("production candidates fail closed until signed alert delivery is configured", () => {
  expect(runtimeConfigSource).toContain('deploymentEnvironment === "production"');
  expect(runtimeConfigSource).toContain('operationsEnvironment !== "production"');
  expect(runtimeConfigSource).toContain("requiredForProductionOperations");
  expect(azureBicepSource).toContain("OPERATIONS_ENVIRONMENT', value: 'production'");
  expect(azureBicepSource).toContain("DEPLOYMENT_ENVIRONMENT', value: 'production'");
  expect(readFileSync("scripts/azure-blue-green.mjs", "utf8")).toContain('"--from-revision", live.revisionName');

  for (const [label, environment, expectedIssue] of [
    ["production deployment missing operations label", {
      DEPLOYMENT_ENVIRONMENT: "production",
      OPERATIONS_ENVIRONMENT: "",
    }, "OPERATIONS_ENVIRONMENT must be production"],
    ["invalid deployment label", {
      DEPLOYMENT_ENVIRONMENT: "prod",
      OPERATIONS_ENVIRONMENT: "qa",
    }, "DEPLOYMENT_ENVIRONMENT must be qa or production"],
    ["invalid operations label", {
      DEPLOYMENT_ENVIRONMENT: "qa",
      OPERATIONS_ENVIRONMENT: "prod",
    }, "OPERATIONS_ENVIRONMENT must be qa or production"],
    ["missing receiver", { OPERATIONS_ENVIRONMENT: "production" }, "OPERATIONS_ALERT_WEBHOOK_URL"],
    ["insecure receiver", {
      OPERATIONS_ENVIRONMENT: "production",
      OPERATIONS_ALERT_WEBHOOK_URL: "http://alerts.example/filosage",
      OPERATIONS_ALERT_WEBHOOK_SECRET: "a".repeat(32),
    }, "OPERATIONS_ALERT_WEBHOOK_URL must be a valid HTTPS URL"],
    ["weak signing secret", {
      OPERATIONS_ENVIRONMENT: "production",
      OPERATIONS_ALERT_WEBHOOK_URL: "https://alerts.example/filosage",
      OPERATIONS_ALERT_WEBHOOK_SECRET: "short",
    }, "OPERATIONS_ALERT_WEBHOOK_SECRET must contain at least 32 characters"],
  ] as const) {
    const result = runTypeScript(`
      import { missingRuntimeConfiguration } from "./src/lib/runtime-config.ts";
      process.stdout.write(JSON.stringify(missingRuntimeConfiguration()));
    `, true, environment);
    expect(result.status, `${label}: ${result.stderr}`).toBe(0);
    const issues = JSON.parse(result.stdout) as string[];
    expect(issues.some((issue) => issue.includes(expectedIssue)), label).toBe(true);
  }
});

test("the separate QA deployment is retired and labels remain discoverable only as candidates", () => {
  expect(existsSync("infra/azure/qa.bicep")).toBe(false);
  expect(existsSync(".github/workflows/azure-qa.yml")).toBe(false);
  expect(azureBicepSource).toContain("activeRevisionsMode: 'Multiple'");
  expect(azureBicepSource).toContain("traffic: revisionTraffic");
  expect(robotsSource).toContain('disallow: "/"');
  expect(robotsSource).toContain('export const dynamic = "force-dynamic"');
  expect(sitemapSource).toContain('export const dynamic = "force-dynamic"');
  expect(proxySourceWithQa).toContain('X-Robots-Tag');
});

test("one immutable application image owns the approved features at build and runtime", () => {
  for (const stage of [dockerfileSource.split("FROM dependencies AS builder")[1]?.split("FROM dependencies AS production-dependencies")[0] || "", dockerfileSource.split("FROM node:22-bookworm-slim AS runtime")[1] || ""]) {
    expect(stage).toContain("ARG FLASHCARD_DECKS_ENABLED=false");
    expect(stage).toContain("ARG FLASHCARD_AI_GENERATION_ENABLED=false");
    expect(stage).toContain("ENV FLASHCARD_DECKS_ENABLED=$FLASHCARD_DECKS_ENABLED");
    expect(stage).toContain("ENV FLASHCARD_AI_GENERATION_ENABLED=$FLASHCARD_AI_GENERATION_ENABLED");
  }
  expect(stagingWorkflowSource).toContain('"${BUILD_ARGS[@]}"');
  expect(stagingWorkflowSource).toContain('--target runtime');
  expect(dockerfileSource).toContain("node scripts/release-capabilities.mjs check-environment");
  expect(readFileSync("scripts/azure-blue-green.mjs", "utf8")).toContain("...releaseEnvironment(manifest)");
  expect(healthRouteSource).toContain("flashcardFeatureConfiguration");
  expect(healthVerifierSource).toContain("releaseSelectionMatches(expectedCapabilities, body?.capabilities)");
  expect(healthVerifierSource).toContain("body?.imageDigest === expectedDigest");
});

test("staging builds once after engineering evidence and promotion never rebuilds", () => {
  expect(stagingWorkflowSource).toContain("quality_run_id:");
  expect(stagingWorkflowSource).toContain("regression_run_id:");
  expect(stagingWorkflowSource).toContain("az acr build");
  expect(stagingWorkflowSource).toContain("node scripts/azure-blue-green.mjs preflight");
  expect(stagingWorkflowSource).toContain("node scripts/azure-blue-green.mjs stage");
  expect(promotionWorkflowSource).not.toContain("az acr build");
  expect(promotionWorkflowSource).not.toContain("docker build");
  expect(promotionWorkflowSource).toContain("candidate_run_id:");
  expect(promotionWorkflowSource).toContain("verification_run_id:");
});

test("custom-domain releases prove their canonical origin and redirect www to the apex", () => {
  expect(healthRouteSource).toContain("origin,");
  expect(healthRouteSource).toContain("checks: {");
  expect(healthVerifierSource).toContain("EXPECTED_SITE_ORIGIN");
  expect(healthVerifierSource).toContain("body?.origin === expectedOrigin");
  expect(proxySource).toContain('host === "www.filosage.com"');
  expect(proxySource).toContain("securityHeaders(");
  expect(proxySource).toContain('destination.hostname = "filosage.com"');
  expect(proxySource).toContain("NextResponse.redirect(destination, 308)");
});

test("promotion checks immutable identity and retains measured traffic evidence", () => {
  const deployment = readFileSync("scripts/azure-blue-green.mjs", "utf8");
  expect(deployment).toContain("sha !== env.GITHUB_SHA");
  expect(deployment).toContain("assertCandidateReadback");
  expect(deployment).toContain("candidateFingerprint");
  expect(deployment).toContain('"--revision-weight", `${candidate.revision}=100`, `${candidate.previous.revision}=0`');
  expect(deployment).toContain('smoke(candidate, candidate.productionOrigin)');
  expect(deployment).toContain('signedInPostSwap: "pending operator evidence"');
});

test("featured-course release verification fails closed around one explicit public course ID", () => {
  expect(packageSource).toContain('"check:featured-course": "node scripts/check-featured-course.mjs"');
  expect(featuredCourseVerifierSource).toContain('expectedCourseId === "none"');
  expect(featuredCourseVerifierSource).toContain("^[a-fA-F0-9]{64}$");
  expect(featuredCourseVerifierSource).toContain('payload.featuredCourseId !== expectedCourseId');
  expect(featuredCourseVerifierSource).toContain('courses.some((course) => course?.id === expectedCourseId)');
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

test("authored-course import preflight reports bounded counts without the owner email", () => {
  const directory = mkdtempSync(join(tmpdir(), "filosage-import-preflight-"));
  const bundlePath = join(directory, "bundle.json");
  const ownerEmail = "private-owner+migration@example.test";
  writeFileSync(bundlePath, JSON.stringify({
    schemaVersion: 2,
    owner: { uid: "migration-owner", email: ownerEmail },
    documents: [{
      path: "courses/migration-course",
      fields: { authorId: { stringValue: "migration-owner" } },
    }],
    bannerObjects: [],
  }));

  try {
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types",
      resolve(root, "scripts/import-azure-authored-courses.ts"),
      `--input=${bundlePath}`,
    ], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Preflight: 1 course(s), 0 lesson(s), 0 banner(s).");
    expect(result.stdout).not.toContain(ownerEmail);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("compiled app and bootstrap are separate workloads with only one web ingress", () => {
  expect(compiledProductionTemplate.resources.filter((r) => r.type === "Microsoft.App/containerApps")).toHaveLength(1);
  const bootstrap = compileBicep("infra/azure/bootstrap.bicep");
  expect(bootstrap.resources.filter((r) => r.type === "Microsoft.App/containerApps")).toHaveLength(0);
  expect(bootstrap.resources.filter((r) => r.type === "Microsoft.App/jobs")).toHaveLength(1);
});
