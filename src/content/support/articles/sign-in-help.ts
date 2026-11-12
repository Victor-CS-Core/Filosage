import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "sign-in-help",
  title: "Troubleshoot secure sign-in",
  summary: "Use secure Google sign-in and troubleshoot account or network problems.",
  category: "account",
  keywords: ["sign in", "Google", "network", "account", "identity recovery"],
  reviewedOn: "2026-09-11",
  sources: ["src/lib/account-session.ts", "src/lib/account-deletion.ts",
    "src/components/AuthProvider.tsx",
    "src/components/AuthModal.tsx",
    "src/components/ThemeProvider.tsx",
    "src/app/course/[topic]/page.tsx",
    "src/components/LegalConsentModal.tsx",
    "src/components/IdentityLinkRequiredModal.tsx",
  ],
  body: `
## Sign in with Google

Select **Continue with Google** in Filosage. Google returns you to Filosage after verification.

The in-app sign-in screen follows the light or dark appearance already selected in Filosage. Google-labeled actions show the official Google mark.

Filosage remembers a light or dark choice made in this browser. If you have not chosen one, it follows your device’s appearance changes. Your Filosage choice is restored when you return from Google.

If you started from a lesson, completing sign-in and any required account setup returns you to that lesson. A course-preview sign-up action returns to its outline.

## If the network or session is slow

Check your connection and retry once. If Filosage reports that the session or account is taking longer than expected, refresh before starting another attempt.

Contact [Filosage support](/support/articles/contact-support) with the page address and exact error message when the problem continues. Never send a password or verification code.
## Recover the intended learning session

If Filosage says your learning session changed, sign in again with the account that owns the work. An older tab cannot submit its saved draft into another account. A pending or completed account-deletion request does not reopen when the same identity signs in again. Keep its reference and contact the privacy team through [Privacy choices](/privacy-center) if recovery or identity review is still needed.
`,
  related: ["getting-started", "contact-support", "privacy-controls"],
  featured: true,
});
