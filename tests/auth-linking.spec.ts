import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { expect, test, type APIResponse } from "@playwright/test";
import {
  IDENTITY_LINK_INTENT_TTL_MS,
  identityRegistryKeys,
  linkIntentPath,
} from "../src/lib/identity-link-policy";
import { DIRECT_GOOGLE_ISSUER, type VerifiedProviderIdentity } from "../src/lib/identity-types";
import { identityLinkCookieAttributes } from "../src/lib/identity-link-cookie";
import { safeAuthenticationReturnPath as safeClientReturnPath } from "../src/lib/auth-return-path";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { playwrightOwnedStorePath } from "./fixtures/playwright-server";

const INTENT_COOKIE = "filosage_identity_link_intent";
const COMPLETE_COOKIE_PATH = "/api/auth/link-intent/complete";
const LOCAL_LINK_SECRET = "filosage-local-identity-link-secret-v1";
const ownerAuthorization = { Authorization: "Bearer playwright-local-owner" };
const ownerRecentAuthentication = {
  ...ownerAuthorization,
  "X-Reauthentication-Token": "playwright-local-owner",
};

function cacheControl(response: APIResponse) {
  return response.headers()["cache-control"];
}

function setCookie(response: APIResponse) {
  return response.headers()["set-cookie"] ?? "";
}

test("identity-link cookies turn Secure on only for production and keep the completion-only path", () => {
  expect(identityLinkCookieAttributes("production")).toEqual({
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth/link-intent/complete",
  });
  expect(identityLinkCookieAttributes("development")).toEqual({
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/api/auth/link-intent/complete",
  });
});

test("the client-safe return-path policy preserves local paths and rejects encoded authority escapes", () => {
  expect(safeClientReturnPath("/profile?identity-linked=1")).toBe("/profile?identity-linked=1");
  expect(safeClientReturnPath("/%2f%2fattacker.invalid/steal")).toBe("/");
});

test("unexpected identity-link failures expose only a correlation ID and emit a bounded audit", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--import",
    "tsx",
    "tests/fixtures/identity-link-route-failure-behavior.ts",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("IDENTITY_LINK_ROUTE_FAILURE_BEHAVIOR_OK");
  expect(result.stdout).not.toContain("private-uid");
  expect(result.stdout).not.toContain("private-token");
});

type LocalStore = Record<string, Record<string, unknown>>;

function linkFixture(provider: "google" | "filosage", runId = crypto.randomUUID()) {
  const normalizedRunId = runId.toLowerCase();
  const token = `playwright-link-${provider}-${normalizedRunId}`;
  const subject = `${provider}-${normalizedRunId}`;
  const email = `identity-link-${normalizedRunId}@filosage.local`;
  return {
    token,
    identity: {
      provider,
      issuer: provider === "google"
        ? DIRECT_GOOGLE_ISSUER
        : "https://local-external-id.filosage.invalid/tenant/v2.0",
      subject,
      email,
      emailVerified: true,
    } satisfies VerifiedProviderIdentity,
  };
}

async function readStore(baseURL: string) {
  try {
    return JSON.parse(await readFile(playwrightOwnedStorePath(baseURL), "utf8")) as LocalStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeStore(baseURL: string, store: LocalStore) {
  await writeFile(
    playwrightOwnedStorePath(baseURL),
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8",
  );
}

function rateLimitDocuments(store: LocalStore, namespace: string) {
  return Object.fromEntries(Object.entries(store).filter(([path, value]) => (
    path.startsWith("systemRateLimits/") && value.namespace === namespace
  )));
}

async function seedCanonicalGoogleAccount(
  baseURL: string,
  fixture: ReturnType<typeof linkFixture>,
  options: { registries?: boolean; updatedAt?: string } = {},
) {
  if (fixture.identity.provider !== "google") throw new Error("Google fixture required.");
  const store = await readStore(baseURL);
  const timestamp = options.updatedAt ?? new Date().toISOString();
  const keys = await identityRegistryKeys(fixture.identity, LOCAL_LINK_SECRET);
  store[`users/${fixture.identity.subject}`] = {
    uid: fixture.identity.subject,
    email: fixture.identity.email,
    displayName: "Identity Link Learner",
    plan: "free",
    accountStatus: "active",
    subscriptionStatus: "none",
    acceptedTermsVersion: TERMS_VERSION,
    acceptedPrivacyVersion: PRIVACY_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (options.registries !== false) {
    store[keys.identityPath] = {
      schemaVersion: 1,
      keyVersion: "v1",
      identityHash: keys.identityHash,
      canonicalUid: fixture.identity.subject,
      provider: "google",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store[keys.emailPath] = {
      schemaVersion: 1,
      keyVersion: "v1",
      emailHash: keys.emailHash,
      canonicalUid: fixture.identity.subject,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
  await writeStore(baseURL, store);
  return keys;
}

test.describe("identity-link mutation routes", () => {
  test.describe.configure({ mode: "serial" });

  test("creation bounds a recent Google caller before account lookup and does not refresh an account after the limit", async ({ request }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const fixture = linkFixture("google");
    const recentHeaders = {
      Authorization: `Bearer ${fixture.token}`,
      "X-Reauthentication-Token": fixture.token,
      Origin: baseURL,
    };
    const crossSite = await request.post("/api/auth/link-intent", {
      headers: {
        ...recentHeaders,
        Origin: "https://attacker.invalid",
        "Sec-Fetch-Site": "cross-site",
        Cookie: `${INTENT_COOKIE}=must-not-be-read`,
      },
    });
    expect(crossSite.status()).toBe(403);
    expect(await crossSite.json()).toEqual({ error: "This request did not originate from Filosage." });
    expect(cacheControl(crossSite)).toBe("private, no-store");
    expect(setCookie(crossSite)).toBe("");

    const staleAuthentication = await request.post("/api/auth/link-intent", {
      headers: { Authorization: `Bearer ${fixture.token}`, Origin: baseURL },
    });
    expect(staleAuthentication.status()).toBe(401);
    expect(await staleAuthentication.json()).toEqual({
      code: "recent_authentication_required",
      error: "Sign in again with your existing Google method before connecting a new sign-in.",
    });
    expect(cacheControl(staleAuthentication)).toBe("private, no-store");

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const preAccount = await request.post("/api/auth/link-intent", {
        headers: recentHeaders,
      });
      expect(preAccount.status(), `attempt ${attempt}`).toBe(403);
      expect(await preAccount.json()).toEqual({
        error: "The secure connection could not be started.",
      });
      expect(cacheControl(preAccount)).toBe("private, no-store");
    }

    const limited = await request.post("/api/auth/link-intent", {
      headers: recentHeaders,
    });
    expect(limited.status()).toBe(429);
    expect(await limited.json()).toEqual({ error: "Too many requests. Please wait a moment and try again." });
    expect(cacheControl(limited)).toBe("private, no-store");
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(540);
    expect(Number(limited.headers()["retry-after"])).toBeLessThanOrEqual(600);
    expect(setCookie(limited)).toBe("");
    const sixthAttemptLimits = Object.values(
      rateLimitDocuments(await readStore(baseURL), "identity-link-create"),
    );
    expect(sixthAttemptLimits).toEqual(expect.arrayContaining([
      expect.objectContaining({ namespace: "identity-link-create", scope: "global", count: 6 }),
      expect.objectContaining({ namespace: "identity-link-create", scope: "account", count: 6 }),
    ]));

    const staleUpdatedAt = "2020-01-01T00:00:00.000Z";
    await seedCanonicalGoogleAccount(baseURL, fixture, {
      registries: false,
      updatedAt: staleUpdatedAt,
    });
    const accountPath = `users/${fixture.identity.subject}`;
    const accountBefore = (await readStore(baseURL))[accountPath];
    const stillLimited = await request.post("/api/auth/link-intent", { headers: recentHeaders });
    expect(stillLimited.status()).toBe(429);
    expect((await readStore(baseURL))[accountPath]).toEqual(accountBefore);
  });

  test("creation returns a bounded redirect and binds an opaque least-privilege cookie to the durable intent", async ({ request }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const fixture = linkFixture("google");
    const sourceKeys = await seedCanonicalGoogleAccount(baseURL, fixture);
    const seeded = await readStore(baseURL);
    expect(seeded[sourceKeys.identityPath]).toEqual(expect.objectContaining({
      schemaVersion: 1,
      keyVersion: "v1",
      identityHash: sourceKeys.identityHash,
      canonicalUid: fixture.identity.subject,
      provider: "google",
    }));
    expect(Object.keys(seeded[sourceKeys.identityPath]).sort()).toEqual([
      "canonicalUid",
      "createdAt",
      "identityHash",
      "keyVersion",
      "provider",
      "schemaVersion",
      "updatedAt",
    ]);
    expect(seeded[sourceKeys.emailPath]).toEqual(expect.objectContaining({
      schemaVersion: 1,
      keyVersion: "v1",
      emailHash: sourceKeys.emailHash,
      canonicalUid: fixture.identity.subject,
    }));
    expect(Object.keys(seeded[sourceKeys.emailPath]).sort()).toEqual([
      "canonicalUid",
      "createdAt",
      "emailHash",
      "keyVersion",
      "schemaVersion",
      "updatedAt",
    ]);
    expect(seeded[`users/${fixture.identity.subject}`]).toEqual(expect.objectContaining({
      uid: fixture.identity.subject,
      email: fixture.identity.email,
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
    }));
    const startedAt = Date.now();
    const created = await request.post(
      "/api/auth/link-intent?return=%2Fprofile%3Fidentity-linked%3D1",
      {
        headers: {
          Authorization: `Bearer ${fixture.token}`,
          "X-Reauthentication-Token": fixture.token,
          Origin: baseURL,
        },
      },
    );

    expect(created.status()).toBe(200);
    expect(cacheControl(created)).toBe("private, no-store");
    const body = await created.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "redirectTo"]);
    expect(body.redirectTo).toBe(
      "/.auth/login/filosage?post_login_redirect_uri=%2Fauth%2Fcomplete-link",
    );
    const expiresAt = Date.parse(String(body.expiresAt));
    expect(expiresAt).toBeGreaterThanOrEqual(startedAt + IDENTITY_LINK_INTENT_TTL_MS - 1_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + IDENTITY_LINK_INTENT_TTL_MS + 1_000);

    const cookie = setCookie(created);
    const tokenMatch = cookie.match(new RegExp(`${INTENT_COOKIE}=([^;]+)`));
    expect(tokenMatch).not.toBeNull();
    const token = tokenMatch![1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie).toContain("Path=/api/auth/link-intent/complete");
    expect(cookie).toContain("Max-Age=600");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).not.toContain("Secure");
    expect(JSON.stringify(body)).not.toContain(token);

    const intentPath = await linkIntentPath(token, LOCAL_LINK_SECRET);
    const store = await readStore(baseURL);
    const intent = store[intentPath];
    expect(intent).toEqual({
      schemaVersion: 1,
      keyVersion: "v1",
      canonicalUid: fixture.identity.subject,
      sourceIdentityHash: sourceKeys.identityHash,
      emailHash: sourceKeys.emailHash,
      returnPath: "/profile?identity-linked=1",
      createdAt: body.expiresAt
        ? new Date(Date.parse(String(body.expiresAt)) - IDENTITY_LINK_INTENT_TTL_MS).toISOString()
        : "",
      expiresAt: body.expiresAt,
      usedAt: null,
    });
    expect(Date.parse(String(intent.expiresAt)) - Date.parse(String(intent.createdAt))).toBe(
      IDENTITY_LINK_INTENT_TTL_MS,
    );
    expect(JSON.stringify(store)).not.toContain(token);
  });

  test("creation clears an older intent cookie on a terminal link denial", async ({ request }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const acceptance = await request.post("/api/legal/acceptance", {
      headers: { ...ownerAuthorization, Origin: baseURL },
      data: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        ageEligibilityConfirmed: true,
        source: "signup",
      },
    });
    expect(acceptance.status()).toBe(200);

    const terminal = await request.post("/api/auth/link-intent", {
      headers: {
        ...ownerRecentAuthentication,
        Origin: baseURL,
        Cookie: `${INTENT_COOKIE}=older-opaque-intent`,
      },
    });
    expect(terminal.status()).toBe(409);
    expect(cacheControl(terminal)).toBe("private, no-store");
    expect(setCookie(terminal)).toContain(`${INTENT_COOKIE}=`);
    expect(setCookie(terminal)).toContain("Path=/api/auth/link-intent/complete");
    expect(setCookie(terminal)).toContain("Max-Age=0");
    expect(setCookie(terminal)).toContain("HttpOnly");
    expect(setCookie(terminal)).toContain("SameSite=lax");
    expect(setCookie(terminal)).not.toContain("Secure");
  });

  test("completion authenticates before durable writes and isolates verified identity allowances", async ({ request }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const token = "A".repeat(43);
    const first = linkFixture("filosage");
    const second = linkFixture("filosage");
    const sharedHeaders = {
      Origin: baseURL,
      "X-Real-IP": "identity-link-shared-client",
      Cookie: `${INTENT_COOKIE}=${token}`,
    };

    const crossSite = await request.post(COMPLETE_COOKIE_PATH, {
      headers: {
        ...sharedHeaders,
        Authorization: `Bearer ${first.token}`,
        Origin: "https://attacker.invalid",
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(crossSite.status()).toBe(403);
    expect(cacheControl(crossSite)).toBe("private, no-store");
    expect(setCookie(crossSite)).toBe("");

    const limitsBefore = rateLimitDocuments(await readStore(baseURL), "identity-link-complete");
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const unauthenticated = await request.post(COMPLETE_COOKIE_PATH, {
        headers: sharedHeaders,
      });
      expect(unauthenticated.status(), `unauthenticated attempt ${attempt}`).toBe(401);
      expect(await unauthenticated.json()).toEqual({
        error: "Sign in with a verified account to continue.",
      });
      expect(cacheControl(unauthenticated)).toBe("private, no-store");
      expect(setCookie(unauthenticated)).toBe("");
    }
    expect(rateLimitDocuments(await readStore(baseURL), "identity-link-complete")).toEqual(limitsBefore);

    const firstHeaders = { ...sharedHeaders, Authorization: `Bearer ${first.token}` };

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const terminal = await request.post(COMPLETE_COOKIE_PATH, { headers: firstHeaders });
      expect(terminal.status(), `attempt ${attempt}`).toBe(409);
      const body = await terminal.json() as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["correlationId", "error"]);
      expect(body.error).toBe("We could not connect that sign-in method. No account data was changed.");
      expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(JSON.stringify(body)).not.toContain(token);
      expect(cacheControl(terminal)).toBe("private, no-store");
      expect(setCookie(terminal)).toContain(`${INTENT_COOKIE}=`);
      expect(setCookie(terminal)).toContain("Path=/api/auth/link-intent/complete");
      expect(setCookie(terminal)).toContain("Max-Age=0");
      expect(setCookie(terminal)).toContain("HttpOnly");
      expect(setCookie(terminal)).toContain("SameSite=lax");
    }

    const limited = await request.post(COMPLETE_COOKIE_PATH, { headers: firstHeaders });
    expect(limited.status()).toBe(429);
    expect(await limited.json()).toEqual({ error: "Too many requests. Please wait a moment and try again." });
    expect(cacheControl(limited)).toBe("private, no-store");
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(540);
    expect(Number(limited.headers()["retry-after"])).toBeLessThanOrEqual(600);
    expect(setCookie(limited)).toBe("");

    const isolated = await request.post(COMPLETE_COOKIE_PATH, {
      headers: { ...sharedHeaders, Authorization: `Bearer ${second.token}` },
    });
    expect(isolated.status()).toBe(409);
    expect(cacheControl(isolated)).toBe("private, no-store");

    const completionLimits = rateLimitDocuments(await readStore(baseURL), "identity-link-complete");
    const completionBuckets = Object.values(completionLimits);
    expect(completionBuckets.filter((bucket) => bucket.scope === "global")).toEqual([
      expect.objectContaining({ namespace: "identity-link-complete", count: 10 }),
    ]);
    expect(completionBuckets.filter((bucket) => bucket.scope === "identity"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ count: 9 }),
        expect.objectContaining({ count: 1 }),
      ]));
    const stored = JSON.stringify(completionLimits);
    for (const rawValue of [first.token, first.identity.subject, first.identity.email, second.token, second.identity.subject, second.identity.email]) {
      expect(stored).not.toContain(rawValue);
    }
  });

  test("successful completion consumes a real local intent and clears the least-privilege cookie", async ({ request }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const acceptance = await request.post("/api/legal/acceptance", {
      headers: { ...ownerAuthorization, Origin: baseURL },
      data: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        ageEligibilityConfirmed: true,
        source: "signup",
      },
    });
    expect(acceptance.status()).toBe(200);

    const token = "B".repeat(43);
    const externalIdentity = {
      provider: "filosage",
      issuer: "https://local-external-id.filosage.invalid/tenant/v2.0",
      subject: "local-external-signup-disabled",
      email: "external-signup-disabled@filosage.local",
      emailVerified: true,
    } satisfies VerifiedProviderIdentity;
    const sourceIdentity = {
      provider: "google",
      issuer: DIRECT_GOOGLE_ISSUER,
      subject: "local-owner",
      email: externalIdentity.email,
      emailVerified: true,
    } satisfies VerifiedProviderIdentity;
    const [intentPath, externalKeys, sourceKeys] = await Promise.all([
      linkIntentPath(token, LOCAL_LINK_SECRET),
      identityRegistryKeys(externalIdentity, LOCAL_LINK_SECRET),
      identityRegistryKeys(sourceIdentity, LOCAL_LINK_SECRET),
    ]);
    const now = Date.now();
    const createdAt = new Date(now - 1_000).toISOString();
    const updatedAt = createdAt;
    const storePath = playwrightOwnedStorePath(baseURL);
    const store = JSON.parse(await readFile(storePath, "utf8")) as Record<string, Record<string, unknown>>;
    store[sourceKeys.identityPath] = {
      schemaVersion: 1,
      keyVersion: "v1",
      identityHash: sourceKeys.identityHash,
      canonicalUid: "local-owner",
      provider: "google",
      createdAt,
      updatedAt,
    };
    store[externalKeys.emailPath] = {
      schemaVersion: 1,
      keyVersion: "v1",
      emailHash: externalKeys.emailHash,
      canonicalUid: "local-owner",
      createdAt,
      updatedAt,
    };
    store[intentPath] = {
      schemaVersion: 1,
      keyVersion: "v1",
      canonicalUid: "local-owner",
      sourceIdentityHash: sourceKeys.identityHash,
      emailHash: externalKeys.emailHash,
      returnPath: "/profile?identity-linked=1",
      createdAt,
      expiresAt: new Date(now - 1_000 + IDENTITY_LINK_INTENT_TTL_MS).toISOString(),
      usedAt: null,
    };
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

    const completed = await request.post(COMPLETE_COOKIE_PATH, {
      headers: {
        Authorization: "Bearer playwright-external-signup-disabled",
        Origin: baseURL,
        "X-Real-IP": `identity-link-success-${crypto.randomUUID()}`,
        Cookie: `${INTENT_COOKIE}=${token}`,
      },
    });
    expect(completed.status()).toBe(200);
    expect(await completed.json()).toEqual({
      linked: true,
      returnPath: "/profile?identity-linked=1",
    });
    expect(cacheControl(completed)).toBe("private, no-store");
    expect(setCookie(completed)).toContain(`${INTENT_COOKIE}=`);
    expect(setCookie(completed)).toContain("Path=/api/auth/link-intent/complete");
    expect(setCookie(completed)).toContain("Max-Age=0");
    expect(setCookie(completed)).toContain("HttpOnly");
    expect(setCookie(completed)).toContain("SameSite=lax");
  });
});

test("completion page schedules only one POST in development StrictMode and rejects an external return path", async ({ page }) => {
  let completionRequests = 0;
  await page.route("**/api/auth/link-intent/complete", async (route) => {
    completionRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ linked: true, returnPath: "https://attacker.invalid/steal" }),
    });
  });

  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "Your sign-in is connected" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue learning" })).toHaveAttribute("href", "/");
  await expect(page.locator("main")).toHaveJSProperty("scrollWidth", 320);
  await page.waitForTimeout(300);
  expect(completionRequests).toBe(1);
});

test("completion page keeps status, focus, responsive, reduced-motion, and forced-color behavior accessible", async ({ page }) => {
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/link-intent/complete", async (route) => {
    await responseGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ linked: true, returnPath: "/profile" }),
    });
  });

  await page.goto("/auth/complete-link");
  const workingStatus = page.getByRole("status");
  await expect(workingStatus).toHaveAttribute("aria-live", "polite");
  await expect(workingStatus).toHaveAttribute("aria-busy", "true");
  releaseResponse?.();

  const completedStatus = page.getByRole("status");
  await expect(completedStatus).toContainText("Your sign-in is connected");
  const continueLink = page.getByRole("link", { name: "Continue learning" });
  await page.keyboard.press("Tab");
  await expect(continueLink).toBeFocused();
  expect(await continueLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const card = page.locator("main > section");
  const transitionSeconds = Number.parseFloat(
    await card.evaluate((element) => getComputedStyle(element).transitionDuration),
  );
  expect(transitionSeconds).toBeLessThanOrEqual(0.001);
  expect(await card.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");

  await page.setViewportSize({ width: 1_280, height: 900 });
  const desktopBox = await card.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.width).toBeLessThanOrEqual(520);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1_280);
});

test("completion page treats non-JSON errors as bounded text and never renders response HTML", async ({ page }) => {
  let completionRequests = 0;
  await page.route("**/api/auth/link-intent/complete", async (route) => {
    completionRequests += 1;
    await route.fulfill({
      status: 502,
      contentType: "text/html",
      body: '<img src=x onerror="document.body.dataset.injected=\'true\'">provider failure',
    });
  });

  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText("The sign-in connection could not be completed.");
  await expect(page.getByRole("link", { name: "Return to Filosage" })).toHaveAttribute("href", "/");
  await expect(page.locator("main img")).toHaveCount(1);
  await expect(page.locator("body")).not.toHaveAttribute("data-injected", "true");
  await page.waitForTimeout(300);
  expect(completionRequests).toBe(1);
});

test("completion page rejects a successful HTTP response without explicit linked proof", async ({ page }) => {
  await page.route("**/api/auth/link-intent/complete", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ returnPath: "/profile" }),
  }));

  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "The sign-in connection could not be completed.",
  );
});

test("completion page rejects an empty 204 response", async ({ page }) => {
  await page.route("**/api/auth/link-intent/complete", (route) => route.fulfill({ status: 204 }));

  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "The sign-in connection could not be completed.",
  );
});

test("completion page rejects JSON whose declared response length exceeds 16 KiB", async ({ page }) => {
  await page.route("**/api/auth/link-intent/complete", (route) => route.fulfill({
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "20000",
    },
    body: JSON.stringify({ linked: true, returnPath: "/profile" }),
  }));

  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "The sign-in connection could not be completed.",
  );
});

test("completion page stops a chunked JSON response after 16 KiB", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const value = input instanceof Request ? input.url : String(input);
      const url = new URL(value, window.location.origin);
      if (url.pathname !== "/api/auth/link-intent/complete") return originalFetch(input, init);
      const encoder = new TextEncoder();
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('{"linked":true,"padding":"'));
          controller.enqueue(encoder.encode("x".repeat(17_000)));
          controller.enqueue(encoder.encode('","returnPath":"/profile"}'));
          controller.close();
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
  });

  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "The sign-in connection could not be completed.",
  );
});

test("completion page rejects malformed UTF-8 bytes that otherwise describe success", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const value = input instanceof Request ? input.url : String(input);
      const url = new URL(value, window.location.origin);
      if (url.pathname !== "/api/auth/link-intent/complete") return originalFetch(input, init);
      const encoder = new TextEncoder();
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('{"linked":true,"padding":"'));
          controller.enqueue(new Uint8Array([0xc3, 0x28]));
          controller.enqueue(encoder.encode('","returnPath":"/profile"}'));
          controller.close();
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
  });

  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "The sign-in connection could not be completed.",
  );
  await expect(page.getByRole("link", { name: "Continue learning" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/auth\/complete-link$/);
});

test("completion page handles a failed completion fetch without leaking the exception", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const value = input instanceof Request ? input.url : String(input);
      const url = new URL(value, window.location.origin);
      if (url.pathname === "/api/auth/link-intent/complete") {
        throw new TypeError("private provider network detail");
      }
      return originalFetch(input, init);
    };
  });

  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "The sign-in connection could not be completed.",
  );
  await expect(page.locator("main")).not.toContainText("private provider network detail");
});

test("completion page aborts a stalled request and announces a bounded timeout", async ({ page }) => {
  let completionRequests = 0;
  await page.clock.install();
  await page.route("**/api/auth/link-intent/complete", () => {
    completionRequests += 1;
    // Keep the request pending until the client aborts it.
  });

  await page.goto("/auth/complete-link");
  await page.clock.runFor(1);
  await expect(page.getByRole("heading", { name: "Connecting your sign-in" })).toBeVisible();
  await page.clock.runFor(10_000);
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "The secure connection took too long. Return to Filosage and try again.",
  );
  expect(completionRequests).toBe(1);
});
