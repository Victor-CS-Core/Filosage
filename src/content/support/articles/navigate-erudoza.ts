import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "navigate-erudoza",
  title: "Find your way around Erudoza",
  summary: "Use the Learning Header, course menu, and account controls on desktop or mobile.",
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

On desktop, these destinations remain visible in the Learning Header. Selecting one changes the main workspace without opening a drawer. On a phone, the same destinations are available from the bottom navigation.

## Switch courses

On desktop, open **My courses** in the Learning Header. The course menu opens directly beneath that control and can search courses already associated with your account. On a phone, open the account menu and choose **My courses**.

If course creation is available to your account, **Create** appears beside **My courses** on desktop and as the center action in the mobile navigation.

## Open account controls

Open the account control bearing your name or profile image. On desktop, the menu opens directly beneath that control. From there you can reach your profile and its privacy controls, support, theme control, and sign out. Available options can vary by account access.
`,
  related: ["getting-started", "manage-profile", "accessibility"],
});
