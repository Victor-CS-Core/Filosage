import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();
const releaseScript = resolve(root, "scripts/check-release-env.mjs");
const healthScript = resolve(root, "scripts/check-production-health.mjs");
const safetyScript = resolve(root, "scripts/check-release-safety.mjs");
const qaProviderStateScript = resolve(root, "scripts/check-qa-auth-provider-state.mjs");

const validReleaseEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SITE_URL: "https://release.example",
  DATABASE_URL: "postgresql://release:placeholder@filosage-release.postgres.database.azure.com:5432/filosage?sslmode=verify-full",
  AZURE_EASY_AUTH_ENABLED: "true",
  AZURE_STORAGE_ACCOUNT_URL: "https://filosagerelease.blob.core.windows.net/",
  AZURE_STORAGE_BANNER_CONTAINER: "course-banners",
  AZURE_POSTGRES_SERVER_NAME: "filosage-release",
  AZURE_RESOURCE_GROUP: "filosage-release-rg",
  OPENAI_API_KEY: "release-check-placeholder",
  OWNER_EMAIL: "owner@release.example",
  MIGRATED_OWNER_UID: "legacy-firebase-owner-uid",
  ACTIVITY_RECEIPT_SECRET: "x".repeat(32),
  OPERATIONS_ALERT_WEBHOOK_URL: "https://alerts.release.example/filosage",
  OPERATIONS_ALERT_WEBHOOK_SECRET: "y".repeat(32),
  SITE_VERSION: "a".repeat(40),
  BILLING_ENABLED: "false",
  IDENTITY_LINK_HMAC_SECRET: "identity-link-hmac-secret-at-least-32-characters",
  DIRECT_GOOGLE_AUTH_ENABLED: "true",
  EXTERNAL_ID_AUTH_ENABLED: "false",
  EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "false",
};

function runNodeScript(script: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = 3_000) {
  return new Promise<{ status: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolveResult) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolveResult({ status, stdout, stderr, timedOut });
    });
  });
}

async function withHealthResponse(
  body: Record<string, unknown>,
  run: (origin: string) => Promise<void>,
) {
  const server = createServer((request, response) => {
    if (request.url !== "/api/health") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Health test server did not bind a TCP port.");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}

test("release checks bind Azure and production health to one full Git SHA", () => {
  const valid = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: validReleaseEnvironment,
    encoding: "utf8",
  });
  expect(valid.status, valid.stderr).toBe(0);
  expect(valid.stdout).toContain("Closed-billing release environment looks complete");

  const missingRecovery = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, AZURE_POSTGRES_SERVER_NAME: "" },
    encoding: "utf8",
  });
  expect(missingRecovery.status).toBe(1);
  expect(missingRecovery.stderr).toContain("AZURE_POSTGRES_SERVER_NAME");

  const disabledEasyAuth = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, AZURE_EASY_AUTH_ENABLED: "false" },
    encoding: "utf8",
  });
  expect(disabledEasyAuth.status).toBe(1);
  expect(disabledEasyAuth.stderr).toContain("AZURE_EASY_AUTH_ENABLED must be true for production releases");

  const shortVersion = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, SITE_VERSION: "abcdef0" },
    encoding: "utf8",
  });
  expect(shortVersion.status).toBe(1);
  expect(shortVersion.stderr).toContain("full 40-character Git commit SHA");

  const missingExpectedVersion = spawnSync(process.execPath, [healthScript, "https://release.example"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(missingExpectedVersion.status).toBe(1);
  expect(missingExpectedVersion.stderr).toContain("Provide the exact deployed Git commit SHA");

  const abbreviatedExpectedVersion = spawnSync(process.execPath, [healthScript, "https://release.example", "abcdef0"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(abbreviatedExpectedVersion.status).toBe(1);
  expect(abbreviatedExpectedVersion.stderr).toContain("full 40-character Git commit SHA");

  const missingSafetyTarget = spawnSync(process.execPath, [safetyScript], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(missingSafetyTarget.status).toBe(1);
  expect(missingSafetyTarget.stderr).toContain("Provide the deployed revision or slot URL");

  const unsafeSafetyTarget = spawnSync(process.execPath, [safetyScript, "http://release.example"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(unsafeSafetyTarget.status).toBe(1);
  expect(unsafeSafetyTarget.stderr).toContain("must be an HTTPS origin");
});

test("ordinary releases reject unsafe identity provider and billing combinations without printing secrets", () => {
  const rejected: Array<[string, NodeJS.ProcessEnv, string]> = [
    ["zero providers", { ...validReleaseEnvironment, DIRECT_GOOGLE_AUTH_ENABLED: "false", EXTERNAL_ID_AUTH_ENABLED: "false" }, "At least one production authentication provider must be enabled"],
    ["new accounts without External ID", { ...validReleaseEnvironment, EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "true" }, "EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED"],
    ["missing External ID client", { ...validReleaseEnvironment, DIRECT_GOOGLE_AUTH_ENABLED: "false", EXTERNAL_ID_AUTH_ENABLED: "true", EXTERNAL_ID_ISSUER: "https://tenant.example/v2.0", EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "https://tenant.example/.well-known/openid-configuration" }, "EXTERNAL_ID_CLIENT_ID is required when External ID is enabled"],
    ["missing External ID issuer", { ...validReleaseEnvironment, DIRECT_GOOGLE_AUTH_ENABLED: "false", EXTERNAL_ID_AUTH_ENABLED: "true", EXTERNAL_ID_CLIENT_ID: "external-client-id", EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "https://tenant.example/.well-known/openid-configuration" }, "EXTERNAL_ID_ISSUER is required when External ID is enabled"],
    ["missing discovery metadata", { ...validReleaseEnvironment, DIRECT_GOOGLE_AUTH_ENABLED: "false", EXTERNAL_ID_AUTH_ENABLED: "true", EXTERNAL_ID_CLIENT_ID: "external-client-id", EXTERNAL_ID_ISSUER: "https://tenant.example/v2.0" }, "EXTERNAL_ID_WELL_KNOWN_CONFIGURATION is required when External ID is enabled"],
    ["HTTP External ID issuer", { ...validReleaseEnvironment, DIRECT_GOOGLE_AUTH_ENABLED: "false", EXTERNAL_ID_AUTH_ENABLED: "true", EXTERNAL_ID_CLIENT_ID: "external-client-id", EXTERNAL_ID_ISSUER: "http://tenant.example/v2.0", EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "https://tenant.example/.well-known/openid-configuration" }, "EXTERNAL_ID_ISSUER must use HTTPS"],
    ["HTTP discovery metadata", { ...validReleaseEnvironment, DIRECT_GOOGLE_AUTH_ENABLED: "false", EXTERNAL_ID_AUTH_ENABLED: "true", EXTERNAL_ID_CLIENT_ID: "external-client-id", EXTERNAL_ID_ISSUER: "https://tenant.example/v2.0", EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "http://tenant.example/.well-known/openid-configuration" }, "EXTERNAL_ID_WELL_KNOWN_CONFIGURATION must use HTTPS"],
    ["short identity HMAC", { ...validReleaseEnvironment, IDENTITY_LINK_HMAC_SECRET: "too-short" }, "IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters"],
    ["ordinary billing activation", { ...validReleaseEnvironment, BILLING_ENABLED: "true" }, "BILLING_ENABLED must be explicitly false for a closed-billing release"],
  ];

  for (const [label, env, message] of rejected) {
    const result = spawnSync(process.execPath, [releaseScript], { cwd: root, env, encoding: "utf8" });
    expect(result.status, label).toBe(1);
    expect(result.stderr, label).toContain(message);
    expect(`${result.stdout}${result.stderr}`, label).not.toContain(validReleaseEnvironment.IDENTITY_LINK_HMAC_SECRET);
  }

  const externalOnly = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: {
      ...validReleaseEnvironment,
      DIRECT_GOOGLE_AUTH_ENABLED: "false",
      EXTERNAL_ID_AUTH_ENABLED: "true",
      EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "true",
      EXTERNAL_ID_CLIENT_ID: "external-client-id",
      EXTERNAL_ID_ISSUER: "https://tenant.example/v2.0",
      EXTERNAL_ID_WELL_KNOWN_CONFIGURATION: "https://tenant.example/.well-known/openid-configuration",
    },
    encoding: "utf8",
  });
  expect(externalOnly.status, externalOnly.stderr).toBe(0);
  expect(`${externalOnly.stdout}${externalOnly.stderr}`).not.toContain("external-client-id");
});

test("QA provider evidence must exactly match the requested application gate", () => {
  const run = (state: unknown, expected: "true" | "false") => spawnSync(
    process.execPath,
    [qaProviderStateScript, expected],
    { cwd: root, input: JSON.stringify(state), encoding: "utf8" },
  );

  expect(run({ google: true, filosage: false }, "false").status).toBe(0);
  expect(run({ google: true, filosage: true }, "true").status).toBe(0);

  for (const [label, state, expected, message] of [
    ["Google disabled", { google: false, filosage: false }, "false", "Direct Google Easy Auth must remain enabled in QA."],
    ["Filosage missing", { google: true, filosage: null }, "false", "QA authentication provider state is invalid."],
    ["requested gate not enabled", { google: true, filosage: false }, "true", "Filosage Easy Auth provider state does not match the requested application acceptance gate."],
    ["provider enabled behind closed gate", { google: true, filosage: true }, "false", "Filosage Easy Auth provider state does not match the requested application acceptance gate."],
    ["unexpected metadata", { google: true, filosage: false, clientId: "do-not-print-this" }, "false", "QA authentication provider state is invalid."],
  ] as const) {
    const result = run(state, expected);
    expect(result.status, label).toBe(1);
    expect(result.stderr, label).toContain(message);
    expect(`${result.stdout}${result.stderr}`, label).not.toContain("do-not-print-this");
  }
});

test("production health verifies and reports only the bounded authentication mode", async () => {
  const version = "b".repeat(40);
  await withHealthResponse({
    ok: true,
    version,
    origin: "https://release.example",
    authenticationMode: "direct-google",
    checks: { configuration: true, datastore: true },
  }, async (origin) => {
    const healthy = await runNodeScript(healthScript, [origin, version], {
      ...process.env,
      EXPECTED_AUTH_MODE: "direct-google",
    });
    expect(healthy.timedOut).toBe(false);
    expect(healthy.status, healthy.stderr).toBe(0);
    expect(healthy.stdout).toContain(`Production health is healthy (version ${version}, authentication direct-google).`);

    const mismatch = await runNodeScript(healthScript, [origin, version], {
      ...process.env,
      EXPECTED_AUTH_MODE: "external-id",
    });
    expect(mismatch.timedOut).toBe(false);
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain("authentication mode mismatch");
  });

  const invalidExpectedMode = spawnSync(process.execPath, [healthScript, "https://release.example", version], {
    cwd: root,
    env: { ...process.env, EXPECTED_AUTH_MODE: "provider-id-secret" },
    encoding: "utf8",
  });
  expect(invalidExpectedMode.status).toBe(1);
  expect(invalidExpectedMode.stderr).toContain("EXPECTED_AUTH_MODE must be direct-google, external-id, or migration-dual");
  expect(`${invalidExpectedMode.stdout}${invalidExpectedMode.stderr}`).not.toContain("provider-id-secret");
});

test("billing activation requires every Plus and Pro Stripe price", () => {
  const activationEnvironment = {
    ...validReleaseEnvironment,
    BILLING_ENABLED: "true",
    BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_live_1234567890AbCdEfGhIjKlMn",
    STRIPE_WEBHOOK_SECRET: "whsec_1234567890AbCdEfGhIjKlMn",
    STRIPE_PLUS_MONTHLY_PRICE_ID: "price_1PlusMonthlyAbCd",
    STRIPE_PLUS_ANNUAL_PRICE_ID: "price_1PlusAnnualAbCd",
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_1ProMonthlyAbCd",
    STRIPE_PRO_ANNUAL_PRICE_ID: "price_1ProAnnualAbCd",
    LEGAL_OPERATOR_NAME: "Filosage LLC",
    LEGAL_BUSINESS_ADDRESS: "123 Example Street",
    GOVERNING_JURISDICTION: "New York",
    SUPPORT_EMAIL: "support@filosage.com",
  };
  for (const variable of ["STRIPE_PLUS_MONTHLY_PRICE_ID", "STRIPE_PLUS_ANNUAL_PRICE_ID", "STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_PRO_ANNUAL_PRICE_ID"]) {
    const result = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
      cwd: root,
      env: { ...activationEnvironment, [variable]: "" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${variable} is required for billing activation`);
  }
  for (const variable of ["LEGAL_OPERATOR_NAME", "LEGAL_BUSINESS_ADDRESS", "GOVERNING_JURISDICTION", "SUPPORT_EMAIL"]) {
    const result = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
      cwd: root,
      env: { ...activationEnvironment, [variable]: "" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${variable} is required for billing activation`);
  }
  const malformedSupportEmail = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
    cwd: root,
    env: { ...activationEnvironment, SUPPORT_EMAIL: "not-an-email" },
    encoding: "utf8",
  });
  expect(malformedSupportEmail.status).toBe(1);
  expect(malformedSupportEmail.stderr).toContain("SUPPORT_EMAIL must be a valid email address");
  const wrongProvider = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
    cwd: root,
    env: { ...activationEnvironment, BILLING_PROVIDER: "none" },
    encoding: "utf8",
  });
  expect(wrongProvider.status).toBe(1);
  expect(wrongProvider.stderr).toContain("BILLING_PROVIDER must be stripe for billing activation");
  for (const [variable, value, message] of [
    ["STRIPE_SECRET_KEY", "sk_test_1234567890AbCdEfGhIjKlMn", "STRIPE_SECRET_KEY must be a non-placeholder Live secret or restricted key"],
    ["STRIPE_SECRET_KEY", "sk_live_placeholder", "STRIPE_SECRET_KEY must be a non-placeholder Live secret or restricted key"],
    ["STRIPE_WEBHOOK_SECRET", "whsec_placeholder", "STRIPE_WEBHOOK_SECRET must be a non-placeholder whsec_ signing secret"],
    ["STRIPE_PLUS_MONTHLY_PRICE_ID", "not_a_price", "STRIPE_PLUS_MONTHLY_PRICE_ID must be a valid Stripe Price ID"],
  ] as const) {
    const result = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
      cwd: root,
      env: { ...activationEnvironment, [variable]: value },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  }
  const duplicatePrice = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
    cwd: root,
    env: {
      ...activationEnvironment,
      STRIPE_PRO_MONTHLY_PRICE_ID: activationEnvironment.STRIPE_PLUS_MONTHLY_PRICE_ID,
    },
    encoding: "utf8",
  });
  expect(duplicatePrice.status).toBe(1);
  expect(duplicatePrice.stderr).toContain("All four current Stripe Price IDs must be unique");
});
