import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "contact-support",
  title: "Contact Filosage support",
  summary: "Create a private support ticket or send the context needed to investigate an account, course, privacy, or technical problem.",
  category: "plans",
  keywords: ["support", "contact", "ticket", "reference", "email", "help", "search", "guide", "problem", "screenshot", "response"],
  reviewedOn: "2026-08-16",
  sources: ["src/app/support/page.tsx", "src/components/support/SupportCenter.tsx", "src/components/support/SupportTicketPanel.tsx", "src/app/api/support/tickets/route.ts", "src/app/api/support/tickets/[ticketId]/route.ts", "src/components/support/SupportSearch.tsx", "src/lib/search.ts", "src/lib/legal.ts", "src/components/LessonIntegrityPanel.tsx", "src/lib/content-report-policy.ts"],
  body: `
## Search the help guides

Open [Support](/support) and search for the task or problem first. Search checks guide titles, summaries, categories, and keywords; multiple words can appear in any order, and matching ignores capitalization, punctuation, and accents. Choose the clear control or press **Escape** to reset the search while keeping focus in the search field.

## Create a private ticket

Open the floating Filosage spark from any page, choose **New request**, and describe the problem. You can also start from [Support](/support) by choosing **Send a support request**. Select the closest request type, add a concise subject, and explain which page or course you were using, what you expected, and what happened instead.

After submission, Filosage shows a ticket reference such as **TKT-123ABCD**. The request enters the private owner review queue. Your description is treated as unverified until it is reviewed, and submitting it cannot trigger a refund, account change, deletion, or other external action.

To protect the queue, each account can submit up to five requests per day.

## Track a request and read replies

Return to Support and open **My requests** to see your submitted tickets. Select a ticket to read its reference, current status, and the conversation details available to your account. Status describes queue progress; it does not by itself prove that a refund, deletion, account change, or content decision occurred.

When the owner deliberately publishes a reply, it appears in the ticket detail as a published owner reply. Filosage draft-agent output is never shown as a reply merely because it was generated or accepted for internal review.

## Use email when you cannot sign in

Email [support@filosage.com](mailto:support@filosage.com?subject=Filosage%20support%20request) when sign-in or the ticket form is unavailable. Include:

- the affected page, course, and lesson when applicable;
- what you were trying to do;
- what you expected and what happened instead;
- when the problem occurred;
- the exact error message, if one appeared.

Screenshots can help when they do not expose private information.

## Protect your account

Never send a password, Google authentication code, full payment-card details, or unnecessary identity evidence. Support may ask for additional information after identifying the safest way to handle it.

## Use the in-product report when available

For a factual, citation, safety, copyright, or lesson-quality concern, use **Report a content issue** in the affected lesson. That connects the report to the exact course and content version.
`,
  related: ["sign-in-help", "report-content", "plans-and-billing"],
  featured: true,
});
