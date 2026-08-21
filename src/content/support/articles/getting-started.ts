import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "getting-started",
  title: "Start learning with Filosage",
  summary: "Browse published courses, inspect a course outline, and sign in when you are ready to open a lesson.",
  category: "start",
  keywords: ["start", "account", "library", "course", "guest", "sign in"],
  reviewedOn: "2026-08-21",
  sources: [
    "src/app/library/page.tsx",
    "src/components/CourseLibrary.tsx",
    "src/components/AppShell.tsx",
    "src/components/CommandPalette.tsx",
    "src/app/page.tsx",
    "src/app/course/[topic]/lesson/[lessonId]/page.tsx",
    "src/components/AuthModal.tsx",
    "src/components/LegalConsentModal.tsx",
  ],
  body: `
## Browse before signing in

Open [Explore](/library) to browse published courses. You can search by topic, skill, or outcome and narrow the list by level or estimated time commitment.

Guests can open a published course overview and inspect its outcome, modules, lesson titles, and assessment structure. Lesson bodies are not available to guests.

## Open your first lesson

1. Choose a published course from Explore.
2. Review the course outcome and sequence.
3. Select a lesson.
4. When prompted, confirm age eligibility and the current Terms and Privacy Notice, then select one of the sign-in methods currently shown. Google remains available when enabled; email-code sign-in appears only when Microsoft Entra External ID is enabled. During rollout, email-code access may be limited to recovering an existing account; that does not mean new email-code account creation is open.

The in-app sign-in screen follows the light or dark appearance already selected in Filosage. Google-labeled actions show the official Google mark.

A signed-in learner can read lessons, complete practice, and keep account-backed progress and reviews in sync.

## Know where to go next

The **Today** page shows the active course deck you can continue plus three fixed signals: **Weekly progress**, **Review queue**, and **Learning streak**. If no course is active, use Explore to choose one.

On desktop, use **Search or jump anywhere** in the Learning Header to open the Command Center. It includes **Today**, **Explore**, **Review**, **Progress**, courses, lessons, and account actions. On a phone, the main destinations remain in the bottom navigation and the account control in the top bar opens the same Command Center.
`,
  related: ["find-a-course", "complete-a-lesson", "sign-in-help"],
  featured: true,
});
