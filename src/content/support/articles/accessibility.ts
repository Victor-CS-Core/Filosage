import { defineSupportArticle } from "../types";

export default defineSupportArticle({
  slug: "accessibility",
  title: "Use Filosage with accessibility settings",
  summary: "Navigate by keyboard, use visible focus and semantic controls, reduce motion, or change the theme.",
  category: "trust",
  keywords: ["accessibility", "keyboard", "screen reader", "focus", "reduced motion", "animation", "motion preference", "dark mode", "speech"],
  reviewedOn: "2026-09-06",
  sources: ["src/components/support/SupportCenter.tsx", "DESIGN.md", "src/app/globals.css", "src/components/AppShell.tsx", "src/components/AppDrawer.tsx", "src/components/CourseDeck.tsx", "src/components/LessonStudyTools.tsx", "src/components/SpeakButton.tsx"],
  body: `
## Navigate by keyboard

Use **Tab** and **Shift+Tab** to move between controls. The first focusable link on a page lets you skip repeated navigation and move to the main content. Drawers and tabbed study tools provide labeled keyboard controls.

## Control motion and animation

Filosage follows your browser or operating-system motion preference until you make a choice in Filosage. On the home course deck, use the **Full motion** or **Reduced motion** pill to switch modes. The choice takes effect immediately and is remembered in this browser. It changes Filosage only; it does not change the settings on your device.

With **Full motion**, complete course cards follow a horizontal mouse drag or swipe and move through the stack. With **Reduced motion**, the same drag, swipe, arrow-key, and button controls remain available, but the selected card changes without the animated handoff.

To change the device preference that websites can detect:

### Windows 11

1. Press **Windows+I** to open Settings.
2. Choose **Accessibility**, then **Visual effects**.
3. Turn **Animation effects** off for reduced motion or on for full motion. See [Microsoft's Windows instructions](https://support.microsoft.com/en-us/accessibility/windows/make-it-easier-to-focus-on-tasks).

On Windows 10, open **Settings**, choose **Ease of Access**, then **Display**, and change **Show animations in Windows**.

### macOS

1. Open the **Apple menu**, then **System Settings**.
2. Choose **Accessibility**, then **Motion**.
3. Turn **Reduce motion** on or off. See [Apple's Mac motion instructions](https://support.apple.com/guide/mac-help/customize-onscreen-motion-mchlc03f57a1/mac).

### iPhone or iPad

1. Open **Settings**, then **Accessibility**.
2. Choose **Motion**.
3. Turn **Reduce Motion** on or off. See [Apple's iPhone and iPad instructions](https://support.apple.com/en-us/111781).

### Android

1. Open **Settings**, then **Accessibility**.
2. Choose **Color and motion**.
3. Turn **Remove animations** on for reduced motion or off for full motion. Names can vary by device manufacturer. See [Google's Android instructions](https://support.google.com/accessibility/android/answer/11183305?hl=en).

If the Filosage pill and the device setting disagree, the choice made in the Filosage pill controls this browser. Select the pill again to return to the same mode as the device; Filosage then resumes following the device preference.

## Change the theme

Open the account menu to switch between light and dark mode. Theme and motion are separate preferences.

## Listen to a lesson

When the browser provides speech synthesis, an open lesson can show **Read this lesson aloud**. If the control is absent, that browser does not expose the required speech feature to Filosage.

## Report an access barrier

Contact [Filosage support](/support/articles/contact-support) with the page, device, browser, assistive technology if relevant, and the task you could not complete. Describe the barrier rather than sending sensitive account information.
## Use support when the form is unavailable

The Support Center keeps keyboard-accessible Help and My requests available when new-request intake is closed. **Contact support** offers the published email address and help guides before composition. If availability cannot be confirmed, use **Check availability again** or email from your own email app; describe the affected control, focus movement and task in your message.
`,
  related: ["navigate-filosage", "contact-support", "sign-in-help"],
});
