import { expect, test } from "@playwright/test";

test("gives lost learners a branded, accessible recovery path", async ({ page }) => {
  await page.goto("/this-course-does-not-exist");

  await expect(page.getByRole("heading", { name: "This path does not lead to a lesson." })).toBeVisible();
  await expect(page.getByText("Your learning progress has not been changed.")).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.getByRole("link", { name: "Browse courses" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Find your next course." })).toBeVisible();
});
