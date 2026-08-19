import { expect, type Page } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../../src/lib/legal";

type MockLearnerAccountOptions = {
  access?: "free" | "plus" | "pro" | "owner";
  plan?: "free" | "plus" | "pro";
  isOwner?: boolean;
  subscriptionStatus?: "none" | "trialing" | "active" | "past_due" | "canceled";
  displayName?: string;
  capabilities?: Partial<{
    createCourse: boolean;
    generateLesson: boolean;
    flashcardDecksEnabled: boolean;
    createCustomFlashcardDeck: boolean;
    publishCourse: boolean;
    advancedCapstoneAnalysis: boolean;
    exportEvidenceReport: boolean;
    shareEvidenceReport: boolean;
  }>;
  courseCredits?: Partial<{
    balance: number | null;
    monthlyAllocation: number | null;
    balanceCap: number | null;
    nextAccrualAt: string | null;
    frozenUntil: string | null;
  }>;
  quotas?: Array<{
    feature: "course_outline" | "course_banner" | "lesson_generation" | "tutor" | "flashcard_generation";
    limit: number | null;
    used: number;
    remaining: number | null;
    resetAt: string;
  }>;
};

export function exactLearnerAccount(options: MockLearnerAccountOptions = {}) {
  return {
    access: options.access ?? "free",
    plan: options.plan ?? "free",
    isOwner: options.isOwner ?? false,
    accountStatus: "active" as const,
    subscriptionStatus: options.subscriptionStatus ?? "none",
    displayName: options.displayName ?? "Playwright Learner",
    capabilities: {
      createCourse: false,
      generateLesson: false,
      flashcardDecksEnabled: false,
      createCustomFlashcardDeck: false,
      publishCourse: false,
      advancedCapstoneAnalysis: false,
      exportEvidenceReport: false,
      shareEvidenceReport: false,
      ...options.capabilities,
    },
    courseCredits: {
      balance: 0,
      monthlyAllocation: 0,
      balanceCap: 0,
      nextAccrualAt: null,
      frozenUntil: null,
      ...options.courseCredits,
    },
    applicationAccountExists: true,
    identityLinkRequired: false,
    acceptedTermsVersion: TERMS_VERSION,
    acceptedPrivacyVersion: PRIVACY_VERSION,
    legalAcceptanceRequired: false,
    currentTermsVersion: TERMS_VERSION,
    currentPrivacyVersion: PRIVACY_VERSION,
    quotas: options.quotas ?? [],
  };
}

export async function restoreLocalLearner(page: Page) {
  const acceptance = await page.request.post("/api/legal/acceptance", {
    maxRetries: 1,
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
    const bootstrapKey = "filosage-playwright-session-bootstrapped";
    if (sessionStorage.getItem(bootstrapKey)) return;
    localStorage.setItem("filosage-local-session", "1");
    sessionStorage.setItem(bootstrapKey, "1");
  });
}

export async function mockFreeLearnerAccount(page: Page) {
  await page.route("**/api/account", (route) => route.fulfill({
    json: exactLearnerAccount(),
  }));
}

export async function mockOwnerLearnerAccount(page: Page, displayName = "Playwright Owner") {
  await page.route("**/api/account", (route) => route.fulfill({
    json: exactLearnerAccount({
      access: "owner",
      plan: "pro",
      isOwner: true,
      displayName,
      capabilities: {
        createCourse: true,
        generateLesson: true,
        flashcardDecksEnabled: true,
        createCustomFlashcardDeck: true,
        publishCourse: true,
        advancedCapstoneAnalysis: true,
        exportEvidenceReport: true,
        shareEvidenceReport: true,
      },
      courseCredits: {
        balance: null,
        monthlyAllocation: null,
        balanceCap: null,
      },
    }),
  }));
}
