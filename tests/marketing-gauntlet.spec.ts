import { expect, test, type Page } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";

async function prepareEligibleCreator(page: Page) {
  await restoreLocalLearner(page);
  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "pro",
      plan: "pro",
      isOwner: false,
      accountStatus: "active",
      displayName: "Independent Learner",
      legalAcceptanceRequired: false,
      capabilities: { createCourse: true, generateLesson: true, publishCourse: true },
      courseCredits: { balance: 5, monthlyAllocation: 5, balanceCap: 60 },
      quotas: [{ feature: "course_outline", remaining: 5 }],
    },
  }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
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
  await prepareEligibleCreator(page);
  let generationBody: Record<string, unknown> | null = null;
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
});
