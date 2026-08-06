import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import type { Course, LessonData } from "../src/lib/course-types";
import type { CourseProgress } from "../src/lib/learning-types";
import { mockFreeLearnerAccount, restoreLocalLearner } from "./fixtures/local-learner";

const screenshotDirectory = resolve(process.cwd(), "public/support/screenshots");

const morseCourse: Course = {
  id: "morse-wiki-course",
  courseId: "morse-wiki-course",
  topic: "Morse Code",
  mission: "Send and receive a short message with accurate timing.",
  outcome: "Build a personal Morse communication card.",
  level: "Foundations",
  category: "Communication",
  estimatedMinutes: 120,
  isPublic: true,
  modules: [{
    title: "Decode the system",
    description: "Read and send foundational patterns.",
    lessons: [
      { title: "Hear the rhythm", concept: "Use relative timing to distinguish dots and dashes.", objective: "Distinguish dots and dashes by rhythm." },
      { title: "Build a message", concept: "Use character spacing to encode a short message.", objective: "Encode a short practical message." },
    ],
  }],
};

const morseLesson: LessonData = {
  learningObjective: "Distinguish dots and dashes by their relative timing, then decode a short pattern.",
  connection: "Timing is the foundation for recognizing complete Morse characters.",
  content: [
    "## Listen for proportion",
    "",
    "A dash lasts three times as long as a dot. Keep the gap between parts of one character equal to one dot.",
    "",
    "## Try a short pattern",
    "",
    "Read **.-** as one connected rhythm: short, then long.",
  ].join("\n"),
  quizzes: [],
};

const morseProgress: CourseProgress = {
  courseId: "morse-wiki-course",
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
  lessons: {},
};

async function prepareMorseExample(page: Page) {
  await restoreLocalLearner(page);
  await mockFreeLearnerAccount(page);
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [morseCourse] } }));
  await page.route("**/api/courses/morse-wiki-course", (route) => route.fulfill({ json: morseCourse }));
  await page.route("**/api/courses/morse-wiki-course/lessons/0-0", (route) => route.fulfill({ json: morseLesson }));
  await page.route("**/api/progress**", (route) => route.fulfill({ json: { progress: [morseProgress] } }));
  await page.route("**/api/course-banners/**", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='360'><defs><linearGradient id='g' x2='1' y2='1'><stop stop-color='#0d1b3d'/><stop offset='1' stop-color='#136f73'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/><path d='M80 250h1040' stroke='#fff' stroke-opacity='.22'/><circle cx='210' cy='150' r='34' fill='#fff' fill-opacity='.16'/><path d='M310 150h90m40 0h26m40 0h90' stroke='#fff' stroke-width='18' stroke-linecap='round'/></svg>",
  }));
}

test.describe("privacy-safe support wiki screenshots", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });

  test("renders the Morse Code course examples without account chrome", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Documentation screenshots are generated once in desktop Chromium.");
    await prepareMorseExample(page);

    await page.goto("/");
    const dashboardCards = page.locator(".dashboard-focus-grid");
    await expect(dashboardCards).toBeVisible();
    await dashboardCards.screenshot({ path: resolve(screenshotDirectory, "today-learning-cards.png") });

    await page.getByRole("button", { name: /Search or jump anywhere/ }).click();
    const commandCenter = page.locator(".command-palette-surface");
    await expect(commandCenter).toBeVisible();
    await commandCenter.screenshot({ path: resolve(screenshotDirectory, "command-center-theme-toggle.png") });

    await page.goto("/library");
    const library = page.locator(".library-browser");
    await page.getByPlaceholder("Search topics, lessons, skills, or courses").fill("Morse Code");
    await expect(library.getByRole("heading", { name: "Morse Code" })).toBeVisible();
    await library.screenshot({ path: resolve(screenshotDirectory, "course-library-morse-code.png") });

    await page.goto("/course/Morse%20Code?id=morse-wiki-course");
    const courseHeader = page.locator(".course-header");
    await expect(courseHeader.getByRole("heading", { level: 1, name: "Morse Code" })).toBeVisible();
    await courseHeader.screenshot({ path: resolve(screenshotDirectory, "morse-code-course-overview.png") });

    await page.goto("/course/Morse%20Code/lesson/0-0?id=morse-wiki-course");
    const lessonWorkspace = page.locator(".lesson-workspace");
    await expect(lessonWorkspace.getByRole("heading", { level: 1, name: "Hear the rhythm" })).toBeVisible();
    await lessonWorkspace.screenshot({ path: resolve(screenshotDirectory, "morse-code-lesson.png") });
  });
});
