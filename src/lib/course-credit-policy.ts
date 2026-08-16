import type { AccountStatus, LearnerPlan } from "@/lib/course-types";
import { MEMBERSHIP_PLANS, isPaidLearnerPlan } from "@/lib/membership-plans";

export const COURSE_CREDIT_SCHEMA_VERSION = "course-credits-v2";
export const COURSE_CREDIT_FREEZE_MONTHS = 12;

export interface CourseCreditLedger extends Record<string, unknown> {
  uid: string;
  schemaVersion: string;
  plan: LearnerPlan;
  balance: number;
  monthlyAllocation: number;
  balanceCap: number;
  periodGranted: number;
  nextAccrualAt: string | null;
  frozenAt: string | null;
  frozenUntil: string | null;
  updatedAt: string;
}
export function courseCreditInteger(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

export function validCourseCreditIso(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function addCourseCreditUtcMonths(value: Date, months: number) {
  const day = value.getUTCDate();
  const result = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth() + months,
    1,
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    value.getUTCMilliseconds(),
  ));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function reconcileCourseCreditLedger(
  stored: Record<string, unknown> | null,
  account: { uid: string; plan: LearnerPlan; accountStatus: AccountStatus },
  now: Date,
): CourseCreditLedger {
  const nowIso = now.toISOString();
  const existingBalance = courseCreditInteger(stored?.balance);
  const priorPlan: LearnerPlan = stored?.plan === "plus" || stored?.plan === "pro" || stored?.plan === "free"
    ? stored.plan
    : "free";
  const paidAndActive = account.accountStatus !== "suspended" && isPaidLearnerPlan(account.plan);

  if (!paidAndActive) {
    const frozenAt = validCourseCreditIso(stored?.frozenAt) ?? nowIso;
    const frozenUntil = validCourseCreditIso(stored?.frozenUntil)
      ?? addCourseCreditUtcMonths(new Date(frozenAt), COURSE_CREDIT_FREEZE_MONTHS).toISOString();
    const balance = Date.parse(frozenUntil) <= now.getTime() ? 0 : existingBalance;
    return {
      uid: account.uid,
      schemaVersion: COURSE_CREDIT_SCHEMA_VERSION,
      plan: account.plan,
      balance,
      monthlyAllocation: 0,
      balanceCap: 0,
      periodGranted: 0,
      nextAccrualAt: null,
      frozenAt,
      frozenUntil,
      updatedAt: nowIso,
    };
  }

  const plan = MEMBERSHIP_PLANS[account.plan];
  const allocation = plan.limits.courseCreditsPerMonth;
  const cap = plan.limits.courseCreditBalanceCap;
  const returningFromFreeze = Boolean(validCourseCreditIso(stored?.frozenAt) || validCourseCreditIso(stored?.frozenUntil));
  const wasFrozenUntil = validCourseCreditIso(stored?.frozenUntil);
  const restoredBalance = wasFrozenUntil && Date.parse(wasFrozenUntil) <= now.getTime() ? 0 : existingBalance;
  let balance = stored ? restoredBalance : allocation;
  let periodGranted = stored ? courseCreditInteger(stored.periodGranted) : allocation;
  let nextAccrualAt = validCourseCreditIso(stored?.nextAccrualAt);
  if (!nextAccrualAt) nextAccrualAt = addCourseCreditUtcMonths(now, 1).toISOString();

  if (returningFromFreeze) {
    balance = Math.min(cap, balance + allocation);
    periodGranted = allocation;
  }

  if (priorPlan === "plus" && account.plan === "pro" && periodGranted < allocation) {
    balance = Math.min(cap, balance + allocation - periodGranted);
    periodGranted = allocation;
  }

  let nextBoundary = new Date(nextAccrualAt);
  let guard = 0;
  while (nextBoundary.getTime() <= now.getTime() && guard < 120) {
    balance = Math.min(cap, balance + allocation);
    periodGranted = allocation;
    nextBoundary = addCourseCreditUtcMonths(nextBoundary, 1);
    guard += 1;
  }

  return {
    uid: account.uid,
    schemaVersion: COURSE_CREDIT_SCHEMA_VERSION,
    plan: account.plan,
    balance,
    monthlyAllocation: allocation,
    balanceCap: cap,
    periodGranted,
    nextAccrualAt: nextBoundary.toISOString(),
    frozenAt: null,
    frozenUntil: null,
    updatedAt: nowIso,
  };
}
