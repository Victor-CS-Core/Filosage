import { expect, test } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";

test("the rendered owner Control Room exposes reconciled membership reporting", async ({ page }) => {
  await restoreLocalLearner(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Free, Plus, and Pro" })).toBeVisible();
  await expect(page.getByText("Paid conversion", { exact: true })).toBeVisible();
  await expect(page.getByText("Nominal MRR", { exact: true })).toBeVisible();
  await expect(page.getByText("Nominal ARR", { exact: true })).toBeVisible();
  await expect(page.getByText("Paid pool — Plus and Pro", { exact: true })).toBeVisible();
  await expect(page.getByText("Pro pool", { exact: true })).toHaveCount(0);
});
