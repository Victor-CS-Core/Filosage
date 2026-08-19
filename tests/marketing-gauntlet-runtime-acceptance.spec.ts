import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { exactLearnerAccount } from "./fixtures/local-learner";

const baseURL = process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3401";
const artifactDir = "docs/research/artifacts/marketing-gauntlet-2026-08-16";

const courses = [
  {
    id: "work-course",
    topic: "Work analysis",
    isPublic: true,
    language: "English",
    outcome: "Use an analysis in a current project.",
    artifact: { title: "Decision memo", description: "An inspectable recommendation", format: "document" },
    modules: [{ title: "Analyze", lessons: [{ title: "Frame the question", concept: "Separate evidence and inference" }] }],
  },
  {
    id: "project-course",
    topic: "Personal project planning",
    isPublic: true,
    language: "French",
    outcome: "Plan and complete a bounded personal project.",
    artifact: { title: "Project plan", description: "A sequenced plan", format: "document" },
    modules: [{ title: "Plan", lessons: [{ title: "Choose a scope", concept: "Bound the project" }] }],
  },
  {
    id: "alpha-course",
    topic: "Calculus study",
    isPublic: true,
    language: "Spanish and English",
    outcome: "Solve and explain a representative calculus problem.",
    artifact: { title: "Worked solution", description: "A checked solution", format: "document" },
    modules: [{ title: "Practice", lessons: [{ title: "Model the rate", concept: "Connect change and slope" }] }],
  },
  {
    id: "career-course",
    topic: "Career interview reasoning",
    isPublic: true,
    language: "English",
    outcome: "Explain a decision clearly in an interview.",
    artifact: { title: "Interview case", description: "A structured response", format: "document" },
    modules: [{ title: "Explain", lessons: [{ title: "Structure the answer", concept: "Claim, evidence, reasoning" }] }],
  },
];

async function commonRoutes(page: Page) {
  await page.route("**/api/telemetry", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/billing/status", (route) => route.fulfill({ json: { ready: false, managementReady: false } }));
  await page.route("**/api/learner-state", (route) => route.fulfill({ json: { state: null } }));
}

async function guestRoutes(page: Page) {
  await commonRoutes(page);
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    recentAuthentication: false,
    authentication: {
      primaryProvider: "google",
      externalIdAvailable: false,
      externalIdNewAccountsAvailable: false,
      legacyGoogleAvailable: true,
    },
    user: null,
  } }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses } }));
}

async function signedRoutes(page: Page, canCreate: boolean) {
  await commonRoutes(page);
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    recentAuthentication: false,
    authentication: {
      primaryProvider: "google",
      externalIdAvailable: false,
      externalIdNewAccountsAvailable: false,
      legacyGoogleAvailable: true,
    },
    user: {
      uid: "acceptance-learner",
      displayName: "Acceptance Learner",
      email: "acceptance@example.test",
      photoURL: null,
      authenticationProvider: "google",
    },
  } }));
  await page.route("**/api/account", (route) => route.fulfill({ json: exactLearnerAccount({
    plan: canCreate ? "plus" : "free",
    displayName: "Acceptance Learner",
  }) }));
}

async function contextFor(browser: Browser, mobile = false): Promise<BrowserContext> {
  return browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    colorScheme: mobile ? "dark" : "light",
    reducedMotion: mobile ? "reduce" : "no-preference",
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `${artifactDir}/${name}.jpg`,
    type: "jpeg",
    quality: 72,
    fullPage: true,
  });
}

test("captures production-mode marketing gauntlet acceptance", async ({ browser }) => {
  test.skip(!process.env.ACCEPTANCE_BASE_URL, "Requires an explicitly started optimized production server.");
  mkdirSync(artifactDir, { recursive: true });

  const desktop = await contextFor(browser);
  const publicPage = await desktop.newPage();
  await guestRoutes(publicPage);
  await publicPage.goto(`${baseURL}/`);
  await expect(publicPage.getByText("Featured course outcome")).toBeVisible();
  await shot(publicPage, "desktop-landing-flagship-light");

  await publicPage.goto(`${baseURL}/library`);
  for (const [button, slug] of [
    ["Coursework or exam", "study-goal"],
    ["Personal project", "personal-project"],
    ["Career transition or interview", "career-goal"],
    ["Current work challenge", "work-goal"],
  ] as const) {
    await publicPage.getByRole("button", { name: button, exact: true }).click();
    await expect(publicPage.getByRole("button", { name: button, exact: true })).toHaveAttribute("aria-pressed", "true");
    await shot(publicPage, `desktop-library-${slug}-light`);
  }

  await publicPage.goto(`${baseURL}/evidence-example`);
  await expect(publicPage.getByText("Demonstration data — not a learner result")).toBeVisible();
  await shot(publicPage, "desktop-evidence-example-light");
  await publicPage.goto(`${baseURL}/pricing?plan=plus&from=library-no-match`);
  await expect(publicPage.locator(".plan-plus")).toHaveClass(/is-selected/);
  await shot(publicPage, "desktop-pricing-plus-context-light");
  await publicPage.goto(`${baseURL}/pricing?plan=pro&from=evidence-portable`);
  await expect(publicPage.locator(".plan-pro")).toHaveClass(/is-selected/);
  await shot(publicPage, "desktop-pricing-pro-context-light");
  await desktop.close();

  for (const canCreate of [false, true]) {
    const context = await contextFor(browser);
    const page = await context.newPage();
    await signedRoutes(page, canCreate);
    await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [] } }));
    await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
    await page.goto(`${baseURL}/library`);
    await expect(page.locator(".learner-shell")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("0 published courses found");
    await page.getByRole("searchbox", { name: "Search published courses" }).fill("Unpublished learning goal");
    await expect(page.getByRole("link", { name: canCreate ? /Create this course/ : /Create private courses with Plus/ })).toBeVisible();
    await shot(page, `desktop-library-no-match-${canCreate ? "creator" : "free"}-light`);
    await context.close();
  }

  const learnerContext = await contextFor(browser);
  const learnerPage = await learnerContext.newPage();
  await signedRoutes(learnerPage, false);
  const dueProgress = {
    courseId: "alpha-course", topic: "Calculus study", lastLessonId: "0-0", lastLessonTitle: "Model the rate",
    nextLessonId: null, completedLessonIds: ["0-0"], totalLessons: 1, studyMinutes: 12,
    lastActivityAt: "2020-01-01T12:00:00.000Z", startedAt: "2020-01-01T12:00:00.000Z",
    lessons: { "0-0": { lessonId: "0-0", lessonTitle: "Model the rate", status: "learned", attempts: 1, totalQuestions: 1, firstAttemptCorrect: 1, confidence: "medium", intervalStage: 0, nextReviewAt: "2020-01-01T12:00:00.000Z", lastStudiedAt: "2020-01-01T12:00:00.000Z", completedAt: "2020-01-01T12:00:00.000Z" } },
  };
  await learnerPage.route("**/api/progress", (route) => route.fulfill({ json: { progress: [dueProgress] } }));
  await learnerPage.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses } }));
  await learnerPage.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await learnerPage.goto(`${baseURL}/`);
  await expect(learnerPage.getByRole("link", { name: /Review.*1 due now/ })).toBeVisible();
  await shot(learnerPage, "desktop-home-due-review-light");

  await learnerPage.route("**/api/courses/evidence-boundary", (route) => route.fulfill({ json: { ...courses[0], id: "evidence-boundary", topic: "Evidence boundary" } }));
  await learnerPage.route("**/api/progress?courseId=evidence-boundary", (route) => route.fulfill({ json: { progress: null } }));
  await learnerPage.route("**/api/mastery?courseId=evidence-boundary", (route) => route.fulfill({ json: { plan: null, evidence: [] } }));
  await learnerPage.goto(`${baseURL}/evidence/evidence-boundary`);
  await expect(learnerPage.getByRole("link", { name: /Add portable export with Pro/ })).toBeVisible();
  await shot(learnerPage, "desktop-free-evidence-pro-prompt-light");
  await learnerContext.close();

  const mobile = await contextFor(browser, true);
  const mobilePage = await mobile.newPage();
  await guestRoutes(mobilePage);
  await mobilePage.goto(`${baseURL}/`);
  await shot(mobilePage, "mobile-landing-flagship-dark-reduced-motion");
  await mobilePage.goto(`${baseURL}/library`);
  await mobilePage.getByRole("button", { name: "Coursework or exam" }).click();
  await shot(mobilePage, "mobile-library-study-dark-reduced-motion");
  await mobilePage.goto(`${baseURL}/evidence-example`);
  await shot(mobilePage, "mobile-evidence-example-dark-reduced-motion");
  await mobilePage.goto(`${baseURL}/pricing?plan=pro&from=evidence-portable`);
  await expect(mobilePage.locator(".plan-pro")).toHaveClass(/is-selected/);
  await shot(mobilePage, "mobile-pricing-pro-dark-reduced-motion");
  await mobile.close();
});
