import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "contact-support",
  title: "Contact Erudoza support",
  summary: "Send the context needed to investigate an account, course, privacy, or technical problem.",
  category: "plans",
  keywords: ["support", "contact", "email", "help", "problem", "screenshot", "response"],
  reviewedOn: "2026-08-05",
  sources: ["src/app/support/page.tsx", "src/lib/legal.ts"],
  body: `
## Include the useful details

Email [support@erudoza.com](mailto:support@erudoza.com?subject=Erudoza%20support%20request) and include:

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
