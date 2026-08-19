import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";
import {
  flashcardQualityIssues,
  generatedCardTarget,
  nextFlashcardDueAt,
  type GeneratedDeckOutput,
} from "../src/lib/flashcards";
import { MEMBERSHIP_PLANS, planAllows } from "../src/lib/membership-plans";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("flashcard entitlements match the approved Free, Plus, and Pro contract", () => {
  expect(MEMBERSHIP_PLANS.free.limits.flashcardDeckGenerationsPerMonth).toBe(5);
  expect(MEMBERSHIP_PLANS.plus.limits.flashcardDeckGenerationsPerMonth).toBe(40);
  expect(MEMBERSHIP_PLANS.pro.limits.flashcardDeckGenerationsPerMonth).toBe(100);
  expect(planAllows("free", "create_custom_flashcard_deck")).toBe(false);
  expect(planAllows("plus", "create_custom_flashcard_deck")).toBe(true);
  expect(planAllows("pro", "create_custom_flashcard_deck")).toBe(true);
});

test("recommended deck sizes stay bounded by study scope", () => {
  expect(generatedCardTarget("lesson", "balanced")).toBe(8);
  expect(generatedCardTarget("module", "balanced")).toBe(16);
  expect(generatedCardTarget("course", "balanced")).toBe(24);
  expect(generatedCardTarget("course", "comprehensive")).toBe(24);
});

test("local sample configuration stays fail-closed while generation accounting stays retry-safe", () => {
  const environment = source(".env.example");
  const route = source("src/app/api/flashcards/generate/route.ts");
  const usage = source("src/lib/ai-usage.ts");
  const server = source("src/lib/flashcards-server.ts");
  const page = source("src/app/review/flashcards/page.tsx");
  expect(environment).toContain("FLASHCARD_DECKS_ENABLED=false");
  expect(environment).toContain("FLASHCARD_AI_GENERATION_ENABLED=false");
  expect(environment).toContain("BILLING_ENABLED=false");
  expect(route).toContain('"flashcard_generation"');
  expect(route).toContain("allowCompletedReplay: true");
  expect(route).toContain("failed: true");
  expect(usage).toContain("A failed generation has no completed metered product event.");
  expect(server.match(/await assertFlashcardDeckCapacity\(/g)).toHaveLength(2);
  expect(server).toContain("deletes: removed.flatMap");
  expect(page).toContain('redirect("/review")');
});

test("quality gate rejects arbitrary cues, duplicates, leaked answers, and invented sources", () => {
  const cards: GeneratedDeckOutput["cards"] = [
    { prompt: "Recall takeaway 1.", answer: "A bounded answer about evidence.", type: "recall", objectiveIds: [], sourceRefIds: ["source-a"] },
    { prompt: "A bounded answer about evidence is what?", answer: "A bounded answer about evidence.", type: "recall", objectiveIds: [], sourceRefIds: ["source-a"] },
    { prompt: "Recall takeaway 1.", answer: "A bounded answer about evidence.", type: "recall", objectiveIds: [], sourceRefIds: ["invented"] },
  ];
  const issues = flashcardQualityIssues(cards, new Set(["source-a"])).join(" ");
  expect(issues).toContain("arbitrary or overly broad");
  expect(issues).toContain("reveals its answer");
  expect(issues).toContain("substantially duplicates");
  expect(issues).toContain("was not supplied");
});

test("review ratings produce progressively longer bounded intervals", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");
  expect(nextFlashcardDueAt("again", null, now)).toBe("2026-08-17T12:00:00.000Z");
  expect(nextFlashcardDueAt("almost", { repetitions: 2, lapses: 0 }, now)).toBe("2026-08-19T12:00:00.000Z");
  expect(nextFlashcardDueAt("got-it", { repetitions: 2, lapses: 0 }, now)).toBe("2026-08-28T12:00:00.000Z");
});

test("persisted private deck reads return cards from nested user storage", async ({ page }) => {
  await restoreLocalLearner(page);
  const headers = { Authorization: "Bearer playwright-local-owner" };
  const created = await page.request.post("/api/flashcards/decks", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      title: "Persistence contract",
      description: "A real local-store read after creation.",
      cards: [{
        prompt: "What must survive a persisted deck reload?",
        answer: "Every active card in the selected private deck.",
        type: "recall",
      }],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const createdDetail = await created.json() as { deck: { id: string }; cards: Array<{ prompt: string }> };
  expect(createdDetail.cards).toHaveLength(1);

  const reloaded = await page.request.get(`/api/flashcards/decks/${createdDetail.deck.id}`, { headers });
  expect(reloaded.ok(), await reloaded.text()).toBe(true);
  const reloadedDetail = await reloaded.json() as { deck: { cardCount: number }; cards: Array<{ prompt: string }> };
  expect(reloadedDetail.deck.cardCount).toBe(1);
  expect(reloadedDetail.cards).toEqual([
    expect.objectContaining({ prompt: "What must survive a persisted deck reload?" }),
  ]);
});

function account(plan: "free" | "plus") {
  const canCreateCustomFlashcardDeck = plan === "plus";
  return {
    access: plan,
    plan,
    isOwner: false,
    accountStatus: "active",
    displayName: "Flashcard Learner",
    subscriptionStatus: "none",
    acceptedTermsVersion: "2026-07-31",
    acceptedPrivacyVersion: "2026-07-31",
    legalAcceptanceRequired: false,
    applicationAccountExists: true,
    identityLinkRequired: false,
    currentTermsVersion: "2026-07-31",
    currentPrivacyVersion: "2026-07-31",
    capabilities: {
      createCourse: plan === "plus",
      generateLesson: plan === "plus",
      flashcardDecksEnabled: true,
      createCustomFlashcardDeck: canCreateCustomFlashcardDeck,
      publishCourse: false,
      advancedCapstoneAnalysis: false,
      exportEvidenceReport: false,
      shareEvidenceReport: false,
    },
    courseCredits: { balance: plan === "plus" ? 2 : 0, monthlyAllocation: plan === "plus" ? 2 : 0, balanceCap: plan === "plus" ? 24 : 0, nextAccrualAt: null, frozenUntil: null },
    quotas: [{ feature: "flashcard_generation", limit: plan === "plus" ? 40 : 5, used: 0, remaining: plan === "plus" ? 40 : 5, resetAt: "2026-09-01T00:00:00.000Z" }],
  };
}

test("Free learners see generation access but cannot open custom deck creation", async ({ page }) => {
  await restoreLocalLearner(page);
  await page.route("**/api/account", (route) => route.fulfill({ json: account("free") }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
  await page.route("**/api/flashcards/decks", (route) => route.fulfill({ json: { decks: [], availability: { decksEnabled: true, generationEnabled: true, canCreateCustomDeck: false } } }));
  await page.goto("/review/flashcards");

  await expect(page.getByRole("heading", { name: "Flashcard decks" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Custom deck/ })).toBeDisabled();
  await expect(page.getByText("Free accounts can generate and edit course-grounded decks.")).toBeVisible();
  await expect(page.getByText("5 of 5 generations left this month")).toBeVisible();
});

test("Plus learners can create a private custom deck from the deck workspace", async ({ page }) => {
  await restoreLocalLearner(page);
  const deck = {
    id: "custom-deck-0001", version: 1, ownerUid: "local-owner", revision: 1,
    title: "Difficult distinctions", description: "A private custom deck.", kind: "custom", status: "active",
    courseId: null, courseTopic: null, moduleIndex: null, lessonIds: [], scope: "custom", generationSettings: null,
    sourceFingerprint: null, cardCount: 1, dueCount: 1, createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z", lastReviewedAt: null, archivedAt: null, deletedAt: null,
  };
  const card = { id: "custom-card-0001", version: 1, deckId: deck.id, courseId: null, position: 0, prompt: "What separates a signal from ordinary noise?", answer: "A signal changes the decision; noise does not.", type: "contrast", origin: "manual", objectiveIds: [], sourceRefs: [], sourceFingerprint: null, createdAt: deck.createdAt, updatedAt: deck.updatedAt, deletedAt: null };
  const detail = { deck, cards: [card] };
  let saved = false;
  await page.route("**/api/account", (route) => route.fulfill({ json: account("plus") }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
  await page.route("**/api/flashcards/decks/custom-deck-0001", (route) => route.fulfill({ json: detail }));
  await page.route("**/api/flashcards/decks", async (route) => {
    if (route.request().method() === "POST") {
      const request = route.request();
      expect(request.headers()["idempotency-key"]?.length).toBeGreaterThanOrEqual(12);
      expect(request.postDataJSON()).toMatchObject({ title: "Difficult distinctions" });
      saved = true;
      return route.fulfill({ status: 201, json: detail });
    }
    return route.fulfill({ json: { decks: saved ? [deck] : [], availability: { decksEnabled: true, generationEnabled: true, canCreateCustomDeck: true } } });
  });
  await page.goto("/review/flashcards");

  await page.getByRole("button", { name: /Custom deck/ }).click();
  await page.getByLabel("Deck title").fill("Difficult distinctions");
  await page.getByLabel("Description").fill("A private custom deck.");
  await page.getByLabel("Prompt").fill("What separates a signal from ordinary noise?");
  await page.getByLabel("Answer").fill("A signal changes the decision; noise does not.");
  await page.getByLabel("Card type").selectOption("contrast");
  await page.getByRole("button", { name: "Create custom deck" }).click();

  await expect(page.getByRole("heading", { name: "Difficult distinctions" })).toBeVisible();
  await expect(page.getByText("Custom deck · 1 cards")).toBeVisible();
  await expect(page.getByText("What separates a signal from ordinary noise?")).toBeVisible();
  const selectedDeck = page.getByRole("button", { name: /Difficult distinctions Custom deck/ });
  await expect(selectedDeck).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm remove" })).toBeVisible();
  await page.getByRole("button", { name: /Generate/ }).click();
  await expect(page.getByRole("button", { name: /Generate/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Study/ }).click();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
});
