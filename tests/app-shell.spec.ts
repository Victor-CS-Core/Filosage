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

  test("uses a Learning Header with courses and account actions unified in the Command Center", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/library");

    const header = page.locator(".learning-header");
    await expect(header).toBeVisible();
    const headerBox = await header.boundingBox();
    expect(headerBox?.height).toBeLessThanOrEqual(82);
    await expect(page.locator(".learner-sidebar")).toHaveCount(0);
    await expect(page.locator(".learning-orbit-nav")).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Create a new course" })).toHaveCount(0);

    const commandTrigger = page.getByRole("button", { name: /Search or jump anywhere/ });
    await expect(commandTrigger).toBeVisible();
    expect((await commandTrigger.boundingBox())?.width).toBeGreaterThan(420);
    await page.keyboard.press("Control+k");
    const commandPalette = page.getByRole("dialog", { name: "Filosage Command Center" });
    await expect(commandPalette).toBeVisible();
    const commandSearch = commandPalette.getByRole("combobox", { name: "Search Filosage" });
    for (let index = 0; index < 10; index += 1) await commandSearch.press("ArrowDown");
    const activeCommandId = await commandSearch.getAttribute("aria-activedescendant");
    if (!activeCommandId) throw new Error("Command Center did not expose its active option.");
    await expect(page.locator(`#${activeCommandId}`)).toBeInViewport();
    await commandSearch.fill("private decision");
    await expect(commandPalette.getByRole("option", { name: /Decision quality/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(commandPalette).toBeHidden();
    await expect(commandTrigger).toBeFocused();

    await commandTrigger.click();
    await commandPalette.getByRole("option", { name: /My courses/ }).click();
    const coursesDialog = page.getByRole("dialog", { name: "My courses" });
    await expect(coursesDialog).toBeVisible();
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeVisible();
    await expect(coursesDialog.getByText("Decision quality", { exact: true })).toBeVisible();

    const courseSearch = coursesDialog.getByPlaceholder("Search titles, lessons, or skills");
    await courseSearch.fill("private decision");
    await expect(coursesDialog.getByText("Decision quality", { exact: true })).toBeVisible();
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeHidden();
    await courseSearch.fill("no course can match this");
    await coursesDialog.getByRole("button", { name: "Clear search" }).click();
    await expect(courseSearch).toBeFocused();
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeVisible();
    await coursesDialog.getByRole("button", { name: "Close course menu" }).click();

    const accountTrigger = page.getByRole("button", { name: "Open Command Center for Playwright" });
    await accountTrigger.focus();
    await accountTrigger.press("Enter");
    await expect(commandPalette).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /Filosage Pro Owner course access/ })).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /My courses Open private and published courses/ })).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /Learning profile/ })).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /Control room/ })).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /Support/ })).toBeVisible();
    const themeToggle = commandPalette.getByRole("switch", { name: "Dark mode" });
    await expect(themeToggle).toBeVisible();
    const initialThemeState = await themeToggle.getAttribute("aria-checked");
    await themeToggle.click();
    await expect(commandPalette).toBeVisible();
    await expect(themeToggle).toHaveAttribute("aria-checked", initialThemeState === "true" ? "false" : "true");
    await themeToggle.click();
    await expect(commandPalette).toBeVisible();
    await expect(themeToggle).toHaveAttribute("aria-checked", initialThemeState ?? "false");
    await expect(commandPalette.getByRole("option", { name: /Sign out/ })).toBeVisible();

    await page.locator(".command-palette-backdrop").click({ position: { x: 6, y: 6 } });
    await expect(commandPalette).toBeHidden();
    await expect(accountTrigger).toBeFocused();

    await accountTrigger.click();
    await commandPalette.getByRole("option", { name: /Support/ }).click();
    await expect(page).toHaveURL(/\/support$/);
  });

  test("makes the active course and its lessons available from the Command Center", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.route("**/api/courses/morse-shell-course", (route) => route.fulfill({ json: ownedCourses[0] }));
    await page.goto("/course/Morse%20Code?id=morse-shell-course");

    await expect(page.getByRole("heading", { name: "Morse Code", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Search or jump anywhere/ }).click();

    const commandCenter = page.getByRole("dialog", { name: "Filosage Command Center" });
    await expect(commandCenter.getByText("Current course", { exact: true })).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Morse Code Open the course overview/ })).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Hear the rhythm Decode the system/ })).toBeVisible();
    await commandCenter.getByRole("combobox", { name: "Search Filosage" }).fill("Build a message");
    await commandCenter.getByRole("option", { name: /Build a message/ }).click();
    await expect(page).toHaveURL(/\/lesson\/0-1\?id=morse-shell-course$/);
  });

  test("returns to the public landing page after signing out", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/profile");

    await page.getByRole("button", { name: "Open Command Center for Playwright" }).click();
    const commandPalette = page.getByRole("dialog", { name: "Filosage Command Center" });
    await commandPalette.getByRole("option", { name: /Sign out/ }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Turn curiosity into understanding" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open Command Center/ })).toHaveCount(0);
  });

  test("keeps a drawer open when it is reopened during its exit transition", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/library");

    const commandTrigger = page.getByRole("button", { name: /Search or jump anywhere/ });
    const coursesDialog = page.getByRole("dialog", { name: "My courses" });
    await commandTrigger.click();
    await page.getByRole("dialog", { name: "Filosage Command Center" }).getByRole("option", { name: /My courses/ }).click();
    await expect(coursesDialog).toBeVisible();

    await coursesDialog.getByRole("button", { name: "Close course menu" }).click();
    await expect(coursesDialog).toBeHidden();
    await commandTrigger.click();
    await page.getByRole("dialog", { name: "Filosage Command Center" }).getByRole("option", { name: /My courses/ }).click();

    await expect(coursesDialog).toBeVisible();
    await page.waitForTimeout(240);
    await expect(coursesDialog).toBeVisible();
  });

  test("keeps the main workspace stable while a modal drawer opens and closes", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/");

    const main = page.locator(".app-main");
    const readLayout = () => main.evaluate((element) => ({
      clientWidth: element.clientWidth,
      left: element.getBoundingClientRect().left,
    }));
    const before = await readLayout();

    await page.getByRole("button", { name: "Customize" }).click();
    const customizer = page.getByRole("dialog", { name: "Choose what helps you focus." });
    await expect(customizer).toBeVisible();
    expect(await readLayout()).toEqual(before);

    await customizer.getByRole("button", { name: "Close dashboard settings" }).click();
    await expect(customizer).toBeHidden();
    expect(await readLayout()).toEqual(before);
  });

  test("presents profile, progress, and course creation as evidence-led decisions", async ({ page }) => {
    await prepareOwnerShell(page);
    let generationRequests = 0;
    let generationBody: Record<string, unknown> | null = null;
    await page.route("**/api/generate-course", async (route) => {
      generationRequests += 1;
      generationBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { courseId: "explicit-course-creation" } });
    });

    await page.goto("/profile");
    await expectNoHorizontalPageOverflow(page);
    await expect(page.getByRole("heading", { name: "What you are building now" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Morse Code/ })).toBeVisible();
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
    expect(generationRequests).toBe(0);
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
    await page.locator("label").filter({ hasText: /^Project-led/ }).click();
    await expect(page.getByRole("radio", { name: /Project-led/ })).toBeChecked();
    expect(generationRequests).toBe(0);
    await createButton.click();
    await expect.poll(() => generationRequests).toBe(1);
    expect(generationBody).toMatchObject({ courseStyle: "Project-led" });
    await expect(page).toHaveURL(/\/course\/Systems%20thinking%20for%20product%20decisions\?id=explicit-course-creation$/);
  });

  test("never creates a course from an incomplete legacy course URL", async ({ page }) => {
    await prepareOwnerShell(page);
    let generationRequests = 0;
    await page.route("**/api/generate-course", async (route) => {
      generationRequests += 1;
      await route.fulfill({ status: 500, json: { error: "Generation must not start from this route." } });
    });

    await page.goto("/course/Legacy%20course");
    await expect(page.getByRole("heading", { name: "Review the course brief first" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open course studio" })).toBeVisible();
    expect(generationRequests).toBe(0);
  });
});

test.describe("mobile application shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps every account action and private courses reachable through the Command Center", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/library");

    await expect(page.locator(".learning-header")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search and jump anywhere" })).toHaveCount(0);
    await page.locator(".mobile-account-trigger").click();

    const commandCenter = page.getByRole("dialog", { name: "Filosage Command Center" });
    await expect(commandCenter).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Learning profile/ })).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Control room/ })).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Support/ })).toBeVisible();
    await expect(commandCenter.getByRole("switch", { name: "Dark mode" })).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Sign out/ })).toBeVisible();
    await commandCenter.getByRole("option", { name: /My courses/ }).click();

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
