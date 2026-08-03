import { expect, test } from "@playwright/test";
import { evaluateBillingConfiguration, subscriptionBlocksCheckout } from "../src/lib/billing-lock";
import { readBoundedRequestText } from "../src/lib/bounded-request-body";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { restoreLocalLearner } from "./fixtures/local-learner";

const stripeLifecycle = {
  BILLING_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
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

  expect(await readBoundedRequestText(new Request("https://erudoza.test/webhook", {
    method: "POST",
    body,
  }), bodyBytes)).toBe(body);
  expect(await readBoundedRequestText(new Request("https://erudoza.test/webhook", {
    method: "POST",
    body,
  }), bodyBytes - 1)).toBeNull();
  expect(await readBoundedRequestText(new Request("https://erudoza.test/webhook", {
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
    data: { interval: "monthly" },
  });
  expect(checkoutResponse.status()).toBe(503);
  expect(await checkoutResponse.json()).toEqual({ error: "Paid subscriptions are not available yet." });
});

test("a past-due subscriber can reach billing management while checkout is closed", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("erudoza-local-session", "1"));
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
