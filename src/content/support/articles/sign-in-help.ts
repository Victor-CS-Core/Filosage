import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "sign-in-help",
  title: "Troubleshoot secure sign-in",
  summary: "Use the secure sign-in methods currently available and troubleshoot Google or email-code sign-in when those methods are enabled.",
  category: "account",
  keywords: ["sign in", "Google", "email code", "Microsoft", "network", "account", "identity recovery"],
  reviewedOn: "2026-09-11",
  sources: ["src/lib/account-session.ts", "src/lib/account-deletion.ts",
    "src/components/AuthProvider.tsx",
    "src/components/AuthModal.tsx",
    "src/components/ThemeProvider.tsx",
    "src/app/course/[topic]/page.tsx",
    "src/components/LegalConsentModal.tsx",
    "src/components/IdentityLinkRequiredModal.tsx",
    "src/app/auth/complete-link/page.tsx",
    "src/app/auth/complete-link/CompleteIdentityLink.tsx",
  ],
  body: `
## Choose a sign-in method

Select **Continue securely** in Filosage. The secure sign-in screen shows only methods enabled for the current environment. Google sign-in remains available when it is enabled. Email-code sign-in appears only when Microsoft Entra External ID is enabled. The managed flow returns you to Filosage after verification.

The in-app sign-in screen follows the light or dark appearance already selected in Filosage. Google-labeled actions show the official Google mark.

Filosage remembers a light or dark choice made in this browser. If you have not chosen one, it follows your device’s appearance changes. The Microsoft-hosted page currently follows the device appearance, which can differ from a manual choice in Filosage. Your Filosage choice is restored when you return.

If you started from a lesson, completing sign-in and any required account setup returns you to that lesson. A course-preview sign-up action returns to its outline.

## If an email code does not arrive

Check the address for typing mistakes, wait for the resend option on the secure sign-in page, then check spam or junk folders. Do not repeatedly request codes. Filosage support cannot see, generate, or validate a code.

## If you used Google before

During a staged rollout, existing-account email recovery may be available before new email-code account creation. When Filosage offers this recovery, choose **Use my existing Google sign-in**. After Google confirms the existing account, Filosage can connect email-code sign-in without moving courses, progress, notes, or review dates. This recovery connects an existing account; it does not create a new one.

## If the network or session is slow

Check your connection and retry once. If Filosage reports that the session or account is taking longer than expected, refresh before starting another attempt.

Contact [Filosage support](/support/articles/contact-support) with the page address and exact error message when the problem continues. Never send a password or one-time code.
## Recover the intended learning session

If Filosage says your learning session changed, sign in again with the account that owns the work. An older tab cannot submit its saved draft into another account. A pending or completed account-deletion request does not reopen when the same identity signs in again. Keep its reference and contact the privacy team through [Privacy choices](/privacy-center) if recovery or identity review is still needed.
`,
  related: ["getting-started", "contact-support", "privacy-controls"],
  featured: true,
});
