import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildAdvancedCapstoneAnalysis } from "../src/lib/capstone-analysis";
import { reconcileCourseCreditLedger } from "../src/lib/course-credit-policy";
import { MEMBERSHIP_PLANS } from "../src/lib/membership-plans";
import type { CapstoneAssessment } from "../src/lib/learning-types";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

test("course-credit and Pro feature access are explicit in the shared catalog", () => {
  expect(MEMBERSHIP_PLANS.plus.limits).toMatchObject({
    courseCreditsPerMonth: 2,
    courseCreditBalanceCap: 24,
    tutorQuestions: 40,
  });
  expect(MEMBERSHIP_PLANS.pro.limits).toMatchObject({
    courseCreditsPerMonth: 5,
    courseCreditBalanceCap: 60,
    tutorQuestions: 100,
  });
  expect(MEMBERSHIP_PLANS.plus.capabilities).toMatchObject({
    advanced_capstone_analysis: false,
    export_evidence_report: false,
    share_evidence_report: false,
  });
  expect(MEMBERSHIP_PLANS.pro.capabilities).toMatchObject({
    advanced_capstone_analysis: true,
    export_evidence_report: true,
    share_evidence_report: true,
  });
  expect(JSON.stringify(MEMBERSHIP_PLANS)).not.toContain("generate_course_banner");
  expect(JSON.stringify(MEMBERSHIP_PLANS)).not.toContain("activeOwnedCourses");
  expect(JSON.stringify(MEMBERSHIP_PLANS)).not.toContain("generatedLessons");
});
test("course credits accrue monthly, roll over to the cap, and handle plan transitions", () => {
  const plus = { uid: "learner", plan: "plus" as const, accountStatus: "active" as const };
  const first = reconcileCourseCreditLedger(null, plus, new Date("2026-01-31T12:00:00.000Z"));
  expect(first).toMatchObject({ balance: 2, monthlyAllocation: 2, balanceCap: 24 });
  expect(first.nextAccrualAt).toBe("2026-02-28T12:00:00.000Z");

  const caughtUp = reconcileCourseCreditLedger(
    { ...first, balance: 1 },
    plus,
    new Date("2026-03-31T12:00:00.000Z"),
  );
  expect(caughtUp.balance).toBe(5);
  expect(caughtUp.nextAccrualAt).toBe("2026-04-28T12:00:00.000Z");

  const capped = reconcileCourseCreditLedger(
    { ...caughtUp, balance: 23, nextAccrualAt: "2026-04-28T12:00:00.000Z" },
    plus,
    new Date("2026-04-28T12:00:00.000Z"),
  );
  expect(capped.balance).toBe(24);

  const upgraded = reconcileCourseCreditLedger(
    { ...caughtUp, balance: 4, plan: "plus", periodGranted: 2 },
    { ...plus, plan: "pro" },
    new Date("2026-04-01T12:00:00.000Z"),
  );
  expect(upgraded.balance).toBe(7);
  expect(upgraded.monthlyAllocation).toBe(5);
  expect(upgraded.balanceCap).toBe(60);
});

test("unused course credits freeze for twelve months after paid access ends", () => {
  const frozen = reconcileCourseCreditLedger(
    {
      uid: "learner",
      schemaVersion: "course-credits-v2",
      plan: "plus",
      balance: 11,
      monthlyAllocation: 2,
      balanceCap: 24,
      periodGranted: 2,
      nextAccrualAt: "2026-03-01T00:00:00.000Z",
      frozenAt: null,
      frozenUntil: null,
      updatedAt: "2026-02-01T00:00:00.000Z",
    },
    { uid: "learner", plan: "free", accountStatus: "active" },
    new Date("2026-02-15T00:00:00.000Z"),
  );
  expect(frozen.balance).toBe(11);
  expect(frozen.frozenUntil).toBe("2027-02-15T00:00:00.000Z");

  const resumed = reconcileCourseCreditLedger(
    frozen,
    { uid: "learner", plan: "plus", accountStatus: "active" },
    new Date("2026-08-15T00:00:00.000Z"),
  );
  expect(resumed.balance).toBe(13);
  expect(resumed.periodGranted).toBe(2);

  const resumedAfterExpiry = reconcileCourseCreditLedger(
    frozen,
    { uid: "learner", plan: "pro", accountStatus: "active" },
    new Date("2027-03-15T00:00:00.000Z"),
  );
  expect(resumedAfterExpiry.balance).toBe(5);

  const expired = reconcileCourseCreditLedger(
    frozen,
    { uid: "learner", plan: "free", accountStatus: "active" },
    new Date("2027-02-15T00:00:00.000Z"),
  );
  expect(expired.balance).toBe(0);
});

test("criterion analysis distinguishes improvement, regression, and changed criteria", () => {
  const latestCriteria = [
    { criterion: "Explain the decision", met: true, feedback: "Now concrete." },
    { criterion: "Test the changed boundary", met: false, feedback: "Add a boundary case." },
  ];
  const assessment: CapstoneAssessment = {
    status: "needs_revision",
    summary: "One criterion remains.",
    assessedAt: "2026-08-16T12:00:00.000Z",
    attempts: 2,
    criteria: latestCriteria,
    history: [
      {
        status: "needs_revision",
        summary: "Revise the explanation.",
        assessedAt: "2026-08-15T12:00:00.000Z",
        attempt: 1,
        criteria: [
          { criterion: "Explain the decision", met: false, feedback: "Too general." },
          { criterion: "Test the boundary", met: true, feedback: "Demonstrated." },
        ],
      },
      {
        status: "needs_revision",
        summary: "One criterion remains.",
        assessedAt: "2026-08-16T12:00:00.000Z",
        attempt: 2,
        criteria: latestCriteria,
      },
    ],
  };

  const analysis = buildAdvancedCapstoneAnalysis(assessment);
  expect(analysis.improvedSincePriorAttempt).toEqual(["Explain the decision"]);
  expect(analysis.unresolved).toEqual(["Test the changed boundary"]);
  expect(analysis.addedSincePriorAttempt).toEqual(["Test the changed boundary"]);
  expect(analysis.removedSincePriorAttempt).toEqual(["Test the boundary"]);
  expect(analysis.regressedSincePriorAttempt).toEqual([]);
  expect(analysis.nextRevisionPriorities).toEqual(["Test the changed boundary"]);
});

test("professional evidence routes enforce Pro creation and preserve downgraded revocation", () => {
  const exportRoute = source("src/app/api/evidence/[courseId]/export/route.ts");
  const shareRoute = source("src/app/api/evidence/[courseId]/shares/route.ts");
  const publicRoute = source("src/app/api/evidence-shares/[token]/route.ts");
  const shareStorage = source("src/lib/evidence-shares.ts");
  const progressRoute = source("src/app/api/progress/route.ts");

  expect(exportRoute).toContain('requirePlanCapability(request, "export_evidence_report")');
  expect(shareRoute).toContain('requirePlanCapability(request, "share_evidence_report")');
  expect(shareRoute.match(/requireAcceptedAccount\(request\)/g)?.length).toBeGreaterThanOrEqual(2);
  expect(progressRoute).toContain("progressForAccount");
  expect(progressRoute).toContain("history: undefined");
  expect(shareStorage).toContain("new Uint8Array(32)");
  expect(shareStorage).toContain('digest("SHA-256"');
  expect(shareStorage).not.toContain("data: { token");
  expect(publicRoute).toContain("available: false, report: null");
  expect(publicRoute).toContain('"Cache-Control": "private, no-store"');
  expect(publicRoute).toContain('"Referrer-Policy": "no-referrer"');
});

test("public evidence pages suppress analytics tracking and consent surfaces", () => {
  expect(source("src/components/TrafficTracker.tsx")).toContain("excludesPublicEvidenceShare");
  expect(source("src/components/AnalyticsConsent.tsx")).toContain('pathname.startsWith("/evidence/shared/")');
});

test("pricing and unavailable shared evidence states pass automated accessibility checks", async ({ page }) => {
  await page.goto("/pricing");
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);

  await page.goto("/evidence/shared/invalid");
  await page.evaluate(() => localStorage.removeItem("filosage:analytics:consent:v1"));
  await page.reload();
  await expect(page.locator(".analytics-consent")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});

test("paid lifecycle sync initializes and reconciles the course-credit ledger", () => {
  const billing = source("src/lib/stripe-server.ts");
  expect(billing).toContain("courseCreditLedgerPath");
  expect(billing).toContain("reconcileCourseCreditLedger");
  expect(billing).toContain("{ path: courseCreditLedgerPath, data: courseCreditLedger }");
});

test("banner regeneration is absent while initial banner generation remains", () => {
  expect(existsSync(resolve(root, "src/app/api/courses/[courseId]/banner/route.ts"))).toBe(false);
  expect(source("src/app/api/generate-course/route.ts")).toContain("createOrReuseCourseBanner");
  expect(source("src/lib/course-dto.ts")).not.toContain("canRegenerateBanner");
  expect(source("src/app/course/[topic]/page.tsx")).not.toContain("regenerateBanner");
});

test("a redeemed outline authorizes every planned lesson without a fixed lesson allowance", () => {
  const credits = source("src/lib/course-credits.ts");
  const lessonRoute = source("src/app/api/generate-lesson/route.ts");
  expect(credits).toContain("courseModule as { lessons: unknown[] }");
  expect(credits).toContain("lessonIds");
  expect(lessonRoute).toContain("courseGenerationGrantAllows(course, lessonId)");
  expect(lessonRoute).not.toContain("generatedLessons");
});
