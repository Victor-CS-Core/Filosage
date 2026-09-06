import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "complete-a-capstone",
  title: "Complete and revise a capstone",
  summary: "Submit the final artifact, read criterion-level feedback, revise when needed, and find the result in Evidence.",
  category: "courses",
  keywords: ["capstone", "final project", "assessment", "criteria", "revision", "history", "evidence"],
  reviewedOn: "2026-09-06",
  sources: ["src/lib/learner-storage.ts", "src/lib/auth-server.ts", "src/app/course/[topic]/page.tsx", "src/app/api/assess-capstone/route.ts", "src/app/api/capstone-analysis/route.ts", "src/lib/membership-plans.ts"],
  body: `
## Become eligible to submit

Complete all lessons in the course before submitting its capstone. The course overview keeps the capstone locked until that sequence is complete. If the course has no capstone, continue to the Evidence report instead.

## Submit the artifact

Enter at least 120 characters that represent the work to assess, then submit it from the course overview. A capstone assessment uses one Tutor question from the account allowance. The assessment compares the submission with the course criteria and saves criterion-level evidence; it is not a credential or professional certification.

## Read the result and revise

A passing result becomes assessed evidence. **Needs revision** identifies criteria that are not yet demonstrated and leaves the course available for another attempt. Use the criterion feedback to revise the artifact itself rather than editing text only to imitate the feedback.

When your membership includes advanced capstone analysis, the Evidence report can compare Pro attempt history against unchanged criteria. Changed criteria are identified rather than counted as improvement.

## Continue to the next outcome

Open the course Evidence report to review the assessed result, objective ledger, and any available cross-attempt analysis. After a passed capstone, Filosage may recommend a next course; inspect its outcome and source disclosures before starting it.
## Recover an interrupted submission

Keep the original account open while the assessment is being saved. If the session changes or the account becomes unavailable, a delayed response cannot save the earlier learner’s submission into another account. Check the current saved evidence and the displayed retry guidance before submitting the artifact again; a network error alone does not prove the assessment was saved.
`,
  related: ["follow-a-course", "read-evidence-report", "understand-progress"],
});
