import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "use-study-tools",
  title: "Use lesson study tools",
  summary: "Take notes, generate a grounded lesson deck on command, and choose the next practice action.",
  category: "practice",
  keywords: ["study tools", "notes", "flashcards", "recall", "tutor", "practice"],
  reviewedOn: "2026-08-16",
  sources: ["src/components/LessonStudyTools.tsx", "src/components/flashcards/FlashcardStudio.tsx", "src/components/flashcards/FlashcardReviewer.tsx", "src/app/course/[topic]/lesson/[lessonId]/page.tsx"],
  body: `
## Open the study workspace

Choose **Study tools** from an open lesson. The workspace contains Notes, Flashcards, and Practice tabs when the lesson provides the required material.

## Take notes

Notes allow up to 12,000 characters. The status beside the note tells you whether it is saving, saved, synced, stored on this device, or could not be saved.

## Review lesson flashcards

Flashcards are generated only when you choose **Generate deck**. The lesson command uses the recommended balanced settings, includes only lesson checks you already attempted, and verifies the cards against lesson material before saving them. A successful generated deck uses one monthly generation; a failed quality or safety check does not.

Choose a saved lesson deck, think before revealing the answer, then rate recall as **Again**, **Almost**, or **Got it**. Cards and next-review dates are saved privately to your account so the same deck is available across devices. Use **Open deck library** to edit cards, choose another deck, or create a custom deck when your membership includes custom creation.

## Choose more practice

The Practice tab can open lesson checks or, when Tutor is available to your account, start a teach-back or fresh-example prompt. Tutor practice requires sign-in and may be unavailable when account access or usage limits do not allow it.
`,
  related: ["complete-a-lesson", "use-review", "sign-in-help"],
});
