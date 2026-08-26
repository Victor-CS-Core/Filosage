import { expect, test } from "@playwright/test";
import { exactLearnerAccount } from "./fixtures/local-learner";

test("paid checkout confirmations stay keyboard-usable and contained on a narrow screen", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
  await page.route("**/api/account", (route) => route.fulfill({ json: exactLearnerAccount() }));
  await page.route("**/api/billing/status", (route) => route.fulfill({
    json: { enabled: true, rolloutMode: "canary", ready: true, checkoutReady: true, managementReady: true },
  }));

  await page.goto("/pricing");
  const confirmations = page.getByRole("group", { name: "Confirm before continuing to Stripe Checkout" });
  await expect(confirmations).toBeVisible();
  const checkoutButtons = page.getByRole("button", { name: "Confirm eligibility to continue" });
  await expect(checkoutButtons).toHaveCount(2);
  await expect(checkoutButtons.first()).toBeDisabled();

  for (const checkboxName of [
    "I am at least 18 years old.",
    "I am a resident of the United States.",
    "I understand this subscription renews automatically until I cancel it through Stripe.",
  ]) {
    const checkbox = confirmations.getByRole("checkbox", { name: checkboxName });
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
  }

  await expect(page.getByRole("button", { name: "Continue to Stripe Checkout — Plus annual" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continue to Stripe Checkout — Pro annual" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("hosted subscription actions wrap into touch-safe controls without mobile overflow", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
  await page.route("**/api/account", (route) => route.fulfill({
    json: exactLearnerAccount({ plan: "plus", subscriptionStatus: "active" }),
  }));
  await page.route("**/api/billing/status", (route) => route.fulfill({
    json: { enabled: false, ready: false, checkoutReady: false, managementReady: true },
  }));

  await page.goto("/pricing");
  for (const name of ["Change plan in Stripe", "Manage billing in Stripe", "Cancel membership in Stripe"]) {
    const action = page.getByRole("button", { name });
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
