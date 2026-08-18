import { readFile, writeFile } from "node:fs/promises";
import { expect, test, type APIResponse } from "@playwright/test";
import {
  IDENTITY_LINK_INTENT_TTL_MS,
  identityRegistryKeys,
  linkIntentPath,
} from "../src/lib/identity-link-policy";
import { DIRECT_GOOGLE_ISSUER, type VerifiedProviderIdentity } from "../src/lib/identity-types";
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

test.describe("identity-link mutation routes", () => {
  test.describe.configure({ mode: "serial" });

  test("creation rejects untrusted, pre-account, and stale-auth callers before its account-scoped durable limit", async ({ request }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const crossSite = await request.post("/api/auth/link-intent", {
      headers: {
        ...ownerRecentAuthentication,
        Origin: "https://attacker.invalid",
        "Sec-Fetch-Site": "cross-site",
        Cookie: `${INTENT_COOKIE}=must-not-be-read`,
      },
    });
    expect(crossSite.status()).toBe(403);
    expect(await crossSite.json()).toEqual({ error: "This request did not originate from Filosage." });
    expect(cacheControl(crossSite)).toBe("private, no-store");
    expect(setCookie(crossSite)).toBe("");

    const beforeAccountSetup = await request.post("/api/auth/link-intent", {
      headers: { ...ownerRecentAuthentication, Origin: baseURL },
    });
    expect(beforeAccountSetup.status()).toBe(403);
    expect(await beforeAccountSetup.json()).toEqual({
      error: "The secure connection could not be started.",
    });
    expect(cacheControl(beforeAccountSetup)).toBe("private, no-store");

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

    const staleAuthentication = await request.post("/api/auth/link-intent", {
      headers: { ...ownerAuthorization, Origin: baseURL },
    });
    expect(staleAuthentication.status()).toBe(401);
    expect(await staleAuthentication.json()).toEqual({
      code: "recent_authentication_required",
      error: "Sign in again with your existing Google method before connecting a new sign-in.",
    });
    expect(cacheControl(staleAuthentication)).toBe("private, no-store");

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const terminal = await request.post("/api/auth/link-intent?return=https%3A%2F%2Fattacker.invalid%2Fsteal", {
        headers: {
          ...ownerRecentAuthentication,
          Origin: baseURL,
          "X-Real-IP": `identity-link-create-${attempt}`,
        },
      });
      expect(terminal.status(), `attempt ${attempt}`).toBe(409);
      const body = await terminal.json() as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["correlationId", "error"]);
      expect(body.error).toBe("We could not connect that sign-in method. No account data was changed.");
      expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(JSON.stringify(body)).not.toContain("attacker.invalid");
      expect(cacheControl(terminal)).toBe("private, no-store");
      expect(setCookie(terminal)).toBe("");
    }

    const limited = await request.post("/api/auth/link-intent", {
      headers: {
        ...ownerRecentAuthentication,
        Origin: baseURL,
        "X-Real-IP": "identity-link-create-sixth-ip",
      },
    });
    expect(limited.status()).toBe(429);
    expect(await limited.json()).toEqual({ error: "Too many requests. Please wait a moment and try again." });
    expect(cacheControl(limited)).toBe("private, no-store");
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(540);
    expect(Number(limited.headers()["retry-after"])).toBeLessThanOrEqual(600);
    expect(setCookie(limited)).toBe("");
  });

  test("completion preserves the cookie for untrusted and limited requests but clears it on terminal intent failures", async ({ request }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL);
    const caller = `identity-link-complete-${crypto.randomUUID()}`;
    const token = "A".repeat(43);
    const trustedHeaders = {
      Authorization: "Bearer playwright-external-signup-disabled",
      Origin: baseURL,
      "X-Real-IP": caller,
      Cookie: `${INTENT_COOKIE}=${token}`,
    };

    const crossSite = await request.post(COMPLETE_COOKIE_PATH, {
      headers: {
        ...trustedHeaders,
        Origin: "https://attacker.invalid",
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(crossSite.status()).toBe(403);
    expect(cacheControl(crossSite)).toBe("private, no-store");
    expect(setCookie(crossSite)).toBe("");

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const terminal = await request.post(COMPLETE_COOKIE_PATH, { headers: trustedHeaders });
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

    const limited = await request.post(COMPLETE_COOKIE_PATH, { headers: trustedHeaders });
    expect(limited.status()).toBe(429);
    expect(await limited.json()).toEqual({ error: "Too many requests. Please wait a moment and try again." });
    expect(cacheControl(limited)).toBe("private, no-store");
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(540);
    expect(Number(limited.headers()["retry-after"])).toBeLessThanOrEqual(600);
    expect(setCookie(limited)).toBe("");
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
