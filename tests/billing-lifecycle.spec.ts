import { expect, test } from "@playwright/test";
import { evaluateBillingConfiguration, subscriptionBlocksCheckout } from "../src/lib/billing-lock";
import { readBoundedRequestText } from "../src/lib/bounded-request-body";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { restoreLocalLearner } from "./fixtures/local-learner";

const stripeLifecycle = {
  BILLING_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PLUS_MONTHLY_PRICE_ID: "price_plus_monthly",
  STRIPE_PLUS_ANNUAL_PRICE_ID: "price_plus_annual",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_monthly",
  STRIPE_PRO_ANNUAL_PRICE_ID: "price_annual",
};

test("closing checkout preserves existing subscriber management and lifecycle processing", () => {
  expect(evaluateBillingConfiguration({ ...stripeLifecycle, BILLING_ENABLED: "false" })).toMatchObject({
    enabled: false,
    managementReady: true,
    webhookReady: true,
    productReady: true,
    providerReady: true,
    checkoutReady: false,
    configured: false,
  });
});

test("billing capabilities fail closed at the narrowest safe boundary", () => {
  expect(evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ENABLED: "true",
  })).toMatchObject({
    managementReady: true,
    webhookReady: true,
    productReady: true,
    providerReady: true,
    checkoutReady: true,
    configured: true,
  });

  expect(evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ENABLED: "true",
    STRIPE_WEBHOOK_SECRET: "",
  })).toMatchObject({
    managementReady: true,
    webhookReady: false,
    productReady: true,
    providerReady: false,
    checkoutReady: false,
  });

  expect(evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ENABLED: "true",
    STRIPE_PRO_MONTHLY_PRICE_ID: "",
  })).toMatchObject({
    managementReady: true,
    webhookReady: true,
    productReady: false,
    providerReady: false,
    checkoutReady: false,
  });

  expect(evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ENABLED: "true",
    STRIPE_SECRET_KEY: "",
  })).toMatchObject({
    managementReady: false,
    webhookReady: false,
    productReady: false,
    providerReady: false,
    checkoutReady: false,
  });
});

test("existing and payment-recovery subscriptions cannot start another checkout", () => {
  expect(subscriptionBlocksCheckout("active")).toBe(true);
  expect(subscriptionBlocksCheckout("trialing")).toBe(true);
  expect(subscriptionBlocksCheckout("past_due")).toBe(true);
  expect(subscriptionBlocksCheckout("canceled")).toBe(false);
  expect(subscriptionBlocksCheckout("none")).toBe(false);
});

test("webhook raw bodies are preserved and bounded by bytes", async () => {
  const body = JSON.stringify({ note: "café" });
  const bodyBytes = new TextEncoder().encode(body).byteLength;

  expect(await readBoundedRequestText(new Request("https://filosage.test/webhook", {
    method: "POST",
    body,
  }), bodyBytes)).toBe(body);
  expect(await readBoundedRequestText(new Request("https://filosage.test/webhook", {
    method: "POST",
    body,
  }), bodyBytes - 1)).toBeNull();
  expect(await readBoundedRequestText(new Request("https://filosage.test/webhook", {
    method: "POST",
    body: "{}",
    headers: { "Content-Length": String(bodyBytes + 1) },
  }), bodyBytes)).toBeNull();
});

test("billing routes report and enforce the closed checkout boundary", async ({ page }) => {
  const statusResponse = await page.request.get("/api/billing/status");
  expect(statusResponse.ok()).toBe(true);
  expect(await statusResponse.json()).toMatchObject({
    enabled: false,
    managementReady: false,
    checkoutReady: false,
    ready: false,
  });

  await restoreLocalLearner(page);
  const checkoutResponse = await page.request.post("/api/billing/checkout", {
    headers: { Authorization: "Bearer playwright-local-owner" },
    data: { planId: "plus", interval: "monthly" },
  });
  expect(checkoutResponse.status()).toBe(503);
  expect(await checkoutResponse.json()).toEqual({ error: "Paid subscriptions are not available yet." });
});

test("a direct API caller cannot exceed the Plus owned-course limit", async ({ request }) => {
  const plusHeaders = { Authorization: "Bearer playwright-plus-learner" };
  const acceptance = await request.post("/api/legal/acceptance", {
    headers: plusHeaders,
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(acceptance.ok()).toBe(true);

  const ownerAcceptance = await request.post("/api/legal/acceptance", {
    headers: { Authorization: "Bearer playwright-local-owner" },
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(ownerAcceptance.ok()).toBe(true);

  const grant = await request.patch("/api/admin/users/local-plus-learner", {
    headers: { Authorization: "Bearer playwright-local-owner" },
    data: { action: "grant_plan", planId: "plus", duration: 7 },
  });
  expect(grant.ok(), await grant.text()).toBe(true);

  const account = await request.get("/api/account", { headers: plusHeaders });
  expect(await account.json()).toMatchObject({
    plan: "plus",
    capabilities: { createCourse: true, publishCourse: false },
    courseCapacity: { owned: 0, limit: 1, remaining: 1, overLimit: false },
  });

  const firstCourse = await request.post("/api/generate-course", {
    headers: { ...plusHeaders, "Idempotency-Key": "plus-capacity-first-course" },
    data: { topic: "Decision quality for Plus capacity testing", targetWeeks: 4 },
  });
  const firstCourseBody = await firstCourse.json() as {
    courseId?: string;
    error?: string;
    modules?: Array<{ lessons: Array<{ title: string; concept: string }> }>;
  };
  expect(firstCourse.ok(), JSON.stringify(firstCourseBody)).toBe(true);
  expect(firstCourseBody.courseId).toBeTruthy();

  const firstLesson = firstCourseBody.modules?.[0]?.lessons[0];
  expect(firstLesson).toBeTruthy();
  const generatedLesson = await request.post("/api/generate-lesson", {
    headers: { ...plusHeaders, "Idempotency-Key": "plus-first-generated-lesson" },
    data: {
      topic: "Decision quality for Plus capacity testing",
      lessonTitle: firstLesson?.title,
      lessonConcept: firstLesson?.concept,
      courseId: firstCourseBody.courseId,
      lessonId: "0-0",
    },
  });
  expect(generatedLesson.ok(), await generatedLesson.text()).toBe(true);
  const savedLesson = await request.get(`/api/courses/${firstCourseBody.courseId}/lessons/0-0`, { headers: plusHeaders });
  expect(savedLesson.ok()).toBe(true);

  const retry = await request.post("/api/generate-course", {
    headers: { ...plusHeaders, "Idempotency-Key": "plus-capacity-first-course" },
    data: { topic: "Decision quality for Plus capacity testing", targetWeeks: 4 },
  });
  expect(retry.ok(), await retry.text()).toBe(true);

  const publish = await request.patch(`/api/courses/${firstCourseBody.courseId}`, {
    headers: plusHeaders,
    data: { isPublic: true },
  });
  expect(publish.status()).toBe(403);
  expect(await publish.json()).toMatchObject({ code: "PLAN_CAPABILITY_REQUIRED" });

  const overLimit = await request.post("/api/generate-course", {
    headers: { ...plusHeaders, "Idempotency-Key": "plus-capacity-second-course" },
    data: { topic: "A second private course", targetWeeks: 4 },
  });
  expect(overLimit.status()).toBe(409);
  expect(await overLimit.json()).toMatchObject({
    code: "COURSE_CAPACITY_REACHED",
    limit: 1,
    owned: 1,
  });
});

test("a past-due subscriber can reach billing management while checkout is closed", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
  await page.route("**/api/billing/status", (route) => route.fulfill({
    json: { enabled: false, ready: false, checkoutReady: false, managementReady: true },
  }));
  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "free",
      plan: "free",
      isOwner: false,
      accountStatus: "active",
      displayName: "Payment Recovery Learner",
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
      legalAcceptanceRequired: false,
      currentTermsVersion: TERMS_VERSION,
      currentPrivacyVersion: PRIVACY_VERSION,
      subscriptionStatus: "past_due",
      quotas: [],
    },
  }));

  await page.goto("/pricing");
  await expect(page.getByText("Payment needs attention")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage billing" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Choose Pro/ })).toHaveCount(0);
});
