import { expect, test } from "@playwright/test";

test("serves release-critical public pages from the Sites production build", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const failedFirstPartyRequests: string[] = [];
  const firstPartyOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "unknown failure";
    const navigationCancelled = /ERR_ABORTED|NS_BINDING_ABORTED/.test(failure);
    if (request.url().startsWith(firstPartyOrigin) && !navigationCancelled) {
      failedFirstPartyRequests.push(`${request.method()} ${request.url()} (${failure})`);
    }
  });

  const home = await page.goto("/");
  expect(home?.ok()).toBe(true);
  expect(home?.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(page.getByRole("heading", { name: "Turn curiosity into understanding" })).toBeVisible();

  for (const publicPage of [
    { path: "/standard", heading: "Generated is not good enough. Every lesson is held to a standard." },
    { path: "/support", heading: "What do you need help with?" },
    { path: "/support/articles/getting-started", heading: "Start learning with Filosage" },
    { path: "/terms", heading: "Terms of Service" },
    { path: "/privacy", heading: "Privacy Notice" },
    { path: "/copyright", heading: "Copyright Policy" },
  ]) {
    const response = await page.goto(publicPage.path);
    expect(response?.ok(), `${publicPage.path} should return a successful document response`).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: publicPage.heading })).toBeVisible();
  }

  await page.goto("/support");
  await page.getByRole("link", { name: "Start an email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("support@erudoza.com");

  await page.goto("/support/articles/getting-started");
  const contents = page.getByRole("complementary", { name: "On this page" });
  await contents.getByRole("link", { name: "Open your first lesson" }).click();
  await expect(page).toHaveURL(/#open-your-first-lesson$/);
  await page.getByRole("link", { name: "Email support", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("support@erudoza.com");

  expect(pageErrors).toEqual([]);
  expect(failedFirstPartyRequests).toEqual([]);
});
