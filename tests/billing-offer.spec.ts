import { expect, test } from "@playwright/test";
import { priceMatchesOffer, PRO_OFFER, PRO_OFFER_VERSION } from "../src/lib/billing-offer";

test("the published Pro offer rejects a mismatched Stripe Price", () => {
  const monthly = {
    active: true,
    currency: "usd",
    unitAmount: PRO_OFFER.monthly.amountMinor,
    type: "recurring",
    recurringInterval: "month",
    recurringIntervalCount: 1,
  };

  expect(PRO_OFFER_VERSION).toBe("pro-v1-closed-launch");
  expect(priceMatchesOffer("monthly", monthly)).toBe(true);
  expect(priceMatchesOffer("monthly", { ...monthly, active: false })).toBe(false);
  expect(priceMatchesOffer("monthly", { ...monthly, currency: "eur" })).toBe(false);
  expect(priceMatchesOffer("monthly", { ...monthly, unitAmount: monthly.unitAmount + 1 })).toBe(false);
  expect(priceMatchesOffer("monthly", { ...monthly, recurringInterval: "year" })).toBe(false);

  expect(priceMatchesOffer("annual", {
    ...monthly,
    unitAmount: PRO_OFFER.annual.amountMinor,
    recurringInterval: "year",
  })).toBe(true);
});
