import type { LearnerPlan } from "@/lib/course-types";

export type BillingInterval = "monthly" | "annual";
export type PaidLearnerPlan = Exclude<LearnerPlan, "free">;
export type PlanCapability =
  | "create_course"
  | "generate_lesson"
  | "generate_course_banner"
  | "create_custom_flashcard_deck"
  | "publish_course";

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
    activeOwnedCourses: number | null;
    courseOutlines: number;
    generatedLessons: number;
    tutorQuestions: number;
    courseBanners: number;
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
    offerVersion: "free-v1",
    prices: null,
    limits: {
      activeOwnedCourses: 0,
      courseOutlines: 0,
      generatedLessons: 0,
      tutorQuestions: 5,
      courseBanners: 0,
      flashcardDeckGenerationsPerMonth: 5,
    },
    capabilities: {
      create_course: false,
      generate_lesson: false,
      generate_course_banner: false,
      create_custom_flashcard_deck: false,
      publish_course: false,
    },
    includedFeatures: [
      "Open every published lesson with a free account",
      "Complete lessons and retrieval practice",
      "Cloud progress and review scheduling",
      "Five tutor questions each month",
      "Five AI flashcard deck generations each month",
    ],
    restrictedFeatures: [
      "Private AI-assisted course creation",
      "Custom flashcard decks",
      "Course publishing",
    ],
  },
  plus: {
    id: "plus",
    name: "Filosage Plus",
    shortName: "Plus",
    description: "Build one focused private course for your current learning goal.",
    sortOrder: 1,
    active: true,
    currency: "usd",
    offerVersion: "plus-v1-closed-launch",
    prices: {
      monthly: { amountMinor: 999, recurringInterval: "month", recurringIntervalCount: 1 },
      annual: { amountMinor: 7_992, recurringInterval: "year", recurringIntervalCount: 1 },
    },
    limits: {
      activeOwnedCourses: 1,
      courseOutlines: 1,
      generatedLessons: 10,
      tutorQuestions: 40,
      courseBanners: 10,
      flashcardDeckGenerationsPerMonth: 40,
    },
    capabilities: {
      create_course: true,
      generate_lesson: true,
      generate_course_banner: true,
      create_custom_flashcard_deck: true,
      publish_course: false,
    },
    includedFeatures: [
      "Everything in Free",
      "One active private course",
      "One generated course outline each month",
      "Ten generated lessons each month",
      "Complete the current lesson activities before generating the next lesson",
      "Forty tutor questions each month",
      "Forty AI flashcard deck generations each month",
      "Create private custom flashcard decks",
      "Ten course-banner generation requests each month",
    ],
    restrictedFeatures: [
      "Publishing courses to the public library",
      "More than one active private course",
    ],
  },
  pro: {
    id: "pro",
    name: "Filosage Pro",
    shortName: "Pro",
    description: "Create, review, and publish courses without an owned-course cap.",
    sortOrder: 2,
    active: true,
    currency: "usd",
    offerVersion: "pro-v1-closed-launch",
    prices: {
      monthly: { amountMinor: 1_499, recurringInterval: "month", recurringIntervalCount: 1 },
      annual: { amountMinor: 11_988, recurringInterval: "year", recurringIntervalCount: 1 },
    },
    limits: {
      activeOwnedCourses: null,
      courseOutlines: 3,
      generatedLessons: 30,
      tutorQuestions: 100,
      courseBanners: 30,
      flashcardDeckGenerationsPerMonth: 100,
    },
    capabilities: {
      create_course: true,
      generate_lesson: true,
      generate_course_banner: true,
      create_custom_flashcard_deck: true,
      publish_course: true,
    },
    includedFeatures: [
      "Everything in Plus",
      "No owned-course cap",
      "Three generated course outlines each month",
      "Thirty generated lessons each month",
      "One hundred tutor questions each month",
      "One hundred AI flashcard deck generations each month",
      "Thirty course-banner generation requests each month",
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
