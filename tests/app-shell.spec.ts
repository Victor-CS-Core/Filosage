import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
  {
    id: "systems-shell-course",
    courseId: "systems-shell-course",
    topic: "Systems thinking",
    mission: "Map a feedback loop and identify a useful intervention.",
    outcome: "Create a practical system map.",
    level: "Intermediate",
    category: "Strategy",
    isPublic: false,
    modules: [{
      title: "Patterns and leverage",
      description: "See how connected causes shape outcomes.",
      lessons: [{ title: "Map the loop", concept: "Feedback loops", objective: "Draw a causal loop." }],
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

const secondLearningProgress: CourseProgress = {
  courseId: "decision-shell-course",
  topic: "Decision quality",
  lastLessonId: "",
  lastLessonTitle: "",
  nextLessonId: "0-0",
  nextLessonTitle: "Evidence first",
  completedLessonIds: [],
  totalLessons: 1,
  studyMinutes: 0,
  lastActivityAt: "2026-08-02T16:00:00.000Z",
  startedAt: "2026-08-02T16:00:00.000Z",
  lessons: {},
};

const thirdLearningProgress: CourseProgress = {
  ...secondLearningProgress,
  courseId: "systems-shell-course",
  topic: "Systems thinking",
  nextLessonTitle: "Map the loop",
  lastActivityAt: "2026-08-01T18:00:00.000Z",
  startedAt: "2026-08-01T18:00:00.000Z",
};

async function prepareOwnerShell(page: Page, progress: CourseProgress[] = learningProgress) {
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
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress } }));
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

async function waitForDeckToSettle(page: Page) {
  await expect.poll(() => page.locator(".course-deck-viewport").getAttribute("data-motion-state")).toBe("idle");
}

test.describe("desktop application shell", () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test("uses a Learning Header with direct courses and a separate Command Center", async ({ page }) => {
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
    await expect(commandPalette.getByRole("option", { name: /Decision quality/ })).toHaveCount(0);
    await expect(commandPalette.getByText("No matching destination")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(commandPalette).toBeHidden();
    await expect(commandTrigger).toBeFocused();

    await commandTrigger.click();
    await commandPalette.getByRole("option", { name: /My courses/ }).click();
    const coursesDialog = page.getByRole("dialog", { name: "My courses" });
    await expect(coursesDialog).toBeVisible();
    await expect(coursesDialog).toHaveAttribute("data-state", "open");
    expect(await coursesDialog.evaluate((element) => element.matches(":modal"))).toBe(false);
    const shelfBox = await coursesDialog.boundingBox();
    expect(shelfBox?.width).toBeLessThanOrEqual(440);
    expect(shelfBox?.height).toBeLessThanOrEqual(560);
    expect(shelfBox?.x).toBeGreaterThan(680);
    await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
    const stacking = await page.evaluate(() => {
      const layer = (value: string) => value === "auto" ? 0 : Number(value);
      return {
        shelf: layer(getComputedStyle(document.getElementById("course-switcher-drawer")!).zIndex),
        card: layer(getComputedStyle(document.querySelector<HTMLElement>(".course-card")!).zIndex),
      };
    });
    expect(stacking.shelf).toBeGreaterThan(stacking.card);
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeVisible();
    await expect(coursesDialog.getByText("Decision quality", { exact: true })).toBeVisible();
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.waitForTimeout(460);
      await page.screenshot({ path: ".impeccable/review/course-drawer-desktop.png", fullPage: false });
    }

    const courseSearch = coursesDialog.getByPlaceholder("Search titles, lessons, or skills");
    await courseSearch.fill("private decision");
    await expect(coursesDialog.getByText("Decision quality", { exact: true })).toBeVisible();
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeHidden();
    await courseSearch.fill("no course can match this");
    await coursesDialog.getByRole("button", { name: "Clear search" }).click();
    await expect(courseSearch).toBeFocused();
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeVisible();
    await coursesDialog.getByRole("button", { name: "Close course menu" }).click();

    await commandTrigger.focus();
    await commandTrigger.press("Enter");
    await expect(commandPalette).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /Filosage Pro Owner course access/ })).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /My courses Open private and published courses/ })).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /Learning profile/ })).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /Control room/ })).toBeVisible();
    await expect(commandPalette.getByRole("option", { name: /Support/ })).toBeVisible();
    await expect(commandPalette.locator(".command-palette-icon[data-tone='teal']").first()).toBeVisible();
    await expect(commandPalette.locator(".command-palette-icon[data-tone='blue']").first()).toBeVisible();
    await expect(commandPalette.locator(".command-palette-icon[data-tone='coral']").first()).toBeVisible();
    await expect(commandPalette.locator(".command-palette-icon[data-tone='gold']").first()).toBeVisible();
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
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/command-center-colors-desktop.png", fullPage: false });
    }

    await page.locator(".command-palette-backdrop").click({ position: { x: 6, y: 6 } });
    await expect(commandPalette).toBeHidden();
    await expect(commandTrigger).toBeFocused();

    await commandTrigger.click();
    await commandPalette.getByRole("option", { name: /Support/ }).click();
    await expect(page).toHaveURL(/\/support$/);
  });

  test("keeps course and lesson listings out of the Command Center", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.route("**/api/courses/morse-shell-course", (route) => route.fulfill({ json: ownedCourses[0] }));
    await page.goto("/course/Morse%20Code?id=morse-shell-course");

    await expect(page.getByRole("heading", { name: "Morse Code", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Search or jump anywhere/ }).click();

    const commandCenter = page.getByRole("dialog", { name: "Filosage Command Center" });
    await expect(commandCenter.getByText("Current course", { exact: true })).toHaveCount(0);
    await expect(commandCenter.getByRole("option", { name: /Morse Code/ })).toHaveCount(0);
    await expect(commandCenter.getByRole("option", { name: /Hear the rhythm/ })).toHaveCount(0);
    await commandCenter.getByRole("combobox", { name: "Search Filosage" }).fill("Build a message");
    await expect(commandCenter.getByText("No matching destination")).toBeVisible();
    await expect(page).toHaveURL(/\/course\/Morse%20Code\?id=morse-shell-course$/);
  });

  test("opens My courses from the top-right profile trigger and unfolds from that origin", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/library");

    await page.getByRole("button", { name: "Open My Courses for Playwright" }).click();
    const shelf = page.getByRole("dialog", { name: "My courses" });
    await expect(shelf).toHaveAttribute("data-state", "open");
    expect(await shelf.evaluate((element) => element.matches(":modal"))).toBe(false);
    const origin = await shelf.locator(".app-drawer-surface").evaluate((surface) => {
      const [x, y] = getComputedStyle(surface).transformOrigin.split(" ").map(Number.parseFloat);
      return { x, y, width: (surface as HTMLElement).offsetWidth };
    });
    expect(origin.x).toBeCloseTo(origin.width, 1);
    expect(origin.y).toBeCloseTo(0, 1);

    const moveHandle = shelf.getByRole("button", { name: "Move My courses window" });
    await expect(shelf).toHaveAttribute("data-motion-settled", "true");
    await expect(moveHandle).toBeVisible();
    expect(await moveHandle.evaluate((handle) => {
      const rect = handle.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === handle || handle.contains(hit);
    })).toBe(true);
    const initialBox = await shelf.boundingBox();
    const handleBox = await moveHandle.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(handleBox).not.toBeNull();
    await page.mouse.move((handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2, (handleBox?.y ?? 0) + (handleBox?.height ?? 0) / 2);
    await page.mouse.down();
    await page.mouse.move((handleBox?.x ?? 0) - 80, (handleBox?.y ?? 0) + 60, { steps: 5 });
    await page.mouse.up();
    const draggedBox = await shelf.boundingBox();
    expect((draggedBox?.x ?? 0)).toBeLessThan((initialBox?.x ?? 0) - 60);
    expect((draggedBox?.y ?? 0)).toBeGreaterThan((initialBox?.y ?? 0) + 40);
    await moveHandle.focus();
    await moveHandle.press("Home");
    await expect.poll(async () => (await shelf.boundingBox())?.x ?? -1).toBeCloseTo(initialBox?.x ?? 0, 0);
    await expect.poll(async () => (await shelf.boundingBox())?.y ?? -1).toBeCloseTo(initialBox?.y ?? 0, 0);

    for (let index = 0; index < 6; index += 1) await moveHandle.press("Shift+ArrowLeft");
    for (let index = 0; index < 3; index += 1) await moveHandle.press("Shift+ArrowDown");
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(async () => {
      const rect = await shelf.boundingBox();
      return Boolean(rect
        && rect.x >= 12
        && rect.y >= 12
        && rect.x + rect.width <= 1012
        && rect.y + rect.height <= 756);
    }).toBe(true);

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(() => shelf.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(shelf).toHaveAttribute("data-presentation", "modal");
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

    await page.setViewportSize({ width: 1366, height: 900 });
    await expect.poll(() => shelf.evaluate((element) => element.matches(":modal"))).toBe(false);
    await expect(shelf).toHaveAttribute("data-presentation", "floating");
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
  });

  test("returns to the public landing page after signing out", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/profile");

    await page.getByRole("button", { name: /Search or jump anywhere/ }).click();
    const commandPalette = page.getByRole("dialog", { name: "Filosage Command Center" });
    await commandPalette.getByRole("option", { name: /Sign out/ }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Build the skill your next decision depends on" })).toBeVisible();
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

  test("uses a modal bottom sheet while the application is in its tablet shell", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await prepareOwnerShell(page);
    await page.goto("/library");

    await expect(page.locator(".learning-header")).toBeHidden();
    await page.getByRole("button", { name: /Open My Courses for Playwright/ }).click();
    const sheet = page.getByRole("dialog", { name: "My courses" });
    await expect(sheet).toHaveAttribute("data-state", "open");
    expect(await sheet.evaluate((element) => element.matches(":modal"))).toBe(true);
    const box = await sheet.boundingBox();
    expect(Math.round(box?.x ?? -1)).toBe(0);
    expect(Math.round((box?.x ?? -1) + (box?.width ?? 0))).toBe(768);
    expect(Math.round((box?.y ?? -1) + (box?.height ?? 0))).toBe(1024);
  });

  test("keeps the floating course shelf above a very large active-course deck", async ({ page }) => {
    const largeProgress = Array.from({ length: 45 }, (_, index): CourseProgress => ({
      ...learningProgress[0],
      courseId: `active-course-${index}`,
      topic: `Active course ${index + 1}`,
      startedAt: new Date(Date.UTC(2026, 7, 1, 16, index)).toISOString(),
    }));
    await prepareOwnerShell(page, largeProgress);
    await page.goto("/");

    await expect(page.locator(".course-deck-card.is-active")).toHaveCSS("z-index", "3");
    await page.getByRole("button", { name: /Search or jump anywhere/ }).click();
    await page.getByRole("dialog", { name: "Filosage Command Center" }).getByRole("option", { name: /My courses/ }).click();
    const shelf = page.getByRole("dialog", { name: "My courses" });
    await expect(shelf).toHaveAttribute("data-state", "open");
    const layers = await page.evaluate(() => ({
      shelf: Number(getComputedStyle(document.getElementById("course-switcher-drawer")!).zIndex),
      activeCard: Number(getComputedStyle(document.querySelector<HTMLElement>(".course-deck-card.is-active")!).zIndex),
    }));
    expect(layers.shelf).toBeGreaterThan(layers.activeCard);
  });

  test("shows one active course without misleading carousel controls", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/");

    const deck = page.getByRole("region", { name: "Active course", exact: true });
    await expect(deck).toBeVisible();
    await expect(deck).not.toHaveAttribute("aria-roledescription");
    await expect(page.getByRole("heading", { name: "Morse Code" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show next active course" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Customize" })).toHaveCount(0);
    await expectNoHorizontalPageOverflow(page);
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/course-deck-desktop.png", fullPage: true });
    }
  });

  test("gives the learner home distinct light and dark paper fields", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("filosage-theme", "light"));
    await prepareOwnerShell(page);
    await page.goto("/");

    const main = page.locator(".app-main");
    const heading = page.locator(".course-deck-heading h1");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(main).toHaveCSS("background-color", "rgb(231, 221, 206)");
    await expect(heading).toHaveCSS("color", "rgb(13, 27, 61)");
    expect((await new AxeBuilder({ page }).include(".course-deck-section").analyze()).violations).toEqual([]);
    await expect(page.locator(".learning-header .filosage-mark img")).toHaveAttribute("src", /filosage-theme-dark\.png/);

    await page.getByRole("button", { name: /Search or jump anywhere/ }).click();
    const commandCenter = page.getByRole("dialog", { name: "Filosage Command Center" });
    await commandCenter.getByRole("switch", { name: "Dark mode" }).click();
    await commandCenter.getByRole("button", { name: "Close Command Center", exact: true }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(main).toHaveCSS("background-color", "rgb(0, 13, 35)");
    await expect(heading).toHaveCSS("color", "rgb(243, 234, 220)");
    expect((await new AxeBuilder({ page }).include(".course-deck-section").analyze()).violations).toEqual([]);
  });

  test("keeps the B2 paper material coherent across core application routes", async ({ page }) => {
    await prepareOwnerShell(page);
    const routes = [
      { path: "/library", heading: /Find your next course/ },
      { path: "/create", heading: /Build toward a real outcome/ },
      { path: "/progress", heading: /Your progress/ },
      { path: "/profile", heading: /Playwright/ },
      { path: "/review", heading: /caught up|concept/ },
      { path: "/pricing", heading: /Learn freely/ },
      { path: "/support", heading: /What do you need help with/ },
      { path: "/standard", heading: /Generated is not good enough/ },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.locator(".app-main")).toHaveCSS("background-image", /svg/);
      await expectNoHorizontalPageOverflow(page);
      if (process.env.CAPTURE_DASHBOARD === "1" && ["/create", "/progress", "/pricing", "/support"].includes(route.path)) {
        await page.screenshot({ path: `.impeccable/review/platform-${route.path.slice(1)}-desktop.png`, fullPage: false });
      }
    }
  });

  test("cycles the held card through the pile in either direction without stealing nested keyboard input", async ({ page }, testInfo) => {
    await prepareOwnerShell(page, [...learningProgress, secondLearningProgress, thirdLearningProgress]);
    await page.goto("/");

    const deck = page.getByRole("region", { name: /Active course/ });
    const deckStatus = page.locator(".course-deck-controls [role='status']");
    const selections = [
      { id: "morse-shell-course", topic: "Morse Code", ordinal: "1 of 3", href: "/course/Morse%20Code/lesson/0-1?id=morse-shell-course" },
      { id: "decision-shell-course", topic: "Decision quality", ordinal: "2 of 3", href: "/course/Decision%20quality/lesson/0-0?id=decision-shell-course" },
      { id: "systems-shell-course", topic: "Systems thinking", ordinal: "3 of 3", href: "/course/Systems%20thinking/lesson/0-0?id=systems-shell-course" },
    ];
    const expectDeckSelection = async (index: number) => {
      const selection = selections[index];
      const activeCard = page.locator(".course-deck-card.is-active");
      await expect(activeCard).toHaveAttribute("data-course-id", selection.id);
      await expect(activeCard).toHaveAttribute("data-position", "0");
      await expect(deckStatus).toContainText(selection.topic);
      await expect(deckStatus).toContainText(selection.ordinal);
      await expect(activeCard.getByRole("link", { name: /Continue/ })).toHaveAttribute("href", selection.href);
    };
    const inspectPile = () => page.locator(".course-deck-card.is-visible").evaluateAll((cards) => cards.map((card) => {
      const rect = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const matrix = new DOMMatrixReadOnly(style.transform);
      const pixelValues = style.boxShadow.match(/-?\d+(?:\.\d+)?px/g)?.map(Number.parseFloat) ?? [];
      return {
        id: (card as HTMLElement).dataset.courseId ?? "",
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: (card as HTMLElement).offsetWidth,
        height: (card as HTMLElement).offsetHeight,
        zIndex: Number(style.zIndex),
        opacity: Number(style.opacity),
        scale: Math.hypot(matrix.a, matrix.b),
        shadowY: pixelValues.at(-3) ?? 0,
        shadowBlur: pixelValues.at(-2) ?? 0,
        position: Number((card as HTMLElement).dataset.position),
      };
    }).sort((a, b) => a.position - b.position).slice(0, 3));
    const inspectPaintedPile = () => page.locator(".course-deck-card.is-visible, .course-deck-card.is-drag-buffer").evaluateAll((cards) => cards.map((card) => {
      const rect = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const matrix = new DOMMatrixReadOnly(style.transform);
      const face = card.querySelector<HTMLElement>(".course-deck-card-face");
      return {
        id: (card as HTMLElement).dataset.courseId ?? "",
        position: Number((card as HTMLElement).dataset.position),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        opacity: Number(style.opacity),
        visibility: style.visibility,
        zIndex: Number(style.zIndex),
        scale: Math.hypot(matrix.a, matrix.b),
        hasSpine: Boolean(card.querySelector(".course-deck-spine")),
        hasFullFace: Boolean(
          face?.querySelector(".course-deck-cover")
          && face.querySelector(".course-deck-card-copy h2")
          && face.querySelector(".course-deck-progress")
          && face.querySelector("a.course-deck-primary"),
        ),
      };
    }).filter((card) => card.visibility === "visible" && card.opacity > 0.05));
    const expectDistinctOverlapLayers = (cards: Awaited<ReturnType<typeof inspectPaintedPile>>) => {
      for (let firstIndex = 0; firstIndex < cards.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < cards.length; secondIndex += 1) {
          const first = cards[firstIndex];
          const second = cards[secondIndex];
          const overlaps = first.left < second.right && first.right > second.left
            && first.top < second.bottom && first.bottom > second.top;
          if (overlaps) expect(first.zIndex, JSON.stringify({ first, second })).not.toBe(second.zIndex);
        }
      }
    };

    await expectDeckSelection(0);
    const motionToggle = page.getByRole("button", { name: "Full motion" });
    await expect(motionToggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("link", { name: "Learn how to change motion settings" })).toHaveAttribute(
      "href",
      "/support/articles/accessibility#control-motion-and-animation",
    );
    await motionToggle.hover();
    await expect(page.locator("#course-deck-motion-tooltip")).toBeVisible();
    await expect(page.locator("#course-deck-motion-tooltip")).toContainText("follow your drag");
    await page.mouse.move(0, 0);
    await expect(page.locator("#course-deck-motion-tooltip")).toBeHidden();
    const fullCardFaces = await page.locator(".course-deck-card.is-visible").evaluateAll((cards) => cards.map((card) => ({
      id: (card as HTMLElement).dataset.courseId,
      hasCover: Boolean(card.querySelector(".course-deck-cover")),
      hasCourseTitle: Boolean(card.querySelector(".course-deck-card-copy h2")),
      hasProgress: Boolean(card.querySelector(".course-deck-progress")),
      hasContinue: Boolean(card.querySelector("a.course-deck-primary")),
      hasSpine: Boolean(card.querySelector(".course-deck-spine")),
      titleWritingMode: getComputedStyle(card.querySelector<HTMLElement>(".course-deck-card-copy h2")!).writingMode,
    })));
    expect(fullCardFaces).toHaveLength(3);
    expect(fullCardFaces.every((card) => card.hasCover && card.hasCourseTitle && card.hasProgress && card.hasContinue)).toBe(true);
    expect(fullCardFaces.every((card) => !card.hasSpine && card.titleWritingMode === "horizontal-tb")).toBe(true);
    await expect(page.locator(".course-deck-spine")).toHaveCount(0);
    const pile = await inspectPile();
    expect(pile).toHaveLength(3);
    expect(pile[0].left).toBeLessThan(pile[1].left);
    expect(pile[1].left).toBeLessThan(pile[2].left);
    expect(Math.abs(pile[0].width - pile[1].width)).toBeLessThan(1);
    expect(Math.abs(pile[0].width - pile[2].width)).toBeLessThan(1);
    expect(Math.abs(pile[0].height - pile[1].height)).toBeLessThan(1);
    expect(Math.abs(pile[0].height - pile[2].height)).toBeLessThan(1);
    expect(pile.every((card) => Math.abs(card.scale - 1) < 0.001)).toBe(true);
    expect(pile.map((card) => card.zIndex)).toEqual([3, 2, 1]);
    expect(pile[0].shadowY).toBeGreaterThan(pile[1].shadowY);
    expect(pile[1].shadowY).toBeGreaterThan(pile[2].shadowY);
    expect(pile[0].shadowBlur).toBeGreaterThan(pile[1].shadowBlur);
    expect(pile[1].shadowBlur).toBeGreaterThan(pile[2].shadowBlur);
    expect(pile[2].left).toBeLessThan(1366);
    const firstCardBeforeControl = await page.locator(".course-deck-card[data-course-id='morse-shell-course']").boundingBox();
    if (!firstCardBeforeControl) throw new Error("Course Deck active card is not measurable before control cycling.");
    await page.getByRole("button", { name: "Show next active course" }).click();
    await expect(page.locator(".course-deck-viewport")).toHaveAttribute("data-motion-state", "committing");
    await expect(page.locator(".course-deck-viewport")).toHaveAttribute("data-direction", "next");
    await expectDeckSelection(0);
    await page.waitForTimeout(90);
    const firstCardDuringControl = await page.locator(".course-deck-card[data-course-id='morse-shell-course']").boundingBox();
    const approachingDuringControl = await page.locator(".course-deck-card[data-course-id='decision-shell-course']").boundingBox();
    if (!firstCardDuringControl || !approachingDuringControl) throw new Error("Course Deck cards are not measurable during control cycling.");
    const controlTravel = firstCardBeforeControl.x - firstCardDuringControl.x;
    expect(controlTravel).toBeGreaterThan(firstCardBeforeControl.width * 0.08);
    expect(controlTravel).toBeLessThan(firstCardBeforeControl.width * 0.95);
    expect(approachingDuringControl.x).toBeLessThan(pile[1].left - 8);
    await expectDeckSelection(0);
    if (process.env.CAPTURE_DASHBOARD === "1" && testInfo.project.name === "chromium") {
      await page.screenshot({ path: ".impeccable/review/course-deck-stack-control-motion-desktop.png", fullPage: false });
    }
    await waitForDeckToSettle(page);
    await expectDeckSelection(1);
    const continueLink = page.locator(".course-deck-card.is-active").getByRole("link", { name: /Continue/ });
    await continueLink.focus();
    await continueLink.press("ArrowRight");
    await expectDeckSelection(1);
    await deck.focus();
    await deck.press("ArrowLeft");
    await expect(page.locator(".course-deck-viewport")).toHaveAttribute("data-motion-state", "committing");
    await waitForDeckToSettle(page);
    await expectDeckSelection(0);
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/course-deck-stack-desktop.png", fullPage: true });
    }

    for (const viewport of [{ width: 1366, height: 900 }, { width: 320, height: 760 }]) {
      await page.setViewportSize(viewport);
      await deck.focus();
      await deck.press("Home");
      await waitForDeckToSettle(page);
      await expectDeckSelection(0);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

      const positions = await inspectPile();
      expect(positions[1].left - positions[0].left, JSON.stringify({ positions, viewport })).toBeGreaterThan(0);
      const activeCard = page.locator(".course-deck-card.is-active");
      const start = await activeCard.boundingBox();
      if (!start) throw new Error("Course Deck active card is not measurable.");
      const startX = start.x + Math.min(start.width * 0.42, 180);
      const startY = start.y + Math.min(start.height * 0.35, 190);

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - start.width * 0.15, startY, { steps: 10 });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const held = await activeCard.boundingBox();
      if (!held) throw new Error("Course Deck held card is not measurable.");
      expect(Math.abs((held.x - start.x) + (start.width * 0.15)), JSON.stringify({ start, held, viewport })).toBeLessThan(6);
      await expect(page.locator(".course-deck-viewport")).toHaveAttribute("data-motion-state", "dragging");
      await expect(page.locator(".course-deck-viewport")).toHaveAttribute("data-direction", "next");
      await expectDeckSelection(0);
      const approaching = await page.locator(".course-deck-card[data-position='1']").boundingBox();
      expect(approaching?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(positions[1].left);
      const nextLayers = await inspectPaintedPile();
      expectDistinctOverlapLayers(nextLayers);
      expect(nextLayers.find((card) => card.id === "morse-shell-course")?.zIndex).toBe(3);
      expect(nextLayers.find((card) => card.id === "decision-shell-course")?.zIndex).toBe(2);
      expect(nextLayers.find((card) => card.id === "systems-shell-course")?.zIndex).toBe(1);
      await page.mouse.move(startX, startY, { steps: 18 });
      await page.waitForTimeout(100);
      await page.mouse.up();
      await waitForDeckToSettle(page);
      await expectDeckSelection(0);

      const reset = await page.locator(".course-deck-card.is-active").boundingBox();
      if (!reset) throw new Error("Course Deck active card did not reset.");
      const resetX = reset.x + Math.min(reset.width * 0.42, 180);
      const resetY = reset.y + Math.min(reset.height * 0.35, 190);
      await page.mouse.move(resetX, resetY);
      await page.mouse.down();
      await page.mouse.move(resetX - reset.width * 0.58, resetY, { steps: 14 });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.waitForTimeout(60);
      await expect(page.locator(".course-deck-viewport")).toHaveAttribute("data-motion-state", "dragging");
      await expect(page.locator(".course-deck-viewport")).toHaveAttribute("data-direction", "next");
      const nextHandoffLayers = await inspectPaintedPile();
      expectDistinctOverlapLayers(nextHandoffLayers);
      const outgoingNextCard = nextHandoffLayers.find((card) => card.id === "morse-shell-course");
      const incomingNextCard = nextHandoffLayers.find((card) => card.id === "decision-shell-course");
      expect(outgoingNextCard?.zIndex).toBe(0);
      expect(incomingNextCard?.zIndex).toBe(3);
      expect(outgoingNextCard?.opacity ?? 1).toBeLessThan(0.99);
      expect(outgoingNextCard?.scale ?? 1).toBeLessThan(0.995);
      expect(incomingNextCard?.hasSpine).toBe(false);
      expect(incomingNextCard?.hasFullFace).toBe(true);
      await expectDeckSelection(0);
      if (process.env.CAPTURE_DASHBOARD === "1" && viewport.width === 1366) {
        await page.screenshot({ path: ".impeccable/review/course-deck-stack-motion-desktop.png", fullPage: true });
      }
      await page.mouse.up();
      await waitForDeckToSettle(page);
      await expectDeckSelection(1);

      const postCycle = await inspectPile();
      expect(postCycle.map((card) => card.zIndex)).toEqual([3, 2, 1]);
      expect(postCycle.every((card) => Math.abs(card.scale - 1) < 0.001)).toBe(true);

      const decisionCard = page.locator(".course-deck-card.is-active");
      const decisionBox = await decisionCard.boundingBox();
      if (!decisionBox) throw new Error("Course Deck cycled card is not measurable.");
      const decisionX = decisionBox.x + Math.min(decisionBox.width * 0.42, 180);
      const decisionY = decisionBox.y + Math.min(decisionBox.height * 0.35, 190);
      await page.mouse.move(decisionX, decisionY);
      await page.mouse.down();
      await page.mouse.move(decisionX + decisionBox.width * 0.15, decisionY, { steps: 8 });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.locator(".course-deck-viewport")).toHaveAttribute("data-direction", "previous");
      await expectDeckSelection(1);
      const heldPrevious = await decisionCard.boundingBox();
      if (!heldPrevious) throw new Error("Course Deck backward-held card is not measurable.");
      expect(Math.abs((heldPrevious.x - decisionBox.x) - (decisionBox.width * 0.15)), JSON.stringify({ decisionBox, heldPrevious, viewport })).toBeLessThan(6);
      const previousLayers = await inspectPaintedPile();
      expectDistinctOverlapLayers(previousLayers);
      expect(previousLayers.find((card) => card.id === "decision-shell-course")?.zIndex).toBe(3);
      expect(previousLayers.find((card) => card.id === "morse-shell-course")?.zIndex).toBe(2);
      expect(previousLayers.find((card) => card.id === "systems-shell-course")?.zIndex).toBe(1);
      await page.mouse.move(decisionX + decisionBox.width * 0.58, decisionY, { steps: 12 });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.waitForTimeout(60);
      const previousHandoffLayers = await inspectPaintedPile();
      expectDistinctOverlapLayers(previousHandoffLayers);
      const outgoingPreviousCard = previousHandoffLayers.find((card) => card.id === "decision-shell-course");
      const incomingPreviousCard = previousHandoffLayers.find((card) => card.id === "morse-shell-course");
      expect(outgoingPreviousCard?.zIndex).toBe(2);
      expect(incomingPreviousCard?.zIndex).toBe(3);
      expect(outgoingPreviousCard?.opacity ?? 0).toBeGreaterThan(0.99);
      expect(Math.abs((outgoingPreviousCard?.scale ?? 0) - 1)).toBeLessThan(0.005);
      expect(outgoingPreviousCard?.left ?? 0).toBeGreaterThan(incomingPreviousCard?.left ?? Number.POSITIVE_INFINITY);
      expect(incomingPreviousCard?.hasSpine).toBe(false);
      expect(incomingPreviousCard?.hasFullFace).toBe(true);
      if (process.env.CAPTURE_DASHBOARD === "1" && viewport.width === 1366) {
        await page.screenshot({ path: ".impeccable/review/course-deck-stack-motion-previous-desktop.png", fullPage: true });
      }
      await page.mouse.up();
      await waitForDeckToSettle(page);
      await expectDeckSelection(0);
    }
    await expect(page).toHaveURL(/\/$/);
    await expectNoHorizontalPageOverflow(page);
  });

  test("adapts course progress contrast to each card paper tone", async ({ page }) => {
    await prepareOwnerShell(page, [...learningProgress, secondLearningProgress, thirdLearningProgress]);
    await page.goto("/");

    const progressColors: Array<{ track: string; fill: string; paper: string }> = [];
    for (let index = 0; index < 3; index += 1) {
      progressColors.push(await page.locator(".course-deck-card.is-active").evaluate((card) => {
        const progress = card.querySelector<HTMLElement>(".course-deck-progress");
        const fill = progress?.querySelector<HTMLElement>("i");
        return {
          track: progress ? getComputedStyle(progress).backgroundColor : "",
          fill: fill ? getComputedStyle(fill).backgroundColor : "",
          paper: getComputedStyle(card).backgroundColor,
        };
      }));
      await page.getByRole("button", { name: "Show next active course" }).click();
      await waitForDeckToSettle(page);
    }

    expect(new Set(progressColors.map(({ fill }) => fill)).size).toBe(3);
    for (const colors of progressColors) {
      expect(colors.fill).not.toBe(colors.track);
      expect(colors.fill).not.toBe(colors.paper);
      expect(colors.track).not.toBe(colors.paper);
    }
  });

  test("keeps unknown progress totals explicit instead of inventing zero percent", async ({ page }) => {
    await prepareOwnerShell(page, [{
      ...secondLearningProgress,
      courseId: "unresolved-course",
      topic: "Unresolved course record",
      completedLessonIds: ["0-0"],
      totalLessons: undefined,
    }]);
    await page.goto("/");

    const card = page.locator(".course-deck-card.is-active");
    await expect(card).toContainText("1 of ? lessons");
    await expect(card).toContainText("Total pending");
    await expect(card.getByRole("progressbar", { name: /total unavailable/ })).not.toHaveAttribute("aria-valuenow", /.+/);
  });

  test("shows a recoverable error instead of a false empty state when progress fails", async ({ page }) => {
    await prepareOwnerShell(page);
    let progressAttempts = 0;
    await page.route("**/api/progress", (route) => {
      progressAttempts += 1;
      return progressAttempts === 1
        ? route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } })
        : route.fulfill({ json: { progress: learningProgress } });
    });
    await page.goto("/");

    const error = page.getByRole("alert", { name: /Your learning path couldn't load/ });
    await expect(error).toContainText("Your learning path couldn't load");
    await expect(error).toContainText("still intact");
    await error.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("region", { name: /Active course/ })).toBeVisible();
  });

  test("keeps the deck clear and usable when reduced motion is requested", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepareOwnerShell(page, [...learningProgress, secondLearningProgress, thirdLearningProgress]);
    await page.goto("/");

    const deck = page.getByRole("region", { name: /Active course/ });
    await expect(deck).toBeVisible();
    const motionToggle = page.getByRole("button", { name: "Reduced motion" });
    await expect(motionToggle).toHaveAttribute("aria-pressed", "true");
    await motionToggle.hover();
    await expect(page.locator("#course-deck-motion-tooltip")).toContainText("switch without animated movement");
    await expect(page.getByRole("link", { name: "Learn how to change motion settings" })).toHaveAttribute(
      "href",
      "/support/articles/accessibility#control-motion-and-animation",
    );
    await page.mouse.move(0, 0);
    const cardMotion = await page.locator(".course-deck-card.is-active").evaluate((element) => ({
      transitionDuration: getComputedStyle(element).transitionDuration,
      transform: getComputedStyle(element).transform,
    }));
    const transitionDurations = cardMotion.transitionDuration.split(",").map((value) => {
      const duration = value.trim();
      return duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    });
    expect(Math.max(...transitionDurations), JSON.stringify(cardMotion)).toBeLessThanOrEqual(1);
    const baselineTransforms = await page.locator(".course-deck-card.is-visible").evaluateAll((cards) => cards.map((card) => ({
      id: (card as HTMLElement).dataset.courseId,
      transform: getComputedStyle(card).transform,
    })));
    const activeBox = await page.locator(".course-deck-card.is-active").boundingBox();
    if (!activeBox) throw new Error("Reduced-motion Course Deck card is not measurable.");
    const startX = activeBox.x + (activeBox.width * 0.42);
    const startY = activeBox.y + (activeBox.height * 0.35);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - (activeBox.width * 0.4), startY, { steps: 10 });
    const heldTransforms = await page.locator(".course-deck-card.is-visible").evaluateAll((cards) => cards.map((card) => ({
      id: (card as HTMLElement).dataset.courseId,
      transform: getComputedStyle(card).transform,
    })));
    expect(heldTransforms).toEqual(baselineTransforms);
    await expect(deck).toHaveAttribute("data-motion-state", "idle");
    await page.mouse.up();
    await expect(page.locator(".course-deck-controls [role='status']")).toContainText("Decision quality");
    await expect(page.locator(".course-deck-card.is-active")).toHaveAttribute("data-course-id", "decision-shell-course");
    await expect(deck).toHaveAttribute("data-motion-state", "idle");
    expect(await page.locator(".course-deck-stage").evaluate((stage) => stage.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length)).toBe(0);
    await motionToggle.click();
    await expect(page.getByRole("button", { name: "Full motion" })).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("filosage-motion-preference"))).toBe("full");
    await deck.focus();
    await deck.press("ArrowRight");
    await expect(deck).toHaveAttribute("data-motion-state", "committing");
    await waitForDeckToSettle(page);
    await expect(page.locator(".course-deck-controls [role='status']")).toContainText("Systems thinking");
    await expect(page.locator(".course-deck-card.is-active")).toHaveAttribute("data-course-id", "systems-shell-course");
    await expectNoHorizontalPageOverflow(page);
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/course-deck-reduced-motion-desktop.png", fullPage: true });
    }
  });

  test("keeps the B2 hierarchy intact in the dark theme", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Search or jump anywhere/ }).click();
    const commandCenter = page.getByRole("dialog", { name: "Filosage Command Center" });
    const themeToggle = commandCenter.getByRole("switch", { name: "Dark mode" });
    if (await themeToggle.getAttribute("aria-checked") !== "true") await themeToggle.click();
    await commandCenter.getByRole("button", { name: "Close Command Center", exact: true }).click();
    await expect(page.getByRole("region", { name: /Active course/ })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/course-deck-dark-desktop.png", fullPage: true });
    }
    await page.getByRole("button", { name: /Search or jump anywhere/ }).click();
    await page.getByRole("dialog", { name: "Filosage Command Center" }).getByRole("option", { name: /My courses/ }).click();
    const darkShelf = page.getByRole("dialog", { name: "My courses" });
    await expect(darkShelf).toBeVisible();
    await expect(darkShelf).toHaveAttribute("data-state", "open");
    expect(await darkShelf.evaluate((element) => element.matches(":modal"))).toBe(false);
    await expect(darkShelf.locator(".app-drawer-surface")).toHaveCSS("background-color", "rgb(7, 21, 43)");
    await expect.poll(() => darkShelf.locator(".app-drawer-surface").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await expect(darkShelf.getByText("Morse Code", { exact: true })).toBeVisible();
    await expect(darkShelf.getByText("Decision quality", { exact: true })).toBeVisible();
    await page.waitForTimeout(280);
    const darkStacking = await page.evaluate(() => ({
      shelf: Number(getComputedStyle(document.getElementById("course-switcher-drawer")!).zIndex),
      deckCard: Number(getComputedStyle(document.querySelector<HTMLElement>(".course-deck-card")!).zIndex),
    }));
    expect(darkStacking.shelf).toBeGreaterThan(darkStacking.deckCard);
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/course-drawer-dark-desktop.png", fullPage: false });
    }
  });

  test("does not call a course complete when only its lessons are finished", async ({ page }) => {
    await prepareOwnerShell(page, [{
      ...learningProgress[0],
      nextLessonId: null,
      nextLessonTitle: null,
      completedLessonIds: ["0-0", "0-1"],
      totalLessons: 2,
    }]);
    await page.goto("/");

    const activeCard = page.locator(".course-deck-card.is-active");
    await expect(activeCard).toContainText("Review the course map");
    await expect(activeCard).not.toContainText("Course complete");
    await expect(activeCard.getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/course/Morse%20Code?id=morse-shell-course");
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
    await expect(page.getByText("Research and source validation are automatic.")).toBeVisible();
    await expect(page.getByText(/verifies suitable API-cited evidence and catalog metadata for further reading/)).toBeVisible();
    await expect(page.getByText(/your course is still created without invented citations/)).toBeVisible();
    const teachingStep = page.getByRole("button", { name: /Teaching plan/ });
    const createButton = page.getByRole("button", { name: "Create private course" });
    await expect(teachingStep).toHaveAttribute("data-complete", "true");
    await expect(createButton).toBeEnabled();
    await expect(page.getByLabel("Source name")).toHaveCount(0);
    await expect(page.getByText("Trusted references")).toHaveCount(0);
    await expect(page.getByRole("status", { name: "" })).toHaveCount(0);
    await page.locator("label").filter({ hasText: /^Project-led/ }).click();
    await expect(page.getByRole("radio", { name: /Project-led/ })).toBeChecked();
    expect(generationRequests).toBe(0);
    await createButton.click();
    await expect.poll(() => generationRequests).toBe(1);
    expect(generationBody).toMatchObject({ courseStyle: "Project-led" });
    expect(generationBody).not.toHaveProperty("sourcePack");
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

  test("opens My Courses from the mobile profile and keeps the Command Center separately reachable", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/library");

    await expect(page.locator(".learning-header")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search and jump anywhere" })).toHaveCount(0);
    await page.getByRole("button", { name: /Open My Courses for Playwright/ }).click();

    const coursesDialog = page.getByRole("dialog", { name: "My courses" });
    await expect(coursesDialog).toBeVisible();
    await expect(coursesDialog).toHaveAttribute("data-state", "open");
    expect(await coursesDialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(coursesDialog.getByText("Morse Code", { exact: true })).toBeVisible();
    await expect(coursesDialog.getByText("Decision quality", { exact: true })).toBeVisible();
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.waitForTimeout(460);
      await page.screenshot({ path: ".impeccable/review/course-drawer-mobile.png", fullPage: false });
    }
    await coursesDialog.getByRole("button", { name: "Close course menu" }).click();

    await page.getByRole("button", { name: "Open Command Center", exact: true }).click();
    const commandCenter = page.getByRole("dialog", { name: "Filosage Command Center" });
    await expect(commandCenter.getByRole("option", { name: /Learning profile/ })).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Control room/ })).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Support/ })).toBeVisible();
    await expect(commandCenter.getByRole("switch", { name: "Dark mode" })).toBeVisible();
    await expect(commandCenter.getByRole("option", { name: /Sign out/ })).toBeVisible();
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

  test("keeps the platform paper system legible on primary mobile routes", async ({ page }) => {
    await prepareOwnerShell(page);
    const routes = [
      { path: "/create", heading: /Build toward a real outcome/ },
      { path: "/progress", heading: /Your progress/ },
      { path: "/pricing", heading: /Learn freely/ },
      { path: "/support", heading: /What do you need help with/ },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.locator(".app-main")).toHaveCSS("background-image", /svg/);
      await expectNoHorizontalPageOverflow(page);
      if (process.env.CAPTURE_DASHBOARD === "1") {
        await page.screenshot({ path: `.impeccable/review/platform-${route.path.slice(1)}-mobile.png`, fullPage: false });
      }
    }
  });

  test("keeps the learner path legible and actionable on a phone", async ({ page }) => {
    await prepareOwnerShell(page);
    await page.goto("/");

    await expect(page.getByRole("region", { name: /Active course/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Morse Code" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue/ })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/course-deck-mobile.png", fullPage: true });
    }
  });

  test("keeps long mobile course and lesson titles above the primary action", async ({ page }) => {
    const longTopic = "Strategic communication across complex cross-functional organizations";
    await prepareOwnerShell(page, [{
      ...secondLearningProgress,
      courseId: "long-title-course",
      topic: longTopic,
      nextLessonTitle: "Build a defensible recommendation from incomplete and conflicting stakeholder evidence",
      totalLessons: 12,
    }]);
    await page.goto("/");

    const containment = await page.locator(".course-deck-card.is-active").evaluate((card) => {
      const action = card.querySelector<HTMLElement>(".course-deck-card-action");
      const cardBox = card.getBoundingClientRect();
      const actionBox = action?.getBoundingClientRect();
      return { cardBottom: cardBox.bottom, actionBottom: actionBox?.bottom ?? Number.POSITIVE_INFINITY };
    });
    expect(containment.actionBottom).toBeLessThanOrEqual(containment.cardBottom + 1);
    await expect(page.getByRole("link", { name: /Continue/ })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
  });

  test("shows the fanned course stack on a phone without horizontal overflow", async ({ page }) => {
    await prepareOwnerShell(page, [...learningProgress, secondLearningProgress, thirdLearningProgress]);
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      await expect(page.getByRole("button", { name: "Show next active course" })).toBeVisible();
      await expect(page.locator(".course-deck-card[data-position='1']")).toBeVisible();
      await expect(page.locator(".course-deck-card[data-position='2']")).toBeVisible();
      const fullCardMetrics = await page.locator(".course-deck-card.is-visible").evaluateAll((cards) => {
        const sortedCards = cards
          .map((card) => ({ element: card as HTMLElement, position: Number((card as HTMLElement).dataset.position) }))
          .sort((first, second) => first.position - second.position);
        const activeWidth = sortedCards[0].element.offsetWidth;
        const activeHeight = sortedCards[0].element.offsetHeight;
        return sortedCards.map(({ element, position }, index) => {
          const previousRect = index > 0 ? sortedCards[index - 1].element.getBoundingClientRect() : null;
          const cardRect = element.getBoundingClientRect();
          const face = element.querySelector<HTMLElement>(".course-deck-card-face")!;
          const title = face.querySelector<HTMLElement>(".course-deck-card-copy h2")!;
          const titleStyle = getComputedStyle(title);
          return {
            position,
            hasCompleteFace: Boolean(
              face.querySelector(".course-deck-cover")
              && face.querySelector(".course-deck-card-copy h2")
              && face.querySelector(".course-deck-progress")
              && face.querySelector("a.course-deck-primary"),
            ),
            hasSpine: Boolean(element.querySelector(".course-deck-spine")),
            sameDimensions: Math.abs(element.offsetWidth - activeWidth) < 1 && Math.abs(element.offsetHeight - activeHeight) < 1,
            exposedWidth: previousRect ? cardRect.right - previousRect.right : cardRect.width,
            writingMode: titleStyle.writingMode,
          };
        });
      });
      expect(fullCardMetrics).toHaveLength(3);
      expect(fullCardMetrics.every((metric) => metric.hasCompleteFace && !metric.hasSpine && metric.sameDimensions), JSON.stringify({ viewport, fullCardMetrics })).toBe(true);
      expect(fullCardMetrics.every((metric) => metric.writingMode === "horizontal-tb"), JSON.stringify({ viewport, fullCardMetrics })).toBe(true);
      expect(fullCardMetrics.slice(1).every((metric) => metric.exposedWidth >= 28), JSON.stringify({ viewport, fullCardMetrics })).toBe(true);

      const actionMetrics = await page.locator(".course-deck-card.is-active").evaluate((card) => {
        const copy = card.querySelector<HTMLElement>(".course-deck-card-copy")!;
        const action = card.querySelector<HTMLElement>(".course-deck-card-action")!;
        const continueLink = action.querySelector<HTMLElement>(".course-deck-primary")!;
        const copyRect = copy.getBoundingClientRect();
        const actionRect = action.getBoundingClientRect();
        const continueRect = continueLink.getBoundingClientRect();
        return {
          actionGap: actionRect.top - copyRect.bottom,
          continueHeight: continueRect.height,
        };
      });
      expect(actionMetrics.actionGap).toBeGreaterThanOrEqual(0);
      expect(actionMetrics.actionGap).toBeLessThanOrEqual(32);
      expect(actionMetrics.continueHeight).toBeGreaterThanOrEqual(44);
      if (process.env.CAPTURE_DASHBOARD === "1") {
        await page.locator(".course-deck-section").screenshot({ path: `.impeccable/review/course-deck-stack-mobile-${viewport.width}.png` });
      }

      const continueLink = page.locator(".course-deck-card.is-active").getByRole("link", { name: /Continue/ });
      await continueLink.scrollIntoViewIfNeeded();
      await continueLink.evaluate((link) => link.scrollIntoView({ block: "end", inline: "nearest" }));
      const continueBox = await continueLink.boundingBox();
      const navigationBox = await page.getByRole("navigation", { name: "Mobile navigation" }).boundingBox();
      expect(continueBox).not.toBeNull();
      expect(navigationBox).not.toBeNull();
      expect((navigationBox?.y ?? 0) - (continueBox?.y ?? 0) - (continueBox?.height ?? 0), JSON.stringify({ viewport, continueBox, navigationBox })).toBeGreaterThanOrEqual(8);
      if (process.env.CAPTURE_DASHBOARD === "1") {
        await page.screenshot({ path: `.impeccable/review/course-deck-stack-mobile-${viewport.width}-scrolled.png`, fullPage: false });
      }

      const sparkBox = await page.getByRole("button", { name: "Open Support Center" }).boundingBox();
      const controlsBox = await page.locator(".course-deck-controls").boundingBox();
      expect(sparkBox).not.toBeNull();
      expect(controlsBox).not.toBeNull();
      const overlapsControls = (sparkBox?.x ?? 0) < (controlsBox?.x ?? 0) + (controlsBox?.width ?? 0)
        && (sparkBox?.x ?? 0) + (sparkBox?.width ?? 0) > (controlsBox?.x ?? 0)
        && (sparkBox?.y ?? 0) < (controlsBox?.y ?? 0) + (controlsBox?.height ?? 0)
        && (sparkBox?.y ?? 0) + (sparkBox?.height ?? 0) > (controlsBox?.y ?? 0);
      expect(overlapsControls).toBe(false);
      expect((sparkBox?.x ?? 0) - ((controlsBox?.x ?? 0) + (controlsBox?.width ?? 0))).toBeGreaterThanOrEqual(8);
      expect((await new AxeBuilder({ page }).include(".course-deck-section").analyze()).violations).toEqual([]);
      await expectNoHorizontalPageOverflow(page);
    }
  });

  test("keeps vertical touch scrolling native while a horizontal touch flick changes course", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Trusted touch-drag synthesis is only available through Chromium CDP.");
    await prepareOwnerShell(page, [...learningProgress, secondLearningProgress, thirdLearningProgress]);
    await page.goto("/");

    const client = await page.context().newCDPSession(page);
    const dispatchTouch = async (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) => {
      await client.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 2, radiusY: 2, force: 1 }],
      });
    };
    const activeCard = page.locator(".course-deck-card.is-active");
    const initialBox = await activeCard.boundingBox();
    if (!initialBox) throw new Error("Touch Course Deck card is not measurable.");
    const verticalX = initialBox.x + (initialBox.width * 0.45);
    const verticalStartY = initialBox.y + Math.min(220, initialBox.height * 0.55);
    const initialScrollTop = await page.locator(".app-main").evaluate((main) => main.scrollTop);
    await dispatchTouch("touchStart", verticalX, verticalStartY);
    for (let step = 1; step <= 6; step += 1) {
      await dispatchTouch("touchMove", verticalX, verticalStartY - (step * 24));
      await page.waitForTimeout(16);
    }
    await dispatchTouch("touchEnd");
    await expect.poll(() => page.locator(".app-main").evaluate((main) => main.scrollTop)).toBeGreaterThan(initialScrollTop + 40);
    await expect(activeCard).toHaveAttribute("data-course-id", "morse-shell-course");
    await expect(page.locator(".course-deck-controls [role='status']")).toContainText("1 of 3");
    await expect(activeCard.getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/course/Morse%20Code/lesson/0-1?id=morse-shell-course");

    await activeCard.scrollIntoViewIfNeeded();
    const flickBox = await activeCard.boundingBox();
    if (!flickBox) throw new Error("Touch Course Deck card is not measurable after scrolling.");
    const flickStartX = flickBox.x + (flickBox.width * 0.7);
    const flickY = flickBox.y + Math.min(150, flickBox.height * 0.3);
    await dispatchTouch("touchStart", flickStartX, flickY);
    for (let step = 1; step <= 6; step += 1) {
      await dispatchTouch("touchMove", flickStartX - (step * 18), flickY);
      await page.waitForTimeout(12);
    }
    await dispatchTouch("touchEnd");
    await waitForDeckToSettle(page);
    await expect(page.locator(".course-deck-card.is-active")).toHaveAttribute("data-course-id", "decision-shell-course");
    await expect(page.locator(".course-deck-controls [role='status']")).toContainText("Decision quality");
    await expect(page.locator(".course-deck-controls [role='status']")).toContainText("2 of 3");
  });

  test("keeps the paper mobile navigation labels contained at the narrowest supported width", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await prepareOwnerShell(page, [...learningProgress, secondLearningProgress, thirdLearningProgress]);
    await page.goto("/");

    const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(navigation).toBeVisible();
    const metrics = await navigation.evaluate((element) => {
      const navigationRect = element.getBoundingClientRect();
      const labels = [...element.querySelectorAll<HTMLElement>("a:not(.mobile-create) > span")].map((label) => {
        const labelRect = label.getBoundingClientRect();
        const linkRect = label.parentElement!.getBoundingClientRect();
        const style = getComputedStyle(label);
        return {
          contained: labelRect.left >= linkRect.left - 0.5
            && labelRect.right <= linkRect.right + 0.5
            && labelRect.top >= navigationRect.top - 0.5
            && labelRect.bottom <= navigationRect.bottom + 0.5,
          overflow: style.overflow,
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
        };
      });
      const active = getComputedStyle(element.querySelector<HTMLElement>("a.is-active")!);
      return {
        navigationLeft: navigationRect.left,
        navigationRight: navigationRect.right,
        viewportWidth: document.documentElement.clientWidth,
        labels,
        activeBackgroundImage: active.backgroundImage,
      };
    });
    expect(metrics.navigationLeft).toBe(0);
    expect(metrics.navigationRight).toBe(metrics.viewportWidth);
    expect(metrics.labels).toHaveLength(4);
    expect(metrics.labels.every((label) => label.contained)).toBe(true);
    expect(metrics.labels.every((label) => label.overflow === "hidden" && label.textOverflow === "ellipsis" && label.whiteSpace === "nowrap")).toBe(true);
    expect(metrics.activeBackgroundImage).toContain("data:image/svg+xml");
    await expectNoHorizontalPageOverflow(page);
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/mobile-bottom-navigation.png", fullPage: false });
    }
  });

  test("shows a clear first-course state when there is no learning progress", async ({ page }) => {
    await prepareOwnerShell(page, []);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Welcome back, Playwright." })).toBeVisible();
    await expect(page.getByRole("link", { name: /Create your first course/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /Active course/ })).toHaveCount(0);
    await expectNoHorizontalPageOverflow(page);
    if (process.env.CAPTURE_DASHBOARD === "1") {
      await page.screenshot({ path: ".impeccable/review/course-deck-empty-mobile.png", fullPage: true });
    }
  });
});
