import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "create-a-course",
  title: "Create a private course",
  summary: "Use a course credit to build a private learning path around a specific professional outcome.",
  category: "courses",
  keywords: ["create course", "private course", "course credit", "outcome", "pace", "teaching approach", "sources", "generation"],
  reviewedOn: "2026-08-16",
  sources: ["src/app/create/page.tsx", "src/app/api/generate-course/route.ts", "src/lib/course-credits.ts", "src/lib/membership-plans.ts"],
  body: `
## Check that creation is available

Private AI course creation requires a signed-in membership with course creation and an available course credit. The [Plans page](/pricing) shows current membership details. Existing courses remain available when no new credit is available.

## Define the outcome

Open **Create course** and describe the skill or subject, the observable result you need, and the work that could prove it. Optional work context, constraints, exclusions, and a representative situation help keep examples relevant and the course focused.

Do not include passwords, confidential customer data, payment details, or information you are not authorized to process.

## Set the pace

Choose your starting level, target length, weekly study time, and describe what you already know. Filosage uses these choices to size the course and adjust explanation depth. The time estimate is a planning aid, not a guaranteed completion time.

## Choose the teaching approach

Choose Balanced, Concept-first, or Project-led emphasis and confirm the course language. Every option still uses the Capability Cycle: define, activate, practice, receive feedback, transfer, and return.

Review the private course-map preview before selecting **Create private course**. The result remains private unless a separate publishing workflow is available to your account and the course later passes its publication review.

## Understand credits and source labels

Starting generation reserves one course credit. A successfully saved course redeems it; a failed creation releases it. Retrying the same request safely should not consume another credit.

Filosage researches suitable released sources and checks supported claims when trustworthy evidence is available. If suitable claim-level sources are scarce, the course can still be created with model-knowledge labels rather than invented citations. Review those labels before relying on the material for important work.

## Recover from an interruption

Keep the page open while generation is in progress. If the app reports that creation took too long to confirm, retry the same request so Filosage can reopen a completed result or continue safely. If the error persists, use [contact support](/support/articles/contact-support) and do not include confidential source material in the ticket.
`,
  related: ["plans-and-billing", "follow-a-course", "contact-support"],
  featured: true,
});