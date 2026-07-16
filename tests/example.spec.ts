import { expect, test } from "@playwright/test";

test("keeps the learning library public", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Teach/);
  await expect(
    page.getByRole("heading", { name: /Learn with structure/i }),
  ).toBeVisible();
  await expect(page.getByText("Public learning mode")).toBeVisible();
});

test("labels the owner-only studio before authentication", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Owner sign in" }).click();

  const dialog = page.getByRole("dialog", { name: "Enter Teach Studio" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("viticopq12@gmail.com");
  await expect(
    dialog.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
});
