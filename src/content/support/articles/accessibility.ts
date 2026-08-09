import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "accessibility",
  title: "Use Filosage with accessibility settings",
  summary: "Navigate by keyboard, use visible focus and semantic controls, reduce motion, or change the theme.",
  category: "trust",
  keywords: ["accessibility", "keyboard", "screen reader", "focus", "reduced motion", "dark mode", "speech"],
  reviewedOn: "2026-08-05",
  sources: ["DESIGN.md", "src/app/globals.css", "src/components/AppShell.tsx", "src/components/AppDrawer.tsx", "src/components/LessonStudyTools.tsx", "src/components/SpeakButton.tsx"],
  body: `
## Navigate by keyboard

Use **Tab** and **Shift+Tab** to move between controls. The first focusable link on a page lets you skip repeated navigation and move to the main content. Drawers and tabbed study tools provide labeled keyboard controls.

## Reduce motion or change theme

Filosage follows the browser or operating system reduced-motion preference for supported transitions. Open the account menu to switch between light and dark mode.

## Listen to a lesson

When the browser provides speech synthesis, an open lesson can show **Read this lesson aloud**. If the control is absent, that browser does not expose the required speech feature to Filosage.

## Report an access barrier

Contact [Filosage support](/support/articles/contact-support) with the page, device, browser, assistive technology if relevant, and the task you could not complete. Describe the barrier rather than sending sensitive account information.
`,
  related: ["navigate-filosage", "contact-support", "sign-in-help"],
});
