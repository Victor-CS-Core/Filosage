import { defineSupportArticle } from "../types";
import { PAID_SUBSCRIPTION_POLICY } from "@/lib/legal";

export default defineSupportArticle({
  slug: "plans-and-billing",
  title: "Understand Free, Plus, Pro, and billing status",
  summary: "Compare memberships, check checkout availability, manage a subscription, and recover from common billing states.",
  category: "plans",
  keywords: ["billing", "pricing", "Plus", "Pro", "course credits", "rollover", "evidence report", "subscription", "downgrade", "cancel", "refund", "payment method"],
  reviewedOn: "2026-08-16",
  sources: [".env.example", "src/lib/billing-lock.ts", "src/lib/stripe-server.ts", "src/lib/membership-plans.ts", "src/lib/course-credits.ts", "src/app/pricing/page.tsx", "src/app/terms/page.tsx", "docs/COMMERCIAL_LAUNCH_RUNBOOK.md"],
  body: `
## Check current checkout availability

The [Plans page](/pricing) is the source of truth for paid-checkout availability. When checkout is open, choosing Plus or Pro sends a signed-in learner to Stripe's secure checkout. When checkout is closed, the page offers a launch update or preference form instead. Joining that list or saving a preference never creates a Stripe customer, subscription, invoice, or charge.

## Memberships

- **Free** opens published courses, progress, review scheduling, and five tutor questions each month.
- **Filosage Plus** builds private courses around goals the published library does not cover. It adds two complete AI course credits and forty tutor questions each membership month. Unused course credits roll over up to twenty-four.
- **Filosage Pro** extends Plus with five complete AI course credits and one hundred tutor questions each membership month, with credit rollover up to sixty. Pro also includes full capstone revision history, criterion-level progression analysis, downloadable portable evidence reports, expiring and revocable evidence-share links, and course publishing after review.

Flashcard decks and AI-assisted flashcard generation are separate, feature-gated capabilities. They appear in the learning interface only when their runtime flags are enabled; the Plans page does not promise them as currently available without that verification.

A complete AI course credit covers one approved outline and every lesson planned in that outline. The learning goal determines the course length; there is no separate generated-lesson quota and paid accounts can keep every course they create. Annual subscribers receive course credits monthly rather than all at once. Tutor-question allowances renew monthly and do not roll over.

Unused course credits remain available up to the plan ceiling. If paid access ends, the balance is frozen for twelve months and becomes usable again if paid access resumes during that period. Starting an outline reserves a credit; a failed creation releases it, while a successfully saved course redeems it.

## Downgrades preserve your work

A downgrade does not delete a course, feature-gated flashcard deck, capstone history, evidence record, or automatically unpublish existing work. The latest capstone verdict, criterion feedback, and revision submission remain available on Free and Plus. Advanced cross-attempt analysis, new portable evidence exports, new share links, and publishing require Pro. Existing share links remain available until their expiration unless revoked, and a downgraded learner can still list and revoke links they created while on Pro.

## Before a purchase

Secure checkout shows the selected membership and price, billing interval, automatic-renewal terms, included limits, and online cancellation path before submission. Checkout also requires acceptance of the Filosage Terms. Review the [Terms of Service](/terms) and [Privacy Notice](/privacy) before subscribing.

Paid subscriptions are initially offered only to individual ${PAID_SUBSCRIPTION_POLICY.launchMarketLabel} residents who are at least ${PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge} years old.

## After returning from checkout

A return to Filosage does not grant membership access by itself. Filosage activates paid access only after processing a verified Stripe payment event. That update can take a moment. If the Plans page still shows Free, do not start repeated checkouts; refresh once, look for **Manage billing**, then contact support if the membership still does not update.

If the browser returns with Checkout marked canceled, the return link alone does not confirm payment or subscription state and does not change access. Review the current membership shown on the Plans page and open **Manage billing** to verify Stripe's account state before starting another checkout. Contact support if the portal is unavailable or anything looks unexpected.

## Manage or cancel a subscription

Signed-in subscribers can use **Manage billing** on the [Plans page](/pricing) to open Stripe's billing portal. The launch portal is limited to reviewing the subscription, updating a payment method, viewing invoices, and canceling at the end of the paid period. It does not offer plan switching. Cancellation ordinarily stops the next renewal while access continues through the current paid period; the portal shows the effective date before confirmation.

If a payment needs attention, use **Manage billing** to review the payment method and current subscription state. Filosage does not delete learning data because a payment is delayed or a membership is downgraded.

## Refund questions

A full refund is available for an initial paid charge requested within ${PAID_SUBSCRIPTION_POLICY.refundWindowDays} calendar days after the charge and for an annual renewal requested within ${PAID_SUBSCRIPTION_POLICY.refundWindowDays} calendar days after that renewal. Verified duplicate, unauthorized, or incorrect charges are corrected or refunded as required by applicable law and payment-network rules. Other monthly renewals, partially used periods, unused time, and unused credits are non-refundable unless law or a specific written offer requires otherwise. An approved refund may end paid access immediately and returns to the original payment method; processor timing varies.

Contact support from the account email with the approximate charge date, plan name, and a short description. Never send a complete card number, password, or one-time code.

## Account deletion is not ordinary cancellation

Deleting a Filosage account immediately cancels any nonterminal Stripe subscription and ends paid access. It does not automatically create or waive refund eligibility. Use **Manage billing** instead of account deletion when you only want to stop renewal and keep access through the paid period.

## Ask a billing question

Use [contact support](/support/articles/contact-support) for a question about plan access, cancellation, a refund request, or an unexpected billing message.
`,
  related: ["contact-support", "privacy-controls", "getting-started"],
  featured: true,
});
