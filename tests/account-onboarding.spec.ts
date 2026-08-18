import { expect, test } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const authorization = {
  Authorization: "Bearer playwright-preaccount-learner",
  "X-Reauthentication-Token": "playwright-preaccount-learner",
};

const sameEmailAuthorization = {
  Authorization: "Bearer playwright-preaccount-same-email-learner",
  "X-Reauthentication-Token": "playwright-preaccount-same-email-learner",
};

test("persists no application account until the learner accepts the current legal terms", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One isolated server-side onboarding contract is sufficient.");

  // Make the fixed local identity retry-safe if an earlier interrupted run
  // completed acceptance but stopped before cleanup.
  await request.delete("/api/account/data", {
    headers: authorization,
    data: { confirmation: "DELETE MY ACCOUNT" },
  });

  const pendingAccount = await request.get("/api/account", { headers: authorization });
  expect(pendingAccount.ok()).toBe(true);
  expect(await pendingAccount.json()).toMatchObject({
    access: "free",
    plan: "free",
    legalAcceptanceRequired: true,
    applicationAccountExists: false,
    identityLinkRequired: false,
    quotas: [],
  });

  const prematureExport = await request.get("/api/account/data", { headers: authorization });
  expect(prematureExport.status()).toBe(403);

  const prematureMutation = await request.post("/api/pricing-intent", {
    headers: authorization,
    data: { planId: "plus", interval: "annual", readiness: "researching", launchEmailConsent: false },
  });
  expect(prematureMutation.status()).toBe(403);

  const acceptance = await request.post("/api/legal/acceptance", {
    headers: authorization,
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      // Deliberately mislabeled by the client: the server must derive this as
      // an initial signup from the absence of an application account.
      source: "terms-update",
    },
  });
  expect(acceptance.ok()).toBe(true);

  try {
    const activeAccount = await request.get("/api/account", { headers: authorization });
    expect(activeAccount.ok()).toBe(true);
    expect(await activeAccount.json()).toMatchObject({
      access: "free",
      plan: "free",
      legalAcceptanceRequired: false,
      applicationAccountExists: true,
      identityLinkRequired: false,
    });
    const consentGranted = await request.post("/api/pricing-intent", {
      headers: authorization,
      data: { planId: "plus", interval: "annual", readiness: "researching", launchEmailConsent: true },
    });
    expect(consentGranted.ok()).toBe(true);
    const consentWithdrawn = await request.post("/api/pricing-intent", {
      headers: authorization,
      data: { planId: "plus", interval: "annual", readiness: "researching", launchEmailConsent: false },
    });
    expect(consentWithdrawn.ok()).toBe(true);
    expect(await consentWithdrawn.json()).toMatchObject({
      intent: { launchEmailConsent: false },
    });

    const dataExport = await request.get("/api/account/data", { headers: authorization });
    expect(dataExport.ok()).toBe(true);
    expect(await dataExport.json()).toMatchObject({
      data: {
        legalAcceptances: [expect.objectContaining({
          source: "signup",
          sources: expect.arrayContaining(["signup"]),
        })],
        pricingIntent: { launchEmailConsent: false },
        launchWaitlistRecord: { status: "unsubscribed", marketingConsent: false },
      },
    });
  } finally {
    const cleanup = await request.delete("/api/account/data", {
      headers: authorization,
      data: { confirmation: "DELETE MY ACCOUNT" },
    });
    expect(cleanup.ok()).toBe(true);
  }
});

test("returns only a provider label in the public session identity", async ({ request }) => {
  const response = await request.get("/api/auth/session", { headers: authorization });
  expect(response.ok()).toBe(true);
  const session = await response.json();
  expect(session.user).toMatchObject({
    uid: "local-preaccount-learner",
    authenticationProvider: "local",
  });
  expect(session.user).not.toHaveProperty("subject");
  expect(session.user).not.toHaveProperty("issuer");
  expect(session.user).not.toHaveProperty("providerIdentity");
});

test("same-email identities receive bounded link-required state without account creation", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One isolated server-side linking contract is sufficient.");

  const ownerAcceptance = await request.post("/api/legal/acceptance", {
    headers: authorization,
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(ownerAcceptance.ok()).toBe(true);

  try {
    const pendingAccount = await request.get("/api/account", { headers: sameEmailAuthorization });
    expect(pendingAccount.ok()).toBe(true);
    expect(await pendingAccount.json()).toMatchObject({
      applicationAccountExists: false,
      legalAcceptanceRequired: false,
      identityLinkRequired: true,
    });

    const acceptance = await request.post("/api/legal/acceptance", {
      headers: sameEmailAuthorization,
      data: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        ageEligibilityConfirmed: true,
        source: "signup",
      },
    });
    expect(acceptance.status()).toBe(409);
    expect(await acceptance.json()).toEqual({
      code: "identity_link_required",
      error: "This email is already connected to a Filosage learning account. Confirm your existing sign-in to connect the new method.",
    });

    const unchangedAccount = await request.get("/api/account", { headers: sameEmailAuthorization });
    expect(unchangedAccount.ok()).toBe(true);
    expect(await unchangedAccount.json()).toMatchObject({
      applicationAccountExists: false,
      legalAcceptanceRequired: false,
      identityLinkRequired: true,
    });
  } finally {
    const cleanup = await request.delete("/api/account/data", {
      headers: authorization,
      data: { confirmation: "DELETE MY ACCOUNT" },
    });
    expect(cleanup.ok()).toBe(true);
  }
});

test("presents a signed-in identity without an application account as initial setup", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One UI acceptance contract is sufficient.");

  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "free",
      plan: "free",
      isOwner: false,
      accountStatus: "active",
      subscriptionStatus: "none",
      legalAcceptanceRequired: true,
      applicationAccountExists: false,
      currentTermsVersion: TERMS_VERSION,
      currentPrivacyVersion: PRIVACY_VERSION,
      quotas: [],
    },
  }));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("filosage-playwright-preaccount-bootstrapped")) return;
    localStorage.setItem("filosage-local-session", "1");
    sessionStorage.setItem("filosage-playwright-preaccount-bootstrapped", "1");
  });
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Review before creating your account" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Account setup", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/before Filosage creates your learning account/i)).toBeVisible();
});

test("returns initial-setup users to the public landing page when they sign out", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One UI logout contract is sufficient for this modal.");

  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "free",
      plan: "free",
      isOwner: false,
      accountStatus: "active",
      subscriptionStatus: "none",
      legalAcceptanceRequired: true,
      applicationAccountExists: false,
      currentTermsVersion: TERMS_VERSION,
      currentPrivacyVersion: PRIVACY_VERSION,
      quotas: [],
    },
  }));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("filosage-playwright-preaccount-bootstrapped")) return;
    localStorage.setItem("filosage-local-session", "1");
    sessionStorage.setItem("filosage-playwright-preaccount-bootstrapped", "1");
  });
  await page.goto("/profile");

  await page.getByRole("dialog", { name: "Review before creating your account" })
    .getByRole("button", { name: "Sign out" })
    .click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("filosage-local-session"))).toBeNull();
});
