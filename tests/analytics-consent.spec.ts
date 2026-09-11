import { expect, test } from "@playwright/test";

// These tests exercise the first consent decision. Start with empty storage
// instead of visiting another page just to remove the default declined choice;
// that page's hydration can still update history during the next navigation.
test.use({ storageState: { cookies: [], origins: [] } });

test("optional analytics stays silent before consent and after refusal", { tag: ["@webkit", "@smoke"] }, async ({ page, context }) => {
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

test("keeps privacy choices reachable on a short mobile viewport", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
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

test("analytics can be allowed and later withdrawn from Privacy choices", { tag: ["@webkit", "@smoke"] }, async ({ page, context }) => {
  const telemetryRoutes: Array<string | null> = [];
  await context.route("**/api/telemetry", async (route) => {
    let telemetryRoute: string | null = null;
    try {
      const payload = route.request().postDataJSON() as unknown;
      if (typeof payload === "object" && payload !== null && "route" in payload && typeof payload.route === "string") {
        telemetryRoute = payload.route;
      }
    } catch {
      // Malformed telemetry is recorded and rejected by the assertions below.
    }
    telemetryRoutes.push(telemetryRoute);
    await route.fulfill({ status: 204 });
  });
  await context.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recentAuthentication: false,
        authentication: {
          primaryProvider: "google",
          externalIdAvailable: false,
          externalIdNewAccountsAvailable: false,
          legacyGoogleAvailable: true,
        },
        user: null,
      }),
    });
  });

  await page.goto("/library");
  await page.getByRole("button", { name: "Allow optional analytics" }).click();
  await expect.poll(() => telemetryRoutes.filter((route) => route !== null).length).toBeGreaterThan(0);
  expect(telemetryRoutes).not.toContain(null);
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
  const pricingCallsAfterWithdrawal = telemetryRoutes.filter((route) => route === "/pricing").length;
  expect(await privacyCenter.evaluate(() => ({
    consent: localStorage.getItem("filosage:analytics:consent:v1"),
    actor: localStorage.getItem("filosage:analytics:actor"),
    attribution: localStorage.getItem("filosage:analytics:first-touch"),
    session: sessionStorage.getItem("filosage:analytics:session"),
  }))).toEqual({ consent: "declined", actor: null, attribution: null, session: null });
  await privacyCenter.close();

  await expect.poll(async () => {
    try {
      return await page.evaluate(() => localStorage.getItem("filosage:analytics:consent:v1"));
    } catch {
      return "navigation-in-progress";
    }
  }).toBe("declined");

  const pricing = await context.newPage();
  const billingStatusReady = pricing.waitForResponse((response) => new URL(response.url()).pathname === "/api/billing/status");
  await pricing.goto("/pricing");
  await billingStatusReady;
  await expect(pricing.getByRole("heading", { name: "Choose your plan." })).toBeVisible();
  await expect.poll(async () => {
    try {
      return await pricing.evaluate(() => new Promise<"ready">((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve("ready")));
      }));
    } catch {
      return "navigation-in-progress";
    }
  }).toBe("ready");
  expect(telemetryRoutes).not.toContain(null);
  expect(telemetryRoutes.filter((route) => route === "/pricing")).toHaveLength(pricingCallsAfterWithdrawal);
  await pricing.close();
});
