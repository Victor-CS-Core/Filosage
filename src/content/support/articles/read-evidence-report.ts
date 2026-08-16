import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "read-evidence-report",
  title: "Read an evidence report",
  summary: "Separate self-reported starting estimates from observed practice and assessed results.",
  category: "progress",
  keywords: ["evidence report", "baseline", "mastery", "capstone", "assessment", "share"],
  reviewedOn: "2026-08-16",
  sources: ["src/app/evidence/[courseId]/page.tsx", "src/app/evidence/shared/[token]/page.tsx", "src/lib/evidence-report.ts", "src/lib/evidence-shares.ts", "src/lib/mastery.ts"],
  body: `
## Understand the three summaries

An evidence report can show:

- a **starting estimate** from the learner's self-reported diagnostic;
- **observed objective evidence** calculated from completed practice, transfer, and assessed criteria;
- **verified improvement** only when comparable baseline and final capstone assessments both exist.

Pending means the required evidence has not been recorded. Self-report alone does not mark an objective as demonstrated.

## Read a professional share

A Pro learner can create a read-only snapshot link that remains available for up to thirty days unless the learner revokes it sooner. The shared report shows when the snapshot was generated, when the link becomes unavailable, and the latest dated evidence included in the snapshot.

Shared reports omit the learner's account identity, private notes, and raw responses. They can show privacy-safe evidence labels, activity types, results, authority, dates, objective states, and available capstone analysis. Anyone with the link can read the snapshot until it expires or is revoked, so recipients should treat the URL as private.

The report is learning evidence, not an accredited credential. Use the evidence ledger and methodology to understand what supports each progression signal and what remains pending.

## Review evidence by objective

The objective ledger groups saved records under course module objectives. States can include no observed evidence, introduced, practicing, needs review, and demonstrated.

## Copy a summary

Use **Copy share summary** to copy the available report measures and a link to the course. Review the text before sharing it outside Filosage.
`,
  related: ["understand-progress", "complete-a-lesson", "privacy-controls"],
});
