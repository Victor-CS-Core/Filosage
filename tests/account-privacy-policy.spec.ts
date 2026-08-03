import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  accountDeletionDocumentPaths,
  AUTOMATED_ACCOUNT_DELETION_RETENTION,
} from "../src/lib/account-data-policy";
import {
  ACCOUNT_DELETION_RECENT_AUTH_SECONDS,
  firebaseAuthenticationClaimsFromIdToken,
  hasRecentFirebaseAuthentication,
} from "../src/lib/recent-auth";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const projectLearnerTokens: Record<string, string> = {
  chromium: "playwright-free-learner",
  "mobile-chromium": "playwright-free-learner-mobile-chromium",
  "mobile-webkit": "playwright-free-learner-mobile-webkit",
};

function authorization(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function acceptCurrentLegalTerms(request: APIRequestContext, token: string) {
  const acceptance = await request.post("/api/legal/acceptance", {
    headers: authorization(token),
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(acceptance.ok()).toBe(true);
}

function testIdToken(payload: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "test-signature",
  ].join(".");
}

test("extracts auth_time only from a structurally valid Firebase ID token payload", () => {
  expect(firebaseAuthenticationClaimsFromIdToken(testIdToken({
    auth_time: 1_750_000_000,
    sub: "firebase-user-123",
  }))).toEqual({ authTime: 1_750_000_000, subject: "firebase-user-123" });
  expect(firebaseAuthenticationClaimsFromIdToken(testIdToken({ auth_time: "1750000000" }))).toEqual({});
  expect(firebaseAuthenticationClaimsFromIdToken("not-a-jwt")).toEqual({});
});

test("requires account-deletion authentication within the server policy window", () => {
  const now = 1_750_000_000;
  expect(hasRecentFirebaseAuthentication(now, now)).toBe(true);
  expect(hasRecentFirebaseAuthentication(now - ACCOUNT_DELETION_RECENT_AUTH_SECONDS, now)).toBe(true);
  expect(hasRecentFirebaseAuthentication(now - ACCOUNT_DELETION_RECENT_AUTH_SECONDS - 1, now)).toBe(false);
  expect(hasRecentFirebaseAuthentication(now + 60, now)).toBe(true);
  expect(hasRecentFirebaseAuthentication(now + 61, now)).toBe(false);
  expect(hasRecentFirebaseAuthentication(undefined, now)).toBe(false);
});

test("wires the destructive route to the recent-auth account guard", async () => {
  const source = await readFile("src/app/api/account/data/route.ts", "utf8");
  expect(source).toContain("requireRecentlyAuthenticatedAccount(request)");
  expect(source).not.toMatch(/export async function DELETE[\s\S]*?requireAccount\(request\)/);
});

test("limits local authentication to explicit owner and learner tokens", async ({ request }, testInfo) => {
  const learnerToken = projectLearnerTokens[testInfo.project.name];
  expect(learnerToken, `Add an explicit learner token for ${testInfo.project.name}.`).toBeTruthy();

  // Account records are created only by affirmative legal acceptance. Give
  // each project a distinct learner because this test permanently deletes it.
  await request.delete("/api/account/data", {
    headers: authorization(learnerToken),
    data: { confirmation: "DELETE MY ACCOUNT" },
  });
  await acceptCurrentLegalTerms(request, "local-dev-token");
  await acceptCurrentLegalTerms(request, learnerToken);

  const localDevOwner = await request.get("/api/account", {
    headers: authorization("local-dev-token"),
  });
  expect(localDevOwner.ok()).toBe(true);
  expect(await localDevOwner.json()).toMatchObject({ isOwner: true, access: "owner" });

  const playwrightOwner = await request.get("/api/account", {
    headers: authorization("playwright-local-owner"),
  });
  expect(playwrightOwner.ok()).toBe(true);
  expect(await playwrightOwner.json()).toMatchObject({ isOwner: true, access: "owner" });

  const freeLearner = await request.get("/api/account", {
    headers: authorization(learnerToken),
  });
  expect(freeLearner.ok()).toBe(true);
  expect(await freeLearner.json()).toMatchObject({
    isOwner: false,
    access: "free",
    plan: "free",
    displayName: "Playwright Learner",
  });

  const recentlyAuthenticatedDeletion = await request.delete("/api/account/data", {
    headers: authorization(learnerToken),
    data: { confirmation: "DELETE MY ACCOUNT" },
  });
  expect(recentlyAuthenticatedDeletion.ok()).toBe(true);
  expect(await recentlyAuthenticatedDeletion.json()).toMatchObject({ deleted: true });

  for (const token of ["arbitrary-local-bearer", "__proto__"]) {
    const arbitraryToken = await request.get("/api/account", {
      headers: authorization(token),
    });
    expect(arbitraryToken.status()).toBe(401);
  }
});

test("deletes every active account-data collection while excluding retained audit records", () => {
  const paths = accountDeletionDocumentPaths("learner-123", {
    courseProgress: [{ id: "course-a" }],
    learningOutcomes: [{ id: "outcome-a" }],
    masteryEvidence: [{ id: "evidence-a" }],
    lessonNotes: [{ id: "note-a" }],
    lessonActivityRecords: [{ id: "activity-a" }],
    aiUsagePeriods: [{ id: "usage-a" }],
    aiRequestRecords: [{ id: "request-a" }],
    aiBudgetRecords: [{ id: "budget-a" }],
    accountLinkedProductEvents: [{ id: "event-a" }],
    referralCodes: [{ id: "referral-a" }],
  }, "waitlist/email-hash");

  expect(paths).toEqual(expect.arrayContaining([
    "users/learner-123/courseProgress/course-a",
    "users/learner-123/learningOutcomes/outcome-a",
    "users/learner-123/masteryEvidence/evidence-a",
    "users/learner-123/lessonNotes/note-a",
    "users/learner-123/lessonActivity/activity-a",
    "users/learner-123/learningData/preferences",
    "users/learner-123/billingCheckout/current",
    "usagePeriods/usage-a",
    "aiRequests/request-a",
    "userAiBudgets/budget-a",
    "productEvents/event-a",
    "referralCodes/referral-a",
    "userEngagement/learner-123",
    "pricingIntents/learner-123",
    "waitlist/email-hash",
    "users/learner-123",
  ]));
  expect(paths.some((path) => path.includes("legalAcceptances"))).toBe(false);
  expect(paths.some((path) => path.includes("billingConsents"))).toBe(false);
  expect(paths.some((path) => path.startsWith("safetyEvents/"))).toBe(false);
  expect(paths.some((path) => path.startsWith("contentReports/"))).toBe(false);
  expect(paths.some((path) => path.startsWith("adminEvents/"))).toBe(false);
  expect(new Set(paths).size).toBe(paths.length);
});

test("documents every intentionally retained automated-deletion category", () => {
  expect(AUTOMATED_ACCOUNT_DELETION_RETENTION.map((entry) => entry.category)).toEqual([
    "Legal acceptance records",
    "Safety and enforcement records",
    "Billing and transaction records",
  ]);
  for (const entry of AUTOMATED_ACCOUNT_DELETION_RETENTION) {
    expect(entry.records.length).toBeGreaterThan(0);
    expect(entry.reason.length).toBeGreaterThan(30);
  }
  const billingRetention = AUTOMATED_ACCOUNT_DELETION_RETENTION.find(
    (entry) => entry.category === "Billing and transaction records",
  );
  expect(billingRetention?.records).toContain("Versioned billing authorization and checkout consent records");
});

test("exports the expanded account inventory and retention boundary", async ({ request }) => {
  await acceptCurrentLegalTerms(request, "playwright-local-owner");
  const response = await request.get("/api/account/data", {
    headers: authorization("playwright-local-owner"),
  });
  expect(response.ok()).toBe(true);
  const exported = await response.json();
  expect(exported.exportFormat).toBe("erudoza-account-data-v2");
  expect(exported.automatedDeletionRetention).toHaveLength(3);
  expect(Object.keys(exported.data)).toEqual(expect.arrayContaining([
    "lessonActivityRecords",
    "billingConsents",
    "billingCheckout",
    "userEngagement",
    "pricingIntent",
    "launchWaitlistRecord",
    "accountLinkedProductEvents",
    "referralCodes",
    "safetySummary",
    "safetyEvents",
    "contentReports",
    "adminActionRecords",
  ]));
});
