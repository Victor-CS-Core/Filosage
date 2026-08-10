import type { LearnerPlan } from "@/lib/course-types";
import {
  isBillingInterval,
  isLearnerPlan,
  isPaidLearnerPlan,
  offerFor,
  type BillingInterval,
} from "@/lib/membership-plans";

export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "other";

export interface MembershipAnalyticsRecord extends Record<string, unknown> {
  id?: string;
  uid?: string;
  plan?: unknown;
  manualPlan?: unknown;
  manualPlanUntil?: unknown;
  manualProUntil?: unknown;
  billingPlan?: unknown;
  billingInterval?: unknown;
  subscriptionStatus?: unknown;
  billingRawStatus?: unknown;
}

export interface MembershipAnalytics {
  recordsComplete: boolean;
  recordsScanned: number;
  totalAccounts: number;
  freeUsers: number;
  paidAccessUsers: number;
  paidConversionPercent: number;
  activeSubscribers: number;
  trialingSubscribers: number;
  pastDueSubscribers: number;
  canceledSubscribers: number;
  otherBillingStates: number;
  mrrUsd: number;
  arrUsd: number;
  arppuUsd: number;
  atRiskMrrUsd: number;
  revenueCoveredSubscribers: number;
  unpricedActiveSubscribers: number;
  plans: Array<{
    plan: LearnerPlan;
    users: number;
    userPercent: number;
    activeSubscribers: number;
    subscriberPercent: number;
    mrrUsd: number;
    arrUsd: number;
  }>;
  intervals: Array<{
    interval: BillingInterval | "unknown";
    activeSubscribers: number;
    subscriberPercent: number;
    mrrUsd: number;
    arrUsd: number;
  }>;
}

function subscriptionStatus(value: unknown): SubscriptionStatus {
  return value === "trialing" || value === "active" || value === "past_due" || value === "canceled"
    ? value
    : "none";
}

function recordSubscriptionStatus(record: MembershipAnalyticsRecord): SubscriptionStatus {
  if (typeof record.billingRawStatus === "string") {
    if (record.billingRawStatus === "trialing" || record.billingRawStatus === "active" || record.billingRawStatus === "past_due" || record.billingRawStatus === "canceled") return record.billingRawStatus;
    if (record.billingRawStatus !== "") return "other";
  }
  return subscriptionStatus(record.subscriptionStatus);
}

function manualPlan(record: MembershipAnalyticsRecord, now: number) {
  const plan = isPaidLearnerPlan(record.manualPlan)
    ? record.manualPlan
    : typeof record.manualProUntil === "string" ? "pro" : undefined;
  const until = typeof record.manualPlanUntil === "string"
    ? record.manualPlanUntil
    : typeof record.manualProUntil === "string" ? record.manualProUntil : undefined;
  const active = until === "permanent" || (Boolean(until) && Date.parse(until!) > now);
  return active ? plan : undefined;
}

function billingPlan(record: MembershipAnalyticsRecord) {
  if (isPaidLearnerPlan(record.billingPlan)) return record.billingPlan;
  // Subscriptions created before plan-aware billing were Pro-only.
  return recordSubscriptionStatus(record) !== "none" ? "pro" : undefined;
}

function effectivePlan(record: MembershipAnalyticsRecord, now: number): LearnerPlan {
  const status = recordSubscriptionStatus(record);
  if (status === "active" || status === "trialing") return billingPlan(record) ?? "pro";
  const granted = manualPlan(record, now);
  if (granted) return granted;
  if (status === "past_due" || status === "canceled" || status === "other") return "free";
  if (record.manualPlan !== undefined || record.manualPlanUntil !== undefined || record.manualProUntil !== undefined) return "free";
  return isLearnerPlan(record.plan) ? record.plan : "free";
}

export function effectiveMembershipPlan(record: MembershipAnalyticsRecord, now = new Date()): LearnerPlan {
  return effectivePlan(record, now.getTime());
}

function allocatedPercents(counts: number[], total: number) {
  if (!total) return counts.map(() => 0);
  const exactTenths = counts.map((count) => (count / total) * 1_000);
  const allocated = exactTenths.map(Math.floor);
  const remainder = 1_000 - allocated.reduce((sum, value) => sum + value, 0);
  const order = exactTenths
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remainder; index += 1) allocated[order[index % order.length].index] += 1;
  return allocated.map((value) => value / 10);
}

function usd(amountMinor: number) {
  return Math.round(amountMinor) / 100;
}

export function calculateMembershipAnalytics(
  records: MembershipAnalyticsRecord[],
  options: { ownerUid?: string; totalAccountCount?: number; now?: Date } = {},
): MembershipAnalytics {
  const now = options.now?.getTime() ?? Date.now();
  const customers = records.filter((record) => {
    const uid = typeof record.uid === "string" ? record.uid : record.id;
    return !options.ownerUid || uid !== options.ownerUid;
  });
  const totalAccounts = Math.max(0, (options.totalAccountCount ?? records.length) - (options.ownerUid ? 1 : 0));
  const recordsComplete = customers.length >= totalAccounts;

  const planCounts: Record<LearnerPlan, number> = { free: 0, plus: 0, pro: 0 };
  const activeByPlan: Record<LearnerPlan, number> = { free: 0, plus: 0, pro: 0 };
  const mrrMinorByPlan: Record<LearnerPlan, number> = { free: 0, plus: 0, pro: 0 };
  const activeByInterval: Record<BillingInterval | "unknown", number> = { monthly: 0, annual: 0, unknown: 0 };
  const mrrMinorByInterval: Record<BillingInterval | "unknown", number> = { monthly: 0, annual: 0, unknown: 0 };
  const statuses: Record<SubscriptionStatus, number> = { none: 0, trialing: 0, active: 0, past_due: 0, canceled: 0, other: 0 };
  let atRiskMrrMinor = 0;

  for (const record of customers) {
    planCounts[effectivePlan(record, now)] += 1;
    const status = recordSubscriptionStatus(record);
    statuses[status] += 1;
    if (status === "past_due" && isBillingInterval(record.billingInterval)) {
      const plan = billingPlan(record) ?? "pro";
      const amountMinor = offerFor(plan, record.billingInterval).amountMinor;
      atRiskMrrMinor += record.billingInterval === "annual" ? amountMinor / 12 : amountMinor;
    }
    if (status !== "active") continue;
    const plan = billingPlan(record) ?? "pro";
    const interval = isBillingInterval(record.billingInterval) ? record.billingInterval : "unknown";
    activeByPlan[plan] += 1;
    activeByInterval[interval] += 1;
    if (interval === "unknown") continue;
    const amountMinor = offerFor(plan, interval).amountMinor;
    const monthlyMinor = interval === "annual" ? amountMinor / 12 : amountMinor;
    mrrMinorByPlan[plan] += monthlyMinor;
    mrrMinorByInterval[interval] += monthlyMinor;
  }

  const visiblePlanCounts = [planCounts.free, planCounts.plus, planCounts.pro];
  const userPercents = allocatedPercents(visiblePlanCounts, customers.length);
  const subscriberCounts = [0, activeByPlan.plus, activeByPlan.pro];
  const subscriberPercents = allocatedPercents(subscriberCounts, statuses.active);
  const intervalCounts = [activeByInterval.monthly, activeByInterval.annual, activeByInterval.unknown];
  const intervalPercents = allocatedPercents(intervalCounts, statuses.active);
  const mrrMinor = mrrMinorByPlan.plus + mrrMinorByPlan.pro;
  const revenueCoveredSubscribers = statuses.active - activeByInterval.unknown;

  return {
    recordsComplete,
    recordsScanned: customers.length,
    totalAccounts,
    freeUsers: visiblePlanCounts[0],
    paidAccessUsers: visiblePlanCounts[1] + visiblePlanCounts[2],
    paidConversionPercent: customers.length ? Math.round((statuses.active / customers.length) * 1_000) / 10 : 0,
    activeSubscribers: statuses.active,
    trialingSubscribers: statuses.trialing,
    pastDueSubscribers: statuses.past_due,
    canceledSubscribers: statuses.canceled,
    otherBillingStates: statuses.other,
    mrrUsd: usd(mrrMinor),
    arrUsd: usd(mrrMinor * 12),
    arppuUsd: revenueCoveredSubscribers ? usd(mrrMinor / revenueCoveredSubscribers) : 0,
    atRiskMrrUsd: usd(atRiskMrrMinor),
    revenueCoveredSubscribers,
    unpricedActiveSubscribers: activeByInterval.unknown,
    plans: (["free", "plus", "pro"] as const).map((plan, index) => ({
      plan,
      users: visiblePlanCounts[index],
      userPercent: userPercents[index],
      activeSubscribers: activeByPlan[plan],
      subscriberPercent: subscriberPercents[index],
      mrrUsd: usd(mrrMinorByPlan[plan]),
      arrUsd: usd(mrrMinorByPlan[plan] * 12),
    })),
    intervals: (["monthly", "annual", "unknown"] as const).map((interval, index) => ({
      interval,
      activeSubscribers: activeByInterval[interval],
      subscriberPercent: intervalPercents[index],
      mrrUsd: usd(mrrMinorByInterval[interval]),
      arrUsd: usd(mrrMinorByInterval[interval] * 12),
    })),
  };
}
