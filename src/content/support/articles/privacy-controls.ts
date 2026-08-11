import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "privacy-controls",
  title: "Use your privacy controls",
  summary: "Choose optional analytics, download account data, make a privacy request, or begin account deletion.",
  category: "trust",
  keywords: ["privacy", "analytics", "export", "download", "delete account", "data request"],
  reviewedOn: "2026-08-11",
  sources: ["src/app/privacy-center/page.tsx", "src/components/AnalyticsConsent.tsx", "src/app/privacy/page.tsx"],
  body: `
## Choose optional analytics

Open [Privacy choices](/privacy-center) to allow or decline optional first-party analytics. Optional analytics are off until you allow them. Changing the choice to off removes the optional browser identifiers used by Filosage.

## Download account data

Sign in, then choose **Download my data**. Filosage prepares a JSON file containing the account-linked categories listed on the Privacy Center page.

## Request another privacy action

The Privacy Center provides an email path for access, correction, deletion, portability, restriction, or another privacy right. Requests are verified before disclosure or deletion.

## Delete an account

Account deletion requires recent Google reauthentication and the exact confirmation phrase shown on screen. The page explains which active application data is removed and which limited records may be retained for the purposes described in the Privacy Notice. Deletion immediately cancels any nonterminal Stripe subscription and ends paid access; it does not automatically create or waive refund eligibility. Use **Manage billing** instead when you only want to stop renewal and keep access through the current paid period. Read the full deletion explanation before confirming because deletion cannot be undone.
`,
  related: ["manage-profile", "accessibility", "contact-support"],
});
