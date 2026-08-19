import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  buildMarketingFunnels,
  orderedIntentCompletion,
  retentionAtDay,
  type ProductMetricEvent,
} from "../src/lib/product-metrics";
import type { Course } from "../src/lib/course-types";
import {
  configuredFlagshipCourseId,
  MARKETING_JOB_PRESETS,
  marketingJobPreset,
  selectFlagshipCourse,
} from "../src/lib/marketing-merchandising";
import { parsePricingContext } from "../src/lib/pricing-context";
import { courseLanguageModeFor } from "../src/lib/product-events";
import { exactLearnerAccount, restoreLocalLearner } from "./fixtures/local-learner";

async function prepareEligibleCreator(page: Page) {
  await restoreLocalLearner(page);
  await page.route("**/api/account", (route) => route.fulfill({
    json: exactLearnerAccount({
      plan: "pro",
      displayName: "Independent Learner",
      quotas: [{ feature: "course_outline", limit: 5, used: 0, remaining: 5, resetAt: "2026-09-01T00:00:00.000Z" }],
    }),
  }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
}

async function fillLibrarySearch(page: Page, value: string) {
  const search = page.getByRole("searchbox", { name: "Search published courses" });
  if (await search.isVisible()) {
    await search.fill(value);
    return;
  }

  await page.getByRole("button", { name: /^Search and filter/ }).click();
  await expect(search).toBeVisible();
  await search.fill(value);
  await page.getByRole("button", { name: /^Show \d+ courses?$/ }).click();
}

test("broad product positioning reflects eligible learners and the actual language boundary", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("goal");
  await page.getByText("Who can use Filosage?").click();
  await expect(page.getByText(/independent students, self-directed learners, career changers, working professionals/i)).toBeVisible();
  await page.getByText("Can I create a course in another language?").click();
  await expect(page.getByText(/interface is English today.*course language.*bilingual pairing/i)).toBeVisible();
  await expect(page.getByText(/real professional outcome/i)).toHaveCount(0);

  await page.route("**/api/billing/status", (route) => route.fulfill({ json: { ready: false, managementReady: false } }));
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("goal");
  await expect(page.getByText(/professional goals/i)).toHaveCount(0);
  await expect(page.getByText(/professional evidence/i)).toHaveCount(0);
  await expect(page.getByText(/flashcard/i)).toHaveCount(0);
});

test("inclusive course creation preserves a personal-study context and bilingual request", async ({ page }) => {
  const telemetry: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => localStorage.setItem("filosage:analytics:consent:v1", "accepted"));
  await prepareEligibleCreator(page);
  let generationBody: Record<string, unknown> | null = null;
  await page.route("**/api/telemetry", async (route) => {
    telemetry.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/generate-course", async (route) => {
    generationBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { courseId: "bilingual-personal-study" } });
  });

  await page.goto("/create");
  await expect(page.getByRole("button", { name: "Prepare for a calculus exam" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Build a personal budgeting model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a portfolio accessibility audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run a causal analysis for a product decision" })).toBeVisible();

  await page.getByLabel("Subject or skill").fill("Urban sketching composition");
  await page.getByLabel("What will you be able to do?").fill("Plan and complete a balanced street sketch from direct observation.");
  await page.getByLabel("What work will prove it?").fill("A finished sketch with an annotated composition review.");
  await page.getByText("Add learning context").click();
  await page.getByLabel("Where will you use this?").fill("For a self-directed personal sketchbook project.");
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.getByLabel("What do you already know?").fill("I can draw basic shapes but have not planned a complete street scene.");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Course language").fill("Spanish and English");
  await page.getByRole("button", { name: "Create private course" }).click();

  await expect.poll(() => generationBody).not.toBeNull();
  expect(generationBody).toMatchObject({
    topic: "Urban sketching composition",
    application: "For a self-directed personal sketchbook project.",
    language: "Spanish and English",
  });
  expect(JSON.stringify(generationBody)).not.toMatch(/professional|required work context/i);
  await expect.poll(
    () => telemetry.some((event) => event.event === "course_creation_started"),
    { timeout: 15_000 },
  ).toBe(true);
  const creationEvent = telemetry.find((event) => event.event === "course_creation_started");
  expect(creationEvent).toMatchObject({ route: "/create", courseLanguageMode: "bilingual" });
  expect(JSON.stringify(creationEvent)).not.toContain("Spanish");
});

test("marketing metric contracts separate anonymous acquisition, verified activation, and meaningful retention", () => {
  const records: ProductMetricEvent[] = [
    { event: "landing_viewed", sessionId: "session-a", createdAt: "2026-08-01T08:00:00.000Z" },
    { event: "course_discovered", sessionId: "session-a", createdAt: "2026-08-01T08:02:00.000Z" },
    { event: "signup_started", sessionId: "session-a", createdAt: "2026-08-01T08:04:00.000Z" },
    { event: "landing_viewed", sessionId: "session-out-of-order", createdAt: "2026-08-01T09:00:00.000Z" },
    { event: "signup_started", sessionId: "session-out-of-order", createdAt: "2026-08-01T09:01:00.000Z" },
    { event: "course_discovered", sessionId: "session-out-of-order", createdAt: "2026-08-01T09:02:00.000Z" },
    { event: "signup_completed", actorId: "learner-a", createdAt: "2026-08-01T10:00:00.000Z" },
    { event: "course_started", actorId: "learner-a", createdAt: "2026-08-01T10:05:00.000Z" },
    { event: "first_practice_completed", actorId: "learner-a", createdAt: "2026-08-01T10:10:00.000Z" },
    { event: "criterion_demonstrated", actorId: "learner-a", createdAt: "2026-08-01T10:20:00.000Z" },
    { event: "evidence_report_viewed", actorId: "learner-a", createdAt: "2026-08-01T10:30:00.000Z" },
    { event: "course_started", actorId: "existing-account", createdAt: "2026-08-01T11:00:00.000Z" },
    { event: "first_practice_completed", actorId: "existing-account", createdAt: "2026-08-01T11:08:00.000Z" },
    { event: "lesson_started", actorId: "learner-a", createdAt: "2026-08-08T10:10:00.000Z" },
    { event: "pricing_viewed", actorId: "existing-account", createdAt: "2026-08-08T11:08:00.000Z" },
    { event: "first_practice_completed", actorId: "owner-account", createdAt: "2026-07-01T10:00:00.000Z" },
    { event: "review_completed", actorId: "owner-account", createdAt: "2026-07-08T10:00:00.000Z" },
    { event: "first_practice_completed", actorId: "too-new", createdAt: "2026-08-09T10:00:00.000Z" },
    { event: "review_due", actorId: "reviewed-in-order", createdAt: "2026-08-02T10:00:00.000Z" },
    { event: "review_completed", actorId: "reviewed-in-order", createdAt: "2026-08-03T10:00:00.000Z" },
    { event: "review_completed", actorId: "reviewed-too-early", createdAt: "2026-08-02T10:00:00.000Z" },
    { event: "review_due", actorId: "reviewed-too-early", createdAt: "2026-08-03T10:00:00.000Z" },
  ];

  const funnels = buildMarketingFunnels(records);
  expect(funnels.acquisition.map((step) => step.event)).toEqual([
    "landing_viewed",
    "course_discovered",
    "signup_started",
  ]);
  expect(funnels.acquisition.map((step) => step.uniqueActors)).toEqual([2, 2, 1]);
  expect(funnels.activation.map((step) => step.event)).toEqual([
    "signup_completed",
    "course_started",
    "first_practice_completed",
    "criterion_demonstrated",
    "evidence_report_viewed",
  ]);
  expect(funnels.activation.map((step) => step.uniqueActors)).toEqual([1, 1, 1, 1, 1]);
  expect(funnels.existingAccountActivation).toEqual({ courseStarters: 2, practiceCompleters: 2, percent: 100 });
  expect(retentionAtDay(records, 7, new Date("2026-08-10T12:00:00.000Z"), "owner-account"))
    .toEqual({ eligible: 2, returned: 1, percent: 50 });
  expect(orderedIntentCompletion(records, "review_due", "review_completed"))
    .toEqual({ intentActors: 2, completionActors: 1, percent: 50 });
});

test("telemetry context accepts fixed marketing enums and rejects free text or anonymous return events", async ({ request }) => {
  const base = {
    schemaVersion: 2,
    route: "/library",
    source: "internal",
    event: "job_start_selected",
    sessionId: `playwright-${crypto.randomUUID()}`,
    surface: "library_job_start",
    jobStart: "study_goal",
    courseLanguageMode: "bilingual",
  };
  const accepted = await request.post("/api/telemetry", { data: base });
  expect(accepted.status()).toBe(204);

  const arbitraryContext = await request.post("/api/telemetry", {
    data: { ...base, sessionId: `playwright-${crypto.randomUUID()}`, surface: "calculus-student-private-query" },
  });
  expect(arbitraryContext.status()).toBe(400);

  const anonymousReturn = await request.post("/api/telemetry", {
    data: {
      ...base,
      event: "return_recommendation_viewed",
      route: "/review",
      surface: "home_review",
      sessionId: `playwright-${crypto.randomUUID()}`,
    },
  });
  expect(anonymousReturn.status()).toBe(401);

  const telemetryRoute = readFileSync("src/app/api/telemetry/route.ts", "utf8");
  expect(telemetryRoute).toContain("surface: parsed.data.surface");
  expect(telemetryRoute).toContain("jobStart: parsed.data.jobStart");
  expect(telemetryRoute).toContain("courseLanguageMode: parsed.data.courseLanguageMode");
});

function marketingCourse(id: string, topic: string, options: Partial<Course> = {}): Course {
  return {
    id,
    topic,
    isPublic: true,
    outcome: `Use ${topic} in a completed project.`,
    language: "English",
    artifact: { title: `${topic} artifact`, description: "Inspectable work", format: "document" },
    modules: [{ title: "Practice", lessons: [{ title: "First practice", concept: topic }] }],
    ...options,
  };
}

test("flagship selection and learning-situation presets stay deterministic and capability grounded", () => {
  const alpha = marketingCourse("alpha-course", "Calculus exam preparation");
  const configured = marketingCourse("configured-course", "Urban sketching");
  const privateCourse = marketingCourse("private-course", "Private study", { isPublic: false });
  const noOutcome = marketingCourse("no-outcome", "Unfinished course", { outcome: undefined, artifact: undefined });

  expect(selectFlagshipCourse([alpha, configured], "configured-course")).toBe(configured);
  expect(selectFlagshipCourse([configured, privateCourse, alpha], "private-course")).toBe(alpha);
  expect(selectFlagshipCourse([configured, noOutcome, alpha], "missing-course")).toBe(alpha);
  expect(selectFlagshipCourse([configured, alpha])).toBe(alpha);
  expect(selectFlagshipCourse([])).toBeUndefined();
  expect(marketingJobPreset("invalid-job")).toBeNull();
  expect(MARKETING_JOB_PRESETS).toEqual([
    { value: "study_goal", label: "Coursework or exam", query: "study" },
    { value: "personal_project", label: "Personal project", query: "project" },
    { value: "career_goal", label: "Career transition or interview", query: "career" },
    { value: "work_goal", label: "Current work challenge", query: "work" },
  ]);
});

test("exposes a configured flagship only when that exact course is publicly eligible", () => {
  const alpha = marketingCourse("alpha-course", "Calculus exam preparation");
  const configured = marketingCourse("configured-course", "Urban sketching");
  const privateCourse = marketingCourse("private-course", "Private study", { isPublic: false });

  expect(configuredFlagshipCourseId([alpha, configured], "configured-course")).toBe("configured-course");
  expect(configuredFlagshipCourseId([alpha, privateCourse], "private-course")).toBeUndefined();
  expect(configuredFlagshipCourseId([alpha], "missing-course")).toBeUndefined();
  expect(configuredFlagshipCourseId([alpha], undefined)).toBeUndefined();
});

test("landing flagship selection follows the validated API id and falls back stably", async ({ page }) => {
  const alpha = marketingCourse("alpha-course", "Calculus study");
  const project = marketingCourse("project-course", "Personal project planning");
  const work = marketingCourse("work-course", "Work analysis");
  let response = { courses: [work, project, alpha], featuredCourseId: "project-course" };
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: response }));

  await page.goto("/");
  await expect(page.getByRole("link", { name: /Inspect course outline/ })).toHaveAttribute("href", /id=project-course/);

  response = { courses: [alpha, project, work].reverse(), featuredCourseId: "missing-course" };
  await page.reload();
  await expect(page.getByRole("link", { name: /Inspect course outline/ })).toHaveAttribute("href", /id=alpha-course/);
});

test("learning-situation discovery is URL-backed, editable, reversible, and language searchable", async ({ page }) => {
  const alpha = marketingCourse("alpha-course", "Calculus study", { language: "Spanish and English" });
  const project = marketingCourse("project-course", "Personal project planning", { language: "French" });
  const work = marketingCourse("work-course", "Work analysis", { language: "English" });
  const telemetry: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => localStorage.setItem("filosage:analytics:consent:v1", "accepted"));
  await page.route("**/api/telemetry", async (route) => {
    telemetry.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [work, project, alpha] } }));

  await page.goto("/");
  await expect(page.getByText("Featured course outcome")).toBeVisible();
  await expect(page.getByRole("link", { name: /Inspect course outline/ })).toHaveAttribute("href", /id=alpha-course/);

  await page.goto("/library?job=invalid-job");
  await page.getByRole("button", { name: "Personal project" }).click();
  await expect(page).toHaveURL(/job=personal_project/);
  await expect(page).toHaveURL(/[?&]q=project(?:&|$)/);
  await expect(page.getByRole("heading", { name: "Personal project planning" })).toBeVisible();
  await page.getByRole("button", { name: "Coursework or exam" }).click();
  await expect(page).toHaveURL(/job=study_goal/);
  await expect(page).toHaveURL(/[?&]q=study(?:&|$)/);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]q=project(?:&|$)/);
  await expect(page.getByRole("heading", { name: "Personal project planning" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/[?&]q=study(?:&|$)/);
  await expect(page.getByRole("heading", { name: "Calculus study" })).toBeVisible();

  await fillLibrarySearch(page, "Spanish");
  await expect(page).not.toHaveURL(/job=/);
  await expect(page.getByRole("heading", { name: "Calculus study" })).toBeVisible();
  await expect(page.getByText("Spanish and English")).toBeVisible();
  await expect.poll(() => telemetry.some((event) => (
    event.event === "job_start_selected"
      && event.surface === "library_job_start"
      && event.jobStart === "study_goal"
  ))).toBe(true);
});

test("evidence example is visibly fictional, role neutral, limited, and makes no private requests", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/evidence-example");

  await expect(page.getByText("Demonstration data — not a learner result")).toBeVisible();
  await expect(page.getByRole("heading", { name: "A fictional learning evidence record" })).toBeVisible();
  const ledger = page.getByRole("region", { name: "What this fictional record supports" });
  await expect(ledger.getByText("Self-report", { exact: true })).toBeVisible();
  await expect(ledger.getByText("Observed practice", { exact: true })).toBeVisible();
  await expect(ledger.getByText("Assessed criterion", { exact: true })).toBeVisible();
  await expect(ledger.getByText("Unresolved", { exact: true })).toBeVisible();
  await expect(page.getByText(/not a credential/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore published courses/ })).toHaveAttribute("href", "/library");
  await expect(page.getByRole("button", { name: /export|share/i })).toHaveCount(0);
  expect(requests.filter((url) => /\/api\/(progress|mastery|evidence|capstone-analysis|referrals)/.test(url))).toEqual([]);
});

test("contextual plan entry respects course-creation and evidence entitlements", async ({ page }) => {
  await restoreLocalLearner(page);
  let canCreate = false;
  await page.route("**/api/account", (route) => route.fulfill({ json: exactLearnerAccount({
    plan: canCreate ? "plus" : "free",
    displayName: "Plan Boundary Learner",
  }) }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));

  await page.goto("/library");
  await expect(page.getByRole("status")).toContainText("0 published courses found");
  await fillLibrarySearch(page, "A course that is not published");
  await expect(page.getByRole("link", { name: /Create private courses with Plus/ })).toHaveAttribute("href", "/pricing?plan=plus&from=library-no-match");
  await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();

  canCreate = true;
  await page.reload();
  await expect(page.getByRole("status")).toContainText("0 published courses found");
  await fillLibrarySearch(page, "A course that is not published");
  await expect(page.getByRole("link", { name: /Create this course/ })).toHaveAttribute("href", "/create");

  canCreate = false;
  await page.route("**/api/courses/evidence-boundary", (route) => route.fulfill({ json: marketingCourse("evidence-boundary", "Evidence boundary") }));
  await page.route("**/api/progress?courseId=evidence-boundary", (route) => route.fulfill({ json: { progress: null } }));
  await page.route("**/api/mastery?courseId=evidence-boundary", (route) => route.fulfill({ json: { plan: null, evidence: [] } }));
  await page.route("**/api/evidence/evidence-boundary/shares", (route) => route.fulfill({ json: { shares: [] } }));
  await page.goto("/evidence/evidence-boundary");
  await expect(page.getByRole("heading", { name: "Evidence boundary" })).toBeVisible();
  await expect(page.getByText("What the record actually shows")).toBeVisible();
  await expect(page.getByRole("link", { name: /Add portable export with Pro/ })).toHaveAttribute("href", "/pricing?plan=pro&from=evidence-portable");
  await expect(page.getByText(/on-screen evidence remains available/i)).toBeVisible();
});

test("pricing context is allowlisted, defaults safely, and never mutates billing by query alone", async ({ page }) => {
  expect(parsePricingContext("?plan=pro&from=evidence-portable")).toEqual({ plan: "pro", from: "evidence-portable" });
  expect(parsePricingContext("?plan=enterprise&from=private-goal-text")).toEqual({ plan: "plus", from: "direct" });
  expect(parsePricingContext("?plan=plus&from=library-no-match")).toEqual({ plan: "plus", from: "library-no-match" });

  const mutationUrls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") mutationUrls.push(request.url());
  });
  await page.route("**/api/billing/status", (route) => route.fulfill({ json: { ready: false, managementReady: false } }));
  await page.goto("/pricing?plan=pro&from=evidence-portable");
  await expect(page.getByText("Portable evidence context")).toBeVisible();
  await expect(page.locator(".plan-pro")).toHaveClass(/is-selected/);
  await page.waitForTimeout(100);
  expect(mutationUrls.filter((url) => /\/api\/(billing|pricing-intent|waitlist)/.test(url))).toEqual([]);
});

test("return recommendation emits bounded view and start events without controlling navigation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("filosage:analytics:consent:v1", "accepted"));
  await restoreLocalLearner(page);
  const telemetry: Array<Record<string, unknown>> = [];
  await page.route("**/api/telemetry", async (route) => {
    telemetry.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 503 });
  });
  await page.route("**/api/account", (route) => route.fulfill({
    json: exactLearnerAccount({ displayName: "Returning Learner" }),
  }));
  const dueProgress = {
    courseId: "return-course",
    topic: "Return practice",
    lastLessonId: "0-0",
    lastLessonTitle: "Recall the method",
    nextLessonId: null,
    completedLessonIds: ["0-0"],
    totalLessons: 1,
    lessons: {
      "0-0": {
        lessonId: "0-0", lessonTitle: "Recall the method", status: "learned", attempts: 1,
        totalQuestions: 1, firstAttemptCorrect: 1, confidence: "medium", intervalStage: 0,
        nextReviewAt: "2020-01-01T12:00:00.000Z", lastStudiedAt: "2020-01-01T12:00:00.000Z",
        completedAt: "2020-01-01T12:00:00.000Z",
      },
    },
    studyMinutes: 10,
    lastActivityAt: "2020-01-01T12:00:00.000Z",
    startedAt: "2020-01-01T12:00:00.000Z",
  };
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [dueProgress] } }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [marketingCourse("return-course", "Return practice")] } }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));

  await page.goto("/");
  const reviewLink = page.getByRole("link", { name: /Review.*1 due now/ });
  await expect(reviewLink).toBeVisible();
  await expect.poll(() => telemetry.filter((event) => event.event === "return_recommendation_viewed").length).toBe(1);
  await reviewLink.click();
  await expect(page).toHaveURL(/\/review$/);
  expect(telemetry.filter((event) => event.event === "return_recommendation_started")).toHaveLength(1);
  expect(telemetry.find((event) => event.event === "return_recommendation_started")).toMatchObject({ surface: "home_review" });

  await page.goBack();
  await page.evaluate(() => {
    localStorage.setItem("filosage:analytics:consent:v1", "declined");
    window.dispatchEvent(new Event("filosage:analytics-consent-changed"));
  });
  const startsBeforeDeclinedClick = telemetry.filter((event) => event.event === "return_recommendation_started").length;
  await page.getByRole("link", { name: /Review.*1 due now/ }).click();
  await expect(page).toHaveURL(/\/review$/);
  expect(telemetry.filter((event) => event.event === "return_recommendation_started")).toHaveLength(startsBeforeDeclinedClick);
});

test("conditional capability copy stays bounded and course telemetry sends only coarse language mode", async ({ page }) => {
  expect(courseLanguageModeFor("English")).toBe("english");
  expect(courseLanguageModeFor("Spanish")).toBe("single_non_english");
  expect(courseLanguageModeFor("Spanish and English")).toBe("bilingual");
  expect(courseLanguageModeFor("Greek / French")).toBe("bilingual");

  const settingsSource = readFileSync("src/components/LearningScheduleSettings.tsx", "utf8");
  expect(settingsSource).toContain("recommended next step");
  expect(settingsSource).not.toContain("daily mission");
  expect(settingsSource).toContain("generated on your device");
  expect(settingsSource).toContain("Email delivery stays off");
  const envExample = readFileSync(".env.example", "utf8");
  expect(envExample).toContain("BILLING_ENABLED=false");
  expect(envExample).toContain("FLASHCARD_DECKS_ENABLED=false");
  expect(envExample).toContain("LESSON_VISUALS_ENABLED=false");
  expect(envExample).toContain("COURSE_LABS_V2=false");

  await page.addInitScript(() => localStorage.setItem("filosage:analytics:consent:v1", "accepted"));
  await restoreLocalLearner(page);
  const telemetry: Array<Record<string, unknown>> = [];
  await page.route("**/api/telemetry", async (route) => {
    telemetry.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/account", (route) => route.fulfill({
    json: exactLearnerAccount({ displayName: "Language Learner" }),
  }));
  const bilingualCourse = marketingCourse("bilingual-course", "Bilingual reasoning", { language: "Spanish and English" });
  await page.route("**/api/courses/bilingual-course", (route) => route.fulfill({ json: bilingualCourse }));
  await page.route("**/api/progress?courseId=bilingual-course", (route) => route.fulfill({ json: { progress: null } }));
  await page.route("**/api/mastery?courseId=bilingual-course", (route) => route.fulfill({ json: { plan: null, evidence: [] } }));

  await page.goto("/course/Bilingual%20reasoning?id=bilingual-course");
  await expect(page.getByRole("button", { name: "Start course" })).toBeVisible();
  await expect.poll(() => telemetry.some((event) => event.event === "course_discovered")).toBe(true);
  await page.getByRole("button", { name: "Start course" }).click();
  await expect(page).toHaveURL(/\/lesson\/0-0\?id=bilingual-course/, { timeout: 15_000 });
  await expect.poll(() => telemetry.some((event) => event.event === "course_started")).toBe(true);
  for (const event of telemetry.filter((candidate) => candidate.event === "course_discovered" || candidate.event === "course_started")) {
    expect(event.courseLanguageMode).toBe("bilingual");
    expect(JSON.stringify(event)).not.toContain("Spanish");
  }

  await page.route("**/api/billing/status", (route) => route.fulfill({ json: { ready: false, managementReady: false } }));
  await page.goto("/pricing");
  const pricingText = await page.locator("main").innerText();
  expect(pricingText).not.toMatch(/flashcards|v2 labs|lesson visuals|fully localized interface/i);
  expect(pricingText).toMatch(/checkout remains closed|No subscription will be created/i);
});
