import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "read-evidence-report",
  title: "Read an evidence report",
  summary: "Separate self-reported starting estimates from observed practice and assessed results.",
  category: "progress",
  keywords: ["evidence report", "baseline", "mastery", "capstone", "assessment", "share"],
  reviewedOn: "2026-08-12",
  sources: ["src/app/evidence/[courseId]/page.tsx", "src/lib/mastery.ts", "src/components/useMasteryJourney.ts"],
  body: `
## Understand the three summaries

An evidence report can show:

- a **starting estimate** from the learner's self-reported diagnostic;
- **observed objective evidence** calculated from completed practice, transfer, and assessed criteria;
- **verified improvement** only when comparable baseline and final capstone assessments both exist.

Pending means the required evidence has not been recorded. Self-report alone does not mark an objective as demonstrated.

## Review evidence by objective

The objective ledger groups saved records under course module objectives. States can include no observed evidence, introduced, practicing, needs review, and demonstrated.

## Copy a summary

Use **Copy share summary** to copy the available report measures and a link to the course. Review the text before sharing it outside Filosage.
`,
  related: ["understand-progress", "complete-a-lesson", "privacy-controls"],
});
