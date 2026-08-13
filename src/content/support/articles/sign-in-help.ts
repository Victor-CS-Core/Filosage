import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "sign-in-help",
  title: "Troubleshoot Google sign-in",
  summary: "Resolve common popup, embedded-browser, storage, network, and authorized-domain sign-in problems.",
  category: "account",
  keywords: ["sign in", "Google", "popup", "private browsing", "storage", "network", "account"],
  reviewedOn: "2026-08-11",
  sources: ["src/components/AuthProvider.tsx", "src/components/AuthModal.tsx"],
  body: `
## If the sign-in window does not open

Allow popups for Filosage, then try Google sign-in again. Choose **Google** on Microsoft's secure sign-in page. If the sign-in window closes, is blocked, or does not load in an embedded browser, choose **Open Google sign-in in this tab**. That option returns you to the same Filosage page after Google confirms your account.

## If browser storage is unavailable

Google sign-in requires browser storage. Turn off Private Browsing for the site or allow site storage, then retry.

## If the network or session is slow

Check your connection and retry. If Filosage reports that the session or account is taking longer than expected, refresh once before starting another sign-in attempt.

## If the domain is not authorized

An authorized-domain error is a site configuration problem rather than an account password problem. Contact [Filosage support](/support/articles/contact-support) and include the page address and exact error message. Never send a password or authentication code.
`,
  related: ["getting-started", "contact-support", "privacy-controls"],
  featured: true,
});
