import { expect, test } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";

test("captures the populated flashcard study workspace", async ({ page }, testInfo) => {
  await restoreLocalLearner(page);
  const deck = {
    id: "visual-deck-0001", version: 1, ownerUid: "local-owner", revision: 2,
    title: "Decision signals", description: "Distinctions worth retrieving before the next case study.",
    kind: "generated", status: "active", courseId: "visual-course", courseTopic: "Evidence-led decisions",
    moduleIndex: 0, lessonIds: ["0-0"], scope: "lesson",
    generationSettings: { depth: "balanced", emphasis: "balanced", includeAttemptedChecks: true },
    sourceFingerprint: "visual-source-fingerprint-00000001", cardCount: 3, dueCount: 3,
    createdAt: "2026-08-16T12:00:00.000Z", updatedAt: "2026-08-16T13:00:00.000Z",
    lastReviewedAt: null, archivedAt: null, deletedAt: null,
  };
  const cards = [
    { id: "visual-card-0001", prompt: "What makes evidence decision-relevant rather than merely interesting?", answer: "It changes which action is justified under the stated constraint.", type: "contrast" },
    { id: "visual-card-0002", prompt: "How should uncertainty change the next move?", answer: "Choose the smallest reversible action and keep the unresolved limitation visible.", type: "application" },
    { id: "visual-card-0003", prompt: "Which shortcut weakens an evidence-led decision?", answer: "Choosing from intuition without connecting the action to the available evidence.", type: "misconception" },
  ].map((card, position) => ({
    ...card, version: 1, deckId: deck.id, courseId: deck.courseId, position, origin: "generated",
    objectiveIds: ["objective-0-0"], sourceRefs: [{ ref: `0-0:content:${position}`, lessonId: "0-0", lessonTitle: "From evidence to action", field: "content" }],
    sourceFingerprint: deck.sourceFingerprint, createdAt: deck.createdAt, updatedAt: deck.updatedAt, deletedAt: null,
  }));
  const account = {
    access: "plus", plan: "plus", isOwner: false, accountStatus: "active", displayName: "Avery",
    subscriptionStatus: "none", legalAcceptanceRequired: false, applicationAccountExists: true, identityLinkRequired: false,
    currentTermsVersion: "2026-07-31", currentPrivacyVersion: "2026-07-31",
    capabilities: { createCourse: true, generateLesson: true, flashcardDecksEnabled: true, createCustomFlashcardDeck: true, publishCourse: false, advancedCapstoneAnalysis: false, exportEvidenceReport: false, shareEvidenceReport: false },
    courseCredits: { balance: 2, monthlyAllocation: 2, balanceCap: 24, nextAccrualAt: null, frozenUntil: null },
    quotas: [{ feature: "flashcard_generation", limit: 40, used: 8, remaining: 32, resetAt: "2026-09-01T00:00:00.000Z" }],
  };
  await page.route("**/api/account", (route) => route.fulfill({ json: account }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
  await page.route("**/api/flashcards/decks/visual-deck-0001", (route) => route.fulfill({ json: { deck, cards } }));
  await page.route("**/api/flashcards/decks", (route) => route.fulfill({ json: { decks: [deck], availability: { decksEnabled: true, generationEnabled: true, canCreateCustomDeck: true } } }));

  await page.goto("/review/flashcards");
  await expect(page.getByRole("heading", { name: "Decision signals" })).toBeVisible();
  await expect(page.getByText("Card 1 of 3")).toBeVisible();
  const promptCard = page.locator(".deck-study-card");
  const promptBounds = await promptCard.boundingBox();
  expect(promptBounds).not.toBeNull();
  expect(promptBounds!.y).toBeLessThan(page.viewportSize()!.height - 80);
  await page.screenshot({
    path: `.impeccable/review/flashcard-studio-${testInfo.project.name}.png`,
    fullPage: false,
    animations: "disabled",
  });
  await page.locator(".deck-study-card").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `.impeccable/review/flashcard-study-${testInfo.project.name}.png`,
    fullPage: false,
    animations: "disabled",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Reveal answer" })).toBeVisible();
  await promptCard.scrollIntoViewIfNeeded();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
