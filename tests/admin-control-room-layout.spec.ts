import { expect, test, type Locator, type Page } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";

type Theme = "light" | "dark";

async function openSafetyTab(page: Page, theme: Theme) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("filosage-theme", selectedTheme);
  }, theme);
  await restoreLocalLearner(page);
  await page.goto("/admin");
  const navigation = page.getByRole("navigation", { name: "Control room sections" });
  await expect(navigation.getByRole("button", { name: "Research", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("button", { name: "Launch readiness", exact: true })).toHaveCount(0);
  await navigation.getByRole("button", { name: "Safety", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Learner report queue", exact: true })).toBeVisible();
}

async function expectNoVerticalOverlap(first: Locator, second: Locator) {
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  const firstBottom = firstBox!.y + firstBox!.height;
  const secondBottom = secondBox!.y + secondBox!.height;
  expect(
    firstBottom <= secondBox!.y || secondBottom <= firstBox!.y,
    `Expected cards not to overlap vertically: ${JSON.stringify({ firstBox, secondBox })}`,
  ).toBe(true);
}

for (const theme of ["light", "dark"] as const) {
  test(`Safety keeps learner reports and audit controls accessible in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await openSafetyTab(page, theme);

    const reports = page.locator("section.admin-content-reports");
    const blockedRequests = page.locator("section.admin-panel").filter({
      has: page.getByRole("heading", { name: "Blocked requests", exact: true }),
    });
    const auditLog = page.locator("section.admin-audit-log");

    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 820 });
      await reports.evaluate((element) => element.scrollIntoView({ block: "start" }));
      await expect(reports).toBeVisible();
      await expect(blockedRequests).toBeVisible();
      await expect(auditLog).toBeVisible();
      await expectNoVerticalOverlap(reports, blockedRequests);
      await expectNoVerticalOverlap(reports, auditLog);
    }
  });
}

test("keeps admin navigation contained with 44px phone touch targets", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSafetyTab(page, "light");

  const tabHeights = await page.getByRole("navigation", { name: "Control room sections" }).getByRole("button").evaluateAll(
    (buttons) => buttons.map((button) => button.getBoundingClientRect().height),
  );
  expect(tabHeights.length).toBeGreaterThan(0);
  expect(Math.min(...tabHeights)).toBeGreaterThanOrEqual(44);

  const selectHeights = await page.locator(".admin-header-actions select:visible").evaluateAll(
    (selects) => selects.map((select) => select.getBoundingClientRect().height),
  );
  expect(selectHeights.length).toBeGreaterThan(0);
  expect(Math.min(...selectHeights)).toBeGreaterThanOrEqual(44);

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
