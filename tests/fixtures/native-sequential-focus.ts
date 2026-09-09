import type { Page } from "@playwright/test";

type SequentialFocusDirection = "forward" | "reverse";

export type NativeSequentialFocusGesture = Readonly<Record<SequentialFocusDirection, string>>;

const candidateGestures: readonly NativeSequentialFocusGesture[] = [
  { forward: "Tab", reverse: "Shift+Tab" },
  { forward: "Alt+Tab", reverse: "Alt+Shift+Tab" },
];

async function activeControlId(page: Page) {
  return page.evaluate(() => document.activeElement?.id ?? "");
}

async function matchesKnownSequentialFocusOrder(page: Page, gesture: NativeSequentialFocusGesture) {
  await page.locator("#sequential-focus-first").focus();
  await page.keyboard.press(gesture.forward);
  const forwardFirst = await activeControlId(page);
  await page.keyboard.press(gesture.forward);
  const forwardSecond = await activeControlId(page);

  await page.locator("#sequential-focus-third").focus();
  await page.keyboard.press(gesture.reverse);
  const reverseFirst = await activeControlId(page);
  await page.keyboard.press(gesture.reverse);
  const reverseSecond = await activeControlId(page);

  return {
    matches: forwardFirst === "sequential-focus-second"
      && forwardSecond === "sequential-focus-third"
      && reverseFirst === "sequential-focus-second"
      && reverseSecond === "sequential-focus-first",
    observed: { forwardFirst, forwardSecond, reverseFirst, reverseSecond },
  };
}

export async function resolveNativeSequentialFocusGesture(page: Page): Promise<NativeSequentialFocusGesture> {
  const probe = await page.context().newPage();
  const attempts: Array<NativeSequentialFocusGesture & { observed: Record<string, string> }> = [];
  try {
    await probe.setContent(`
      <main>
        <input id="sequential-focus-first" aria-label="Known first control">
        <button id="sequential-focus-second" type="button">Known second control</button>
        <a id="sequential-focus-third" href="#known-sequential-focus-target">Known third control</a>
      </main>
    `);
    for (const gesture of candidateGestures) {
      const result = await matchesKnownSequentialFocusOrder(probe, gesture);
      if (result.matches) return gesture;
      attempts.push({ ...gesture, observed: result.observed });
    }
  } finally {
    await probe.close();
  }

  throw new Error(
    `Native sequential-focus preflight could not traverse input, button, and link in both directions: ${JSON.stringify(attempts)}`,
  );
}

export async function pressNativeSequentialFocus(
  page: Page,
  gesture: NativeSequentialFocusGesture,
  direction: SequentialFocusDirection,
) {
  await page.keyboard.press(gesture[direction]);
}
