import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("filosage:analytics:consent:v1");
    localStorage.removeItem("filosage:analytics:actor");
    localStorage.removeItem("filosage:analytics:first-touch");
    sessionStorage.clear();
  });
});

test("optional analytics stays silent before consent and after refusal", async ({ page, context }) => {
  let telemetryCalls = 0;
  await context.route("**/api/telemetry", async (route) => {
    telemetryCalls += 1;
    await route.fulfill({ status: 204 });
  });

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Help improve the learning experience?" })).toBeVisible();
  await page.waitForTimeout(150);
  expect(telemetryCalls).toBe(0);

  await page.getByRole("button", { name: "Continue without analytics" }).click();
  await expect(page.getByRole("heading", { name: "Help improve the learning experience?" })).toBeHidden();
  expect(await page.evaluate(() => ({
    consent: localStorage.getItem("filosage:analytics:consent:v1"),
    actor: localStorage.getItem("filosage:analytics:actor"),
    attribution: localStorage.getItem("filosage:analytics:first-touch"),
    session: sessionStorage.getItem("filosage:analytics:session"),
  }))).toEqual({ consent: "declined", actor: null, attribution: null, session: null });

  const pricing = await context.newPage();
  await pricing.goto("/pricing");
  await pricing.waitForTimeout(150);
  expect(telemetryCalls).toBe(0);
  await pricing.close();
});

test("keeps privacy choices reachable on a short mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");

  const panel = page.locator(".analytics-consent");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  await expect(panel.getByRole("button", { name: "Continue without analytics" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Allow optional analytics" })).toBeVisible();
});

test("analytics can be allowed and later withdrawn from Privacy choices", async ({ page, context }) => {
  let telemetryCalls = 0;
  await context.route("**/api/telemetry", async (route) => {
    telemetryCalls += 1;
    await route.fulfill({ status: 204 });
  });

  await page.goto("/library");
  await page.getByRole("button", { name: "Allow optional analytics" }).click();
  await expect.poll(() => telemetryCalls).toBeGreaterThan(0);
  const acceptedStorage = await page.evaluate(() => ({
    consent: localStorage.getItem("filosage:analytics:consent:v1"),
    actor: localStorage.getItem("filosage:analytics:actor"),
    session: sessionStorage.getItem("filosage:analytics:session"),
  }));
  expect(acceptedStorage.consent).toBe("accepted");
  expect(acceptedStorage.actor).toMatch(/^[A-Za-z0-9_-]{12,80}$/);
  expect(acceptedStorage.session).toMatch(/^[A-Za-z0-9_-]{12,80}$/);

  const privacyCenter = await context.newPage();
  await privacyCenter.goto("/privacy-center");
  await privacyCenter.getByRole("button", { name: "Keep analytics off" }).click();
  await expect(privacyCenter.getByText("Optional analytics are off and their browser identifiers were removed.")).toBeVisible();
  const callsAfterWithdrawal = telemetryCalls;
  expect(await privacyCenter.evaluate(() => ({
    consent: localStorage.getItem("filosage:analytics:consent:v1"),
    actor: localStorage.getItem("filosage:analytics:actor"),
    attribution: localStorage.getItem("filosage:analytics:first-touch"),
    session: sessionStorage.getItem("filosage:analytics:session"),
  }))).toEqual({ consent: "declined", actor: null, attribution: null, session: null });
  await privacyCenter.close();

  const pricing = await context.newPage();
  await pricing.goto("/pricing");
  await pricing.waitForTimeout(150);
  expect(telemetryCalls).toBe(callsAfterWithdrawal);
  await pricing.close();
});
