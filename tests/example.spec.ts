import { expect, test } from "@playwright/test";

test("keeps the learning library public", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Teach/);
  await expect(
    page.getByRole("heading", { name: /Learn with structure/i }),
  ).toBeVisible();
  await expect(page.getByText("Published lessons stay free.")).toBeVisible();
});

test("offers an optional learner account without blocking public access", async ({ page }) => {
  await page.goto("/");

  if ((page.viewportSize()?.width ?? 1000) < 820) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.locator("button:visible").filter({ hasText: /^Sign in$/ }).first().click();

  const dialog = page.getByRole("dialog", { name: "Keep your learning in sync" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Published courses remain open without an account");
  await expect(
    dialog.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
});

test("keeps generation visibly metered and premium", async ({ page }) => {
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: "Teach Pro" })).toBeVisible();
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
