import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const ownerHeaders = { Authorization: "Bearer playwright-local-owner" };

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

async function acceptOwnerTerms(request: APIRequestContext) {
  const response = await request.post("/api/legal/acceptance", {
    headers: ownerHeaders,
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(response.ok()).toBe(true);
}

async function openEvidenceDesk(page: Page) {
  await acceptOwnerTerms(page.request);
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
  await page.goto("/admin/command-center");
  await expect(page.getByRole("heading", { level: 1, name: "Command Center" })).toBeVisible();
  await expect(page.getByText(/tickets loaded/i)).toBeVisible({ timeout: 30_000 });
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test("settles into the owner-only boundary when signed out", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "One signed-out state contract is sufficient");
  await page.goto("/admin/command-center");
  await expect(page.getByRole("heading", { level: 1, name: "Owner access required" })).toBeVisible();
  await expect(page.getByText("Loading the owner evidence desk…")).toBeHidden();
});

test("renders the Evidence Desk, keyboard tabs, publication boundary, and dark theme", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop visual contract");
  await openEvidenceDesk(page);
  await expect(page.locator("main[data-impeccable-direction-seed='ddbdcffa']"))
    .toHaveAttribute("data-impeccable-direction-contract", "thesis-own-world-story-first-viewport-form-finish");

  await expect(page.getByText("Overdue → due time → risk tie")).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Command Center sections" });
  await tabs.getByRole("tab", { name: "Work" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Reviews" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "System" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs.getByRole("tab", { name: "Work" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: /Contract support ticket A/ }).click();
  await expect(page.getByRole("article", { name: "Selected case evidence dossier" })).toBeFocused();
  const submittedContext = page.getByRole("region", { name: "Submitted page context" });
  await expect(submittedContext).toContainText("/course/context-audit/lesson/1-2");
  await expect(submittedContext).toContainText("Context audit lesson");
  await expect(submittedContext).toContainText("lesson-experience");
  await page.evaluate(() => document.querySelector<HTMLElement>(".app-main")?.scrollTo(0, 0));
  await page.screenshot({ path: ".impeccable/review/command-center-v2-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "Publish to learner" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish to learner" });
  await expect(dialog.getByText(/external learner-visible effect/)).toBeVisible();
  await dialog.getByLabel("Learner-visible reply").fill("A reviewed response that remains unpublished until the owner confirms identity.");
  await expect(dialog.getByText("A reviewed response that remains unpublished until the owner confirms identity.").last()).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/command-center-v2-publication.png", fullPage: true });
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("button", { name: "Load the next recorded page" })).toBeVisible();
  await page.getByRole("button", { name: "Load the next recorded page" }).click();
  await expect(page.getByLabel("Tickets collection status")).toContainText("501 of 502 tickets loaded");
  await expect(page.getByRole("button", { name: "Load the next recorded page" })).toBeHidden();

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await tabs.getByRole("tab", { name: "System" }).click();
  await expect(page.getByRole("heading", { name: "System boundaries" })).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/command-center-v2-dark-system.png", fullPage: true });

  const overflows = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflows).toBeLessThanOrEqual(1);
  await expectNoSeriousAccessibilityViolations(page);
});

test("preserves labelled mobile list-to-detail navigation without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Mobile visual contract");
  await openEvidenceDesk(page);

  for (const label of ["Work", "Reviews", "Activity", "System"]) {
    await expect(page.getByRole("tab", { name: label })).toBeVisible();
  }
  await page.getByRole("button", { name: /Contract support ticket A/ }).click();
  await expect(page.getByRole("button", { name: "Back to work" })).toBeVisible();
  await page.evaluate(() => document.querySelector<HTMLElement>(".app-main")?.scrollTo(0, 0));
  const suffix = testInfo.project.name === "mobile-webkit" ? "mobile-webkit" : "mobile-chromium";
  await page.screenshot({ path: `.impeccable/review/command-center-v2-${suffix}.png`, fullPage: true });
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflows).toBeLessThanOrEqual(1);
  await expectNoSeriousAccessibilityViolations(page);
});
