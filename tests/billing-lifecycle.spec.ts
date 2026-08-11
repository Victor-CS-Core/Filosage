import { expect, test } from "@playwright/test";
import {
  checkoutFulfillmentIsPaid,
  checkoutConsentMetadataIsCurrent,
  billingWebhookClaimDisposition,
  accountDeletionBlocksCheckout,
  CLOSED_LAUNCH_PAYMENT_METHOD_TYPES,
  accountDeletionRequiresStripeReconciliation,
  checkoutClaimRequiresDeletionRetry,
  chargeLifecyclePaymentState,
  durableBillingConsentMatches,
  invoiceLifecyclePaymentOverride,
  entitlementSubscriptionStatus,
  evaluateBillingConfiguration,
  normalizedSubscriptionStatus,
  resolvedBillingPaymentState,
  shouldApplyBillingEvent,
  stripeCustomerBindingMatches,
  subscriptionBlocksCheckout,
  terminalSubscriptionCanBeAcknowledgedWithoutAccount,
  type BillingEventCursor,
} from "../src/lib/billing-lock";
import { readBoundedRequestText } from "../src/lib/bounded-request-body";
import { PAID_SUBSCRIPTION_POLICY, PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { restoreLocalLearner } from "./fixtures/local-learner";

const stripeLifecycle = {
  BILLING_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PLUS_MONTHLY_PRICE_ID: "price_plus_monthly",
  STRIPE_PLUS_ANNUAL_PRICE_ID: "price_plus_annual",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_monthly",
  STRIPE_PRO_ANNUAL_PRICE_ID: "price_annual",
  LEGAL_OPERATOR_NAME: "Filosage LLC",
  LEGAL_BUSINESS_ADDRESS: "123 Example Street",
  GOVERNING_JURISDICTION: "New York",
  SUPPORT_EMAIL: "support@filosage.com",
};

test("closing checkout preserves existing subscriber management and lifecycle processing", () => {
  expect(evaluateBillingConfiguration({ ...stripeLifecycle, BILLING_ENABLED: "false" })).toMatchObject({
    enabled: false,
    managementReady: true,
    webhookReady: true,
    productReady: true,
    legalReady: true,
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
    legalReady: true,
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

  expect(evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ENABLED: "true",
    LEGAL_BUSINESS_ADDRESS: "",
  })).toMatchObject({
    managementReady: true,
    webhookReady: true,
    productReady: true,
    legalReady: false,
    providerReady: true,
    checkoutReady: false,
  });

  expect(evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ENABLED: "true",
    SUPPORT_EMAIL: "not-an-email",
  })).toMatchObject({ legalReady: false, checkoutReady: false });
});

test("existing and payment-recovery subscriptions cannot start another checkout", () => {
  expect(subscriptionBlocksCheckout("active")).toBe(true);
  expect(subscriptionBlocksCheckout("trialing")).toBe(true);
  expect(subscriptionBlocksCheckout("past_due")).toBe(true);
  expect(subscriptionBlocksCheckout("canceled")).toBe(false);
  expect(subscriptionBlocksCheckout("none")).toBe(false);
  expect(subscriptionBlocksCheckout("incomplete")).toBe(true);
  expect(subscriptionBlocksCheckout("unpaid")).toBe(true);
  expect(subscriptionBlocksCheckout("paused")).toBe(true);
  expect(subscriptionBlocksCheckout("future_nonterminal_state")).toBe(true);
  expect(subscriptionBlocksCheckout("incomplete_expired")).toBe(false);
});

test("account deletion reconciles remote billing state even before webhook sync", () => {
  expect(accountDeletionRequiresStripeReconciliation({
    billingCustomerId: "cus_checkout_completed",
    subscriptionStatus: "none",
  })).toBe(true);
  expect(accountDeletionRequiresStripeReconciliation({
    billingSubscriptionId: "sub_remote",
    subscriptionStatus: "canceled",
  })).toBe(true);
  expect(accountDeletionRequiresStripeReconciliation({ subscriptionStatus: "past_due" })).toBe(true);
  expect(accountDeletionRequiresStripeReconciliation({ subscriptionStatus: "none" })).toBe(false);
  expect(terminalSubscriptionCanBeAcknowledgedWithoutAccount("canceled")).toBe(true);
  expect(terminalSubscriptionCanBeAcknowledgedWithoutAccount("active")).toBe(false);
  expect(accountDeletionBlocksCheckout({ accountDeletionInProgress: true })).toBe(true);
  expect(accountDeletionBlocksCheckout({ accountDeletionInProgress: false })).toBe(false);
  expect(accountDeletionBlocksCheckout(null)).toBe(true);
  expect(checkoutClaimRequiresDeletionRetry("creating")).toBe(true);
  expect(checkoutClaimRequiresDeletionRetry("replacing")).toBe(true);
  expect(checkoutClaimRequiresDeletionRetry("open")).toBe(false);
});

test("Stripe customer bindings reject deleted and cross-account customers", () => {
  expect(stripeCustomerBindingMatches({ metadata: { filosage_uid: "user-1" } }, "user-1")).toBe(true);
  expect(stripeCustomerBindingMatches({ deleted: true, metadata: { filosage_uid: "user-1" } }, "user-1")).toBe(false);
  expect(stripeCustomerBindingMatches({ metadata: { filosage_uid: "user-2" } }, "user-1")).toBe(false);
});

test("every Stripe subscription status maps to a safe local lifecycle state", () => {
  expect(normalizedSubscriptionStatus("trialing")).toBe("trialing");
  expect(normalizedSubscriptionStatus("active")).toBe("active");
  expect(normalizedSubscriptionStatus("past_due")).toBe("past_due");
  expect(normalizedSubscriptionStatus("incomplete")).toBe("past_due");
  expect(normalizedSubscriptionStatus("unpaid")).toBe("past_due");
  expect(normalizedSubscriptionStatus("paused")).toBe("past_due");
  expect(normalizedSubscriptionStatus("canceled")).toBe("canceled");
  expect(normalizedSubscriptionStatus("incomplete_expired")).toBe("canceled");
  expect(normalizedSubscriptionStatus("future_nonterminal_state")).toBe("past_due");
});

test("paid entitlement requires a completed Checkout and paid invoice", () => {
  expect(CLOSED_LAUNCH_PAYMENT_METHOD_TYPES).toEqual(["card"]);
  const paid = {
    mode: "subscription",
    checkoutStatus: "complete",
    paymentStatus: "paid",
    invoicePaid: true,
    invoiceStatus: "paid",
  };
  expect(checkoutFulfillmentIsPaid(paid)).toBe(true);
  expect(checkoutFulfillmentIsPaid({ ...paid, paymentStatus: "unpaid" })).toBe(false);
  expect(checkoutFulfillmentIsPaid({ ...paid, invoicePaid: false, invoiceStatus: "open" })).toBe(false);
  expect(checkoutFulfillmentIsPaid({ ...paid, checkoutStatus: "open" })).toBe(false);
});

test("checkout consent rejects stale legal or offer snapshots", () => {
  const metadata = {
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    offer_version: "plus-v1-closed-launch",
    offer_currency: "usd",
    offer_amount_minor: "999",
    automatic_renewal: "true",
    purchaser_minimum_age: String(PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge),
    launch_market: PAID_SUBSCRIPTION_POLICY.launchMarketCode,
    refund_window_days: String(PAID_SUBSCRIPTION_POLICY.refundWindowDays),
  };
  const expected = {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    offerVersion: "plus-v1-closed-launch",
    currency: "usd",
    amountMinor: 999,
    minimumPurchaserAge: PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge,
    launchMarketCode: PAID_SUBSCRIPTION_POLICY.launchMarketCode,
    refundWindowDays: PAID_SUBSCRIPTION_POLICY.refundWindowDays,
  };
  expect(checkoutConsentMetadataIsCurrent(metadata, expected)).toBe(true);
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, terms_version: "stale" }, expected)).toBe(false);
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, offer_amount_minor: "998" }, expected)).toBe(false);
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, automatic_renewal: "false" }, expected)).toBe(false);
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, purchaser_minimum_age: "17" }, expected)).toBe(false);
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, launch_market: "worldwide" }, expected)).toBe(false);
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, refund_window_days: "0" }, expected)).toBe(false);
});

test("renewals preserve historical consent after legal or offer versions change", () => {
  const historicalConsentBinding = {
    billingConsentSubscriptionId: "sub_existing",
    billingConsentCustomerId: "cus_existing",
    billingConsentCheckoutSessionId: "cs_original_v1",
    billingConsentRecordedAt: "2026-01-01T00:00:00.000Z",
    billingConsentTermsVersion: "terms-v1",
    billingConsentPrivacyVersion: "privacy-v1",
    billingConsentOfferVersion: "pro-v1",
    billingConsentPriceId: "price_pro_v1",
    billingConsentPlanId: "pro",
    billingConsentInterval: "monthly",
  };
  const unchangedOffer = { priceId: "price_pro_v1", planId: "pro", interval: "monthly" };
  expect(durableBillingConsentMatches(historicalConsentBinding, "sub_existing", "cus_existing", unchangedOffer)).toBe(true);
  expect(checkoutConsentMetadataIsCurrent({
    terms_version: "terms-v1",
    privacy_version: "privacy-v1",
    offer_version: "pro-v1",
    offer_currency: "usd",
    offer_amount_minor: "1499",
    automatic_renewal: "true",
    purchaser_minimum_age: "18",
    launch_market: "US",
    refund_window_days: "7",
  }, {
    termsVersion: "terms-v2",
    privacyVersion: "privacy-v2",
    offerVersion: "pro-v2",
    currency: "usd",
    amountMinor: 1_599,
    minimumPurchaserAge: 18,
    launchMarketCode: "US",
    refundWindowDays: 7,
  })).toBe(false);
  expect(durableBillingConsentMatches(historicalConsentBinding, "sub_other", "cus_existing")).toBe(false);
  expect(durableBillingConsentMatches(historicalConsentBinding, "sub_existing", "cus_other")).toBe(false);
  expect(durableBillingConsentMatches(historicalConsentBinding, "sub_existing", "cus_existing", {
    ...unchangedOffer,
    priceId: "price_pro_v2",
  })).toBe(false);
});

test("concurrent webhook duplicates remain retryable until processing completes", () => {
  const now = Date.parse("2026-08-10T12:00:00.000Z");
  expect(billingWebhookClaimDisposition(null, now, 300_000)).toBe("claim");
  expect(billingWebhookClaimDisposition({
    status: "processing",
    claimedAt: "2026-08-10T11:59:59.000Z",
  }, now, 300_000)).toBe("in_flight");
  expect(billingWebhookClaimDisposition({
    status: "processed",
    claimedAt: "2026-08-10T11:59:59.000Z",
    processedAt: "2026-08-10T12:00:00.000Z",
  }, now, 300_000)).toBe("processed");
  expect(billingWebhookClaimDisposition({
    status: "failed",
    claimedAt: "2026-08-10T11:59:59.000Z",
  }, now, 300_000)).toBe("claim");
  expect(billingWebhookClaimDisposition({
    status: "processing",
    claimedAt: "2026-08-10T11:50:00.000Z",
  }, now, 300_000)).toBe("claim");
});

test("passive subscription updates preserve a paid invoice until an explicit payment event", () => {
  const paymentState = resolvedBillingPaymentState("paid", true, undefined);
  expect(paymentState).toBe("paid");
  expect(entitlementSubscriptionStatus("active", paymentState)).toBe("active");
  expect(entitlementSubscriptionStatus("active", resolvedBillingPaymentState("paid", true, "failed"))).toBe("past_due");
  expect(entitlementSubscriptionStatus("active", resolvedBillingPaymentState("failed", true, "paid"))).toBe("active");
  expect(entitlementSubscriptionStatus("active", resolvedBillingPaymentState("paid", false, undefined))).toBe("past_due");
  for (const eventType of [
    "invoice.payment_failed",
    "invoice.finalization_failed",
    "invoice.payment_action_required",
    "invoice.marked_uncollectible",
    "invoice.voided",
  ]) {
    expect(invoiceLifecyclePaymentOverride(eventType)).toBe("failed");
  }
  expect(invoiceLifecyclePaymentOverride("invoice.paid")).toBeUndefined();
});

test("refund and dispute holds survive passive subscription updates until a new payment", () => {
  expect(resolvedBillingPaymentState("refunded", true, "paid", {
    sameInvoice: true,
    allowSameInvoiceRecovery: false,
  })).toBe("refunded");
  expect(resolvedBillingPaymentState("disputed", true, "paid", {
    sameInvoice: true,
    allowSameInvoiceRecovery: false,
  })).toBe("disputed");
  expect(resolvedBillingPaymentState("refunded", true, "paid", {
    sameInvoice: false,
    allowSameInvoiceRecovery: false,
  })).toBe("paid");
  expect(resolvedBillingPaymentState("disputed", true, "paid", {
    sameInvoice: true,
    allowSameInvoiceRecovery: true,
  })).toBe("paid");
  expect(chargeLifecyclePaymentState("paid", {
    amount: 1_499,
    amountRefunded: 1_499,
    refunded: true,
  })).toBe("refunded");
});

test("same-second webhook reconciliation never reverse-grants access", () => {
  const active: BillingEventCursor = {
    eventCreated: 100,
    eventId: "evt_active",
    subscriptionStatus: "active",
    invoiceId: "in_renewal",
    invoiceAttemptCount: 1,
    invoicePaidAt: 100,
  };
  const canceled: BillingEventCursor = {
    ...active,
    eventId: "evt_canceled",
    subscriptionStatus: "canceled",
  };
  expect(shouldApplyBillingEvent(active, canceled)).toBe(true);
  expect(shouldApplyBillingEvent(canceled, active)).toBe(false);
  expect(shouldApplyBillingEvent(active, active)).toBe(false);

  const failed: BillingEventCursor = {
    ...active,
    eventId: "evt_failed",
    subscriptionStatus: "past_due",
    invoicePaidAt: undefined,
  };
  expect(shouldApplyBillingEvent(active, failed)).toBe(false);

  const recovered: BillingEventCursor = {
    ...failed,
    eventId: "evt_recovered",
    subscriptionStatus: "active",
    invoiceAttemptCount: 2,
    invoicePaidAt: 101,
  };
  expect(shouldApplyBillingEvent(failed, recovered)).toBe(true);
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

test("pricing explains successful and canceled checkout returns without granting access from the redirect", async ({ page }) => {
  await page.goto("/pricing?checkout=success");
  await expect(page.getByRole("heading", { name: "Confirming your membership" })).toBeVisible();
  await expect(page.getByText(/Access activates only after Filosage processes Stripe's verified payment event/)).toBeVisible();
  await expect(page).toHaveURL(/\/pricing$/);

  await page.goto("/pricing?checkout=canceled");
  await expect(page.getByRole("heading", { name: "Checkout did not return success" })).toBeVisible();
  await expect(page.getByText(/A redirect cannot confirm payment or subscription state and does not change your access/)).toBeVisible();
  await expect(page.getByText(/No new charge or subscription was completed/)).toHaveCount(0);
  await expect(page).toHaveURL(/\/pricing$/);
});

test("publishes the approved paid eligibility, refund, cancellation, and deletion policy", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Plans, fees, automatic renewal, cancellation, and refunds" })).toBeVisible();
  await expect(page.getByText(/Paid subscriptions are offered only to individual United States residents who are at least 18 years old/)).toBeVisible();
  await expect(page.getByText(/full refund is available for the initial paid charge when requested within 7 calendar days/)).toBeVisible();
  await expect(page.getByText(/account deletion immediately cancels any nonterminal Stripe subscription and ends paid access/)).toBeVisible();
  await expect(page.getByText(/Paid subscriptions will remain disabled until/)).toHaveCount(0);

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Children and paid-plan eligibility" })).toBeVisible();
  await expect(page.getByText(/Paid subscriptions are not offered to users under 18/)).toBeVisible();

  await page.goto("/support/articles/plans-and-billing");
  await expect(page.getByRole("heading", { name: "Account deletion is not ordinary cancellation" })).toBeVisible();
  await expect(page.getByText(/annual renewal requested within 7 calendar days/)).toBeVisible();
});

test("account deletion confirmation explains subscription termination without promising a refund", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "free",
      plan: "pro",
      isOwner: false,
      accountStatus: "active",
      displayName: "Subscriber Learner",
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
      legalAcceptanceRequired: false,
      currentTermsVersion: TERMS_VERSION,
      currentPrivacyVersion: PRIVACY_VERSION,
      subscriptionStatus: "active",
      quotas: [],
    },
  }));

  await page.goto("/privacy-center");
  await page.getByRole("button", { name: "Start account deletion" }).click();
  const billingWarning = page.locator(".privacy-delete-billing-warning");
  await expect(billingWarning).toContainText("immediately ends any active, past-due, or incomplete Stripe subscription and paid access");
  await expect(billingWarning).toContainText("does not automatically create or waive refund eligibility");
  await expect(billingWarning).toContainText("Initial charges and annual renewals have a 7-day refund window");
  await expect(page.getByRole("link", { name: "billing support" })).toHaveAttribute("href", /mailto:support@filosage\.com/);
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
  await expect(page.getByText(/update your payment method, view invoices, or cancel at the end of the paid period/)).toBeVisible();
  await expect(page.getByText(/switch an available plan/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage billing" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Choose Pro/ })).toHaveCount(0);
});
