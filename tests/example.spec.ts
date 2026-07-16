import { expect, test } from "@playwright/test";

test("keeps the learning library public", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Erudoza/);
  await expect(
    page.getByRole("heading", { name: "Understand more. Achieve more." }),
  ).toBeVisible();
  await expect(page.getByText("No account required to read")).toBeVisible();
});

test("offers an optional learner account without blocking public access", async ({ page }) => {
  await page.goto("/");

  await page.locator(".public-header").getByRole("button", { name: "Sign in" }).click();

  const dialog = page.getByRole("dialog", { name: "Keep your learning in sync" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Published courses remain open without an account");
  await expect(
    dialog.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
});

test("keeps generation visibly metered and premium", async ({ page }) => {
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: "Erudoza Pro" })).toBeVisible();
  await expect(page.getByText("Three private course outlines each month")).toBeVisible();
  await expect(page.getByText("Thirty generated lessons each month")).toBeVisible();
  await expect(page.getByRole("button", { name: /Checkout coming next/i })).toBeDisabled();
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
      lessons: [{ title: "Feedback loops", concept: "How outputs influence future inputs", estimatedMinutes: 8 }],
    }],
  };
  const lesson = {
    content: "A **feedback loop** connects a system's output to what happens next.",
    diagram: "flowchart LR\nA[Action] --> B[Result]\nB --> A",
    diagramSummary: "An action creates a result, and that result influences the next action.",
    quizzes: [
      { question: "What defines a feedback loop?", options: ["A static list", "Output influencing future input", "A deadline", "A category"], correctIndex: 1, explanation: "The result feeds back into the system." },
      { question: "Why study the loop?", options: ["To see change over time", "To remove all inputs", "To rename parts", "To avoid examples"], correctIndex: 0, explanation: "Loops explain how behavior develops over time." },
    ],
  };
  await page.route("**/api/courses/demo", (route) => route.fulfill({ json: course }));
  await page.route("**/api/courses/demo/lessons/0-0", (route) => route.fulfill({ json: lesson }));
  await page.goto("/course/Systems%20thinking/lesson/0-0?id=demo");

  const firstCheck = page.locator(".knowledge-check").first();
  await firstCheck.getByRole("button", { name: "Compare with choices" }).click();
  await firstCheck.getByRole("button", { name: /A static list/ }).click();
  await expect(page.getByText("Demonstrate understanding")).toBeVisible();
  await expect(page.getByText("Lesson learned")).not.toBeVisible();

  await firstCheck.getByRole("button", { name: "Try again" }).click();
  await firstCheck.getByRole("button", { name: /Output influencing future input/ }).click();
  await firstCheck.getByRole("button", { name: "Mostly sure" }).click();

  const secondCheck = page.locator(".knowledge-check").nth(1);
  await secondCheck.getByRole("button", { name: "Compare with choices" }).click();
  await secondCheck.getByRole("button", { name: /To see change over time/ }).click();
  await secondCheck.getByRole("button", { name: "Certain" }).click();
  await expect(page.getByText("Lesson learned")).toBeVisible();
});

test("presents public courses as a browsable learning library", async ({ page }) => {
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [{
    id: "public-systems",
    courseId: "public-systems",
    topic: "Systems thinking",
    mission: "See the feedback loops shaping everyday outcomes.",
    level: "beginner",
    isPublic: true,
    modules: [{ title: "Foundations", description: "Build the model", lessons: [
      { title: "Feedback loops", concept: "How outputs shape future inputs", estimatedMinutes: 8 },
      { title: "Leverage points", concept: "Where small changes matter", estimatedMinutes: 10 },
    ] }],
  }] } }));

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Find the next idea worth mastering." })).toBeVisible();
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
    modules: [{
      title: "Foundations",
      description: "Build a working mental model",
      lessons: [{ title: "Feedback loops", concept: "How outputs influence future inputs", estimatedMinutes: 8 }],
    }],
  };
  await page.route("**/api/courses/demo", (route) => route.fulfill({ json: course }));
  await page.goto("/course/Systems%20thinking?id=demo");

  await expect(page.getByText("Course outcome")).toBeVisible();
  await expect(page.getByText("Designed to build")).toBeVisible();
  await expect(page.getByRole("heading", { name: "From foundation to fluency" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Foundations" })).toBeVisible();
});
