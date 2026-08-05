import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "understand-progress",
  title: "Understand your progress",
  summary: "Read weekly activity, course completion, review readiness, and learning evidence without treating every measure as mastery.",
  category: "progress",
  keywords: ["progress", "weekly goal", "accuracy", "confidence", "mastery", "activity", "summary"],
  reviewedOn: "2026-08-05",
  sources: ["src/app/progress/page.tsx", "src/lib/learning-summary.ts", "src/components/MasteryPath.tsx"],
  body: `
## Open the learning record

Choose **Progress** to see recent activity, review readiness, tracked study time, course completion, and available evidence from completed work.

## Read each measure in context

- **Course progress** is based on completed lessons in each course.
- **First-try accuracy** appears only when retrieval questions have been recorded.
- **Confidence calibration** compares recorded confidence with performance when both are available.
- **Mastery states** are derived from saved evidence and review behavior; they are not credentials or guarantees.

## Adjust the weekly milestone

Use the target selector in the weekly milestone panel to change the number of lessons you intend to complete. Missed days do not increase the target.

The weekly summary can be copied after there is learning activity in the current seven-day window.
`,
  related: ["use-review", "read-evidence-report", "manage-profile"],
});
