export interface BillingEnvironment {
  BILLING_PROVIDER?: string;
  BILLING_ENABLED?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PLUS_MONTHLY_PRICE_ID?: string;
  STRIPE_PLUS_ANNUAL_PRICE_ID?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_ANNUAL_PRICE_ID?: string;
  LEGAL_OPERATOR_NAME?: string;
  LEGAL_BUSINESS_ADDRESS?: string;
  GOVERNING_JURISDICTION?: string;
  SUPPORT_EMAIL?: string;
}

export type StoredSubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled";
export type BillingPaymentState = "unknown" | "paid" | "failed" | "refunded" | "disputed";
export const CLOSED_LAUNCH_PAYMENT_METHOD_TYPES = ["card"] as const;

export interface BillingEventCursor {
  eventCreated: number;
  eventId: string;
  subscriptionStatus: StoredSubscriptionStatus;
  invoiceId?: string;
  invoiceAttemptCount?: number;
  invoicePaidAt?: number;
}

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

function emailAddress(value: string | undefined) {
  return Boolean(value?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

export function evaluateBillingConfiguration(environment: BillingEnvironment) {
  const provider = (environment.BILLING_PROVIDER ?? "none").trim().toLowerCase();
  const enabled = environment.BILLING_ENABLED?.trim().toLowerCase() === "true";
  const managementReady = provider === "stripe"
    && present(environment.STRIPE_SECRET_KEY);
  const webhookReady = managementReady
    && present(environment.STRIPE_WEBHOOK_SECRET);
  const productReady = managementReady
    && present(environment.STRIPE_PLUS_MONTHLY_PRICE_ID)
    && present(environment.STRIPE_PLUS_ANNUAL_PRICE_ID)
    && present(environment.STRIPE_PRO_MONTHLY_PRICE_ID)
    && present(environment.STRIPE_PRO_ANNUAL_PRICE_ID);
  const legalReady = present(environment.LEGAL_OPERATOR_NAME)
    && present(environment.LEGAL_BUSINESS_ADDRESS)
    && present(environment.GOVERNING_JURISDICTION)
    && emailAddress(environment.SUPPORT_EMAIL);
  const providerReady = webhookReady && productReady;
  const checkoutReady = enabled && providerReady && legalReady;

  return {
    provider,
    enabled,
    managementReady,
    webhookReady,
    productReady,
    legalReady,
    providerReady,
    checkoutReady,
    // Compatibility alias for release checks that predate capability-specific
    // readiness. New purchase paths should use checkoutReady explicitly.
    configured: checkoutReady,
  };
}

export function subscriptionBlocksCheckout(status: string | null | undefined) {
  if (!status || status === "none" || status === "canceled" || status === "incomplete_expired") return false;
  // Any present state not explicitly terminal is treated as a subscription
  // that must be recovered or canceled, including future Stripe statuses.
  return true;
}

export function normalizedSubscriptionStatus(status: string | null | undefined): StoredSubscriptionStatus {
  if (status === "active" || status === "trialing") return status;
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  if (status === "none" || !status) return "none";
  // Stripe's incomplete, past_due, unpaid, and paused states all represent a
  // nonterminal subscription that must use payment recovery rather than a new
  // Checkout Session. Unknown future states fail closed the same way.
  return "past_due";
}

export function resolvedBillingPaymentState(
  current: string | null | undefined,
  sameSubscription: boolean,
  incoming?: BillingPaymentState,
  options?: { sameInvoice?: boolean; allowSameInvoiceRecovery?: boolean },
): BillingPaymentState {
  if (incoming) {
    const restrictive = current === "refunded" || current === "disputed";
    if (restrictive
      && incoming === "paid"
      && options?.sameInvoice
      && !options.allowSameInvoiceRecovery) return current;
    return incoming;
  }
  if (!sameSubscription) return "unknown";
  return current === "paid"
    || current === "failed"
    || current === "refunded"
    || current === "disputed"
    ? current
    : "unknown";
}

export function entitlementSubscriptionStatus(
  stripeStatus: string | null | undefined,
  paymentState: BillingPaymentState,
): StoredSubscriptionStatus {
  const normalized = normalizedSubscriptionStatus(stripeStatus);
  const stripeEligible = normalized === "active" || normalized === "trialing";
  if (!stripeEligible) return normalized;
  return paymentState === "paid" ? normalized : "past_due";
}

export function checkoutFulfillmentIsPaid(input: {
  mode: string | null | undefined;
  checkoutStatus: string | null | undefined;
  paymentStatus: string | null | undefined;
  invoicePaid: boolean;
  invoiceStatus: string | null | undefined;
}) {
  return input.mode === "subscription"
    && input.checkoutStatus === "complete"
    && (input.paymentStatus === "paid" || input.paymentStatus === "no_payment_required")
    && input.invoicePaid
    && input.invoiceStatus === "paid";
}

export function checkoutConsentMetadataIsCurrent(
  metadata: Record<string, string> | null | undefined,
  expected: {
    termsVersion: string;
    privacyVersion: string;
    offerVersion: string;
    currency: string;
    amountMinor: number;
  },
) {
  return metadata?.terms_version === expected.termsVersion
    && metadata.privacy_version === expected.privacyVersion
    && metadata.offer_version === expected.offerVersion
    && metadata.offer_currency === expected.currency
    && metadata.offer_amount_minor === String(expected.amountMinor)
    && metadata.automatic_renewal === "true";
}

export function durableBillingConsentMatches(
  account: Record<string, unknown>,
  subscriptionId: string,
  customerId: string,
  offer?: { priceId: string; planId: string; interval: string },
) {
  return account.billingConsentSubscriptionId === subscriptionId
    && account.billingConsentCustomerId === customerId
    && typeof account.billingConsentCheckoutSessionId === "string"
    && account.billingConsentCheckoutSessionId.startsWith("cs_")
    && typeof account.billingConsentRecordedAt === "string"
    && (!offer || (account.billingConsentPriceId === offer.priceId
      && account.billingConsentPlanId === offer.planId
      && account.billingConsentInterval === offer.interval));
}

export function stripeCustomerBindingMatches(
  customer: { deleted?: unknown; metadata?: Record<string, string> },
  uid: string,
) {
  return customer.deleted !== true && customer.metadata?.filosage_uid === uid;
}

export function terminalSubscriptionCanBeAcknowledgedWithoutAccount(status: string) {
  return status === "canceled" || status === "incomplete_expired";
}

export function chargeLifecyclePaymentState(
  requested: BillingPaymentState | "refund",
  charge: { amount: number; amountRefunded: number; refunded: boolean },
): BillingPaymentState {
  const fullyRefunded = charge.refunded
    || (charge.amountRefunded > 0 && charge.amountRefunded >= charge.amount);
  if (fullyRefunded) return "refunded";
  return requested === "refund" ? "paid" : requested;
}

export type BillingWebhookClaimDisposition = "claim" | "processed" | "in_flight";

export function billingWebhookClaimDisposition(
  existing: Record<string, unknown> | null | undefined,
  nowMs: number,
  retryAfterMs: number,
): BillingWebhookClaimDisposition {
  if (!existing) return "claim";
  if (typeof existing.processedAt === "string") return "processed";
  if (existing.status === "failed") return "claim";
  const claimedAt = typeof existing.claimedAt === "string" ? Date.parse(existing.claimedAt) : 0;
  return nowMs - claimedAt > retryAfterMs ? "claim" : "in_flight";
}

export function invoiceLifecyclePaymentOverride(eventType: string): BillingPaymentState | undefined {
  if (eventType === "invoice.payment_failed"
    || eventType === "invoice.finalization_failed"
    || eventType === "invoice.payment_action_required"
    || eventType === "invoice.marked_uncollectible"
    || eventType === "invoice.voided") return "failed";
  return undefined;
}

export function accountDeletionRequiresStripeReconciliation(input: {
  billingCustomerId?: string;
  billingSubscriptionId?: string;
  subscriptionStatus?: string;
  billingRawStatus?: string;
}) {
  return Boolean(input.billingCustomerId?.startsWith("cus_")
    || input.billingSubscriptionId?.startsWith("sub_")
    || subscriptionBlocksCheckout(input.subscriptionStatus)
    || subscriptionBlocksCheckout(input.billingRawStatus));
}

export function accountDeletionBlocksCheckout(account: Record<string, unknown> | null | undefined) {
  return !account || account.accountDeletionInProgress === true;
}

export function checkoutClaimRequiresDeletionRetry(status: string | null | undefined) {
  return status === "creating" || status === "replacing";
}

function restrictionRank(status: StoredSubscriptionStatus) {
  if (status === "canceled") return 3;
  if (status === "past_due" || status === "none") return 2;
  return 1;
}

export function shouldApplyBillingEvent(current: BillingEventCursor | null, next: BillingEventCursor) {
  if (!current) return true;
  if (current.eventId === next.eventId) return false;

  const sameInvoice = Boolean(next.invoiceId && current.invoiceId === next.invoiceId);
  if (sameInvoice) {
    const currentPaidAt = current.invoicePaidAt ?? 0;
    const nextPaidAt = next.invoicePaidAt ?? 0;
    // A current paid snapshot is authoritative for its invoice. A delayed
    // payment-failed handler must not undo a recovery that completed in the
    // same Stripe timestamp second.
    if (currentPaidAt !== nextPaidAt) return nextPaidAt > currentPaidAt;

    const currentAttempt = current.invoiceAttemptCount ?? 0;
    const nextAttempt = next.invoiceAttemptCount ?? 0;
    if (currentAttempt !== nextAttempt) return nextAttempt > currentAttempt;
  }

  if (next.eventCreated !== current.eventCreated) return next.eventCreated > current.eventCreated;

  // Stripe event.created has one-second precision. On an unresolved tie,
  // preserve the more restrictive entitlement state instead of allowing a
  // reverse-delivered active event to regrant access.
  return restrictionRank(next.subscriptionStatus) > restrictionRank(current.subscriptionStatus);
}
