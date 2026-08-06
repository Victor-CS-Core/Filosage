import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "complete-a-lesson",
  title: "Complete a lesson and its activities",
  summary: "Read the lesson, complete the available practice, and save the lesson to your learning record.",
  category: "courses",
  keywords: ["lesson", "activities", "practice", "quiz", "transfer", "complete", "mark learned"],
  reviewedOn: "2026-08-05",
  sources: ["src/app/course/[topic]/lesson/[lessonId]/page.tsx", "src/components/LessonSectionNavigator.tsx", "src/components/SpeakButton.tsx", "src/lib/learning-progress.ts"],
  body: `
## Read and practice

Lessons separate explanation from activities. Depending on the lesson, activities can include an active lesson task, guided practice, a transfer task, interactive practice, and knowledge checks.

Use the lesson section navigation to move through longer explanations. If your browser supports speech synthesis, the lesson toolbar can also offer **Read this lesson aloud**.

![A Morse Code lesson showing its objective, Learn and Activities workspaces, and explanation.](/support/screenshots/morse-code-lesson.png)

## Finish the available work

Complete the activities shown for that lesson. Knowledge checks show feedback after an attempt. A transfer task asks you to apply the idea in a different situation.

When the required activities are complete, Erudoza can mark the lesson complete and schedule a later review. If a lesson has no additional activities, confirm that you reviewed the explanation and use **Mark learned**.

## Check the save status

The completion panel states whether progress synced to your account or was saved on the current device. If syncing fails, keep the page open and use the displayed recovery guidance before repeating work.
`,
  related: ["use-study-tools", "use-review", "report-content"],
  featured: true,
});
