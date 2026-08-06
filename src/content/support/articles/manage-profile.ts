import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "manage-profile",
  title: "Manage your learning profile",
  summary: "Review your current focus, learning record, weekly goal, achievements, and dashboard preferences.",
  category: "account",
  keywords: ["profile", "dashboard", "weekly goal", "badges", "preferences", "account"],
  reviewedOn: "2026-08-05",
  sources: ["src/app/profile/page.tsx", "src/components/AppShell.tsx", "src/components/DashboardCustomizer.tsx", "src/components/useLearnerState.ts"],
  body: `
## Open your profile

Open the account control to launch the Command Center, then choose **Learning profile**. A profile requires a signed-in account because it combines synced progress, account access, and learner preferences.

## Review your current direction

The profile highlights the next lesson or course review based on saved progress. It also summarizes secure, developing, and fragile learning states, reviews due, practice evidence, and assessed capstones when those records exist.

## Customize the dashboard

Choose **Customize dashboard** to select a preset, show or hide supporting sections, and change their order. The save status indicates whether the preference synced or remains saved on the current device.

Achievements are secondary summaries of recorded learning behavior and milestones. They are not credentials.
`,
  related: ["navigate-erudoza", "understand-progress", "privacy-controls"],
});
