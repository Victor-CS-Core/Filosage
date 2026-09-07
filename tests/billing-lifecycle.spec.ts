import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  CHECKOUT_ELIGIBILITY_VERSION,
  billingCheckoutAllowedForAccount,
  checkoutFulfillmentIsPaid,
  checkoutConsentMetadataIsCurrent,
  billingWebhookClaimDisposition,
  accountDeletionBlocksCheckout,
  checkoutEligibilityAttestation,
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
import {
  billingPortalSessionParameters,
  parseBillingPortalRequest,
  stripeSubscriptionCustomerMatches,
} from "../src/lib/billing-portal";
import { readBoundedRequestText } from "../src/lib/bounded-request-body";
import { PAID_SUBSCRIPTION_POLICY, PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { ensureLocalLearnerAccepted, exactLearnerAccount, restoreLocalLearner } from "./fixtures/local-learner";

const stripeLifecycle = {
  BILLING_PROVIDER: "stripe",
  BILLING_ROLLOUT_MODE: "configured",
  STRIPE_TAX_READY: "true",
  BILLING_CANARY_UIDS: "canary-learner",
  STRIPE_SECRET_KEY: "sk_live_example",
  STRIPE_WEBHOOK_SECRET: "whsec_example",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_filosage123",
  STRIPE_PLUS_MONTHLY_PRICE_ID: "price_plus_monthly",
  STRIPE_PLUS_ANNUAL_PRICE_ID: "price_plus_annual",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_monthly",
  STRIPE_PRO_ANNUAL_PRICE_ID: "price_annual",
  LEGAL_OPERATOR_NAME: "Filosage LLC",
  LEGAL_BUSINESS_ADDRESS: "123 Example Street",
  GOVERNING_JURISDICTION: "New York",
  SUPPORT_EMAIL: "support@filosage.com",
};

const stripeServerSource = readFileSync("src/lib/stripe-server.ts", "utf8");
const checkoutRouteSource = readFileSync("src/app/api/billing/checkout/route.ts", "utf8");
const portalRouteSource = readFileSync("src/app/api/billing/portal/route.ts", "utf8");
const pricingPageSource = readFileSync("src/app/pricing/page.tsx", "utf8");

test("exact learner account fixtures derive coherent access, capabilities, and credits", () => {
  expect(exactLearnerAccount()).toMatchObject({
    access: "free",
    plan: "free",
    isOwner: false,
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
  });

  expect(exactLearnerAccount({ plan: "plus" })).toMatchObject({
    access: "plus",
    plan: "plus",
    isOwner: false,
    capabilities: {
      createCourse: true,
      generateLesson: true,
      flashcardDecksEnabled: false,
      createCustomFlashcardDeck: true,
      publishCourse: false,
      advancedCapstoneAnalysis: false,
      exportEvidenceReport: false,
      shareEvidenceReport: false,
    },
    courseCredits: {
      balance: 2,
      monthlyAllocation: 2,
      balanceCap: 24,
      nextAccrualAt: "2026-09-18T00:00:00.000Z",
      frozenUntil: null,
    },
  });

  expect(exactLearnerAccount({ plan: "pro", subscriptionStatus: "active" })).toMatchObject({
    access: "pro",
    plan: "pro",
    isOwner: false,
    subscriptionStatus: "active",
    capabilities: {
      createCourse: true,
      generateLesson: true,
      flashcardDecksEnabled: false,
      createCustomFlashcardDeck: true,
      publishCourse: true,
      advancedCapstoneAnalysis: true,
      exportEvidenceReport: true,
      shareEvidenceReport: true,
    },
    courseCredits: {
      balance: 5,
      monthlyAllocation: 5,
      balanceCap: 60,
      nextAccrualAt: "2026-09-18T00:00:00.000Z",
      frozenUntil: null,
    },
  });

  expect(exactLearnerAccount({ isOwner: true })).toMatchObject({
    access: "owner",
    plan: "pro",
    isOwner: true,
    capabilities: {
      createCourse: true,
      generateLesson: true,
      flashcardDecksEnabled: false,
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
      nextAccrualAt: null,
      frozenUntil: null,
    },
  });
});

test("closing checkout preserves existing subscriber management and lifecycle processing", { tag: "@smoke" }, () => {
  expect(evaluateBillingConfiguration({ ...stripeLifecycle, BILLING_ENABLED: "false" })).toMatchObject({
    rolloutMode: "configured",
    enabled: false,
    enabledValid: true,
    portalConfigurationReady: true,
    managementReady: true,
    webhookReady: true,
    productReady: true,
    legalReady: true,
    taxReady: true,
    providerReady: true,
    checkoutReady: false,
    configured: true,
  });

  for (const portalConfigurationId of [undefined, "", "portal_default"]) {
    expect(evaluateBillingConfiguration({
      ...stripeLifecycle,
      STRIPE_PORTAL_CONFIGURATION_ID: portalConfigurationId,
      BILLING_ENABLED: "false",
    })).toMatchObject({
      portalConfigurationReady: false,
      managementReady: false,
      providerReady: false,
      configured: false,
      checkoutReady: false,
    });
  }
});

test("billing rollout states fail closed from configuration through canary and open access", () => {
  const closed = evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ROLLOUT_MODE: "closed",
    BILLING_ENABLED: "false",
  });
  expect(closed).toMatchObject({ rolloutMode: "closed", configured: false, checkoutReady: false });
  expect(billingCheckoutAllowedForAccount(closed, "canary-learner")).toBe(false);

  const configured = evaluateBillingConfiguration({ ...stripeLifecycle, BILLING_ENABLED: "false" });
  expect(configured).toMatchObject({ rolloutMode: "configured", configured: true, checkoutReady: false });
  expect(billingCheckoutAllowedForAccount(configured, "canary-learner")).toBe(false);

  const canary = evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ROLLOUT_MODE: "canary",
    BILLING_ENABLED: "true",
  });
  expect(canary).toMatchObject({ rolloutMode: "canary", configured: true, canaryReady: true, checkoutReady: false });
  expect(billingCheckoutAllowedForAccount(canary, "canary-learner")).toBe(true);
  expect(billingCheckoutAllowedForAccount(canary, "other-learner")).toBe(false);

  const open = evaluateBillingConfiguration({
    ...stripeLifecycle,
    BILLING_ROLLOUT_MODE: "open",
    BILLING_ENABLED: "true",
  });
  expect(open).toMatchObject({ rolloutMode: "open", configured: true, canaryReady: false, checkoutReady: true });
  expect(billingCheckoutAllowedForAccount(open, "other-learner")).toBe(true);

  for (const unsafe of [
    { ...stripeLifecycle, BILLING_ROLLOUT_MODE: "open", BILLING_ENABLED: "false" },
    { ...stripeLifecycle, BILLING_ROLLOUT_MODE: "open", BILLING_ENABLED: "true", STRIPE_TAX_READY: "false" },
    { ...stripeLifecycle, BILLING_ROLLOUT_MODE: "canary", BILLING_ENABLED: "true", BILLING_CANARY_UIDS: "" },
    { ...stripeLifecycle, BILLING_ROLLOUT_MODE: "surprise", BILLING_ENABLED: "true" },
    { ...stripeLifecycle, BILLING_ROLLOUT_MODE: "open", BILLING_ENABLED: "yes" },
    { ...stripeLifecycle, BILLING_ROLLOUT_MODE: "open", BILLING_ENABLED: "true", STRIPE_WEBHOOK_SECRET: "" },
  ]) {
    const config = evaluateBillingConfiguration(unsafe);
    expect(config.checkoutReady, JSON.stringify(unsafe)).toBe(false);
    expect(billingCheckoutAllowedForAccount(config, "canary-learner"), JSON.stringify(unsafe)).toBe(false);
  }
});

test("checkout eligibility is exact, versioned, and bound to Stripe-hosted billing", () => {
  const accepted = checkoutEligibilityAttestation({
    version: CHECKOUT_ELIGIBILITY_VERSION,
    age18OrOlder: true,
    usResident: true,
    automaticRenewalAccepted: true,
  });
  expect(accepted).toEqual({
    version: CHECKOUT_ELIGIBILITY_VERSION,
    age18OrOlder: true,
    usResident: true,
    automaticRenewalAccepted: true,
  });
  for (const rejected of [
    null,
    {},
    { ...accepted, version: "stale" },
    { ...accepted, age18OrOlder: false },
    { ...accepted, usResident: false },
    { ...accepted, automaticRenewalAccepted: false },
    { ...accepted, extra: true },
  ]) {
    expect(checkoutEligibilityAttestation(rejected)).toBeNull();
  }

  expect(stripeServerSource).toMatch(/integration_identifier:\s*"filosage_checkout_[a-z]{8}"/);
  expect(stripeServerSource).toContain("billingPortal.sessions.create");
  expect(portalRouteSource).toContain("createBillingPortalSession");
  expect(stripeServerSource).toContain("automatic_tax: { enabled: automaticTaxEnabled }");
  expect(stripeServerSource).toContain("eligibility_version");
  expect(checkoutRouteSource).toContain("checkoutEligibilityAttestation");
  expect(pricingPageSource).toContain("Continue to Stripe Checkout");
  expect(pricingPageSource).toContain("Manage billing in Stripe");
});

test("billing portal actions are exact and build ownership-bound Stripe-hosted flows", () => {
  expect(parseBillingPortalRequest({ action: "manage" })).toBe("manage");
  expect(parseBillingPortalRequest({ action: "change_plan" })).toBe("change_plan");
  expect(parseBillingPortalRequest({ action: "cancel" })).toBe("cancel");
  for (const rejected of [
    null,
    "manage",
    {},
    { action: "upgrade" },
    { action: "manage", extra: true },
  ]) {
    expect(parseBillingPortalRequest(rejected)).toBeNull();
  }

  const common = {
    customerId: "cus_bound_customer",
    configurationId: "bpc_filosage_portal",
    returnUrl: "https://filosage.com/pricing",
  };
  expect(billingPortalSessionParameters({ ...common, action: "manage" })).toEqual({
    customer: "cus_bound_customer",
    configuration: "bpc_filosage_portal",
    return_url: "https://filosage.com/pricing",
  });
  expect(billingPortalSessionParameters({
    ...common,
    action: "change_plan",
    subscriptionId: "sub_bound_subscription",
  })).toEqual({
    customer: "cus_bound_customer",
    configuration: "bpc_filosage_portal",
    return_url: "https://filosage.com/pricing",
    flow_data: {
      type: "subscription_update",
      subscription_update: { subscription: "sub_bound_subscription" },
      after_completion: {
        type: "redirect",
        redirect: { return_url: "https://filosage.com/pricing" },
      },
    },
  });
  expect(billingPortalSessionParameters({
    ...common,
    action: "cancel",
    subscriptionId: "sub_bound_subscription",
  })).toEqual({
    customer: "cus_bound_customer",
    configuration: "bpc_filosage_portal",
    return_url: "https://filosage.com/pricing",
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: { subscription: "sub_bound_subscription" },
      after_completion: {
        type: "redirect",
        redirect: { return_url: "https://filosage.com/pricing" },
      },
    },
  });
  expect(() => billingPortalSessionParameters({ ...common, action: "change_plan" })).toThrow(
    "A Stripe subscription is required for this billing action.",
  );

  expect(stripeSubscriptionCustomerMatches("cus_bound_customer", "cus_bound_customer")).toBe(true);
  expect(stripeSubscriptionCustomerMatches({ id: "cus_bound_customer" }, "cus_bound_customer")).toBe(true);
  expect(stripeSubscriptionCustomerMatches("cus_foreign_customer", "cus_bound_customer")).toBe(false);
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
    eligibility_version: CHECKOUT_ELIGIBILITY_VERSION,
    age_18_or_older: "true",
    us_resident: "true",
    automatic_renewal_acknowledged: "true",
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
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, age_18_or_older: "false" }, expected)).toBe(false);
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, us_resident: "false" }, expected)).toBe(false);
  expect(checkoutConsentMetadataIsCurrent({ ...metadata, automatic_renewal_acknowledged: "false" }, expected)).toBe(false);
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

test("billing routes report and enforce the closed checkout boundary", { tag: "@smoke" }, async ({ page }) => {
  const statusResponse = await page.request.get("/api/billing/status");
  expect(statusResponse.ok()).toBe(true);
  expect(statusResponse.headers()["cache-control"]).toBe("private, no-store");
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

test("a slow verified-payment return times out safely and offers recovery without a real wait", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-24T12:00:00.000Z") });
  let releaseSession!: () => void;
  const sessionRestoration = new Promise<void>((resolve) => { releaseSession = resolve; });
  let sessionRequested = false;
  await page.route("**/api/auth/session", async (route) => {
    sessionRequested = true;
    await sessionRestoration;
    await route.fulfill({ json: {
      recentAuthentication: true,
      authentication: { primaryProvider: "filosage", externalIdAvailable: true, externalIdNewAccountsAvailable: true, legacyGoogleAvailable: true },
      user: { uid: "checkout-learner", displayName: "Checkout Learner", email: "checkout@example.com", photoURL: null, authenticationProvider: "filosage" },
    } });
  });
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  let accountRequests = 0;
  await page.route("**/api/account", async (route) => {
    accountRequests += 1;
    if (accountRequests === 1) await route.fulfill({ json: exactLearnerAccount() });
    // Leave reconciliation reads pending to prove the visible deadline does
    // not depend on an account response arriving.
  });

  await page.goto("/pricing?checkout=success");
  await expect.poll(() => sessionRequested).toBe(true);
  // The bootstrap watchdog can release the loading UI before auth resolves.
  // Its timeout must not consume the marker before the canonical remount.
  await page.clock.runFor(10_001);
  await expect(page).toHaveURL(/checkout=success/);
  releaseSession();
  await expect(page.getByRole("heading", { name: "Confirming your membership" })).toBeVisible();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByText(/check for confirmation for up to 30 seconds/)).toBeVisible();

  await page.clock.runFor(30_000);
  await expect(page.getByText(/Stripe has not confirmed the subscription within 30 seconds/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh membership" })).toBeVisible();
  await expect(page.getByText("Free is active")).toBeVisible();
  expect(accountRequests).toBeGreaterThan(1);
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
    json: exactLearnerAccount({
      plan: "pro",
      displayName: "Subscriber Learner",
      subscriptionStatus: "active",
    }),
  }));

  await page.goto("/privacy-center");
  await page.getByRole("button", { name: "Start account deletion" }).click();
  const billingWarning = page.locator(".privacy-delete-billing-warning");
  await expect(billingWarning).toContainText("immediately ends any active, past-due, or incomplete Stripe subscription and paid access");
  await expect(billingWarning).toContainText("does not automatically create or waive refund eligibility");
  await expect(billingWarning).toContainText("Initial charges and annual renewals have a 7-day refund window");
  await expect(page.getByRole("link", { name: "billing support" })).toHaveAttribute("href", /mailto:support@filosage\.com/);
});

test("a direct API caller receives two complete Plus course credits", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The API course-credit contract is browser-independent.");
  test.setTimeout(120_000);
  const runId = crypto.randomUUID();
  const plusLearnerUid = `local-plus-learner-${runId}`;
  const plusHeaders = { Authorization: `Bearer playwright-plus-learner-${runId}` };
  const firstCourseKey = `plus-capacity-first-course-${runId}`;
  const firstCourseTopic = `Decision quality for Plus capacity testing ${runId}`;
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

  await ensureLocalLearnerAccepted(request);

  const grant = await request.patch(`/api/admin/users/${plusLearnerUid}`, {
    headers: { Authorization: "Bearer playwright-local-owner" },
    data: { action: "grant_plan", planId: "plus", duration: 7 },
  });
  expect(grant.ok(), await grant.text()).toBe(true);

  const account = await request.get("/api/account", { headers: plusHeaders });
  expect(await account.json()).toMatchObject({
    plan: "plus",
    capabilities: { createCourse: true, publishCourse: false },
    courseCredits: { balance: 2, monthlyAllocation: 2, balanceCap: 24 },
  });

  const firstCourse = await request.post("/api/generate-course", {
    headers: { ...plusHeaders, "Idempotency-Key": firstCourseKey },
    data: { topic: firstCourseTopic, targetWeeks: 4 },
  });
  const firstCourseBody = await firstCourse.json() as {
    courseId?: string;
    error?: string;
    modules?: Array<{ lessons: Array<{ title: string; concept: string }> }>;
  };
  expect(firstCourse.ok(), JSON.stringify(firstCourseBody)).toBe(true);
  expect(firstCourseBody.courseId).toBeTruthy();

  const retry = await request.post("/api/generate-course", {
    headers: { ...plusHeaders, "Idempotency-Key": firstCourseKey },
    data: { topic: firstCourseTopic, targetWeeks: 4 },
  });
  expect(retry.ok(), await retry.text()).toBe(true);

  const publish = await request.patch(`/api/courses/${firstCourseBody.courseId}`, {
    headers: plusHeaders,
    data: { isPublic: true },
  });
  expect(publish.status()).toBe(403);
  expect(await publish.json()).toMatchObject({ code: "PLAN_CAPABILITY_REQUIRED" });

  const secondCourse = await request.post("/api/generate-course", {
    headers: { ...plusHeaders, "Idempotency-Key": `plus-capacity-second-course-${runId}` },
    data: { topic: `A second private course ${runId}`, targetWeeks: 4 },
  });
  expect(secondCourse.ok(), await secondCourse.text()).toBe(true);

  const exhausted = await request.post("/api/generate-course", {
    headers: { ...plusHeaders, "Idempotency-Key": `plus-credit-third-course-${runId}` },
    data: { topic: `A third private course ${runId}`, targetWeeks: 4 },
  });
  expect(exhausted.status()).toBe(409);
  expect(await exhausted.json()).toMatchObject({
    code: "COURSE_CREDITS_EXHAUSTED",
    courseCredits: { balance: 0, monthlyAllocation: 2, balanceCap: 24 },
  });
});

test("a past-due subscriber can reach billing management while checkout is closed", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
  await page.route("**/api/billing/status", (route) => route.fulfill({
    json: { enabled: false, ready: false, checkoutReady: false, managementReady: true },
  }));
  await page.route("**/api/account", (route) => route.fulfill({
    json: exactLearnerAccount({
      displayName: "Payment Recovery Learner",
      subscriptionStatus: "past_due",
    }),
  }));

  await page.goto("/pricing");
  await expect(page.getByText("Payment needs attention")).toBeVisible();
  await expect(page.getByText(/Update your payment method or cancel at the end of the paid period/)).toBeVisible();
  await expect(page.getByText(/switch an available plan/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage billing in Stripe" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Cancel membership in Stripe" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Change plan in Stripe" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Choose Pro/ })).toHaveCount(0);
});

test("an active subscriber gets explicit Stripe-hosted manage, plan-change, and cancellation actions", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
  await page.route("**/api/billing/status", (route) => route.fulfill({
    json: { enabled: false, ready: false, checkoutReady: false, managementReady: true },
  }));
  await page.route("**/api/account", (route) => route.fulfill({
    json: exactLearnerAccount({ plan: "plus", subscriptionStatus: "active" }),
  }));

  const actions: unknown[] = [];
  let releaseFirstRequest = () => {};
  const firstRequestGate = new Promise<void>((resolve) => { releaseFirstRequest = resolve; });
  await page.route("**/api/billing/portal", async (route) => {
    actions.push(route.request().postDataJSON());
    if (actions.length === 1) await firstRequestGate;
    await route.fulfill({ status: 503, json: { error: "Test request held before Stripe redirect." } });
  });

  await page.goto("/pricing");
  const changePlan = page.getByRole("button", { name: "Change plan in Stripe" });
  const manage = page.getByRole("button", { name: "Manage billing in Stripe" });
  const cancel = page.getByRole("button", { name: "Cancel membership in Stripe" });
  await expect(changePlan).toBeEnabled();
  await expect(manage).toBeEnabled();
  await expect(cancel).toBeEnabled();
  await expect(page.getByText(/takes effect immediately and Stripe calculates the prorated invoice/)).toBeVisible();
  await expect(page.getByText(/cancellation takes effect at the end of the current paid period/)).toBeVisible();

  await changePlan.click();
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toEqual({ action: "change_plan" });
  await expect(changePlan).toBeDisabled();
  await expect(manage).toBeDisabled();
  await expect(cancel).toBeDisabled();
  releaseFirstRequest();
  await expect(page.getByText("Test request held before Stripe redirect.", { exact: true })).toBeVisible();

  await manage.click();
  await expect.poll(() => actions.length).toBe(2);
  expect(actions[1]).toEqual({ action: "manage" });
  await expect(page.getByText("Test request held before Stripe redirect.", { exact: true })).toBeVisible();

  await cancel.click();
  await expect.poll(() => actions.length).toBe(3);
  expect(actions[2]).toEqual({ action: "cancel" });
});
