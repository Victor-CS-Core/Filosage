import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "navigate-erudoza",
  title: "Find your way around Erudoza",
  summary: "Use the main navigation, course switcher, and account menu on desktop or mobile.",
  category: "start",
  keywords: ["navigation", "today", "explore", "review", "progress", "mobile", "menu"],
  reviewedOn: "2026-08-05",
  sources: ["src/components/AppShell.tsx", "src/components/AppDrawer.tsx"],
  body: `
## Main destinations

- **Today** returns to your current learning focus.
- **Explore** opens the published course library.
- **Review** shows material that is ready for retrieval practice.
- **Progress** opens your learning record and weekly activity.

## Switch courses

On desktop, open **Courses** in the navigation rail. On a phone, open the account menu and choose **My courses**. The course switcher can search courses already associated with your account.

## Open account controls

Open the account control bearing your name or profile image. From there you can reach your profile, privacy choices, support, theme control, and sign out. Available options can vary by account access.
`,
  related: ["getting-started", "manage-profile", "accessibility"],
});
