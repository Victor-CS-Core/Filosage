/**
 * Pure policy for the hard per-course illustration spend caps. Kept free of
 * server-only imports so contract tests can pin the numbers directly.
 */

export type CourseIllustrationBudgetTier = "plus" | "pro";

/**
 * Hard per-course image spend caps, in micros of USD.
 *
 * These preserve the originally approved Tier B (~$0.10/course) and Tier C
 * (~$0.22/course) budget envelopes. With the gpt-image-2.5 models measured
 * 2026-09-25 (hero $0.0107, module/lesson illustration $0.0063), expected
 * spend lands far under the caps (Plus ≈ $0.036, Pro ≈ $0.086). The headroom
 * covers unusually large courses and one full regeneration — for example
 * after a house art-style change, which mints new fingerprints and respends
 * every subject once.
 */
export const COURSE_ILLUSTRATION_BUDGET_MICROS: Record<CourseIllustrationBudgetTier, number> = {
  plus: 100_000,
  pro: 220_000,
};

/** Owners are comped to Pro, so their courses spend against the Pro envelope. */
export function budgetTierForAccount(
  plan: string | undefined,
  isOwner: boolean,
): CourseIllustrationBudgetTier {
  if (isOwner) return "pro";
  return plan === "pro" ? "pro" : "plus";
}
