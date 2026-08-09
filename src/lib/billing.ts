import "server-only";

import { billingConfiguration } from "@/lib/runtime-config";
import { PRO_OFFER } from "@/lib/billing-offer";
import { serverEnvironment } from "@/lib/runtime-environment";

export const proPlan = {
  id: "pro_monthly",
  name: "Filosage Pro",
  interval: "month" as const,
  currency: PRO_OFFER.currency,
  priceUsd: PRO_OFFER.monthly.amountMinor / 100,
  annualPriceUsd: PRO_OFFER.annual.amountMinor / 100,
  get priceId() { return serverEnvironment.STRIPE_PRO_MONTHLY_PRICE_ID ?? ""; },
  get annualPriceId() { return serverEnvironment.STRIPE_PRO_ANNUAL_PRICE_ID ?? ""; },
  features: { courseOutlines: 3, generatedLessons: 30, tutorQuestions: 100 },
};

export function billingStatus() {
  const config = billingConfiguration();
  return {
    provider: config.provider,
    enabled: config.enabled,
    managementReady: config.managementReady,
    checkoutReady: config.checkoutReady,
    ready: config.checkoutReady,
    plan: { ...proPlan, priceId: undefined, annualPriceId: undefined },
  };
}
