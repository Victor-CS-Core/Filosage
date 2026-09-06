import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "read-evidence-report",
  title: "Read an evidence report",
  summary: "Separate self-reported starting estimates from observed practice and assessed results.",
  category: "progress",
  keywords: ["evidence report", "baseline", "mastery", "capstone", "assessment", "share"],
  reviewedOn: "2026-09-06",
  sources: ["src/lib/account-deletion.ts", "src/lib/learner-storage.ts", "src/app/evidence/[courseId]/page.tsx", "src/app/evidence/shared/[token]/page.tsx", "src/app/api/evidence/[courseId]/export/route.ts", "src/app/api/evidence/[courseId]/shares/route.ts", "src/components/OutcomeUsefulness.tsx", "src/lib/evidence-report.ts", "src/lib/evidence-shares.ts", "src/lib/mastery.ts", "src/components/useMasteryJourney.ts"],
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

## Download a professional report

When your membership includes professional evidence export, choose **Download report** to save an accessible HTML snapshot for printing or review outside Filosage. The export reflects the evidence available when you download it. Keep the file secure after it leaves your account.

## Create and revoke a share link

When your membership includes evidence sharing, choose **Create 30-day link** to copy a public snapshot URL. The snapshot excludes your account identity, private notes, and raw responses. Anyone with an active URL can view that snapshot until it expires, so share it only with intended recipients.

The report lists active, expired, and revoked links. Choose **Revoke** beside an active link to disable it before its expiration date. A plan downgrade does not reactivate an expired or revoked link; existing links follow the access rules shown on the Plans page.

## Read capstone history

When advanced capstone analysis is available and at least two attempts exist, the report compares unchanged criteria across attempts. Renamed or removed criteria are shown as changed rather than counted as improvement. The analysis highlights improvement, unresolved criteria, regressions, and possible revision priorities; it remains learning evidence, not a credential.

## Rate usefulness and choose the next outcome

After every lesson has saved evidence, the report can ask for a **1–5 usefulness rating** about how useful the outcome was in practice. Submit only the rating and optional context you intend to share as product feedback.

After a passed capstone, Filosage may show a recommended next course. Treat it as a next-outcome suggestion, inspect its outline and source disclosures, and choose it only if the outcome fits your work.
## Check the account and saved state

Evidence, feedback and draft work remain with the account that recorded them. If the session changes while a request is loading, reopen the report in the intended account. A failed load is not evidence of zero attempts or no improvement. Account deletion disables access to that account’s shares and removes active learner work through its saved deletion request; a downloaded report already held outside Filosage remains under its recipient’s control.
`,
  related: ["understand-progress", "complete-a-lesson", "complete-a-capstone", "privacy-controls"],
});
