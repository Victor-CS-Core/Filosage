import type { LearnerPlan } from "@/lib/course-types";

export type BillingInterval = "monthly" | "annual";
export type PaidLearnerPlan = Exclude<LearnerPlan, "free">;
export type PlanCapability =
  | "create_course"
  | "generate_lesson"
  | "create_custom_flashcard_deck"
  | "publish_course"
  | "advanced_capstone_analysis"
  | "export_evidence_report"
  | "share_evidence_report"
  | "course_illustrations";

export interface MembershipPlan {
  id: LearnerPlan;
  name: string;
  shortName: string;
  description: string;
  sortOrder: number;
  active: boolean;
  currency: "usd";
  offerVersion: string;
  prices: null | Record<BillingInterval, {
    amountMinor: number;
    recurringInterval: "month" | "year";
    recurringIntervalCount: 1;
  }>;
  limits: {
    courseCreditsPerMonth: number;
    courseCreditBalanceCap: number;
    tutorQuestions: number;
    flashcardDeckGenerationsPerMonth: number;
  };
  capabilities: Record<PlanCapability, boolean>;
  includedFeatures: readonly string[];
  restrictedFeatures: readonly string[];
}

export const MEMBERSHIP_PLANS = {
  free: {
    id: "free",
    name: "Free learner",
    shortName: "Free",
    description: "Learn from the public library.",
    sortOrder: 0,
    active: true,
    currency: "usd",
    offerVersion: "free-v2-course-credits",
    prices: null,
    limits: {
      courseCreditsPerMonth: 0,
      courseCreditBalanceCap: 0,
      tutorQuestions: 5,
      flashcardDeckGenerationsPerMonth: 5,
    },
    capabilities: {
      create_course: false,
      generate_lesson: false,
      create_custom_flashcard_deck: false,
      publish_course: false,
      advanced_capstone_analysis: false,
      export_evidence_report: false,
      share_evidence_report: false,
      course_illustrations: false,
    },
    includedFeatures: [
      "Every published lesson, free",
      "Progress, notes, and review scheduling across devices",
      "5 tutor questions a month — ask the AI tutor about your lessons",
    ],
    restrictedFeatures: [
      "Private AI-assisted course creation",
      "Course publishing",
    ],
  },
  plus: {
    id: "plus",
    name: "Filosage Plus",
    shortName: "Plus",
    description: "Build private courses around your own goals.",
    sortOrder: 1,
    active: true,
    currency: "usd",
    offerVersion: "plus-v2-course-credits",
    prices: {
      monthly: { amountMinor: 999, recurringInterval: "month", recurringIntervalCount: 1 },
      annual: { amountMinor: 7_992, recurringInterval: "year", recurringIntervalCount: 1 },
    },
    limits: {
      courseCreditsPerMonth: 2,
      courseCreditBalanceCap: 24,
      tutorQuestions: 40,
      flashcardDeckGenerationsPerMonth: 40,
    },
    capabilities: {
      create_course: true,
      generate_lesson: true,
      create_custom_flashcard_deck: true,
      publish_course: false,
      advanced_capstone_analysis: false,
      export_evidence_report: false,
      share_evidence_report: false,
      course_illustrations: true,
    },
    includedFeatures: [
      "Everything in Free",
      "2 course credits a month — 1 credit builds 1 complete course (the full outline plus every lesson in it)",
      "Unused credits roll over — bank up to 24",
      "40 tutor questions a month",
      "Your courses stay private to you",
      "Keep every course you create, even if you cancel",
      "Illustrated courses — a custom cover plus an illustration for every module",
    ],
    restrictedFeatures: [
      "Publishing courses to the public library",
      "Detailed final-project feedback",
      "Portable evidence exports and share links",
    ],
  },
  pro: {
    id: "pro",
    name: "Filosage Pro",
    shortName: "Pro",
    description: "Everything in Plus, plus proof of your work.",
    sortOrder: 2,
    active: true,
    currency: "usd",
    offerVersion: "pro-v2-course-credits",
    prices: {
      monthly: { amountMinor: 1_499, recurringInterval: "month", recurringIntervalCount: 1 },
      annual: { amountMinor: 11_988, recurringInterval: "year", recurringIntervalCount: 1 },
    },
    limits: {
      courseCreditsPerMonth: 5,
      courseCreditBalanceCap: 60,
      tutorQuestions: 100,
      flashcardDeckGenerationsPerMonth: 100,
    },
    capabilities: {
      create_course: true,
      generate_lesson: true,
      create_custom_flashcard_deck: true,
      publish_course: true,
      advanced_capstone_analysis: true,
      export_evidence_report: true,
      share_evidence_report: true,
      course_illustrations: true,
    },
    includedFeatures: [
      "Everything in Plus",
      "5 course credits a month — bank up to 60",
      "100 tutor questions a month",
      "Detailed final-project feedback — see how each attempt improved, requirement by requirement",
      "Downloadable progress reports, plus private share links (expire after 30 days) you can revoke anytime",
      "Richly illustrated courses — a custom cover plus an illustration for every lesson",
      "Publish finished courses to the public library",
    ],
    restrictedFeatures: [],
  },
} as const satisfies Record<LearnerPlan, MembershipPlan>;

export const ACTIVE_MEMBERSHIP_PLANS = Object.values(MEMBERSHIP_PLANS)
  .filter((plan) => plan.active)
  .sort((left, right) => left.sortOrder - right.sortOrder);

export function isLearnerPlan(value: unknown): value is LearnerPlan {
  return value === "free" || value === "plus" || value === "pro";
}

export function isPaidLearnerPlan(value: unknown): value is PaidLearnerPlan {
  return value === "plus" || value === "pro";
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export function planFor(planId: LearnerPlan) {
  return MEMBERSHIP_PLANS[planId];
}

export function paidPlanFor(planId: PaidLearnerPlan) {
  return MEMBERSHIP_PLANS[planId];
}

export function offerFor(planId: PaidLearnerPlan, interval: BillingInterval) {
  return paidPlanFor(planId).prices[interval];
}

export function annualSavingsMinor(planId: PaidLearnerPlan) {
  const prices = paidPlanFor(planId).prices;
  return prices.monthly.amountMinor * 12 - prices.annual.amountMinor;
}

export function annualMonthlyEquivalentMinor(planId: PaidLearnerPlan) {
  return Math.round(paidPlanFor(planId).prices.annual.amountMinor / 12);
}

export function annualSavingsPercent(planId: PaidLearnerPlan) {
  const monthlyYearMinor = paidPlanFor(planId).prices.monthly.amountMinor * 12;
  return Math.round((annualSavingsMinor(planId) / monthlyYearMinor) * 100);
}

export function planAllows(planId: LearnerPlan, capability: PlanCapability) {
  return planFor(planId).capabilities[capability];
}

export function formatUsd(amountMinor: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountMinor / 100);
}
