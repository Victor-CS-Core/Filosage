import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  buildLessonIllustrationPrompt,
  buildModuleIllustrationPrompt,
  lessonIllustrationFingerprintMaterial,
  moduleIllustrationFingerprintMaterial,
  COURSE_ILLUSTRATION_STYLE_VERSION,
} from "../src/lib/course-illustration-prompt";
import {
  COURSE_ILLUSTRATION_BUDGET_MICROS,
  budgetTierForAccount,
} from "../src/lib/course-illustration-budget-policy";
import { MEMBERSHIP_PLANS, planAllows } from "../src/lib/membership-plans";

const moduleInput = {
  courseTopic: "Everyday knife skills for home cooks",
  moduleTitle: "Grip and control",
  moduleDescription: "Hold the knife safely and guide food with the claw grip.",
  moduleObjective: "Make even, controlled cuts without risking fingers.",
  keyConcepts: ["Pinch grip", "Claw grip", "Cutting board stability"],
};

test("module illustration prompts are text-free, single-concept, and deterministic", () => {
  const prompt = buildModuleIllustrationPrompt(moduleInput);
  expect(prompt).toContain("Grip and control");
  expect(prompt).toContain("Absolute text ban");
  expect(prompt).toContain("no more than five major shapes");
  expect(prompt).toContain("one recognizable subject anchor");
  // No rendered words may leak into the prompt as image text instructions.
  expect(prompt.toLowerCase()).not.toContain("render the words");
  expect(prompt).not.toContain("Pinch grip: label");

  const materialA = moduleIllustrationFingerprintMaterial(moduleInput);
  const materialB = moduleIllustrationFingerprintMaterial({ ...moduleInput });
  expect(materialA).toBe(materialB);
  expect(materialA).toContain(String(COURSE_ILLUSTRATION_STYLE_VERSION));

  const different = moduleIllustrationFingerprintMaterial({ ...moduleInput, moduleTitle: "Knife cuts" });
  expect(different).not.toBe(materialA);
});

test("lesson illustration prompts illustrate the takeaway, not the whole lesson", () => {
  const prompt = buildLessonIllustrationPrompt({
    courseTopic: "Everyday knife skills for home cooks",
    moduleTitle: "Grip and control",
    lessonTitle: "The claw grip",
    lessonConcept: "Curl fingertips under so the knife rides against knuckles.",
    learningObjective: "Guide food safely with curled fingers.",
    keyTakeaways: ["Knuckles guide the blade", "Fingertips stay clear"],
  });
  expect(prompt).toContain("The claw grip");
  expect(prompt).toContain("Curl fingertips under");
  expect(prompt).toContain("illustrate the takeaway, not the whole lesson");
  expect(prompt).toContain("Absolute text ban");

  const materialA = lessonIllustrationFingerprintMaterial({
    courseTopic: "T", moduleTitle: "M", lessonTitle: "L1",
  });
  const materialB = lessonIllustrationFingerprintMaterial({
    courseTopic: "T", moduleTitle: "M", lessonTitle: "L2",
  });
  expect(materialA).not.toBe(materialB);
});

test("illustration tier gating: Plus and Pro illustrate, Free does not", () => {
  expect(planAllows("plus", "course_illustrations")).toBe(true);
  expect(planAllows("pro", "course_illustrations")).toBe(true);
  expect(planAllows("free", "course_illustrations")).toBe(false);
  expect(MEMBERSHIP_PLANS.plus.includedFeatures.join(" ")).toContain("every module");
  expect(MEMBERSHIP_PLANS.pro.includedFeatures.join(" ")).toContain("every lesson");
});

test("per-course illustration budgets match the approved Tier B/C economics", () => {
  // Hero: gpt-image-2.5-sunburst medium landscape = $0.0107 (measured
  // 2026-09-25); module/lesson illustrations: gpt-image-2.5-flare low square =
  // $0.0063 (measured 2026-09-25). Plus (hero + 4 modules) ≈ $0.036,
  // Pro Tier C (hero + 12 lessons) ≈ $0.086.
  const heroMicros = 10_700;
  const illustrationMicros = 6_300;
  expect(heroMicros + 4 * illustrationMicros).toBe(35_900);
  expect(heroMicros + 12 * illustrationMicros).toBe(86_300);
});

test("per-course illustration budget policy pins the approved envelopes", () => {
  // Caps preserve the approved Tier B (~$0.10) and Tier C (~$0.22) envelopes
  // from docs/AGENT_PROGRESS.md; measured 2.5-model spend lands far under.
  expect(COURSE_ILLUSTRATION_BUDGET_MICROS.plus).toBe(100_000);
  expect(COURSE_ILLUSTRATION_BUDGET_MICROS.pro).toBe(220_000);
  const heroMicros = 10_700;
  const illustrationMicros = 6_300;
  expect(heroMicros + 4 * illustrationMicros).toBeLessThan(COURSE_ILLUSTRATION_BUDGET_MICROS.plus);
  expect(heroMicros + 12 * illustrationMicros).toBeLessThan(COURSE_ILLUSTRATION_BUDGET_MICROS.pro);
  // Headroom also covers a full regeneration (new fingerprints, e.g. a style change).
  expect(2 * (heroMicros + 12 * illustrationMicros)).toBeLessThan(COURSE_ILLUSTRATION_BUDGET_MICROS.pro);
});

test("budget tier mapping follows the account plan, owners spend as Pro", () => {
  expect(budgetTierForAccount("plus", false)).toBe("plus");
  expect(budgetTierForAccount("pro", false)).toBe("pro");
  expect(budgetTierForAccount("free", false)).toBe("plus");
  expect(budgetTierForAccount(undefined, false)).toBe("plus");
  expect(budgetTierForAccount("free", true)).toBe("pro");
});

test("illustration service enforces the per-course cap around the provider call", () => {
  const service = readFileSync("src/lib/course-illustrations.ts", "utf8");
  // The budget reservation happens after winning the generate claim and
  // before the AI-usage reservation, so an over-cap course never touches
  // provider spend or quota.
  const reserveBudgetAt = service.indexOf("reserveCourseIllustrationBudget(input.courseId");
  const reserveAiAt = service.indexOf("reserveAiUsage(");
  expect(reserveBudgetAt).toBeGreaterThan(-1);
  expect(reserveAiAt).toBeGreaterThan(-1);
  expect(reserveBudgetAt).toBeLessThan(reserveAiAt);
  // Success settles the reservation as spent; any failure releases it.
  expect(service).toContain('settleCourseIllustrationBudget(input.courseId, budgetReservation, "spent")');
  expect(service).toContain('settleCourseIllustrationBudget(input.courseId, budgetReservation, "released")');
  expect(service).toContain("CourseIllustrationBudgetExceededError");
  // Reused artwork (dedupe hits) costs nothing and skips the budget entirely.
  const reuseReturnAt = service.indexOf("if (reused) return reused;");
  expect(reuseReturnAt).toBeGreaterThan(-1);
  expect(reuseReturnAt).toBeLessThan(reserveBudgetAt);
});

test("media wave and lesson generation attach the course budget to every illustration", () => {
  const media = readFileSync("src/app/api/courses/[courseId]/media/route.ts", "utf8");
  expect(media).toContain("budgetTierForAccount(account.plan, account.isOwner)");
  expect(media).toContain("courseId,\n        budgetTier");
  const lesson = readFileSync("src/app/api/generate-lesson/route.ts", "utf8");
  expect(lesson).toContain("budgetTierForAccount(account.plan, account.isOwner)");
  expect(lesson).toContain("courseId,\n              budgetTier");
});

test("module and lesson art follow the locked-in engraved-plate direction, centered", () => {
  expect(COURSE_ILLUSTRATION_STYLE_VERSION).toBe(2);
  const modulePrompt = buildModuleIllustrationPrompt(moduleInput);
  expect(modulePrompt).toContain("fine line engraving");
  expect(modulePrompt).toContain("warm oatmeal paper (#E7DDCE)");
  expect(modulePrompt).toContain("centered in the frame");
  expect(modulePrompt).toContain("balanced quiet margins");
  expect(modulePrompt).toContain("coral (#FF8A65) and teal (#14B8A6)");
  expect(modulePrompt).not.toContain("central two-thirds");

  const lessonPrompt = buildLessonIllustrationPrompt({
    courseTopic: "Everyday knife skills for home cooks",
    moduleTitle: "Grip and control",
    lessonTitle: "The pinch grip",
  });
  expect(lessonPrompt).toContain("fine line engraving");
  expect(lessonPrompt).toContain("centered in the frame");
  expect(lessonPrompt).toContain("illustrate the takeaway, not the whole lesson");
});

test("course DTO carries the creator-tier seal signal, plus/pro only", () => {
  const result = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", `
    import { toCourseDto } from './src/lib/course-dto.ts';
    const base = { topic: 'Knife skills', modules: [] };
    console.log(JSON.stringify({
      pro: toCourseDto({ ...base, creatorTier: 'pro' }).creatorTier,
      plus: toCourseDto({ ...base, creatorTier: 'plus' }).creatorTier,
      missing: toCourseDto({ ...base }).creatorTier ?? null,
      free: toCourseDto({ ...base, creatorTier: 'free' }).creatorTier ?? null,
      bogus: toCourseDto({ ...base, creatorTier: 'enterprise' }).creatorTier ?? null,
    }));
  `], { encoding: "utf8" }));
  expect(result.pro).toBe("pro");
  expect(result.plus).toBe("plus");
  expect(result.missing).toBeNull();
  expect(result.free).toBeNull();
  expect(result.bogus).toBeNull();
});
