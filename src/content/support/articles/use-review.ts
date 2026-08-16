import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "use-review",
  title: "Use the Review queue",
  summary: "Return to due, prerequisite-ready capabilities in a focused retrieval session.",
  category: "practice",
  keywords: ["review", "queue", "due", "schedule", "retrieval", "streak", "flashcard", "deck"],
  reviewedOn: "2026-08-16",
  sources: ["src/app/review/page.tsx", "src/app/review/flashcards/page.tsx", "src/components/flashcards/FlashcardStudio.tsx", "src/lib/adaptive-learning.ts", "src/lib/retrieval-planning.ts", "src/lib/review-readiness.ts", "src/lib/learning-progress.ts"],
  body: `
## Open today's review

Choose **Review** in the main navigation. Filosage builds a course-scoped queue from saved learning progress and presents up to 10 due items whose prerequisites are ready.

If you are signed in, the page loads account-backed progress. Without an account, it can use progress stored on the current device.

## Work through the queue

Start the review session and open each suggested lesson. The review begins with recall before answer-bearing lesson cues become available. After you commit an answer, the explanation and study tools return for feedback and remediation.

## Study flashcard decks

Choose **Open decks** from Review to select a private flashcard deck. **Generate** creates a source-grounded lesson, module, or course deck only when you command it. Recommended settings use balanced depth and emphasis; you can choose focused or comprehensive depth and emphasize key ideas or application. A successful preview uses one monthly generation even if you later remove it. Failed or rejected attempts and retry-safe replays do not use another generation.

The deck editor lets you revise or remove generated cards. Plus and Pro members can also create custom decks and add manual cards. Free accounts cannot create a custom deck, but a downgrade does not delete saved decks. During study, rate each answer **Again**, **Almost**, or **Got it** to save its next review date.

## When nothing is due

The page shows upcoming scheduled reviews when available. A clear queue means no saved item is both due and prerequisite-ready; it does not erase completed work. Older lessons without current review metadata receive a compatible scheduling entry instead of disappearing from the queue.
`,
  related: ["complete-a-lesson", "use-study-tools", "understand-progress"],
  featured: true,
});
