import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "manage-and-publish-a-course",
  title: "Manage and publish a course",
  summary: "Review a private course, resolve ordinary publication checks, control visibility, and understand permanent deletion.",
  category: "courses",
  keywords: ["creator", "publish", "unpublish", "quality", "source", "delete course", "private course"],
  reviewedOn: "2026-09-06",
  sources: ["src/lib/publication-proofs.ts", "src/lib/document-store.ts", "src/app/course/[topic]/page.tsx", "src/app/api/courses/[courseId]/route.ts", "src/app/api/courses/[courseId]/validation/route.ts", "src/app/api/courses/[courseId]/repair/route.ts", "src/lib/publication-readiness.ts"],
  body: `
## Review the private course

Open the course from **Your current courses** or **My courses**. Check the intended outcome, module and lesson sequence, assessments, language, rights declarations, and source disclosures before changing visibility.

## Resolve ordinary publication checks

Publishing is available only when the account and course are eligible. Choose **Validate draft** to review the current course. The readiness panel lists blockers, warnings and any manual-review requirements tied to that exact course snapshot. Use an offered safe fix only after reading what it changes, and use its undo action if the result is not correct. Later lesson, moderation or source changes can invalidate an earlier review. Expired or changed source evidence also requires validation again; approval applies to the exact reviewed snapshot.

Creators should correct content, sources, rights information, or incomplete lessons through the ordinary workflow. Owner-only manual decisions and overrides remain separate, recently authenticated actions and are not a shortcut around creator checks.

## Publish or unpublish

Choose **Publish** only after every blocker is resolved and the preview represents the course you intend learners to see. Published courses appear in Explore according to the current library rules. Choose **Unpublish** to remove the course from public discovery while you review or revise it; existing records are not described as erased merely because visibility changes.

## Delete with care

Course deletion is permanent deletion, not unpublishing. The confirmation describes linked course and lesson data, learner progress and reviews, bookmarks, notes, evidence, feedback, and open reports that can be removed. For a published or shared course, this can affect all learners who used it, not only the creator.

If you delete a course within 24 hours of creating it, the course credit is restored automatically (up to twice per calendar month). The confirmation tells you when a credit will come back.

Export or preserve any records you are authorized to retain, resolve open safety or rights reports, and prefer **Unpublish** when temporary removal is enough. Continue only when you understand the full impact shown in the confirmation.

## If publication stops during review

Reload the course’s current validation result when Filosage says the draft or its evidence changed. An earlier successful validation is not permission to publish a different version. Required human review stays visible until the current evidence has been reviewed. Completed publication makes the reviewed lesson version available to learners; editing a draft does not silently replace that released lesson.
`,
  related: ["create-a-course", "find-a-course", "report-content"],
});
