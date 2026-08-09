import { expect, test } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const authorization = { Authorization: "Bearer playwright-preaccount-learner" };

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
    quotas: [],
  });

  const prematureExport = await request.get("/api/account/data", { headers: authorization });
  expect(prematureExport.status()).toBe(403);

  const prematureMutation = await request.post("/api/pricing-intent", {
    headers: authorization,
    data: { interval: "annual", readiness: "researching", launchEmailConsent: false },
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
    });
    const consentGranted = await request.post("/api/pricing-intent", {
      headers: authorization,
      data: { interval: "annual", readiness: "researching", launchEmailConsent: true },
    });
    expect(consentGranted.ok()).toBe(true);
    const consentWithdrawn = await request.post("/api/pricing-intent", {
      headers: authorization,
      data: { interval: "annual", readiness: "researching", launchEmailConsent: false },
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
  await page.addInitScript(() => localStorage.setItem("erudoza-local-session", "1"));
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Review before creating your account" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Account setup", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/before Filosage creates your learning account/i)).toBeVisible();
});
