import { expect, test, type Page } from "@playwright/test";
import { mockOwnerLearnerAccount, restoreLocalLearner } from "./fixtures/local-learner";

async function openShell(page: Page) {
  await restoreLocalLearner(page);
  await mockOwnerLearnerAccount(page);
  await page.route("**/api/courses?*", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
  await page.goto("/library");
  await expect(page.locator(".learner-mobile-header")).toBeVisible();
}

// Browser automation cannot open a native phone keyboard. Model its documented
// VisualViewport resize/pan events independently of the layout viewport instead.
async function visibleViewport(page: Page, height: number, offsetTop = 0, scale = 1) {
  await page.evaluate(({ height, offsetTop, scale }) => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, {
      height: { configurable: true, value: height },
      offsetTop: { configurable: true, value: offsetTop },
      scale: { configurable: true, value: scale },
    });
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  }, { height, offsetTop, scale });
}

test.describe("phone overlay visible viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("search stays usable above a simulated keyboard and restores after dismissal", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
    await openShell(page);
    await page.locator(".mobile-command-trigger").click();
    const dialog = page.locator("#command-palette");
    const input = dialog.getByRole("combobox");
    await input.fill("profile");
    await visibleViewport(page, 330, 24);
    const surface = dialog.locator(".command-palette-surface");
    await expect.poll(async () => {
      const box = await surface.boundingBox();
      return box ? box.y >= 24 && box.y + box.height <= 355 : false;
    }).toBe(true);
    await expect(dialog.locator(".command-palette-close")).toBeInViewport();
    await expect(dialog.getByRole("option", { name: /Profile/i })).toBeVisible();
    await expect(input).toHaveValue("profile");
    await visibleViewport(page, 420, 0, 2);
    await expect.poll(() => dialog.evaluate((element) => element.style.getPropertyValue("--overlay-height"))).toBe("");
    await visibleViewport(page, 844);
    await input.fill("");
    await expect.poll(async () => (await surface.boundingBox())!.height).toBeGreaterThan(330);
    await dialog.locator(".command-palette-close").click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".mobile-command-trigger")).toBeFocused();
  });

  test("course drawer fits a short visible viewport without losing its close control", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
    await openShell(page);
    await page.locator(".mobile-account-trigger").click();
    const dialog = page.getByRole("dialog", { name: "My courses" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-motion-settled", "true");
    await visibleViewport(page, 310, 20);
    await expect.poll(async () => {
      const box = await dialog.boundingBox();
      return box ? box.y >= 20 && box.y + box.height <= 331 : false;
    }).toBe(true);
    const close = dialog.getByRole("button", { name: /Close/ }).first();
    await expect(close).toBeInViewport();
    await close.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".mobile-account-trigger")).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });
  test("support search stays inside the visible viewport above a simulated keyboard", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
    await openShell(page);
    await page.getByRole("button", { name: "Open Support Center", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Support center", exact: true });
    await expect(dialog).toHaveAttribute("data-motion-settled", "true");
    const input = dialog.getByRole("searchbox", { name: "Search help guides" });
    await input.fill("lesson");
    await visibleViewport(page, 330, 24);
    await expect.poll(async () => {
      const box = await dialog.boundingBox();
      return box ? box.y >= 24 && box.y + box.height <= 355 : false;
    }).toBe(true);
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeInViewport();
    await expect(input).toHaveValue("lesson");
    await dialog.getByRole("button", { name: "Close Support Center", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Open Support Center", exact: true })).toBeFocused();
  });

});
