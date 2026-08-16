import type { PaidLearnerPlan } from "@/lib/membership-plans";

export const PRICING_CONTEXT_SOURCES = [
  "library-no-match",
  "evidence-portable",
  "direct",
] as const;

export type PricingContextSource = (typeof PRICING_CONTEXT_SOURCES)[number];

export interface PricingContext {
  plan: PaidLearnerPlan;
  from: PricingContextSource;
}

export function parsePricingContext(input: string | URLSearchParams): PricingContext {
  const params = typeof input === "string"
    ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
    : input;
  const plan = params.get("plan");
  const source = params.get("from");
  return {
    plan: plan === "pro" ? "pro" : "plus",
    from: PRICING_CONTEXT_SOURCES.includes(source as PricingContextSource)
      ? source as PricingContextSource
      : "direct",
  };
}
