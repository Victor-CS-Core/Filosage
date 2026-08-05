import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "use-study-tools",
  title: "Use lesson study tools",
  summary: "Take notes, run a lesson flashcard session, and choose the next practice action.",
  category: "practice",
  keywords: ["study tools", "notes", "flashcards", "recall", "tutor", "practice"],
  reviewedOn: "2026-08-05",
  sources: ["src/components/LessonStudyTools.tsx", "src/app/course/[topic]/lesson/[lessonId]/page.tsx"],
  body: `
## Open the study workspace

Choose **Study tools** from an open lesson. The workspace contains Notes, Flashcards, and Practice tabs when the lesson provides the required material.

## Take notes

Notes allow up to 12,000 characters. The status beside the note tells you whether it is saving, saved, synced, stored on this device, or could not be saved.

## Review lesson flashcards

Start a recall session, think before revealing the answer, then choose **Review again** or **Got it**. Cards marked for another pass return in the session. Flashcard session progress and the next flashcard review date are saved on this device for that lesson.

## Choose more practice

The Practice tab can open lesson checks or, when Tutor is available to your account, start a teach-back or fresh-example prompt. Tutor practice requires sign-in and may be unavailable when account access or usage limits do not allow it.
`,
  related: ["complete-a-lesson", "use-review", "sign-in-help"],
});
