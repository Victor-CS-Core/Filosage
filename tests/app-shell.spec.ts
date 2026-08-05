import { expect, test, type Page } from "@playwright/test";
import type { Course } from "../src/lib/course-types";
import type { CourseProgress } from "../src/lib/learning-types";
import { restoreLocalLearner } from "./fixtures/local-learner";

const ownedCourses: Course[] = [
  {
    id: "morse-shell-course",
    courseId: "morse-shell-course",
    topic: "Morse Code",
    mission: "Send and receive a short message with accurate timing.",
    outcome: "Build a personal Morse communication card.",
    level: "Foundations",
    category: "Communication",
    isPublic: true,
    modules: [{
      title: "Decode the system",
      description: "Read and send foundational patterns.",
      lessons: [
        { title: "Hear the rhythm", concept: "Relative timing", objective: "Distinguish dots and dashes." },
        { title: "Build a message", concept: "Character spacing", objective: "Encode a short message." },
      ],
    }],
  },
  {
    id: "decision-shell-course",
    courseId: "decision-shell-course",
    topic: "Decision quality",
    mission: "Make a defensible decision from incomplete evidence.",
    outcome: "Create an evidence-backed decision brief.",
    level: "Intermediate",
    category: "Product",
    isPublic: false,
    modules: [{
      title: "Evidence and action",
      description: "Separate evidence from inference.",
      lessons: [{ title: "Evidence first", concept: "Evidence", objective: "Classify a decision record." }],
    }],
  },
];

const learningProgress: CourseProgress[] = [{
  courseId: "morse-shell-course",
  topic: "Morse Code",
  lastLessonId: "0-0",
  lastLessonTitle: "Hear the rhythm",
  nextLessonId: "0-1",
  nextLessonTitle: "Build a message",
  completedLessonIds: ["0-0"],
  totalLessons: 2,
  studyMinutes: 28,
  lastActivityAt: "2026-08-03T16:00:00.000Z",
  startedAt: "2026-08-01T16:00:00.000Z",
  lessons: {
    "0-0": {
      lessonId: "0-0",
      lessonTitle: "Hear the rhythm",
      status: "learned",
      attempts: 2,
      totalQuestions: 2,
      firstAttemptCorrect: 0,
      confidence: "high",
      calibration: "overconfident",
      performanceBand: "secure",
      intervalStage: 1,
      nextReviewAt: "2026-08-03T16:00:00.000Z",
      lastStudiedAt: "2026-08-03T16:00:00.000Z",
      completedAt: "2026-08-03T16:00:00.000Z",
      misconception: "Dots and dashes can be sent without consistent spacing.",
      experienceEvidence: { type: "practice-lab", response: "A paced signal sample with a timing note.", completed: true },
    },
  },
}];

async function prepareOwnerShell(page: Page) {
  await restoreLocalLearner(page);
  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "pro",
      plan: "pro",
      isOwner: true,
      accountStatus: "active",
      displayName: "Playwright Owner",
      legalAcceptanceRequired: false,
      quotas: [{ feature: "course_outline", remaining: null }],
    },
  }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: ownedCourses } }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: learningProgress } }));
  await page.route("**/api/course-banners/**", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='100%' height='100%' fill='#0D1B3D'/></svg>",
  }));
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const dimensions = await page.locator(".app-main").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    offenders: [...element.querySelectorAll<HTMLElement>("*")]
      .filter((child) => child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1)
      .slice(0, 8)
      .map((child) => ({ tag: child.tagName, className: child.className, parent: child.parentElement?.className, text: child.textContent?.slice(0, 40), right: Math.round(child.getBoundingClientRect().right) })),
  }));
  expect(dimensions.scrollWidth, JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(dimensions.clientWidth);
}

test.describe("desktop application shell", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("keeps primary navigation compact and moves secondary controls into right drawers", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/library");

    const rail = page.locator(".learner-sidebar");
    await expect(rail).toBeVisible();
    const railBox = await rail.boundingBox();
    expect(railBox?.width).toBeLessThanOrEqual(96);
    await expect(page.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("aria-current", "page");

    const coursesTrigger = page.getByRole("button", { name: /Courses/ });
    await expect(coursesTrigger).toHaveAttribute("aria-expanded", "false");
    await coursesTrigger.click();

    const coursesDialog = page.getByRole("dialog", { name: "My courses" });
    await expect(coursesDialog).toBeVisible();
    await expect(coursesTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeVisible();
    await expect(coursesDialog.getByText("Decision quality", { exact: true })).toBeVisible();
    const drawerBox = await coursesDialog.boundingBox();
    expect(drawerBox && Math.abs(drawerBox.x + drawerBox.width - 1366)).toBeLessThanOrEqual(1);

    await coursesDialog.getByPlaceholder("Search your courses").fill("decision");
    await expect(coursesDialog.getByText("Decision quality", { exact: true })).toBeVisible();
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeHidden();
    await coursesDialog.getByRole("button", { name: "Close course switcher" }).click();

    const accountTrigger = page.getByRole("button", { name: "Open account menu for Playwright" });
    await accountTrigger.focus();
    await accountTrigger.press("Enter");
    const accountDialog = page.getByRole("dialog", { name: "Playwright" });
    await expect(accountDialog).toBeVisible();
    await expect(accountDialog.getByText("Owner course access")).toBeVisible();
    await expect(accountDialog.getByRole("button", { name: /Control room/ })).toBeVisible();
    const supportButton = accountDialog.getByRole("button", { name: /Support/ });
    await expect(supportButton).toBeVisible();
    await expect(accountDialog.getByRole("button", { name: /Dark mode|Light mode/ })).toBeVisible();
    await supportButton.click();
    await expect(page).toHaveURL(/\/support$/);
  });

  test("keeps a drawer open when it is reopened during its exit transition", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/library");

    const coursesTrigger = page.getByRole("button", { name: /Courses/ });
    const coursesDialog = page.getByRole("dialog", { name: "My courses" });
    await coursesTrigger.click();
    await expect(coursesDialog).toBeVisible();

    await coursesDialog.getByRole("button", { name: "Close course switcher" }).click();
    await expect(coursesTrigger).toHaveAttribute("aria-expanded", "false");
    await coursesTrigger.click();

    await expect(coursesTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(coursesDialog).toBeVisible();
    await page.waitForTimeout(240);
    await expect(coursesTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(coursesDialog).toBeVisible();
  });

  test("presents profile, progress, and course creation as evidence-led decisions", async ({ page }) => {
    await prepareOwnerShell(page);

    await page.goto("/profile");
    await expectNoHorizontalPageOverflow(page);
    await expect(page.getByRole("heading", { name: "What you are building now" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Morse Code/ })).toBeVisible();
    await expect(page.getByText("How your understanding is holding")).toBeVisible();
    await expect(page.getByText("Practice evidence", { exact: true }).first()).toBeVisible();

    await page.goto("/progress");
    await expectNoHorizontalPageOverflow(page);
    await expect(page.getByText("Recommended next action")).toBeVisible();
    await expect(page.getByText("1 review ready")).toBeVisible();
    await expect(page.getByText("0% first-try accuracy")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Work you saved while learning" })).toBeVisible();
    await expect(page.getByText("Misconceptions corrected")).toHaveCount(0);

    await page.goto("/create");
    await expectNoHorizontalPageOverflow(page);
    await expect(page.getByRole("heading", { name: "What needs to change when you finish?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Make the course fit your actual week." })).toHaveCount(0);
    const outcomeStep = page.getByRole("button", { name: /Outcome/ });
    await expect(outcomeStep).toHaveAttribute("data-complete", "false");
    await page.getByLabel("Subject or skill").fill("Systems thinking for product decisions");
    await page.getByLabel("What will you be able to do?").fill("Analyze a product decision, identify feedback loops, and explain its likely second-order effects.");
    await expect(outcomeStep).toHaveAttribute("data-complete", "true");
    await expect(page.getByRole("complementary", { name: "Course snapshot" })).toContainText("Complete the course brief");

    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Make the course fit your actual week." })).toBeVisible();
    const paceStep = page.getByRole("button", { name: /Pace/ });
    await expect(paceStep).toHaveAttribute("data-complete", "false");
    await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
    await page.getByLabel("What do you already know?").fill("I know the core vocabulary but have not applied it to a live product decision.");
    await expect(paceStep).toHaveAttribute("data-complete", "true");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Choose how the learning should unfold." })).toBeVisible();
    await expect(page.getByText("Trusted references")).toBeVisible();
    await expect(page.getByText("Optional · add up to five")).toBeVisible();
    const teachingStep = page.getByRole("button", { name: /Teaching plan/ });
    const createButton = page.getByRole("button", { name: "Create private course" });
    await expect(teachingStep).toHaveAttribute("data-complete", "true");
    await expect(createButton).toBeEnabled();
    await page.getByText("Trusted references").click();
    await page.getByLabel("Source name").fill("NIST AI Risk Management Framework");
    await expect(teachingStep).toHaveAttribute("data-complete", "false");
    await expect(createButton).toBeDisabled();
    await page.getByLabel("Relevant note").fill("Use the framework's risk measurement categories to structure the applied review.");
    await expect(teachingStep).toHaveAttribute("data-complete", "true");
    await expect(createButton).toBeEnabled();
    await expect(page.getByRole("status", { name: "" })).toHaveCount(0);
  });
});

test.describe("mobile application shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps private courses reachable through the account sheet", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/library");

    await expect(page.locator(".learner-sidebar")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await page.locator(".mobile-account-trigger").click();

    const accountDialog = page.getByRole("dialog", { name: "Playwright" });
    await expect(accountDialog).toBeVisible();
    await accountDialog.getByRole("button", { name: /My courses/ }).click();

    const coursesDialog = page.getByRole("dialog", { name: "My courses" });
    await expect(coursesDialog).toBeVisible();
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeVisible();
    await expect(coursesDialog.getByText("Decision quality", { exact: true })).toBeVisible();
  });

  test("keeps the focused course-builder step and next action reachable on a phone", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/create");
    await page.getByLabel("Subject or skill").fill("Morse communication timing");
    await page.getByLabel("What will you be able to do?").fill("Send a short message with readable spacing and explain the timing choices.");
    await expect(page.getByRole("button", { name: /Continue/ })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Make the course fit your actual week." })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pace/ })).toHaveAttribute("data-complete", "false");
    await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
    await expectNoHorizontalPageOverflow(page);
  });
});
