import { expect, type Page } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../../src/lib/legal";

export async function restoreLocalLearner(page: Page) {
  const acceptance = await page.request.post("/api/legal/acceptance", {
    headers: { Authorization: "Bearer playwright-local-owner" },
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(acceptance.ok()).toBe(true);
  await page.addInitScript(() => {
    const bootstrapKey = "erudoza-playwright-session-bootstrapped";
    if (sessionStorage.getItem(bootstrapKey)) return;
    localStorage.setItem("erudoza-local-session", "1");
    sessionStorage.setItem(bootstrapKey, "1");
  });
}

export async function mockFreeLearnerAccount(page: Page) {
  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "free",
      plan: "free",
      isOwner: false,
      accountStatus: "active",
      displayName: "Playwright Learner",
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
      legalAcceptanceRequired: false,
      currentTermsVersion: TERMS_VERSION,
      currentPrivacyVersion: PRIVACY_VERSION,
      quotas: [],
    },
  }));
}
