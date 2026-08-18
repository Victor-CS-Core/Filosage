import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "sign-in-help",
  title: "Troubleshoot secure sign-in",
  summary: "Choose Google or a private email code, recover an existing account, and resolve common managed sign-in problems.",
  category: "account",
  keywords: ["sign in", "Google", "email code", "Microsoft", "network", "account", "identity recovery"],
  reviewedOn: "2026-08-18",
  sources: ["src/components/AuthProvider.tsx", "src/components/AuthModal.tsx", "src/components/LegalConsentModal.tsx"],
  body: `
## Choose a sign-in method

Select **Continue securely** in Filosage. On the next secure Filosage screen, choose **Continue with Google** or enter your email address to receive an email code. Microsoft manages both methods and returns you to Filosage after verification.

## If an email code does not arrive

Check the address for typing mistakes, wait for the resend option on the secure sign-in page, then check spam or junk folders. Do not repeatedly request codes. Filosage support cannot see, generate, or validate a code.

## If you used Google before

Choose **Use my existing Google sign-in** in Filosage. After Google confirms the existing account, Filosage can connect the new method without moving courses, progress, notes, or review dates.

## If the network or session is slow

Check your connection and retry once. If Filosage reports that the session or account is taking longer than expected, refresh before starting another attempt.

Contact [Filosage support](/support/articles/contact-support) with the page address and exact error message when the problem continues. Never send a password or one-time code.
`,
  related: ["getting-started", "contact-support", "privacy-controls"],
  featured: true,
});
