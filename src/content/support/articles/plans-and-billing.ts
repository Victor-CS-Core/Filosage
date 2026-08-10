import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "plans-and-billing",
  title: "Understand Free, Plus, Pro, and billing status",
  summary: "Compare the three Filosage memberships and understand why checkout remains closed during launch preparation.",
  category: "plans",
  keywords: ["billing", "pricing", "Plus", "Pro", "checkout", "course limit", "subscription", "downgrade"],
  reviewedOn: "2026-08-09",
  sources: [".env.example", "src/lib/billing-lock.ts", "src/app/pricing/page.tsx", "docs/COMMERCIAL_LAUNCH_RUNBOOK.md"],
  body: `
## Paid checkout is currently closed

Filosage does not currently offer a new paid checkout. Joining the membership launch list or saving a pricing preference is product research only. Neither action creates a subscription or charge.

## Memberships

- **Free** opens published courses, progress, review scheduling, and five tutor questions each month.
- **Filosage Plus** is designed for one active private course at a time, with one generated outline, ten generated lessons, forty tutor questions, and ten course banners each month. Plus does not include public publishing.
- **Filosage Pro** removes the owned-course cap, includes three generated outlines, thirty generated lessons, one hundred tutor questions, and thirty course banners each month, and includes course publishing after review.

Generation allowances reset monthly and do not roll over. Course ownership and monthly AI allowances are separate limits.

## Downgrades preserve your work

A downgrade does not delete a course or automatically unpublish existing work. If the new plan has a lower owned-course limit, existing courses remain accessible, but new course creation is paused until the account is within its limit or upgrades. Features that the new plan does not include, such as publishing from Plus, are blocked for new actions.

## Before any future purchase

If paid memberships open later, checkout must show the selected membership, price, currency, billing interval, included limits, renewal terms, and cancellation method before consent. Availability will be stated on the [Plans page](/pricing).

## Ask a billing question

Use [contact support](/support/articles/contact-support) for a question about plan access or an unexpected billing-related message. Never email complete payment-card details.
`,
  related: ["contact-support", "privacy-controls", "getting-started"],
  featured: true,
});
