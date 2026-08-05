import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "use-review",
  title: "Use the Review queue",
  summary: "Return to due lessons in a focused review session and see what is coming next.",
  category: "practice",
  keywords: ["review", "queue", "due", "schedule", "retrieval", "streak"],
  reviewedOn: "2026-08-05",
  sources: ["src/app/review/page.tsx", "src/lib/adaptive-learning.ts", "src/lib/learning-progress.ts"],
  body: `
## Open today's review

Choose **Review** in the main navigation. Erudoza builds a queue from lessons with saved learning progress and presents up to 10 due items in one session.

If you are signed in, the page loads account-backed progress. Without an account, it can use progress stored on the current device.

## Work through the queue

Start the review session and open each suggested lesson. Review items identify the kind of practice requested and carry the course and lesson context back into the lesson page.

## When nothing is due

The page shows upcoming scheduled reviews when available. A clear queue means there is no due item in the current saved progress; it does not erase completed work.
`,
  related: ["complete-a-lesson", "use-study-tools", "understand-progress"],
  featured: true,
});
