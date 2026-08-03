export interface BillingEnvironment {
  BILLING_PROVIDER?: string;
  BILLING_ENABLED?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_ANNUAL_PRICE_ID?: string;
}

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

export function evaluateBillingConfiguration(environment: BillingEnvironment) {
  const provider = (environment.BILLING_PROVIDER ?? "none").trim().toLowerCase();
  const enabled = environment.BILLING_ENABLED?.trim().toLowerCase() === "true";
  const managementReady = provider === "stripe"
    && present(environment.STRIPE_SECRET_KEY);
  const webhookReady = managementReady
    && present(environment.STRIPE_WEBHOOK_SECRET);
  const productReady = managementReady
    && present(environment.STRIPE_PRO_MONTHLY_PRICE_ID)
    && present(environment.STRIPE_PRO_ANNUAL_PRICE_ID);
  const providerReady = webhookReady && productReady;
  const checkoutReady = enabled && providerReady;

  return {
    provider,
    enabled,
    managementReady,
    webhookReady,
    productReady,
    providerReady,
    checkoutReady,
    // Compatibility alias for release checks that predate capability-specific
    // readiness. New purchase paths should use checkoutReady explicitly.
    configured: checkoutReady,
  };
}

export function subscriptionBlocksCheckout(status: string | null | undefined) {
  return status === "active" || status === "trialing" || status === "past_due";
}
