import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import { releaseEnvironment } from "../src/lib/release-capabilities";

const root = process.cwd();
const releaseScript = resolve(root, "scripts/check-release-env.mjs");
const healthScript = resolve(root, "scripts/check-production-health.mjs");
const safetyScript = resolve(root, "scripts/check-release-safety.mjs");
const featuredCourseScript = resolve(root, "scripts/check-featured-course.mjs");
const providerStateScript = resolve(root, "scripts/check-auth-provider-state.mjs");
const trackedSecretScript = resolve(root, "scripts/check-tracked-secrets.mjs");
const healthVersion = "b".repeat(40);
const approvedManifest = JSON.parse(readFileSync(resolve(root, "config/release-capabilities.json"), "utf8"));
const healthDigest = `sha256:${"d".repeat(64)}`;
function selectedManifest(decks = true, generation = true) {
  return { ...approvedManifest, capabilities: { ...approvedManifest.capabilities, flashcardDecks: decks, flashcardGeneration: generation } };
}
function manifestEnvironment(decks = true, generation = true) {
  return { RELEASE_CAPABILITIES_JSON: JSON.stringify(selectedManifest(decks, generation)) };
}


test("release safety locks new checkout without disabling Stripe account management", async () => {
  const { releaseSafetyBillingState } = await import("../scripts/release-safety-contract.mjs");
  const closed = {
    enabled: false,
    rolloutMode: "closed",
    checkoutReady: false,
    managementReady: false,
    ready: false,
  };

  expect(releaseSafetyBillingState(closed)).toBe(true);
  expect(releaseSafetyBillingState({ ...closed, managementReady: true })).toBe(true);
  expect(releaseSafetyBillingState({
    ...closed,
    rolloutMode: "configured",
    managementReady: true,
  })).toBe(true);

  for (const unsafe of [
    { ...closed, enabled: true },
    { ...closed, checkoutReady: true },
    { ...closed, ready: true },
    { ...closed, rolloutMode: "canary" },
    { ...closed, rolloutMode: "open" },
    { ...closed, rolloutMode: "unexpected" },
  ]) {
    expect(releaseSafetyBillingState(unsafe)).toBe(false);
  }
});

test("tracked secret scanning fails without echoing the credential and permits an explicit fake fixture", () => {
  const directory = mkdtempSync(join(tmpdir(), "filosage-secret-scan-"));
  try {
    expect(spawnSync("git", ["init"], { cwd: directory, encoding: "utf8" }).status).toBe(0);
    const fakeLiveKey = `sk_live_${"A".repeat(32)}`;
    writeFileSync(join(directory, "candidate.txt"), `STRIPE_SECRET_KEY=${fakeLiveKey}\n`, "utf8");
    expect(spawnSync("git", ["add", "candidate.txt"], { cwd: directory, encoding: "utf8" }).status).toBe(0);

    const rejected = spawnSync(process.execPath, [trackedSecretScript], { cwd: directory, encoding: "utf8" });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("candidate.txt:1 [stripe-live-key]");
    expect(rejected.stderr).not.toContain(fakeLiveKey);

    writeFileSync(
      join(directory, "candidate.txt"),
      `STRIPE_SECRET_KEY=${fakeLiveKey} # secret-scan: allow-test-fixture\n`,
      "utf8",
    );
    const allowed = spawnSync(process.execPath, [trackedSecretScript], { cwd: directory, encoding: "utf8" });
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.stdout).toBe("Tracked-file secret scan passed.\n");

    writeFileSync(join(directory, "candidate.txt"), "security corpus sentinel sk-live-CANARYSECRET123456\n", "utf8");
    const sentinel = spawnSync(process.execPath, [trackedSecretScript], { cwd: directory, encoding: "utf8" });
    expect(sentinel.status, sentinel.stderr).toBe(0);

    const fakeOpenAiKey = `sk-proj-${"C".repeat(32)}`;
    writeFileSync(join(directory, "candidate.txt"), `OPENAI_API_KEY=${fakeOpenAiKey}\n`, "utf8");
    const openAiRejected = spawnSync(process.execPath, [trackedSecretScript], { cwd: directory, encoding: "utf8" });
    expect(openAiRejected.status).toBe(1);
    expect(openAiRejected.stderr).toContain("candidate.txt:1 [openai-api-key]");
    expect(openAiRejected.stderr).not.toContain(fakeOpenAiKey);

    const representativeSecrets = [
      ["github-fine-grained-token", `github_pat_${"D".repeat(40)}`],
      ["google-api-key", `AIza${"E".repeat(35)}`],
      ["azure-storage-account-key", `AccountKey=${"F".repeat(64)}`],
      ["postgres-credential-url", `postgresql://release:${"G".repeat(24)}@database.example/filosage`],
    ] as const;
    for (const [name, secret] of representativeSecrets) {
      writeFileSync(join(directory, "candidate.txt"), `${secret}\n`, "utf8");
      const secretRejected = spawnSync(process.execPath, [trackedSecretScript], { cwd: directory, encoding: "utf8" });
      expect(secretRejected.status, name).toBe(1);
      expect(secretRejected.stderr, name).toContain(`[${name}]`);
      expect(secretRejected.stderr, name).not.toContain(secret);
    }

    writeFileSync(join(directory, "candidate.txt"), "safe fixture\n", "utf8");
    const pendingSecret = `github_pat_${"H".repeat(40)}`;
    writeFileSync(join(directory, "pending.txt"), `${pendingSecret}\n`, "utf8");
    const untrackedRejected = spawnSync(process.execPath, [trackedSecretScript], { cwd: directory, encoding: "utf8" });
    expect(untrackedRejected.status).toBe(1);
    expect(untrackedRejected.stderr).toContain("pending.txt:1 [github-fine-grained-token]");
    expect(untrackedRejected.stderr).not.toContain(pendingSecret);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the billing operator guide matches the hosted rollout contract", () => {
  const guide = readFileSync(resolve(root, "docs/BILLING_SETUP.md"), "utf8");
  for (const required of [
    "Stripe-hosted Checkout",
    "Stripe-hosted Customer Portal",
    "BILLING_ROLLOUT_MODE=closed",
    "BILLING_ROLLOUT_MODE=configured",
    "BILLING_ROLLOUT_MODE=canary",
    "BILLING_ROLLOUT_MODE=open",
    "STRIPE_TAX_READY=true",
    "BILLING_CANARY_UIDS",
    "--billing-activation",
    "versioned age-18-or-older, U.S.-residency, and automatic-renewal acknowledgements",
  ]) expect(guide).toContain(required);
  expect(guide).not.toContain("explicitly accepts cards only");
});

function runNode(args: string[], environment: NodeJS.ProcessEnv) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("close", (status) => resolveRun({ status, stdout, stderr }));
  });
}

async function checkHealthResponse(checks: Record<string, unknown>, expectedDecks = true, expectedGeneration = true) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      ok: true,
      imageDigest: healthDigest,
      capabilities: { ...approvedManifest.capabilities, ...checks },
      version: healthVersion,
      origin: "https://release.example",
      authenticationMode: "direct-google",
      checks: { configuration: true, datastore: true, ...checks },
    }));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address() as AddressInfo;
  try {
    return await runNode(
      [healthScript, `http://127.0.0.1:${port}`, healthVersion],
      {
        ...process.env,
        EXPECTED_AUTH_MODE: "direct-google",
        EXPECTED_SITE_ORIGIN: "https://release.example",
        ...manifestEnvironment(expectedDecks, expectedGeneration),
        EXPECTED_IMAGE_DIGEST: healthDigest,
        FILOSAGE_HEALTH_CHECK_ATTEMPTS: "1",
        FILOSAGE_HEALTH_CHECK_DELAY_MS: "0",
      },
    );
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => server.close((error) => (
      error ? rejectClose(error) : resolveClose()
    )));
  }
}

const validReleaseEnvironment = {
  ...process.env,
  ...manifestEnvironment(),
  EXPECTED_AUTH_MODE: "direct-google",
  EXPECTED_SITE_ORIGIN: "https://release.example",
  // Every optional switch is explicit in a release environment.
  ...releaseEnvironment(selectedManifest()),
  NEXT_PUBLIC_SITE_URL: "https://release.example",
  DATABASE_URL: "postgresql://release:placeholder@filosage-release.postgres.database.azure.com:5432/filosage?sslmode=verify-full",
  AZURE_EASY_AUTH_ENABLED: "true",
  AZURE_STORAGE_ACCOUNT_URL: "https://filosagerelease.blob.core.windows.net/",
  AZURE_STORAGE_BANNER_CONTAINER: "course-banners",
  AZURE_POSTGRES_SERVER_NAME: "filosage-release",
  AZURE_RESOURCE_GROUP: "filosage-release-rg",
  OPENAI_API_KEY: "release-check-placeholder",
  OWNER_EMAIL: "owner@release.example",
  MIGRATED_OWNER_UID: "migrated-owner-uid",
  ACTIVITY_RECEIPT_SECRET: "x".repeat(32),
  OPERATIONS_ALERT_WEBHOOK_URL: "https://alerts.release.example/filosage",
  OPERATIONS_ALERT_WEBHOOK_SECRET: "y".repeat(32),
  SITE_VERSION: "a".repeat(40),
  EXPECTED_SITE_VERSION: "a".repeat(40),
  BILLING_ENABLED: "false",
  BILLING_ROLLOUT_MODE: "closed",
  STRIPE_TAX_READY: "false",
  FLASHCARD_DECKS_ENABLED: "true",
  FLASHCARD_AI_GENERATION_ENABLED: "true",
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

  const missingDecksFlag = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, FLASHCARD_DECKS_ENABLED: "" },
    encoding: "utf8",
  });
  expect(missingDecksFlag.status).toBe(1);
  expect(missingDecksFlag.stderr).toContain("release capabilities must match the approved manifest");

  const disabledGenerationFlag = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, FLASHCARD_AI_GENERATION_ENABLED: "false" },
    encoding: "utf8",
  });
  expect(disabledGenerationFlag.status).toBe(1);
  expect(disabledGenerationFlag.stderr).toContain("release capabilities must match the approved manifest");

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

  const missingFeaturedCourseId = spawnSync(process.execPath, [featuredCourseScript, "https://release.example"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(missingFeaturedCourseId.status).toBe(1);
  expect(missingFeaturedCourseId.stderr).toContain("Provide the expected featured course ID or the explicit value none");

  const malformedFeaturedCourseId = spawnSync(process.execPath, [featuredCourseScript, "https://release.example", "course-123"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(malformedFeaturedCourseId.status).toBe(1);
  expect(malformedFeaturedCourseId.stderr).toContain("must be none or a 64-character hexadecimal course ID");

  const unsafeFeaturedCourseTarget = spawnSync(process.execPath, [featuredCourseScript, "http://release.example", "none"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(unsafeFeaturedCourseTarget.status).toBe(1);
  expect(unsafeFeaturedCourseTarget.stderr).toContain("must be an HTTPS origin");
});

test("production health rejects a revision with disabled flashcard decks", async () => {
  const result = await checkHealthResponse({ flashcardDecks: false, flashcardGeneration: true });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("release capabilities mismatch");
});

test("production health rejects a revision with disabled flashcard AI generation", async () => {
  const result = await checkHealthResponse({ flashcardDecks: true, flashcardGeneration: false });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("release capabilities mismatch");
});

test("production health accepts a revision with both flashcard features enabled", async () => {
  const result = await checkHealthResponse({ flashcardDecks: true, flashcardGeneration: true });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain(`Production health is healthy (version ${healthVersion}, authentication direct-google).`);
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
    ["malformed Easy Auth boolean", { ...validReleaseEnvironment, AZURE_EASY_AUTH_ENABLED: "yes" }, "AZURE_EASY_AUTH_ENABLED must be exactly true or false"],
    ["uppercase provider boolean", { ...validReleaseEnvironment, DIRECT_GOOGLE_AUTH_ENABLED: "TRUE" }, "DIRECT_GOOGLE_AUTH_ENABLED must be exactly true or false"],
    ["uppercase billing boolean", { ...validReleaseEnvironment, BILLING_ENABLED: "FALSE" }, "BILLING_ENABLED must be exactly true or false"],
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
      EXPECTED_AUTH_MODE: "external-id",
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

test("managed provider evidence uses environment-neutral output and exactly matches the requested mode", () => {
  const run = (state: unknown, expected: "direct-google" | "migration-dual") => spawnSync(
    process.execPath,
    [providerStateScript, expected],
    { cwd: root, input: JSON.stringify(state), encoding: "utf8" },
  );

  for (const [state, expected] of [
    [{ google: true, filosage: false }, "direct-google"],
    [{ google: true, filosage: true }, "migration-dual"],
  ] as const) {
    const result = run(state, expected);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Managed authentication provider state matches the requested mode.");
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/\bQA\b|application gate/i);
  }

  for (const [label, state, expected, message] of [
    ["Google disabled", { google: false, filosage: false }, "direct-google", "Direct Google managed authentication must remain enabled."],
    ["Filosage missing", { google: true, filosage: null }, "direct-google", "Managed authentication provider state is invalid."],
    ["dual provider missing", { google: true, filosage: false }, "migration-dual", "Filosage managed authentication state does not match the requested mode."],
    ["unexpected provider enabled", { google: true, filosage: true }, "direct-google", "Filosage managed authentication state does not match the requested mode."],
    ["unexpected metadata", { google: true, filosage: false, clientId: "do-not-print-this" }, "direct-google", "Managed authentication provider state is invalid."],
  ] as const) {
    const result = run(state, expected);
    expect(result.status, label).toBe(1);
    expect(result.stderr, label).toContain(message);
    expect(`${result.stdout}${result.stderr}`, label).not.toContain("do-not-print-this");
    expect(`${result.stdout}${result.stderr}`, label).not.toMatch(/\bQA\b|application gate/i);
  }

  for (const [label, input, expected, message] of [
    ["invalid JSON", "not-json", "direct-google", "Managed authentication provider state is invalid."],
    ["oversized input", JSON.stringify({ google: true, filosage: false, padding: "x".repeat(1_024) }), "direct-google", "Managed authentication provider state is invalid."],
    ["boolean-shaped legacy mode", JSON.stringify({ google: true, filosage: false }), "false", "Expected authentication mode must be direct-google or migration-dual."],
    ["unsupported external-only mode", JSON.stringify({ google: true, filosage: false }), "external-id", "Expected authentication mode must be direct-google or migration-dual."],
  ] as const) {
    const result = spawnSync(process.execPath, [providerStateScript, expected], {
      cwd: root,
      input,
      encoding: "utf8",
    });
    expect(result.status, label).toBe(1);
    expect(result.stderr, label).toContain(message);
    expect(`${result.stdout}${result.stderr}`, label).not.toContain("padding");
    expect(`${result.stdout}${result.stderr}`, label).not.toMatch(/\bQA\b|application gate/i);
  }
});

test("production health verifies and reports only the bounded authentication mode", async () => {
  const version = "b".repeat(40);
  await withHealthResponse({
    ok: true,
    imageDigest: healthDigest,
    capabilities: selectedManifest().capabilities,
    version,
    origin: "https://release.example",
    authenticationMode: "direct-google",
    checks: {
      configuration: true,
      datastore: true,
      flashcardDecks: true,
      flashcardGeneration: true,
    },
  }, async (origin) => {
    const healthy = await runNodeScript(healthScript, [origin, version], {
      ...process.env,
      ...manifestEnvironment(),
      EXPECTED_SITE_ORIGIN: "https://release.example",
      EXPECTED_IMAGE_DIGEST: healthDigest,
      EXPECTED_AUTH_MODE: "direct-google",
    });
    expect(healthy.timedOut).toBe(false);
    expect(healthy.status, healthy.stderr).toBe(0);
    expect(healthy.stdout).toContain(`Production health is healthy (version ${version}, authentication direct-google).`);

    const mismatch = await runNodeScript(healthScript, [origin, version], {
      ...process.env,
      ...manifestEnvironment(),
      EXPECTED_SITE_ORIGIN: "https://release.example",
      EXPECTED_IMAGE_DIGEST: healthDigest,
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
    BILLING_ROLLOUT_MODE: "open",
    STRIPE_TAX_READY: "true",
    BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: `sk_live_${"A".repeat(32)}`,
    STRIPE_WEBHOOK_SECRET: `whsec_${"B".repeat(32)}`,
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_1FilosagePortalAbCd",
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
    ["STRIPE_PORTAL_CONFIGURATION_ID", "portal_default", "STRIPE_PORTAL_CONFIGURATION_ID must be a valid Stripe Customer Portal configuration ID"],
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

  for (const [environment, message] of [
    [{ ...activationEnvironment, BILLING_ROLLOUT_MODE: "configured" }, "BILLING_ROLLOUT_MODE must be canary or open for billing activation"],
    [{ ...activationEnvironment, STRIPE_TAX_READY: "false" }, "STRIPE_TAX_READY must be true for billing activation"],
    [{ ...activationEnvironment, BILLING_ROLLOUT_MODE: "canary", BILLING_CANARY_UIDS: "" }, "BILLING_CANARY_UIDS must contain one to 100 valid account UIDs for canary activation"],
  ] as const) {
    const result = spawnSync(process.execPath, [releaseScript, "--billing-activation"], {
      cwd: root,
      env: environment,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  }
});

for (const [decks, generation] of [[false, false], [true, false], [true, true]]) {
  test(`production health accepts exact approved flashcards ${decks}/${generation}`, async () => {
    const result = await checkHealthResponse({ flashcardDecks: decks, flashcardGeneration: generation }, decks, generation);
    expect(result.status, result.stderr).toBe(0);
  });
  test(`production health rejects changed or malformed flashcards ${decks}/${generation}`, async () => {
    for (const observed of [{}, { flashcardDecks: String(decks), flashcardGeneration: generation }, { flashcardDecks: decks, flashcardGeneration: !generation }, { flashcardDecks: !decks, flashcardGeneration: generation }]) {
      const result = await checkHealthResponse(observed, decks, generation);
      expect(result.status, JSON.stringify(observed)).toBe(1);
    }
  });
  test(`release environment accepts approved flashcards ${decks}/${generation}`, () => {
    const result = spawnSync(process.execPath, [releaseScript], {
      cwd: root,
      env: { ...validReleaseEnvironment, FLASHCARD_DECKS_ENABLED: String(decks), FLASHCARD_AI_GENERATION_ENABLED: String(generation), ...manifestEnvironment(decks, generation) },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  });
}

test("release rejects generation without decks even when selected", async () => {
  const result = await checkHealthResponse({ flashcardDecks: false, flashcardGeneration: true }, false, true);
  expect(result.status).toBe(1);
});

test("release environment rejects a different full candidate SHA", () => {
  const result = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, EXPECTED_SITE_VERSION: "c".repeat(40) },
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("SITE_VERSION must match the approved EXPECTED_SITE_VERSION");
});

test("health binds the approved SHA, digest, origin, configuration, and every selected capability", async () => {
  const base = {
    ok: true,
    version: healthVersion,
    imageDigest: healthDigest,
    origin: "https://release.example",
    authenticationMode: "direct-google",
    capabilities: selectedManifest().capabilities,
    checks: { configuration: true, datastore: true, flashcardDecks: true, flashcardGeneration: true },
  };
  for (const changed of [
    { version: "c".repeat(40) },
    { imageDigest: `sha256:${"e".repeat(64)}` },
    { imageDigest: null },
    { origin: "https://wrong.example" },
    { capabilities: { ...base.capabilities, commandCenter: true } },
    { capabilities: { ...base.capabilities, pipelineV2: "false" } },
    { capabilities: undefined },
    { checks: { ...base.checks, configuration: false } },
    { checks: { ...base.checks, datastore: "true" } },
  ]) {
    await withHealthResponse({ ...base, ...changed }, async (url) => {
      const result = await runNodeScript(healthScript, [url, healthVersion, base.origin], {
        ...process.env,
        ...manifestEnvironment(),
        EXPECTED_AUTH_MODE: "direct-google",
        EXPECTED_IMAGE_DIGEST: healthDigest,
        FILOSAGE_HEALTH_CHECK_ATTEMPTS: "1",
        FILOSAGE_HEALTH_CHECK_DELAY_MS: "0",
      });
      expect(result.timedOut).toBe(false);
      expect(result.status, JSON.stringify(changed)).toBe(1);
    });
  }
});

test("health requires explicit approved origin, authentication, and digest before fetching", () => {
  const environment = { ...process.env, ...manifestEnvironment(), EXPECTED_AUTH_MODE: "direct-google", EXPECTED_IMAGE_DIGEST: healthDigest, EXPECTED_SITE_ORIGIN: "https://release.example" };
  for (const changed of [{ EXPECTED_AUTH_MODE: "" }, { EXPECTED_IMAGE_DIGEST: "" }, { EXPECTED_SITE_ORIGIN: "" }]) {
    const result = spawnSync(process.execPath, [healthScript, "https://release.example", healthVersion], { encoding: "utf8", timeout: 2_000, env: { ...environment, ...changed } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
  }
});
