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

The main navigation includes **Today**, **Explore**, **Review**, and **Progress**. Your account menu contains your profile, support, privacy choices, theme control, and sign out.
`,
  related: ["find-a-course", "complete-a-lesson", "sign-in-help"],
  featured: true,
});
