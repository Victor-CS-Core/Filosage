import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "complete-a-lesson",
  title: "Complete a lesson and its activities",
  summary: "Move through the lesson's Capability Cycle, complete its practice, and save honest learning evidence.",
  category: "courses",
  keywords: ["lesson", "activities", "practice", "quiz", "transfer", "complete", "mark learned"],
  reviewedOn: "2026-09-06",
  sources: ["src/lib/learner-storage.ts", "src/lib/auth-server.ts", "src/app/course/[topic]/lesson/[lessonId]/page.tsx", "src/components/LessonExperience.tsx", "src/components/InteractiveLessonBlock.tsx", "src/components/LessonSectionNavigator.tsx", "src/components/SpeakButton.tsx", "src/lib/learning-design.ts", "src/lib/learning-progress.ts"],
  body: `
## Follow the Capability Cycle

The lesson workspace separates **Learn and Activities**. Learn contains the explanation and section navigation; Activities presents the ordered work that can produce lesson evidence. Each lesson has one focused win and may begin by retrieving a prerequisite or asking for a prediction.

Use the lesson section navigation to move through longer explanations. If your browser supports speech synthesis, the lesson toolbar can also offer **Read this lesson aloud**.

## Complete the activity sequence

Complete the activities in the order shown. A written active attempt must contain at least 20 meaningful characters before it can be saved. Knowledge checks keep feedback hidden until you commit an answer. The guided practice may require you to save an attempt, compare it with guidance, and confirm that review before the next activity opens. Finish with transfer work in a different situation.

Saved drafts and submitted activity evidence are private to your account unless you deliberately use a separate sharing feature. The completion panel identifies which required activity still needs attention instead of silently marking incomplete work as finished.

## Use interactive practice

Some lessons include recognition, classification, sequence, scenario, or signal/audio labs. Follow the control labels to check a selection, order, or classification. If the first pass misses the stated target, use the focused retry to work only on missed items before continuing. Scenario labs reveal feedback after a committed choice. Signal/audio labs include visible labels or text alternatives when audio is unavailable.

## Bookmark a lesson

Choose **Bookmark lesson** in an open lesson to save or remove that lesson marker. This is distinct from bookmarking a whole course in Explore: a course bookmark saves the course result, while a lesson bookmark records the individual lesson in learner state.

When the required activities are complete, Filosage can mark the lesson complete and schedule a later review. Completion records the instructional work; it does not automatically claim that a self-check demonstrated mastery. If a compatible legacy lesson has no additional activities, confirm that you reviewed the explanation and use **Mark learned**.

## Check the save status

The completion panel states whether progress synced to your account or was saved on the current device. If syncing fails, keep the page open and use the displayed recovery guidance before repeating work.
## Return after a session change

Notes, practice drafts, mastery evidence and completion are isolated by account on this device. After signing out or switching accounts, reopen the lesson using the account that owns the work. A delayed response cannot save work into another account’s session; guest mode does not claim private drafts left by a previous learner.
`,
  related: ["use-study-tools", "use-review", "report-content"],
  featured: true,
});
