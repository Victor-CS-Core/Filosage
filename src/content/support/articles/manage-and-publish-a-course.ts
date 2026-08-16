import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "manage-and-publish-a-course",
  title: "Manage and publish a course",
  summary: "Review a private course, resolve ordinary publication checks, control visibility, and understand permanent deletion.",
  category: "courses",
  keywords: ["creator", "publish", "unpublish", "quality", "source", "delete course", "private course"],
  reviewedOn: "2026-08-16",
  sources: ["src/app/course/[topic]/page.tsx", "src/app/api/courses/[courseId]/route.ts", "src/app/api/courses/[courseId]/validation/route.ts", "src/app/api/courses/[courseId]/repair/route.ts", "src/lib/publication-readiness.ts"],
  body: `
## Review the private course

Open the course from **Your current courses** or **My courses**. Check the intended outcome, module and lesson sequence, assessments, language, rights declarations, and source disclosures before changing visibility.

## Resolve ordinary publication checks

Publishing is available only when the account and course are eligible. The readiness panel lists blockers and warnings tied to the current course snapshot. Use an offered safe fix only after reading what it changes, and use its undo action if the result is not correct. A later content change can invalidate an earlier review because approval applies to the exact reviewed snapshot.

Creators should correct content, sources, rights information, or incomplete lessons through the ordinary workflow. Owner-only manual decisions and overrides remain separate, recently authenticated actions and are not a shortcut around creator checks.

## Publish or unpublish

Choose **Publish** only after every blocker is resolved and the preview represents the course you intend learners to see. Published courses appear in Explore according to the current library rules. Choose **Unpublish** to remove the course from public discovery while you review or revise it; existing records are not described as erased merely because visibility changes.

## Delete with care

Course deletion is permanent deletion, not unpublishing. The confirmation describes linked course and lesson data, learner progress and reviews, bookmarks, notes, evidence, feedback, and open reports that can be removed. For a published or shared course, this can affect all learners who used it, not only the creator.

Export or preserve any records you are authorized to retain, resolve open safety or rights reports, and prefer **Unpublish** when temporary removal is enough. Continue only when you understand the full impact shown in the confirmation.
`,
  related: ["create-a-course", "find-a-course", "report-content"],
});
