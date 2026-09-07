import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../../src/lib/legal";
import { MEMBERSHIP_PLANS } from "../../src/lib/membership-plans";

type CommonMockLearnerAccountOptions = {
  subscriptionStatus?: "none" | "trialing" | "active" | "past_due" | "canceled";
  displayName?: string;
  flashcardDecksEnabled?: boolean;
  quotas?: Array<{
    feature: "course_outline" | "course_banner" | "lesson_generation" | "tutor" | "flashcard_generation";
    limit: number | null;
    used: number;
    remaining: number | null;
    resetAt: string;
  }>;
};

type MockLearnerAccountOptions = CommonMockLearnerAccountOptions & (
  | { isOwner: true; plan?: never }
  | { isOwner?: false; plan?: keyof typeof MEMBERSHIP_PLANS }
);

export function exactLearnerAccount(options: MockLearnerAccountOptions = {}) {
  const isOwner = options.isOwner === true;
  const plan = isOwner ? "pro" : options.plan ?? "free";
  const membership = MEMBERSHIP_PLANS[plan];
  const paidCredits = plan === "free"
    ? {
        balance: 0,
        monthlyAllocation: 0,
        balanceCap: 0,
        nextAccrualAt: null,
        frozenUntil: null,
      }
    : {
        balance: membership.limits.courseCreditsPerMonth,
        monthlyAllocation: membership.limits.courseCreditsPerMonth,
        balanceCap: membership.limits.courseCreditBalanceCap,
        nextAccrualAt: "2026-09-18T00:00:00.000Z",
        frozenUntil: null,
      };

  return {
    access: isOwner ? "owner" as const : plan,
    plan,
    isOwner,
    accountStatus: "active" as const,
    subscriptionStatus: options.subscriptionStatus ?? "none",
    displayName: options.displayName ?? "Playwright Learner",
    capabilities: {
      createCourse: isOwner || membership.capabilities.create_course,
      generateLesson: isOwner || membership.capabilities.generate_lesson,
      flashcardDecksEnabled: options.flashcardDecksEnabled ?? false,
      createCustomFlashcardDeck: isOwner || membership.capabilities.create_custom_flashcard_deck,
      publishCourse: isOwner || membership.capabilities.publish_course,
      advancedCapstoneAnalysis: isOwner || membership.capabilities.advanced_capstone_analysis,
      exportEvidenceReport: isOwner || membership.capabilities.export_evidence_report,
      shareEvidenceReport: isOwner || membership.capabilities.share_evidence_report,
    },
    courseCredits: isOwner
      ? { balance: null, monthlyAllocation: null, balanceCap: null, nextAccrualAt: null, frozenUntil: null }
      : paidCredits,
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

export async function ensureLocalLearnerAccepted(request: APIRequestContext) {
  const headers = { Authorization: "Bearer playwright-local-owner" };
  const response = await request.get("/api/account", { headers });
  expect(response.ok(), "The local learner account must be readable before setup.").toBe(true);
  const account = await response.json();
  if (account.legalAcceptanceRequired === false
    && account.identityLinkRequired === false
    && account.acceptedTermsVersion === TERMS_VERSION
    && account.acceptedPrivacyVersion === PRIVACY_VERSION) return;

  const acceptance = await request.post("/api/legal/acceptance", {
    maxRetries: 1,
    headers,
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(acceptance.ok()).toBe(true);
  const acceptedAccount = await request.get("/api/account", { headers });
  expect(acceptedAccount.ok()).toBe(true);
  expect(await acceptedAccount.json()).toMatchObject({
    legalAcceptanceRequired: false,
    identityLinkRequired: false,
    acceptedTermsVersion: TERMS_VERSION,
    acceptedPrivacyVersion: PRIVACY_VERSION,
  });
}

export async function restoreLocalLearner(page: Page) {
  await ensureLocalLearnerAccepted(page.request);
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
      isOwner: true,
      displayName,
      flashcardDecksEnabled: true,
    }),
  }));
}
