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
  await expect(page.getByRole("heading", { name: "Learn anything. Understand everything." })).toBeVisible();

  for (const publicPage of [
    { path: "/standard", heading: "Generated is not good enough. Every lesson is held to a standard." },
    { path: "/support", heading: "Start with the right details." },
    { path: "/terms", heading: "Terms of Service" },
    { path: "/privacy", heading: "Privacy Notice" },
    { path: "/copyright", heading: "Copyright Policy" },
  ]) {
    const response = await page.goto(publicPage.path);
    expect(response?.ok(), `${publicPage.path} should return a successful document response`).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: publicPage.heading })).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
  expect(failedFirstPartyRequests).toEqual([]);
});
