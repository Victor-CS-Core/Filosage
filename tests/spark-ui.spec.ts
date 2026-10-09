import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const course = {
  courseId: "spark-ui-course",
  id: "spark-ui-course",
  topic: "Neural networks",
  mission: "Explain and apply a weighted-input model.",
  isPublic: true,
  modules: [{ title: "Foundations", description: "Start with one neuron", lessons: [{ title: "A first neuron", concept: "Weighted inputs", estimatedMinutes: 8 }] }],
};

const lesson = {
  aiAssisted: true,
  content: "## Weighted inputs\n\nA weight scales its input before the bias is added.",
  learningObjective: "Explain how each weighted input contributes to a neuron's output.",
  quizzes: [],
};

const manifest = {
  schemaVersion: 1,
  registryVersion: "spark-registry-v1",
  id: "manifest-ui-fixture",
  courseId: course.id,
  lessonId: "0-0",
  lessonVersion: "lesson-ui-fixture",
  locale: "en",
  stage: "practice",
  objectiveIds: ["objective-neuron"],
  contentHash: "a".repeat(64),
  evidenceStatus: "course_supported",
  blocks: [
    { id: "explain-weight", type: "explanation", title: "Weights scale inputs", text: "Multiply each input by its weight, add the bias, then apply the activation.", style: "concise", sourceRefs: ["lesson-main"], evidenceStatus: "course_supported", objectiveIds: ["objective-neuron"] },
    { id: "neuron-model", type: "parameter_explorer", title: "Explore one neuron", prompt: "Change a value and observe the output.", template: "neuron-v1", config: { x1: 2, x2: 1, weight1: 0.8, weight2: 0.2, bias: -1, x1Label: "Input one", x2Label: "Input two", minimum: -5, maximum: 5, step: 0.1 }, sourceRefs: ["lesson-main"], evidenceStatus: "course_supported", objectiveIds: ["objective-neuron"] },
    { id: "weight-check", type: "single_choice", taskId: "weight-check", taskVersion: "task-ui-fixture", prompt: "What does a weight do before activation?", options: [{ id: "scale", text: "Scale the input" }, { id: "erase", text: "Erase the input" }], sourceRefs: ["lesson-main"], evidenceStatus: "course_supported", objectiveIds: ["objective-neuron"] },
  ],
  createdAt: "2026-10-09T00:00:00.000Z",
} as const;

test("Spark remains usable, accessible, and contained without live AI", async ({ page }, testInfo) => {
  let tutorTurnRequests = 0;
  await restoreLocalLearner(page);
  await page.route("**/api/courses/spark-ui-course", (route) => route.fulfill({ json: course }));
  await page.route("**/api/courses/spark-ui-course/lessons/0-0", (route) => route.fulfill({ json: lesson }));
  await page.route("**/api/spark/courses/spark-ui-course/state*", (route) => route.fulfill({ json: {
    featureEnabled: true,
    availability: "practice_only",
    course: { id: course.id, topic: course.topic },
    lesson: { id: "0-0", title: "A first neuron", version: manifest.lessonVersion, content: lesson.content },
    currentStage: "practice",
    manifest,
    preparation: "ready",
    evidence: { records: 0, demonstrated: 0 },
    review: { due: false, nextReviewAt: null },
    entitlement: { questionsRemaining: 5, resetAt: "2026-11-01T00:00:00.000Z" },
  } }));
  await page.route("**/api/spark/sessions", (route) => route.fulfill({ json: { session: { id: "session-ui", lessonVersion: manifest.lessonVersion, stage: "practice" }, manifest } }));
  await page.route("**/api/spark/sessions/session-ui?*", (route) => route.fulfill({ json: { session: { id: "session-ui" }, turns: [], nextCursor: null } }));
  await page.route("**/api/spark/sessions/*/turns", (route) => { tutorTurnRequests += 1; return route.fulfill({ status: 503, json: { error: "Live tutoring is paused." } }); });
  await page.route("**/api/spark/attempts", (route) => route.fulfill({ json: {
    attempt: { id: "attempt-ui" },
    grade: { state: "demonstrated", gradingMethod: "deterministic", verified: true, feedback: "The weight scales the input." },
    assessmentStatus: "not_required",
    assessment: null,
  } }));

  await page.goto(`/course/${encodeURIComponent(course.topic)}/lesson/0-0?id=${course.id}&spark=1`);
  await expect(page.getByRole("tab", { name: /Spark/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Learn by doing" })).toBeVisible();
  await expect(page.getByText("Live tutoring is paused", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask Spark" })).toHaveCount(0);

  const output = page.locator(".spark-output strong");
  const before = await output.textContent();
  await page.locator(".spark-range input").first().fill("4");
  await expect(output).not.toHaveText(before ?? "");
  expect(tutorTurnRequests).toBe(0);

  await page.getByLabel("Scale the input").check();
  await page.getByRole("button", { name: "Commit answer" }).click();
  await expect(page.getByText("Demonstrated", { exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).include(".spark-workspace").analyze();
  expect(accessibility.violations).toEqual([]);
  const overflow = await page.locator(".spark-workspace").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath("spark-workspace.png"), fullPage: true });
});

test("Spark denies private course and session reads across two authenticated accounts", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "spark-1024", "One server-backed identity acceptance run is sufficient.");
  const storeDirectory = process.env.FILOSAGE_SPARK_TEST_STORE_DIR;
  expect(storeDirectory).toBeTruthy();
  const storePath = resolve(storeDirectory!, "store.json");
  await mkdir(resolve(storeDirectory!), { recursive: true });
  const stored = JSON.parse(await readFile(storePath, "utf8").catch(() => "{}")) as Record<string, Record<string, unknown>>;
  const now = "2026-10-09T00:00:00.000Z";
  const authorUid = "local-free-learner-api";
  const otherUid = "local-free-learner";
  const account = (uid: string) => ({
    uid,
    plan: "free",
    accountStatus: "active",
    subscriptionStatus: "none",
    acceptedTermsVersion: TERMS_VERSION,
    acceptedPrivacyVersion: PRIVACY_VERSION,
    createdAt: now,
    updatedAt: now,
  });
  Object.assign(stored, {
    [`users/${authorUid}`]: account(authorUid),
    [`users/${otherUid}`]: account(otherUid),
    "courses/spark-private-acceptance": {
      id: "spark-private-acceptance",
      courseId: "spark-private-acceptance",
      authorId: authorUid,
      topic: "Private weighted inputs",
      isPublic: false,
      modules: [{ title: "Foundations", lessons: [{ title: "A first neuron", concept: "Weighted inputs", objectiveId: "objective-neuron" }] }],
    },
    "courses/spark-private-acceptance/lessons/0-0": {
      title: "A first neuron",
      content: "A weight scales its input before the bias is added.",
      objectiveIds: ["objective-neuron"],
      quizzes: [],
    },
    "sparkSessions/session-private-acceptance": {
      id: "session-private-acceptance",
      ownerUid: authorUid,
      courseId: "spark-private-acceptance",
      lessonId: "0-0",
      lessonVersion: "lesson-private-acceptance",
      locale: "en",
      stage: "practice",
      manifestId: "manifest-private-acceptance",
      contextSummary: "",
      summaryVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
  await writeFile(storePath, JSON.stringify(stored, null, 2));

  const authorHeaders = { Authorization: "Bearer playwright-free-learner-api" };
  const otherHeaders = { Authorization: "Bearer playwright-free-learner" };
  const stateUrl = "/api/spark/courses/spark-private-acceptance/state?lessonId=0-0&locale=en";
  const authorState = await request.get(stateUrl, { headers: authorHeaders });
  expect(authorState.ok(), await authorState.text()).toBe(true);
  const deniedState = await request.get(stateUrl, { headers: otherHeaders });
  expect(deniedState.status()).toBe(403);
  expect(await deniedState.json()).toMatchObject({ code: "SPARK_COURSE_FORBIDDEN" });

  const sessionUrl = "/api/spark/sessions/session-private-acceptance?limit=20";
  const authorSession = await request.get(sessionUrl, { headers: authorHeaders });
  expect(authorSession.ok(), await authorSession.text()).toBe(true);
  const deniedSession = await request.get(sessionUrl, { headers: otherHeaders });
  expect(deniedSession.status()).toBe(403);
  expect(await deniedSession.json()).toMatchObject({ code: "SPARK_SESSION_FORBIDDEN" });
});