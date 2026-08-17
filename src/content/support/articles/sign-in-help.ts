import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "sign-in-help",
  title: "Troubleshoot Google sign-in",
  summary: "Use the same-tab Google sign-in flow, complete account consent, and resolve common session problems.",
  category: "account",
  keywords: ["sign in", "Google", "consent", "terms", "age eligibility", "storage", "network", "account"],
  reviewedOn: "2026-08-16",
  sources: ["src/components/AuthProvider.tsx", "src/components/AuthModal.tsx", "src/components/LegalConsentModal.tsx"],
  body: `
## Start Google sign-in

Choose **Continue with Google**. Filosage leaves the current page in the same tab, sends you to the platform-managed Google sign-in flow, and returns you to Filosage after authentication. A separate popup is not required.

## Confirm account consent

Before the first redirect, confirm age eligibility and acceptance of the current Terms and Privacy Notice. If the legal terms change later, Filosage asks you to accept the current versions before continuing; you can sign out instead. Never continue on an account you are not authorized to use.

## If browser storage is unavailable

The signed-in session requires browser storage and cookies. Turn off Private Browsing for the site or allow site storage, then retry in the same tab.

## If the network or session is slow

Check your connection and retry. If Filosage reports that the session or account is taking longer than expected, refresh once before starting another sign-in attempt.

## If the domain is not authorized

An authorized-domain error is a site configuration problem rather than an account password problem. Contact [Filosage support](/support/articles/contact-support) and include the page address and exact error message. Never send a password or authentication code.
`,
  related: ["getting-started", "contact-support", "privacy-controls"],
  featured: true,
});
