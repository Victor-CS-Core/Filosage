import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "navigate-erudoza",
  title: "Find your way around Erudoza",
  summary: "Use the Command Center, course switcher, and mobile navigation to move through Erudoza.",
  category: "start",
  keywords: ["navigation", "command center", "search", "shortcut", "today", "explore", "review", "progress", "mobile", "menu"],
  reviewedOn: "2026-08-05",
  sources: ["src/components/AppShell.tsx", "src/components/CommandPalette.tsx", "src/components/AppDrawer.tsx", "src/lib/search.ts"],
  body: `
## Main destinations

- **Today** returns to your current learning focus.
- **Explore** opens the published course library.
- **Review** shows material that is ready for retrieval practice.
- **Progress** opens your learning record and weekly activity.

On a phone, these destinations remain available from the bottom navigation.

## Use the Command Center

On desktop, choose **Search or jump anywhere** in the Learning Header. You can also press **Ctrl+K** on Windows or **Command+K** on macOS. The account control opens the same Command Center instead of a separate profile menu. On a phone, open it from the account control in the mobile header.

The Command Center brings together main destinations, available courses, the current course and its lessons, profile and support links, appearance control, and sign out. Options such as course creation or the control room appear only when your account can use them.

Use the **Light / Dark** switch at the bottom of the Command Center to compare appearances. The theme changes immediately and the Command Center stays open until you close it or choose a destination.

![The Erudoza Command Center with navigation, course, account actions, and the Light and Dark appearance switch.](/support/screenshots/command-center-theme-toggle.png)

Enter one or more words to filter the available commands. Word order and accents do not affect matching. Use the arrow keys to move, **Enter** to open the selected result, and **Escape** to close. You can also close it by choosing the shaded area outside the panel.

## Switch courses

Open the Command Center and choose **My courses**. The course switcher can search course titles, lessons, skills, levels, and published or private status across courses associated with your account.

If course creation is available to your account, **Create a course** appears in the Command Center and as the center action in the mobile navigation.

## Open account controls

Open the account control bearing your name or profile image to open the Command Center. From there you can reach your profile and its privacy controls, support, appearance switch, and sign out. Available options can vary by account access.
`,
  related: ["getting-started", "manage-profile", "accessibility"],
});
