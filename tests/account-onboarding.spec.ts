import { readFile } from "node:fs/promises";
import { expect, test, type TestInfo } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { playwrightOwnedStorePath } from "./fixtures/playwright-server";

const onboardingRun = crypto.randomUUID();
const displayRun = crypto.randomUUID();
const authorization = {
  Authorization: `Bearer playwright-preaccount-learner-${onboardingRun}`,
  "X-Reauthentication-Token": `playwright-preaccount-learner-${onboardingRun}`,
};

const sameEmailAuthorization = {
  Authorization: `Bearer playwright-preaccount-same-email-learner-${onboardingRun}`,
  "X-Reauthentication-Token": `playwright-preaccount-same-email-learner-${onboardingRun}`,
};

const disabledExternalSignupAuthorization = {
  Authorization: "Bearer playwright-external-signup-disabled",
};

const firstDisplayNameAuthorization = {
  Authorization: `Bearer playwright-display-name-first-${displayRun}`,
  "X-Reauthentication-Token": `playwright-display-name-first-${displayRun}`,
};

const changedDisplayNameAuthorization = {
  Authorization: `Bearer playwright-display-name-changed-${displayRun}`,
  "X-Reauthentication-Token": `playwright-display-name-changed-${displayRun}`,
};

type PlaywrightStore = Record<string, Record<string, unknown>>;

async function readPlaywrightOwnedStore(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;
  expect(typeof baseURL).toBe("string");
  return JSON.parse(await readFile(playwrightOwnedStorePath(baseURL), "utf8")) as PlaywrightStore;
}

function rejectedRegistrationPaths(uid: string) {
  const acceptanceId = `${TERMS_VERSION}__${PRIVACY_VERSION}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  return [
    `users/${uid}`,
    `users/${uid}/legalAcceptances/${acceptanceId}`,
    `productEvents/signup-completed-${uid}`,
  ];
}

const zeroCapabilityLinkRequiredAccount = {
  access: "free",
  plan: "free",
  isOwner: false,
  accountStatus: "active",
  displayName: "Same-email Learner",
  subscriptionStatus: "none",
  capabilities: {
    createCourse: false,
    generateLesson: false,
    flashcardDecksEnabled: false,
    createCustomFlashcardDeck: false,
    publishCourse: false,
    advancedCapstoneAnalysis: false,
    exportEvidenceReport: false,
    shareEvidenceReport: false,
  },
  courseCredits: {
    balance: 0,
    monthlyAllocation: 0,
    balanceCap: 0,
    nextAccrualAt: null,
    frozenUntil: null,
  },
  legalAcceptanceRequired: false,
  applicationAccountExists: false,
  identityLinkRequired: true,
  currentTermsVersion: TERMS_VERSION,
  currentPrivacyVersion: PRIVACY_VERSION,
  quotas: [],
};

test("persists no application account until the learner accepts the current legal terms", { tag: "@smoke" }, async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One isolated server-side onboarding contract is sufficient.");

  const token = `playwright-preaccount-learner-${crypto.randomUUID()}`;
  const authorization = { Authorization: `Bearer ${token}`, "X-Reauthentication-Token": token };

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
    uid: `local-preaccount-learner-${onboardingRun}`,
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
    expect(await pendingAccount.json()).toEqual(zeroCapabilityLinkRequiredAccount);

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
    expect(acceptance.headers()["cache-control"]).toBe("private, no-store");
    expect(await acceptance.json()).toEqual({
      code: "identity_link_required",
      error: "This email is already connected to a Filosage learning account. Confirm your existing sign-in to connect the new method.",
    });

    const unchangedAccount = await request.get("/api/account", { headers: sameEmailAuthorization });
    expect(unchangedAccount.ok()).toBe(true);
    expect(await unchangedAccount.json()).toEqual(zeroCapabilityLinkRequiredAccount);

    const store = await readPlaywrightOwnedStore(testInfo);
    for (const path of rejectedRegistrationPaths(`local-preaccount-same-email-learner-${onboardingRun}`)) {
      expect(store[path], `${path} must not be created after identity-link rejection.`).toBeUndefined();
    }
  } finally {
    const cleanup = await request.delete("/api/account/data", {
      headers: authorization,
      data: { confirmation: "DELETE MY ACCOUNT" },
    });
    expect(cleanup.ok()).toBe(true);
  }
});

test("inactive External ID signup returns bounded retry guidance without durable writes", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One isolated server-side signup-gate contract is sufficient.");

  const acceptance = await request.post("/api/legal/acceptance", {
    headers: disabledExternalSignupAuthorization,
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });

  expect(acceptance.status()).toBe(503);
  expect(acceptance.headers()["cache-control"]).toBe("private, no-store");
  expect(acceptance.headers()["retry-after"]).toBe("300");
  expect(await acceptance.json()).toEqual({
    code: "external_id_signup_unavailable",
    error: "Email-code sign-up is not available yet. You can continue with Google.",
  });

  const store = await readPlaywrightOwnedStore(testInfo);
  for (const path of rejectedRegistrationPaths("local-external-signup-disabled")) {
    expect(store[path], `${path} must not be created while External ID signup is inactive.`).toBeUndefined();
  }
});

test("seeds a provider name once and preserves an edited Filosage profile name", { tag: "@smoke" }, async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One isolated server-side profile contract is sufficient.");

  const acceptance = await request.post("/api/legal/acceptance", {
    headers: firstDisplayNameAuthorization,
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(acceptance.ok()).toBe(true);

  try {
    const seeded = await request.get("/api/account", { headers: firstDisplayNameAuthorization });
    expect(seeded.ok()).toBe(true);
    expect(await seeded.json()).toMatchObject({ displayName: "QA Learner" });

    const updated = await request.patch("/api/account", {
      headers: firstDisplayNameAuthorization,
      data: { displayName: "  Avery\t  N.  " },
    });
    expect(updated.status()).toBe(200);
    expect(updated.headers()["cache-control"]).toBe("private, no-store");
    expect(await updated.json()).toEqual({ displayName: "Avery N." });

    const changedProviderClaim = await request.get("/api/account", {
      headers: changedDisplayNameAuthorization,
    });
    expect(changedProviderClaim.ok()).toBe(true);
    expect(await changedProviderClaim.json()).toMatchObject({ displayName: "Avery N." });

    const beforeRejectedUpdate = await readPlaywrightOwnedStore(testInfo);
    const rejected = await request.patch("/api/account", {
      headers: changedDisplayNameAuthorization,
      data: { displayName: "unknown", privateField: "must-not-be-stored" },
    });
    expect(rejected.status()).toBe(400);
    expect(await rejected.json()).toEqual({ error: "Enter a name between 1 and 80 characters." });
    const afterRejectedUpdate = await readPlaywrightOwnedStore(testInfo);
    expect(afterRejectedUpdate[`users/local-display-name-learner-${displayRun}`]).toEqual(
      beforeRejectedUpdate[`users/local-display-name-learner-${displayRun}`],
    );
  } finally {
    const cleanup = await request.delete("/api/account/data", {
      headers: firstDisplayNameAuthorization,
      data: { confirmation: "DELETE MY ACCOUNT" },
    });
    expect(cleanup.ok()).toBe(true);
  }
});

test("presents a signed-in identity without an application account as initial setup", { tag: "@smoke" }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One UI acceptance contract is sufficient.");

  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "free",
      plan: "free",
      isOwner: false,
      accountStatus: "active",
      subscriptionStatus: "none",
      capabilities: {
        createCourse: false,
        generateLesson: false,
        flashcardDecksEnabled: false,
        createCustomFlashcardDeck: false,
        publishCourse: false,
        advancedCapstoneAnalysis: false,
        exportEvidenceReport: false,
        shareEvidenceReport: false,
      },
      courseCredits: { balance: 0, monthlyAllocation: 0, balanceCap: 0, nextAccrualAt: null, frozenUntil: null },
      legalAcceptanceRequired: true,
      applicationAccountExists: false,
      identityLinkRequired: false,
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
      capabilities: {
        createCourse: false,
        generateLesson: false,
        flashcardDecksEnabled: false,
        createCustomFlashcardDeck: false,
        publishCourse: false,
        advancedCapstoneAnalysis: false,
        exportEvidenceReport: false,
        shareEvidenceReport: false,
      },
      courseCredits: { balance: 0, monthlyAllocation: 0, balanceCap: 0, nextAccrualAt: null, frozenUntil: null },
      legalAcceptanceRequired: true,
      applicationAccountExists: false,
      identityLinkRequired: false,
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
