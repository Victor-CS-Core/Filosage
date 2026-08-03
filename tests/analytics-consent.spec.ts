import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("erudoza:analytics:consent:v1");
    localStorage.removeItem("erudoza:analytics:actor");
    localStorage.removeItem("erudoza:analytics:first-touch");
    sessionStorage.clear();
  });
});

test("optional analytics stays silent before consent and after refusal", async ({ page }) => {
  let telemetryCalls = 0;
  await page.route("**/api/telemetry", async (route) => {
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
    consent: localStorage.getItem("erudoza:analytics:consent:v1"),
    actor: localStorage.getItem("erudoza:analytics:actor"),
    attribution: localStorage.getItem("erudoza:analytics:first-touch"),
    session: sessionStorage.getItem("erudoza:analytics:session"),
  }))).toEqual({ consent: "declined", actor: null, attribution: null, session: null });

  await page.goto("/pricing");
  await page.waitForTimeout(150);
  expect(telemetryCalls).toBe(0);
});

test("analytics can be allowed and later withdrawn from Privacy choices", async ({ page }) => {
  let telemetryCalls = 0;
  await page.route("**/api/telemetry", async (route) => {
    telemetryCalls += 1;
    await route.fulfill({ status: 204 });
  });

  await page.goto("/library");
  await page.getByRole("button", { name: "Allow optional analytics" }).click();
  await expect.poll(() => telemetryCalls).toBeGreaterThan(0);
  const acceptedStorage = await page.evaluate(() => ({
    consent: localStorage.getItem("erudoza:analytics:consent:v1"),
    actor: localStorage.getItem("erudoza:analytics:actor"),
    session: sessionStorage.getItem("erudoza:analytics:session"),
  }));
  expect(acceptedStorage.consent).toBe("accepted");
  expect(acceptedStorage.actor).toMatch(/^[A-Za-z0-9_-]{12,80}$/);
  expect(acceptedStorage.session).toMatch(/^[A-Za-z0-9_-]{12,80}$/);

  await page.goto("/privacy-center");
  await page.getByRole("button", { name: "Keep analytics off" }).click();
  await expect(page.getByText("Optional analytics are off and their browser identifiers were removed.")).toBeVisible();
  const callsAfterWithdrawal = telemetryCalls;
  expect(await page.evaluate(() => ({
    consent: localStorage.getItem("erudoza:analytics:consent:v1"),
    actor: localStorage.getItem("erudoza:analytics:actor"),
    attribution: localStorage.getItem("erudoza:analytics:first-touch"),
    session: sessionStorage.getItem("erudoza:analytics:session"),
  }))).toEqual({ consent: "declined", actor: null, attribution: null, session: null });

  await page.goto("/pricing");
  await page.waitForTimeout(150);
  expect(telemetryCalls).toBe(callsAfterWithdrawal);
});
