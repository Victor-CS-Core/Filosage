import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "getting-started",
  title: "Start learning with Erudoza",
  summary: "Browse published courses, inspect a course outline, and sign in when you are ready to open a lesson.",
  category: "start",
  keywords: ["start", "account", "library", "course", "guest", "sign in"],
  reviewedOn: "2026-08-05",
  sources: [
    "src/app/library/page.tsx",
    "src/components/CourseLibrary.tsx",
    "src/components/AppShell.tsx",
    "src/components/CommandPalette.tsx",
    "src/app/page.tsx",
    "src/app/course/[topic]/lesson/[lessonId]/page.tsx",
  ],
  body: `
## Browse before signing in

Open [Explore](/library) to browse published courses. You can search by topic, skill, or outcome and narrow the list by level or estimated time commitment.

Guests can open a published course overview and inspect its outcome, modules, lesson titles, and assessment structure. Lesson bodies are not available to guests.

## Open your first lesson

1. Choose a published course from Explore.
2. Review the course outcome and sequence.
3. Select a lesson.
4. When prompted, sign in with Google or create a free learner account.

A signed-in learner can read lessons, complete practice, and keep account-backed progress and reviews in sync.

## Know where to go next

The **Today** page opens with a learning brief, your current mission, and the course you can continue. Use **Customize** to choose which supporting cards and learning measures appear.

![The Today learning cards showing a clear next step, review status, and weekly learning progress.](/support/screenshots/today-learning-cards.png)

On desktop, use **Search or jump anywhere** in the Learning Header to open the Command Center. It includes **Today**, **Explore**, **Review**, **Progress**, courses, lessons, and account actions. On a phone, the main destinations remain in the bottom navigation and the account control in the top bar opens the same Command Center.
`,
  related: ["find-a-course", "complete-a-lesson", "sign-in-help"],
  featured: true,
});
