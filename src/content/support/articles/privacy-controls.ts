import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "privacy-controls",
  title: "Use your privacy controls",
  summary: "Choose optional analytics, download account data, make a privacy request, or begin account deletion.",
  category: "trust",
  keywords: ["privacy", "analytics", "export", "download", "delete account", "data request"],
  reviewedOn: "2026-09-06",
  sources: ["src/lib/account-data-policy.ts", "src/lib/account-deletion.ts", "src/app/privacy-center/page.tsx", "src/components/AnalyticsConsent.tsx", "src/app/privacy/page.tsx"],
  body: `
## Choose optional analytics

Open [Privacy choices](/privacy-center) to allow or decline optional first-party analytics. Optional analytics are off until you allow them. Changing the choice to off removes the optional browser identifiers used by Filosage.

## Download account data

Sign in, then choose **Download my data**. Filosage prepares a JSON file containing the account-linked categories listed on the Privacy Center page.

## Request another privacy action

The Privacy Center provides an email path for access, correction, deletion, portability, restriction, or another privacy right. Requests are verified before disclosure or deletion.

## Delete an account

Account deletion requires a recent managed sign-in and the exact confirmation phrase shown on screen. The page explains which active application data is removed and which limited records may be retained for the purposes described in the Privacy Notice. Deletion closes the account to new learning activity and attempts immediate cancellation of any nonterminal Stripe subscription. An unknown cancellation outcome remains pending with the account and billing references preserved; it does not automatically create or waive refund eligibility. Use **Manage billing** instead when you only want to stop renewal and keep access through the current paid period. Read the full deletion explanation before confirming because deletion cannot be undone.

## Keep the saved deletion reference

Deletion proceeds through a saved request that can resume after an interruption. Retry the same request after signing in again if checkout containment, inventory or an asset check remains pending. An incomplete inventory or uncertain asset ownership requires review rather than a success message.

**Active data removed** is separate from complete erasure. Limited legal, billing, safety, identity-recovery and deletion-control records remain subject to retention and identity review. Shared assets and other learners’ work follow their ownership policy. Exact retention durations and holds still require that review; the app does not claim every record was erased. Contact legal@filosage.com with the reference for a manual privacy request.
`,
  related: ["manage-profile", "accessibility", "contact-support"],
});
