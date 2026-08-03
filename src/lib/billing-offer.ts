export type BillingInterval = "monthly" | "annual";

export const PRO_OFFER_VERSION = "pro-v1-closed-launch";

export const PRO_OFFER = {
  currency: "usd",
  automaticRenewal: true,
  monthly: {
    amountMinor: 1_499,
    recurringInterval: "month",
    recurringIntervalCount: 1,
  },
  annual: {
    amountMinor: 11_988,
    recurringInterval: "year",
    recurringIntervalCount: 1,
  },
} as const;

export function offerForInterval(interval: BillingInterval) {
  return PRO_OFFER[interval];
}

export interface RecurringPriceSnapshot {
  active: boolean;
  currency: string;
  unitAmount: number | null;
  type: string;
  recurringInterval?: string;
  recurringIntervalCount?: number;
}

export function priceMatchesOffer(interval: BillingInterval, price: RecurringPriceSnapshot) {
  const expected = offerForInterval(interval);
  return price.active
    && price.currency.toLowerCase() === PRO_OFFER.currency
    && price.unitAmount === expected.amountMinor
    && price.type === "recurring"
    && price.recurringInterval === expected.recurringInterval
    && price.recurringIntervalCount === expected.recurringIntervalCount;
}
