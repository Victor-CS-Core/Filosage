import { expect, test } from "@playwright/test";
import { membershipPriceMappings, priceMatchesOffer } from "../src/lib/billing-offer";
import {
  annualMonthlyEquivalentMinor,
  annualSavingsMinor,
  annualSavingsPercent,
  MEMBERSHIP_PLANS,
  offerFor,
  paidPlanFor,
} from "../src/lib/membership-plans";
import { localCourseOutlineFixture } from "../src/lib/local-course-fixture";
import { courseQualityIssues } from "../src/lib/course-quality";

for (const planId of ["plus", "pro"] as const) {
  test(`${planId} pricing math and Stripe validation stay internally consistent`, () => {
    const plan = paidPlanFor(planId);
    const monthlyOffer = offerFor(planId, "monthly");
    const annualOffer = offerFor(planId, "annual");
    const monthly = {
      active: true,
      currency: "usd",
      unitAmount: monthlyOffer.amountMinor,
      type: "recurring",
      recurringInterval: "month",
      recurringIntervalCount: 1,
    };

    expect(plan.offerVersion).toBe(`${planId}-v1-closed-launch`);
    expect(priceMatchesOffer(planId, "monthly", monthly)).toBe(true);
    expect(priceMatchesOffer(planId, "monthly", { ...monthly, active: false })).toBe(false);
    expect(priceMatchesOffer(planId, "monthly", { ...monthly, currency: "eur" })).toBe(false);
    expect(priceMatchesOffer(planId, "monthly", { ...monthly, unitAmount: monthly.unitAmount + 1 })).toBe(false);
    expect(priceMatchesOffer(planId, "monthly", { ...monthly, recurringInterval: "year" })).toBe(false);
    expect(priceMatchesOffer(planId, "annual", {
      ...monthly,
      unitAmount: annualOffer.amountMinor,
      recurringInterval: "year",
    })).toBe(true);

    expect(annualMonthlyEquivalentMinor(planId)).toBe(Math.round(annualOffer.amountMinor / 12));
    expect(annualSavingsMinor(planId)).toBe(monthlyOffer.amountMinor * 12 - annualOffer.amountMinor);
    expect(annualSavingsPercent(planId)).toBe(33);
  });
}

test("Plus uses the approved annual amount and savings", () => {
  expect(offerFor("plus", "monthly").amountMinor).toBe(999);
  expect(offerFor("plus", "annual").amountMinor).toBe(7_992);
  expect(annualMonthlyEquivalentMinor("plus")).toBe(666);
  expect(annualSavingsMinor("plus")).toBe(3_996);
});

test("every configured Stripe price resolves to one explicit plan and interval", () => {
  const mappings = membershipPriceMappings({
    STRIPE_PLUS_MONTHLY_PRICE_ID: "price_plus_monthly",
    STRIPE_PLUS_ANNUAL_PRICE_ID: "price_plus_annual",
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro_monthly",
    STRIPE_PRO_ANNUAL_PRICE_ID: "price_pro_annual",
    STRIPE_PRO_LEGACY_PRICE_IDS: "price_legacy, price_legacy",
  });

  expect(mappings).toEqual([
    expect.objectContaining({ priceId: "price_plus_monthly", planId: "plus", interval: "monthly", legacy: false }),
    expect.objectContaining({ priceId: "price_plus_annual", planId: "plus", interval: "annual", legacy: false }),
    expect.objectContaining({ priceId: "price_pro_monthly", planId: "pro", interval: "monthly", legacy: false }),
    expect.objectContaining({ priceId: "price_pro_annual", planId: "pro", interval: "annual", legacy: false }),
    expect.objectContaining({ priceId: "price_legacy", planId: "pro", interval: "monthly", legacy: true }),
  ]);
});

test("ambiguous Stripe price mappings fail closed", () => {
  expect(() => membershipPriceMappings({
    STRIPE_PLUS_MONTHLY_PRICE_ID: "price_shared",
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_shared",
  })).toThrow("mapped to more than one membership offer");
});

test("the approved capability and quota matrix stays explicit", () => {
  expect(MEMBERSHIP_PLANS.free.capabilities).toEqual({
    create_course: false,
    generate_lesson: false,
    generate_course_banner: false,
    create_custom_flashcard_deck: false,
    publish_course: false,
  });
  expect(MEMBERSHIP_PLANS.plus).toMatchObject({
    limits: { activeOwnedCourses: 1, courseOutlines: 1, generatedLessons: 10, tutorQuestions: 40, courseBanners: 10, flashcardDeckGenerationsPerMonth: 40 },
    capabilities: { create_course: true, generate_lesson: true, generate_course_banner: true, create_custom_flashcard_deck: true, publish_course: false },
  });
  expect(MEMBERSHIP_PLANS.pro).toMatchObject({
    limits: { activeOwnedCourses: null, courseOutlines: 3, generatedLessons: 30, tutorQuestions: 100, courseBanners: 30, flashcardDeckGenerationsPerMonth: 100 },
    capabilities: { create_course: true, generate_lesson: true, generate_course_banner: true, create_custom_flashcard_deck: true, publish_course: true },
  });
});

test("the offline course fixture satisfies the production course-quality gate", () => {
  const course = localCourseOutlineFixture("Decision quality");
  expect(courseQualityIssues(course)).toEqual([]);
});
