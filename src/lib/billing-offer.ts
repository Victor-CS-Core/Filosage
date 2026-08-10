import {
  offerFor,
  paidPlanFor,
  type BillingInterval,
  type PaidLearnerPlan,
} from "@/lib/membership-plans";

export type { BillingInterval, PaidLearnerPlan } from "@/lib/membership-plans";

export interface RecurringPriceSnapshot {
  active: boolean;
  currency: string;
  unitAmount: number | null;
  type: string;
  recurringInterval?: string;
  recurringIntervalCount?: number;
}

export interface MembershipPriceEnvironment {
  STRIPE_PLUS_MONTHLY_PRICE_ID?: string;
  STRIPE_PLUS_ANNUAL_PRICE_ID?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_ANNUAL_PRICE_ID?: string;
  STRIPE_PRO_LEGACY_PRICE_IDS?: string;
}

export interface StripePricePlanMapping {
  priceId: string;
  planId: PaidLearnerPlan;
  interval: BillingInterval;
  offerVersion: string;
  legacy: boolean;
}

export function membershipPriceMappings(environment: MembershipPriceEnvironment) {
  const configuredOffers = [
    { rawPriceId: environment.STRIPE_PLUS_MONTHLY_PRICE_ID, planId: "plus", interval: "monthly" },
    { rawPriceId: environment.STRIPE_PLUS_ANNUAL_PRICE_ID, planId: "plus", interval: "annual" },
    { rawPriceId: environment.STRIPE_PRO_MONTHLY_PRICE_ID, planId: "pro", interval: "monthly" },
    { rawPriceId: environment.STRIPE_PRO_ANNUAL_PRICE_ID, planId: "pro", interval: "annual" },
  ] as const;
  const mappings: StripePricePlanMapping[] = configuredOffers.flatMap(({ rawPriceId, planId, interval }) => {
    const priceId = rawPriceId?.trim();
    if (!priceId) return [];
    return [{ priceId, planId, interval, offerVersion: paidPlanFor(planId).offerVersion, legacy: false }];
  });

  for (const priceId of (environment.STRIPE_PRO_LEGACY_PRICE_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean)) {
    if (!mappings.some((mapping) => mapping.priceId === priceId)) {
      mappings.push({ priceId, planId: "pro", interval: "monthly", offerVersion: "pro-legacy", legacy: true });
    }
  }

  const byId = new Map<string, StripePricePlanMapping>();
  for (const mapping of mappings) {
    const existing = byId.get(mapping.priceId);
    if (existing && (existing.planId !== mapping.planId || existing.interval !== mapping.interval)) {
      throw new Error(`Stripe Price ${mapping.priceId} is mapped to more than one membership offer.`);
    }
    byId.set(mapping.priceId, mapping);
  }
  return Array.from(byId.values());
}

export function priceMatchesOffer(planId: PaidLearnerPlan, interval: BillingInterval, price: RecurringPriceSnapshot) {
  const plan = paidPlanFor(planId);
  const expected = offerFor(planId, interval);
  return price.active
    && price.currency.toLowerCase() === plan.currency
    && price.unitAmount === expected.amountMinor
    && price.type === "recurring"
    && price.recurringInterval === expected.recurringInterval
    && price.recurringIntervalCount === expected.recurringIntervalCount;
}
