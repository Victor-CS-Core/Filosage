import { expect, test } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { evaluateBadges } from "../src/lib/badges";
import { normalizeDashboardPreferences } from "../src/lib/dashboard-preferences";
import { estimateAiUsageCostMicros, summarizeAiUsage } from "../src/lib/ai-pricing";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const location = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(location) : [location];
  }));
  return files.flat();
}

test("keeps interface copy free of encoding artifacts", async () => {
  const files = (await sourceFiles(join(process.cwd(), "src")))
    .filter((file) => [".ts", ".tsx", ".css"].includes(extname(file)));
  const offenders: string[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (/(?:\u00E2\u20AC|\u00C2|\u00C3|\uFFFD)/u.test(content)) offenders.push(file);
  }
  expect(offenders).toEqual([]);
});

test("normalizes legacy dashboard settings without losing required defaults", () => {
  const preferences = normalizeDashboardPreferences({
    preset: "custom",
    sections: { learningTip: false },
    metrics: { streak: false },
    mainOrder: ["achievements"],
  });

  expect(preferences.sections.learningTip).toBe(false);
  expect(preferences.sections.nextUp).toBe(true);
  expect(preferences.metrics.streak).toBe(false);
  expect(preferences.metrics.lessons).toBe(true);
  expect(preferences.mainOrder).toEqual(["achievements", "nextUp", "learningTip"]);
});

test("earns badges from real learning progress", () => {
  const badges = evaluateBadges({
    progress: [{
      courseId: "systems",
      topic: "Systems thinking",
      lastLessonId: "0-0",
      lastLessonTitle: "Feedback loops",
      completedLessonIds: ["0-0"],
      totalLessons: 1,
      studyMinutes: 65,
      lastActivityAt: "2026-07-16T12:00:00.000Z",
      startedAt: "2026-07-16T12:00:00.000Z",
      lessons: {
        "0-0": {
          lessonId: "0-0",
          lessonTitle: "Feedback loops",
          status: "learned",
          attempts: 2,
          totalQuestions: 2,
          firstAttemptCorrect: 2,
          confidence: "high",
          intervalStage: 0,
          nextReviewAt: "2026-07-17T12:00:00.000Z",
          lastStudiedAt: "2026-07-16T12:00:00.000Z",
        },
      },
    }],
  });

  expect(badges.find((badge) => badge.id === "first-step")?.earned).toBe(true);
  expect(badges.find((badge) => badge.id === "study-hour")?.earned).toBe(true);
  expect(badges.find((badge) => badge.id === "clean-sweep")?.earned).toBe(true);
  expect(badges.find((badge) => badge.id === "course-complete")?.earned).toBe(true);
});

test("never leaves public learning behind the authentication startup screen", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/identitytoolkit.googleapis.com/**", (route) => route.abort());
  await page.goto("/");

  expect(pageErrors).toEqual([]);

  await expect(
    page.getByRole("heading", { name: "Understanding that lasts." }),
  ).toBeVisible({ timeout: 4000 });
  await expect(page.locator(".auth-boot-shell")).toHaveCount(0);
});

test("keeps the learning library public", async ({ page }) => {
  const response = await page.goto("/");

  await expect(page).toHaveTitle(/Erudoza/);
  const contentSecurityPolicy = response?.headers()["content-security-policy"] ?? "";
  const scriptDirective = contentSecurityPolicy.split(";").find((directive) => directive.trim().startsWith("script-src "));
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
  expect(scriptDirective).toContain("script-src 'self' 'nonce-");
  expect(scriptDirective).not.toContain("'unsafe-inline'");
  await expect(page.locator(".skip-link")).toHaveAttribute("href", "#main-content");
  await expect(
    page.getByRole("heading", { name: "Understanding that lasts." }),
  ).toBeVisible();
  await expect(page.getByText("No account required to read")).toBeVisible();
});

test("publishes the teaching standard", async ({ page }) => {
  await page.goto("/standard");

  await expect(page.getByRole("heading", { name: "Generated is not good enough. Every lesson is held to a standard." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A named misconception" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mastery is earned, not attended" })).toBeVisible();
  await expect(page.getByRole("button", { name: /See courses held to this standard/ })).toBeVisible();
});

test("keeps the signed-in learner shell on one scroll owner", async ({ page }) => {
  const styles = await readFile(join(process.cwd(), "src/app/globals.css"), "utf8");
  await page.setContent(`
    <div class="app-shell learner-shell">
      <main class="app-main"><div style="height: 2000px"></div></main>
    </div>
  `);
  await page.addStyleTag({ content: styles });
  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".learner-shell");
    const main = document.querySelector<HTMLElement>(".app-main");
    return {
      bodyClientHeight: document.body.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      mainClientHeight: main?.clientHeight ?? 0,
      mainScrollHeight: main?.scrollHeight ?? 0,
      shellOverflow: shell ? getComputedStyle(shell).overflow : "",
      shellPosition: shell ? getComputedStyle(shell).position : "",
    };
  });

  expect(dimensions.shellPosition).toBe("fixed");
  expect(dimensions.shellOverflow).toBe("hidden");
  expect(dimensions.bodyScrollHeight - dimensions.bodyClientHeight).toBeLessThanOrEqual(1);
  expect(dimensions.mainScrollHeight).toBeGreaterThan(dimensions.mainClientHeight);
});

test("prices cached input and mixed-model fallbacks accurately", () => {
  const luna = {
    model: "gpt-5.6-luna",
    inputTokens: 1_000,
    cachedInputTokens: 400,
    cacheWriteTokens: 200,
    outputTokens: 100,
  };
  const terra = { ...luna, model: "gpt-5.6-terra" };

  expect(estimateAiUsageCostMicros(luna)).toBe(1_290);
  expect(estimateAiUsageCostMicros(terra)).toBe(3_225);
  expect(summarizeAiUsage([luna, terra])).toEqual({
    inputTokens: 2_000,
    cachedInputTokens: 800,
    cacheWriteTokens: 400,
    outputTokens: 200,
    actualCostMicros: 4_515,
  });
});

test("keeps the owner control room private at both page and API boundaries", async ({ page, request }) => {
  const overview = await request.get("/api/admin/overview");
  expect(overview.status()).toBe(401);

  const accountAction = await request.patch("/api/admin/users/not-an-owner", {
    data: { action: "restore" },
  });
  expect(accountAction.status()).toBe(401);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "This page is not available." })).toBeVisible();
  await expect(page.getByText("Owner workspace")).toHaveCount(0);
  await expect(page.getByText("User directory")).toHaveCount(0);
});

test("preserves the selected theme across navigation and reloads", async ({ page }) => {
  await page.goto("/");
  // The toggle is server-rendered before React hydration attaches its click
  // handler, so retry the click until the theme actually changes.
  await expect(async () => {
    await page.locator(".public-header").getByRole("button", { name: "Use dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Explore published courses" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("erudoza-theme"))).toBe("dark");
});

test("offers an optional learner account without blocking public access", async ({ page }) => {
  await page.goto("/");

  await page.locator(".public-header").getByRole("button", { name: "Sign in" }).click();

  const dialog = page.getByRole("dialog", { name: "Keep your learning in sync" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("You can still read published courses without an account");
  await expect(
    dialog.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await expect(dialog.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
});

test("publishes clear legal documents", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await expect(page.getByText("automatic renewal", { exact: false }).first()).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy choices" })).toHaveAttribute("href", "/privacy-center");
  await page.goto("/acceptable-use");
  await expect(page.getByRole("heading", { name: "Acceptable Use Policy" })).toBeVisible();
  await page.goto("/copyright");
  await expect(page.getByRole("heading", { name: "Copyright Policy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repeat infringement" })).toBeVisible();
  await page.goto("/privacy-center");
  await expect(page.getByRole("heading", { name: "Your information, under your control." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to export" })).toBeVisible();
});

test("keeps generation visibly metered and premium", async ({ page }) => {
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: "Erudoza Pro" })).toBeVisible();
  await expect(page.getByText("Three private course outlines each month")).toBeVisible();
  await expect(page.getByText("Thirty generated lessons each month")).toBeVisible();
  await expect(page.getByText("$14.99")).toBeVisible();
  await expect(page.getByText("Five tutor questions each month")).toBeVisible();
  await expect(page.getByRole("button", { name: /Join the Pro launch list/i })).toBeDisabled();
});

test("reads a lesson aloud from the toolbar speaker", async ({ page }) => {
  const course = {
    courseId: "demo",
    id: "demo",
    topic: "Systems thinking",
    mission: "Understand feedback loops.",
    isPublic: true,
    modules: [{
      title: "Foundations",
      description: "Start here",
      lessons: [{ title: "Feedback loops", concept: "How outputs influence future inputs", estimatedMinutes: 8 }],
    }],
  };
  const lesson = {
    aiAssisted: true,
    content: "# Feedback loops\n\nA feedback loop connects a system's output to what happens next.",
    quizzes: [],
  };
  await page.route("**/api/courses/demo", (route) => route.fulfill({ json: course }));
  await page.route("**/api/courses/demo/lessons/0-0", (route) => route.fulfill({ json: lesson }));
  await page.goto("/course/Systems%20thinking/lesson/0-0?id=demo");

  const speechSupported = await page.evaluate(() => "speechSynthesis" in window);
  test.skip(!speechSupported, "This browser build has no speech synthesis; the button hides itself.");

  const speaker = page.getByRole("button", { name: "Read this lesson aloud" });
  await expect(speaker).toBeVisible();
  await expect(speaker).toHaveAttribute("aria-pressed", "false");
  await speaker.click();
  await expect(page.getByRole("button", { name: "Stop reading aloud" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Stop reading aloud" }).click();
  await expect(page.getByRole("button", { name: "Read this lesson aloud" })).toHaveAttribute("aria-pressed", "false");
});

test("does not complete a lesson after a wrong answer", async ({ page }) => {
  const course = {
    courseId: "demo",
    id: "demo",
    topic: "Systems thinking",
    mission: "Understand feedback loops.",
    isPublic: true,
    modules: [{
      title: "Foundations",
      description: "Start here",
      lessons: [
        { title: "Feedback loops", concept: "How outputs influence future inputs", estimatedMinutes: 8 },
        { title: "Leverage points", concept: "Where a small change can alter behavior", estimatedMinutes: 8 },
      ],
    }],
  };
  const lesson = {
    aiAssisted: true,
    content: "# Feedback loops\n\nA **feedback loop** connects a system's output to what happens next.\n\n### Why it matters\n\nLoops make change visible over time.",
    diagram: "flowchart LR\nA[Action] --> B[Result]\nB --> A",
    diagramSummary: "Legacy visual data must not appear in the lesson.",
    quizzes: [
      { question: "What defines a feedback loop?", options: ["A static list", "Output influencing future input", "A deadline", "A category"], correctIndex: 1, explanation: "The result feeds back into the system." },
      { question: "Why study the loop?", options: ["To see change over time", "To remove all inputs", "To rename parts", "To avoid examples"], correctIndex: 0, explanation: "Loops explain how behavior develops over time." },
    ],
  };
  await page.route("**/api/courses/demo", (route) => route.fulfill({ json: course }));
  await page.route("**/api/courses/demo/lessons/0-0", (route) => route.fulfill({ json: lesson }));
  await page.route("**/api/courses/demo/lessons/0-1", (route) => route.fulfill({ json: { ...lesson, content: "## Find the leverage point\n\nLook for the relationship that changes the system's behavior." } }));
  await page.goto("/course/Systems%20thinking/lesson/0-0?id=demo");

  await expect(page.getByRole("heading", { name: "Feedback loops" })).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByText("AI-assisted lesson")).toBeVisible();
  await expect(page.locator("[data-ai-generated='true']")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "See the relationships" })).toHaveCount(0);
  await expect(page.locator(".lesson-workspace")).toHaveCSS("overflow-y", "visible");
  await expect(page.locator(".lesson-scroll")).toHaveCSS("overflow-y", "visible");
  await expect(page.locator(".lesson-study-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Study tools" }).click();
  await expect(page.locator(".lesson-study-panel")).toBeVisible();
  await page.getByRole("button", { name: "Close study tools" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Why it matters" })).toBeVisible();
  const firstCheck = page.locator(".knowledge-check");
  await expect(firstCheck).toHaveCount(1);
  await expect(firstCheck.getByPlaceholder("Capture the key idea in your own words…")).toBeVisible();
  await firstCheck.getByRole("button", { name: "Reveal answer choices" }).click();
  const firstCorrectPosition = await firstCheck.getByRole("button", { name: /Output influencing future input/ }).locator("span").textContent();
  await firstCheck.getByRole("button", { name: /A static list/ }).click();
  const completionBanner = page.locator(".completion-banner");
  await expect(completionBanner.getByText("Complete the activities")).toBeVisible();
  await expect(completionBanner.getByText("Lesson complete")).not.toBeVisible();

  await firstCheck.getByRole("button", { name: "Try again" }).click();
  await firstCheck.getByRole("button", { name: /Output influencing future input/ }).click();
  await firstCheck.getByRole("button", { name: "Mostly sure" }).click();
  await firstCheck.getByRole("button", { name: "Continue to practice 2" }).click();

  const secondCheck = page.locator(".knowledge-check");
  await expect(secondCheck).toHaveCount(1);
  await secondCheck.getByRole("button", { name: "Reveal answer choices" }).click();
  const secondCorrectPosition = await secondCheck.getByRole("button", { name: /To see change over time/ }).locator("span").textContent();
  expect(secondCorrectPosition).not.toBe(firstCorrectPosition);
  await secondCheck.getByRole("button", { name: /To see change over time/ }).click();
  await secondCheck.getByRole("button", { name: "Certain" }).click();
  await expect(completionBanner.getByText("Lesson complete")).toBeVisible();
  await page.getByRole("button", { name: /Next lesson Leverage points/ }).click();
  await expect(page).toHaveURL(/lesson\/0-1\?id=demo/);
  await expect(page.getByRole("heading", { name: "Leverage points" })).toBeVisible();
  await expect(page.locator(".completion-banner").getByText("Complete the activities")).toBeVisible();
  await expect(page.locator(".completion-banner").getByText("Lesson complete")).not.toBeVisible();
});

test("renders the didactic lesson contract and transfer practice", async ({ page }) => {
  await page.route("**/api/courses/didactic-demo", (route) => route.fulfill({ json: {
    id: "didactic-demo",
    courseId: "didactic-demo",
    topic: "Decision making",
    mission: "Make defensible decisions under uncertainty.",
    isPublic: true,
    modules: [{
      title: "Evidence",
      objective: "Separate observations from assumptions.",
      lessons: [{
        title: "Evidence and inference",
        concept: "How claims depend on evidence",
        objective: "Classify statements as evidence or inference.",
        lessonMode: "worked-example",
        estimatedMinutes: 10,
      }],
    }],
  } }));
  await page.route("**/api/courses/didactic-demo/lessons/0-0", (route) => route.fulfill({ json: {
    aiAssisted: true,
    learningObjective: "Classify statements as evidence or inference.",
    connection: "This distinction is required before comparing competing explanations.",
    keyTakeaways: ["Evidence is observed.", "Inference interprets evidence.", "Good decisions keep the distinction visible."],
    content: "## Begin with the claim\n\nA claim can report an observation or interpret what that observation means.",
    guidedPractice: {
      prompt: "Work through a short claim.",
      steps: ["Underline what was observed.", "Name the interpretation added to it."],
      modelAnswer: "The measurement is evidence; the explanation is an inference.",
    },
    transferTask: {
      prompt: "Apply the distinction to a workplace decision.",
      successCriteria: ["Name the observation.", "Name the inference."],
      modelResponse: "The missed deadline is observed; the claim that priorities are unclear is an inference.",
    },
    quizzes: [],
  } }));

  await page.goto("/course/Decision%20making/lesson/0-0?id=didactic-demo");
  await expect(page.getByText("Classify statements as evidence or inference.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work through the idea" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Use it in a new situation" })).toBeVisible();

  const response = page.getByLabel("Your response");
  await response.fill("The customer complaint is observed; the product diagnosis is an inference.");
  const compare = page.getByRole("button", { name: "Compare response" });
  await expect(compare).toBeEnabled();
  await compare.click();
  await expect(page.getByText("The missed deadline is observed; the claim that priorities are unclear is an inference.")).toBeVisible();
});

test("presents public courses as a browsable learning library", async ({ page }) => {
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [{
    id: "public-systems",
    courseId: "public-systems",
    topic: "Systems thinking",
    mission: "See the feedback loops shaping everyday outcomes.",
    level: "beginner",
    isPublic: true,
    aiAssisted: true,
    modules: [{ title: "Foundations", description: "Build the model", lessons: [
      { title: "Feedback loops", concept: "How outputs shape future inputs", estimatedMinutes: 8 },
      { title: "Leverage points", concept: "Where small changes matter", estimatedMinutes: 10 },
    ] }],
  }] } }));

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Find your next course." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Systems thinking" })).toBeVisible();
  await expect(page.getByText("2 lessons")).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Systems thinking/i })).toBeVisible();
});

test("frames each course around an outcome and mastery", async ({ page }) => {
  const course = {
    courseId: "demo",
    id: "demo",
    topic: "Systems thinking",
    mission: "Understand feedback loops.",
    level: "beginner",
    isPublic: true,
    aiAssisted: true,
    modules: [{
      title: "Foundations",
      description: "Build a working mental model",
      lessons: [
        { title: "Feedback loops", concept: "How outputs influence future inputs", estimatedMinutes: 8 },
        { title: "Leverage points", concept: "Where small changes reshape a system", estimatedMinutes: 10 },
      ],
    }],
  };
  await page.route("**/api/courses/demo", (route) => route.fulfill({ json: course }));
  await page.route("**/api/courses/demo/lessons/0-1", (route) => route.fulfill({ json: {
    aiAssisted: true,
    content: "# Leverage points\n\nA leverage point is a place where a focused change can reshape system behavior.",
    quizzes: [],
  } }));
  await page.addInitScript(() => {
    localStorage.setItem("erudoza-learning-state-v2", JSON.stringify({
      demo: {
        courseId: "demo",
        topic: "Systems thinking",
        lastLessonId: "0-0",
        lastLessonTitle: "Feedback loops",
        completedLessonIds: ["0-0"],
        lessons: {},
        studyMinutes: 8,
        totalLessons: 2,
        lastActivityAt: "2026-07-16T12:00:00.000Z",
        startedAt: "2026-07-16T12:00:00.000Z",
      },
    }));
  });
  await page.goto("/course/Systems%20thinking?id=demo");

  await expect(page.getByText("Course outcome")).toBeVisible();
  await expect(page.getByText("AI-assisted course")).toBeVisible();
  await expect(page.locator("[data-ai-assisted='true']")).toHaveCount(1);
  await expect(page.getByText("By the end")).toBeVisible();
  const resumeCard = page.locator(".course-resume-card");
  await expect(resumeCard.getByText("Continue learning")).toBeVisible();
  await expect(resumeCard.getByRole("heading", { name: "Leverage points" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Modules and lessons" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Foundations" })).toBeVisible();
  await expect(page.locator(".module-completion")).toContainText("1/2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await resumeCard.getByRole("button", { name: /Resume lesson/i }).click();
  await expect(page).toHaveURL(/lesson\/0-1\?id=demo/);
});
