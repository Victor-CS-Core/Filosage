import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "understand-progress",
  title: "Understand your progress",
  summary: "Read weekly activity, course completion, review readiness, and learning evidence without treating every measure as the same signal.",
  category: "progress",
  keywords: ["progress", "weekly goal", "schedule", "calendar", "reminder", "accuracy", "confidence", "mastery", "activity", "summary"],
  reviewedOn: "2026-08-16",
  sources: ["src/app/progress/page.tsx", "src/components/LearningScheduleSettings.tsx", "src/lib/learning-summary.ts", "src/components/MasteryPath.tsx"],
  body: `
## Open the learning record

Choose **Progress** to see recent activity, review readiness, tracked study time, course completion, and available evidence from completed work.

## Read each measure in context

- **Course progress** is based on completed lessons in each course.
- **First-try accuracy** appears only when retrieval questions have been recorded.
- **Confidence calibration** compares recorded confidence with performance when both are available.
- **Concept states** are derived from saved evidence and review behavior; they are not credentials or guarantees.

## Adjust the weekly milestone

Use the target selector in the weekly milestone panel to change the number of lessons you intend to complete. Missed days do not increase the target.

The weekly summary can be copied after there is learning activity in the current seven-day window.

## Set a learning schedule

Use Learning schedule on Progress to choose a study cadence and preferred time. Filosage normalizes the schedule to the timezone shown by your browser and can keep in-app reminders on or off.

Choose the calendar export to download a local **.ics** file for your calendar application. The file is a point-in-time export; changing the Filosage schedule later does not silently rewrite an event already imported elsewhere. **Email delivery is currently off**, so the in-app control does not promise an email reminder.
`,
  related: ["use-review", "read-evidence-report", "manage-profile"],
});
