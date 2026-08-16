import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "use-review",
  title: "Use the Review queue",
  summary: "Return to due lessons in a focused review session and see what is coming next.",
  category: "practice",
  keywords: ["review", "queue", "due", "schedule", "retrieval", "streak", "flashcard", "deck"],
  reviewedOn: "2026-08-16",
  sources: ["src/app/review/page.tsx", "src/app/review/flashcards/page.tsx", "src/components/flashcards/FlashcardStudio.tsx", "src/lib/adaptive-learning.ts", "src/lib/learning-progress.ts"],
  body: `
## Open today's review

Choose **Review** in the main navigation. Filosage builds a queue from lessons with saved learning progress and presents up to 10 due items in one session.

If you are signed in, the page loads account-backed progress. Without an account, it can use progress stored on the current device.

## Work through the queue

Start the review session and open each suggested lesson. Review items identify the kind of practice requested and carry the course and lesson context back into the lesson page.

## Study flashcard decks

Choose **Open decks** from Review to select a private flashcard deck. **Generate** creates a source-grounded lesson, module, or course deck only when you command it. Recommended settings use balanced depth and emphasis; you can choose focused or comprehensive depth and emphasize key ideas or application. A successful preview uses one monthly generation even if you later remove it. Failed or rejected attempts and retry-safe replays do not use another generation.

The deck editor lets you revise or remove generated cards. Plus and Pro members can also create custom decks and add manual cards. Free accounts cannot create a custom deck, but a downgrade does not delete saved decks. During study, rate each answer **Again**, **Almost**, or **Got it** to save its next review date.

## When nothing is due

The page shows upcoming scheduled reviews when available. A clear queue means there is no due item in the current saved progress; it does not erase completed work.
`,
  related: ["complete-a-lesson", "use-study-tools", "understand-progress"],
  featured: true,
});
