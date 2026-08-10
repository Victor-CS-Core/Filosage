import { expect, test } from "@playwright/test";
import { calculateMembershipAnalytics, effectiveMembershipPlan } from "@/lib/membership-analytics";

test("Free, Plus, and Pro counts reconcile with annual revenue normalized once", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const analytics = calculateMembershipAnalytics([
    { uid: "owner", plan: "pro", subscriptionStatus: "active", billingPlan: "pro", billingInterval: "monthly" },
    { uid: "free", plan: "free" },
    { uid: "plus-monthly", plan: "plus", subscriptionStatus: "active", billingPlan: "plus", billingInterval: "monthly" },
    { uid: "plus-annual", plan: "plus", subscriptionStatus: "active", billingPlan: "plus", billingInterval: "annual" },
    { uid: "pro-monthly", plan: "pro", subscriptionStatus: "active", billingPlan: "pro", billingInterval: "monthly" },
    { uid: "pro-annual", plan: "pro", subscriptionStatus: "active", billingPlan: "pro", billingInterval: "annual" },
    { uid: "trial", plan: "plus", subscriptionStatus: "trialing", billingPlan: "plus", billingInterval: "monthly" },
    { uid: "past-due", plan: "pro", subscriptionStatus: "past_due", billingPlan: "pro", billingInterval: "monthly" },
    { uid: "canceled", plan: "pro", subscriptionStatus: "canceled", billingPlan: "pro", billingInterval: "annual" },
    { uid: "grant", plan: "plus", manualPlan: "plus", manualPlanUntil: "permanent" },
    { uid: "expired-grant", plan: "pro", manualPlan: "pro", manualPlanUntil: "2026-08-01T00:00:00.000Z" },
  ], { ownerUid: "owner", totalAccountCount: 11, now });

  expect(analytics.recordsComplete).toBe(true);
  expect(analytics.totalAccounts).toBe(10);
  expect(analytics.plans.map(({ users }) => users)).toEqual([4, 4, 2]);
  expect(analytics.plans.reduce((sum, plan) => sum + plan.userPercent, 0)).toBeCloseTo(100, 10);
  expect(analytics.activeSubscribers).toBe(4);
  expect(analytics.trialingSubscribers).toBe(1);
  expect(analytics.pastDueSubscribers).toBe(1);
  expect(analytics.canceledSubscribers).toBe(1);
  expect(analytics.paidConversionPercent).toBe(40);
  expect(analytics.mrrUsd).toBe(41.63);
  expect(analytics.arrUsd).toBe(499.56);
  expect(analytics.arppuUsd).toBe(10.41);
  expect(analytics.atRiskMrrUsd).toBe(14.99);
  expect(analytics.plans.find((plan) => plan.plan === "plus")).toMatchObject({ activeSubscribers: 2, subscriberPercent: 50, mrrUsd: 16.65 });
  expect(analytics.plans.find((plan) => plan.plan === "pro")).toMatchObject({ activeSubscribers: 2, subscriberPercent: 50, mrrUsd: 24.98 });
  expect(analytics.intervals.find((interval) => interval.interval === "monthly")).toMatchObject({ activeSubscribers: 2, subscriberPercent: 50, mrrUsd: 24.98 });
  expect(analytics.intervals.find((interval) => interval.interval === "annual")).toMatchObject({ activeSubscribers: 2, subscriberPercent: 50, mrrUsd: 16.65 });
});

test("manual grants are access only and missing billing intervals never invent revenue", () => {
  const analytics = calculateMembershipAnalytics([
    { uid: "grant", plan: "plus", manualPlan: "plus", manualPlanUntil: "permanent" },
    { uid: "subscriber", plan: "plus", subscriptionStatus: "active", billingPlan: "plus" },
    { uid: "unpaid", plan: "pro", subscriptionStatus: "canceled", billingRawStatus: "unpaid", billingPlan: "pro", billingInterval: "monthly" },
  ]);

  expect(analytics.paidAccessUsers).toBe(2);
  expect(analytics.activeSubscribers).toBe(1);
  expect(analytics.otherBillingStates).toBe(1);
  expect(analytics.plans.find((plan) => plan.plan === "free")?.users).toBe(1);
  expect(analytics.unpricedActiveSubscribers).toBe(1);
  expect(analytics.revenueCoveredSubscribers).toBe(0);
  expect(analytics.mrrUsd).toBe(0);
  expect(analytics.arrUsd).toBe(0);
  expect(analytics.arppuUsd).toBe(0);
  expect(analytics.intervals.find((interval) => interval.interval === "unknown")).toMatchObject({ activeSubscribers: 1, subscriberPercent: 100 });
});

test("display percentages use largest-remainder allocation and total exactly 100", () => {
  const analytics = calculateMembershipAnalytics([
    { uid: "free", plan: "free" },
    { uid: "plus", plan: "plus" },
    { uid: "pro", plan: "pro" },
  ]);
  expect(analytics.plans.map((plan) => plan.userPercent)).toEqual([33.4, 33.3, 33.3]);
  expect(analytics.plans.reduce((sum, plan) => sum + plan.userPercent, 0)).toBeCloseTo(100, 10);
});

test("a paid subscription takes precedence over a lower manual grant", () => {
  const record = {
    uid: "subscriber",
    plan: "plus",
    manualPlan: "plus",
    manualPlanUntil: "permanent",
    subscriptionStatus: "active",
    billingPlan: "pro",
    billingInterval: "monthly",
  };
  expect(effectiveMembershipPlan(record)).toBe("pro");
  expect(calculateMembershipAnalytics([record]).plans.find((plan) => plan.plan === "pro")?.users).toBe(1);
});
