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
  | "share_evidence_report";

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
    description: "Learn from published courses and keep your progress in sync.",
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
    },
    includedFeatures: [
      "Open every published lesson with a free account",
      "Complete lessons and retrieval practice",
      "Cloud progress and review scheduling",
      "Five tutor questions each month",
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
    description: "Build private courses around goals the published library does not cover.",
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
    },
    includedFeatures: [
      "Everything in Free",
      "Two complete AI course credits added each month",
      "Unused course credits roll over, up to twenty-four",
      "Each credit includes the approved outline and every planned lesson",
      "Keep every private course you create",
      "Complete the current lesson activities before generating the next lesson",
      "Forty tutor questions each month",
    ],
    restrictedFeatures: [
      "Publishing courses to the public library",
      "Advanced capstone progression analysis",
      "Portable evidence exports and share links",
    ],
  },
  pro: {
    id: "pro",
    name: "Filosage Pro",
    shortName: "Pro",
    description: "Add advanced portable evidence, revocable sharing, and publishing tools.",
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
    },
    includedFeatures: [
      "Everything in Plus",
      "Five complete AI course credits added each month",
      "Unused course credits roll over, up to sixty",
      "Advanced capstone history and criterion-level analysis",
      "Downloadable evidence reports and expiring share links",
      "One hundred tutor questions each month",
      "Publish generated courses after completing every lesson",
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
