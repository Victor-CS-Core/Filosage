import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "plans-and-billing",
  title: "Understand the current plan and billing status",
  summary: "Paid checkout is closed; launch-list and pricing-preference actions do not create a subscription or charge.",
  category: "plans",
  keywords: ["billing", "pricing", "Pro", "checkout", "launch list", "subscription", "charge"],
  reviewedOn: "2026-08-05",
  sources: [".env.example", "src/lib/billing-lock.ts", "src/app/pricing/page.tsx", "docs/COMMERCIAL_LAUNCH_RUNBOOK.md"],
  body: `
## Paid checkout is currently closed

Filosage does not currently offer a new paid checkout. Joining the Pro launch list or saving a pricing preference is product research only. Neither action creates a subscription or charge.

## Before any future purchase

If paid plans open later, checkout must show the price, currency, billing interval, included limits, renewal terms, and cancellation method before consent. Availability will be stated on the [Plans page](/pricing).

## Ask a billing question

Use [contact support](/support/articles/contact-support) for a question about plan access or an unexpected billing-related message. Never email complete payment-card details.
`,
  related: ["contact-support", "privacy-controls", "getting-started"],
  featured: true,
});
