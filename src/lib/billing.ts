import "server-only";

import { billingConfiguration } from "@/lib/runtime-config";

export const proPlan = {
  id: "pro_monthly",
  name: "Erudoza Pro",
  interval: "month" as const,
  currency: "usd",
  priceUsd: 14.99,
  annualPriceUsd: 119.88,
  priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
  annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
  features: { courseOutlines: 3, generatedLessons: 30, tutorQuestions: 100 },
};

export function billingStatus() {
  const config = billingConfiguration();
  return {
    provider: config.provider,
    ready: config.configured,
    plan: { ...proPlan, priceId: undefined, annualPriceId: undefined },
  };
}
