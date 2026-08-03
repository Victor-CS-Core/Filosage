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
  const providerReady = provider === "stripe"
    && present(environment.STRIPE_SECRET_KEY)
    && present(environment.STRIPE_WEBHOOK_SECRET)
    && present(environment.STRIPE_PRO_MONTHLY_PRICE_ID)
    && present(environment.STRIPE_PRO_ANNUAL_PRICE_ID);

  return {
    provider,
    enabled,
    providerReady,
    configured: enabled && providerReady,
  };
}
