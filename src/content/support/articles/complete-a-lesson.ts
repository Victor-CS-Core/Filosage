import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "complete-a-lesson",
  title: "Complete a lesson and its activities",
  summary: "Move through the lesson's Capability Cycle, complete its practice, and save honest learning evidence.",
  category: "courses",
  keywords: ["lesson", "activities", "practice", "quiz", "transfer", "complete", "mark learned"],
  reviewedOn: "2026-08-16",
  sources: ["src/app/course/[topic]/lesson/[lessonId]/page.tsx", "src/components/LessonSectionNavigator.tsx", "src/components/SpeakButton.tsx", "src/lib/learning-design.ts", "src/lib/learning-progress.ts"],
  body: `
## Follow the Capability Cycle

Each lesson has one focused win. It may begin by retrieving a prerequisite or asking for a prediction, then provides only the explanation needed for the central activity. Depending on the lesson, activities can include guided practice, a transfer task, interactive practice, and knowledge checks.

Use the lesson section navigation to move through longer explanations. If your browser supports speech synthesis, the lesson toolbar can also offer **Read this lesson aloud**.

## Finish the available work

Complete the activities shown for that lesson. Knowledge checks keep feedback hidden until you commit an answer. Use the feedback to revise a missed attempt, then complete the transfer task in a different situation.

When the required activities are complete, Filosage can mark the lesson complete and schedule a later review. Completion records the instructional work; it does not automatically claim that a self-check demonstrated mastery. If a compatible legacy lesson has no additional activities, confirm that you reviewed the explanation and use **Mark learned**.

## Check the save status

The completion panel states whether progress synced to your account or was saved on the current device. If syncing fails, keep the page open and use the displayed recovery guidance before repeating work.
`,
  related: ["use-study-tools", "use-review", "report-content"],
  featured: true,
});
