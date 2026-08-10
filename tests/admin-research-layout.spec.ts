import { expect, test, type Locator, type Page } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";

type Theme = "light" | "dark";

async function openResearchTab(page: Page, theme: Theme) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("erudoza-theme", selectedTheme);
  }, theme);
  await restoreLocalLearner(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Research" }).click();
  await expect(page.getByRole("heading", { name: "Outcome validation" })).toBeVisible();
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
  test(`Research cards remain in document flow while scrolling in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 820 });
    await openResearchTab(page, theme);

    const phaseOne = page.locator("section.admin-research-summary").filter({
      has: page.getByRole("heading", { name: "Outcome validation" }),
    });
    const phaseTwo = page.locator("section.admin-research-summary").filter({
      has: page.getByRole("heading", { name: "Retention validation" }),
    });
    const protocol = page.locator("section.admin-research-protocol");
    const phaseFour = page.locator("section.admin-research-summary").filter({
      has: page.getByRole("heading", { name: "Controlled launch and referral growth" }),
    });

    await expect(page.locator(".admin-research-summary")).toHaveCount(3);
    await expect(page.locator(".admin-research-summary").first()).toHaveCSS("position", "static");
    await protocol.evaluate((element) => element.scrollIntoView({ block: "start" }));

    await expectNoVerticalOverlap(phaseOne, protocol);
    await expectNoVerticalOverlap(phaseTwo, phaseFour);

    await page.setViewportSize({ width: 1024, height: 820 });
    await protocol.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const responsiveColumns = await page.locator(".admin-research-layout").evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
    );
    expect(responsiveColumns).toHaveLength(1);
    await expectNoVerticalOverlap(phaseOne, phaseTwo);
    await expectNoVerticalOverlap(phaseTwo, protocol);
    await expectNoVerticalOverlap(protocol, phaseFour);
  });
}
