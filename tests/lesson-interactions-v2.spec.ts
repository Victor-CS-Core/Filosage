import { expect, test } from "@playwright/test";
import type { Course, LessonData } from "../src/lib/course-types";
import { mockFreeLearnerAccount, restoreLocalLearner } from "./fixtures/local-learner";
import {
  signInteractionReceipt,
  validateInteractionReceipt,
  type InteractionReceiptClaims,
} from "../src/lib/interaction-receipt-crypto";
import {
  deriveLessonInteractions,
  interactionQualityIssues,
  type LessonInteraction,
} from "../src/lib/lesson-interactions";

const morseRows = [
  ["A", ".-"], ["B", "-..."], ["C", "-.-."], ["D", "-.."],
  ["E", "."], ["F", "..-."], ["G", "--."], ["H", "...."],
  ["I", ".."], ["J", ".---"], ["K", "-.-"], ["L", ".-.."],
] as const;

function lesson(content: string, interactions?: LessonInteraction[]): LessonData {
  return {
    content,
    learningObjective: "Classify 10 of 12 introduced Morse patterns correctly without consulting the chart.",
    interactions,
    quizzes: [],
  };
}

test("builds an objective-aligned Morse recognition lab from the lesson reference", () => {
  const content = [
    "## Reference chart",
    "",
    "| Character | Pattern |",
    "| --- | --- |",
    ...morseRows.map(([character, pattern]) => `| ${character} | ${pattern} |`),
  ].join("\n");
  const source = lesson(content);
  const interactions = deriveLessonInteractions(source);

  expect(interactions).toHaveLength(1);
  const interaction = interactions[0];
  expect(interaction.type).toBe("recognition");
  if (interaction.type !== "recognition") return;
  expect(interaction.purpose).toBe("practice");
  expect(interaction.referencePolicy).toBe("hidden-until-complete");
  expect(interaction.mastery).toEqual({ minimumFirstAttemptCorrect: 10, retryMissed: true });
  expect(interaction.items).toHaveLength(12);
  expect(interaction.items.map((item) => item.correctIndex)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
  for (const [index, item] of interaction.items.entries()) {
    expect(item.choices).toHaveLength(4);
    expect(new Set(item.choices.map((choice) => choice.label)).size).toBe(4);
    expect(item.choices[item.correctIndex].label).toBe(morseRows[index][0]);
    expect(item.choices.every((choice) => choice.feedback.length >= 12)).toBe(true);
  }
  expect(interactionQualityIssues(source, true)).toEqual([]);
});

test("keeps a signal sandbox as exploration and does not treat it as mastery practice", () => {
  const source = lesson("## Timing\n\nListen to `.`, `-`, `..`, and `--` before comparing the rhythm.");
  const interactions = deriveLessonInteractions(source);
  expect(interactions).toHaveLength(1);
  expect(interactions[0].type).toBe("signal");
  expect(interactions[0].purpose).toBe("explore");
  expect(interactionQualityIssues(source, true)).toContain(
    "The lesson needs a Recognition v2 practice lab with item-level mastery evidence; legacy interactions and explorers do not satisfy this requirement.",
  );
});

test("rejects a recognition answer key that conflicts with the lesson reference", () => {
  const content = [
    "| Character | Pattern |",
    "| --- | --- |",
    ...morseRows.map(([character, pattern]) => `| ${character} | ${pattern} |`),
  ].join("\n");
  const source = lesson(content);
  const [derived] = deriveLessonInteractions(source);
  expect(derived.type).toBe("recognition");
  if (derived.type !== "recognition") return;
  const tampered: LessonInteraction = {
    ...derived,
    items: derived.items.map((item, index) => index === 0 ? { ...item, correctIndex: (item.correctIndex + 1) % 4 } : item),
  };
  const issues = interactionQualityIssues(lesson(content, [tampered]), true);
  expect(issues.some((issue) => issue.includes("conflicts with the lesson content"))).toBe(true);
});

test("rejects weak mastery thresholds and predictable answer-position patterns", () => {
  const content = [
    "| Character | Pattern |",
    "| --- | --- |",
    ...morseRows.map(([character, pattern]) => `| ${character} | ${pattern} |`),
  ].join("\n");
  const source = lesson(content);
  const [derived] = deriveLessonInteractions(source);
  expect(derived.type).toBe("recognition");
  if (derived.type !== "recognition") return;
  const weak: LessonInteraction = {
    ...derived,
    mastery: { ...derived.mastery, minimumFirstAttemptCorrect: 1 },
    items: derived.items.map((item) => ({ ...item, correctIndex: 0 })),
  };
  const issues = interactionQualityIssues(lesson(content, [weak]), true);
  expect(issues).toContain("The lab mastery threshold is too low to demonstrate reliable first-pass recognition.");
  expect(issues).toContain("The recognition lab needs varied correct-answer positions to avoid a guessing pattern.");
});

test("does not invent generic ordering labs from ordinary guided-practice prose", () => {
  const source = {
    ...lesson("## Explanation\n\nA compact explanation with no interactive signal reference."),
    guidedPractice: {
      prompt: "Apply the method.",
      steps: ["Observe the situation.", "Choose an action.", "Check the result."],
      modelAnswer: "The response connects the observation, action, and check.",
    },
  };
  expect(deriveLessonInteractions(source)).toEqual([]);
});

test("binds practice receipts to the exact learner and recognition item", async () => {
  const secret = "test-only-interaction-receipt-secret";
  const claims: InteractionReceiptClaims = {
    version: 1,
    uid: "learner-1",
    courseId: "morse-course",
    lessonId: "0-0",
    interactionId: "interaction-recognition-morse",
    itemId: "item-morse-a",
    attempts: 2,
    firstAttemptCorrect: false,
    issuedAt: Date.now(),
  };
  const receipt = await signInteractionReceipt(secret, claims);
  await expect(validateInteractionReceipt(secret, receipt, {
    uid: claims.uid,
    courseId: claims.courseId,
    lessonId: claims.lessonId,
    interactionId: claims.interactionId,
    itemId: claims.itemId,
  })).resolves.toMatchObject({ ...claims });
  await expect(validateInteractionReceipt(secret, receipt, {
    uid: claims.uid,
    courseId: claims.courseId,
    lessonId: claims.lessonId,
    interactionId: claims.interactionId,
    itemId: "item-morse-b",
  })).resolves.toBeNull();
});

test("places recognition practice in Activities and withholds feedback until commitment", async ({ page }) => {
  const courseId = "morse-recognition-v2";
  const topic = "Morse Code";
  const content = [
    "## Character reference",
    "",
    "Use this chart while learning, then switch to Activities to practice without it.",
    "",
    "| Character | Pattern |",
    "| --- | --- |",
    ...morseRows.map(([character, pattern]) => `| ${character} | ${pattern} |`),
  ].join("\n");
  const course: Course = {
    id: courseId,
    courseId,
    topic,
    isPublic: true,
    modules: [{
      title: "Recognition",
      lessons: [{
        title: "Read whole patterns",
        concept: "Recognize a complete Morse pattern before translating it.",
        objective: "Classify 10 of 12 introduced Morse patterns correctly without consulting the chart.",
      }],
    }],
  };
  const lessonData = lesson(content);

  await restoreLocalLearner(page);
  await mockFreeLearnerAccount(page);
  await page.route(`**/api/courses/${courseId}`, (route) => route.fulfill({ json: course }));
  await page.route(`**/api/courses/${courseId}/lessons/0-0`, (route) => route.fulfill({ json: lessonData }));
  await page.route("**/api/progress?**", (route) => route.fulfill({ json: { progress: null } }));
  await page.route("**/api/lesson-interaction", async (route) => {
    const body = route.request().postDataJSON() as { itemId: string; selectedIndex: number };
    const expectedIndex = morseRows.findIndex(([character]) => body.itemId === `item-morse-${character.toLowerCase()}`) % 4;
    const correct = body.selectedIndex === expectedIndex;
    await route.fulfill({
      json: {
        correct,
        attempts: 1,
        firstAttemptCorrect: correct,
        receipt: correct ? "signed-practice-receipt-placeholder-with-enough-length" : undefined,
      },
    });
  });

  await page.goto(`/course/${encodeURIComponent(topic)}/lesson/0-0?id=${courseId}`);
  await expect(page.getByRole("heading", { name: "Read whole patterns" })).toBeVisible();
  await expect(page.locator(".markdown-content table")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recognize the character" })).toHaveCount(0);

  await page.getByRole("tab", { name: /Activities/ }).click();
  await expect(page.getByRole("tab", { name: /Pattern lab/ })).toBeVisible();
  await expect(page.locator(".markdown-content table")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recognize the character" })).toBeVisible();
  await expect(page.getByText("First-pass target: 10 of 12.")).toBeVisible();
  await expect(page.locator(".recognition-feedback")).toHaveCount(0);

  await page.locator(".recognition-choices button").first().click();
  await expect(page.locator(".recognition-feedback")).toContainText("Correct");
  await expect(page.locator(".recognition-feedback")).toContainText("A is .-");
});
