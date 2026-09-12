import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "manage-profile",
  title: "Manage your learning profile",
  summary: "Review your current focus, learning record, weekly goal, achievements, and dashboard preferences.",
  category: "account",
  keywords: ["profile", "dashboard", "weekly goal", "badges", "preferences", "account"],
  reviewedOn: "2026-09-12",
  sources: ["src/lib/learner-storage.ts", "src/components/AuthProvider.tsx", "src/app/profile/page.tsx", "src/components/AppShell.tsx", "src/components/DashboardCustomizer.tsx", "src/components/useLearnerState.ts"],
  body: `
## Open your profile

On desktop, choose **Search or jump anywhere** to open the Command Center, then choose **Learning profile**. On a phone, use the command icon labelled **Open Command Center**. You can also press **Ctrl+K** on Windows or **Command+K** on macOS. The account/avatar control opens **My Courses**. A profile requires a signed-in account because it combines synced progress, account access, and learner preferences.

## Review your current direction

The profile highlights the next lesson or course review based on saved progress. It also summarizes secure, developing, and fragile learning states, reviews due, practice evidence, and assessed capstones when those records exist.

## Customize the dashboard

Choose **Change dashboard view** to select and save a preferred dashboard preset and section order. With the keyboard, focus this button and press **Enter** to open the settings. Press **Escape** to close them and return focus to the same button. The save status indicates whether the preference synced or remains saved on the current device. The current Today page records these preferences but does not currently rearrange the fixed Today signals; Weekly progress, Review queue, and Learning streak remain visible in their standard layout.

Achievements are secondary summaries of recorded learning behavior and milestones. They are not credentials.
## Check the signed-in account before saving

Your name, notes, learning preferences and browser drafts are tied to the current account. A sign-out, account switch or account-generation change invalidates earlier requests and clears the corresponding mounted view. Returning to the same active account can restore its own saved work. To export or close an account, use [Privacy choices](/privacy-center) and keep the deletion reference if review remains pending.
`,
  related: ["navigate-filosage", "understand-progress", "privacy-controls"],
});
