import { expect, test } from "@playwright/test";

const publicCourse = {
  id: "motion-review",
  courseId: "motion-review",
  topic: "Systems thinking",
  outcome: "Apply systems thinking to a realistic situation.",
  level: "Foundations",
  estimatedMinutes: 60,
  isPublic: true,
  modules: [{ title: "The core model", lessons: [{ title: "Feedback loops", estimatedMinutes: 12 }] }],
  capstone: { title: "Apply the model", brief: "Use it at work.", deliverable: "A decision walkthrough", successCriteria: ["State one boundary"] },
};

test("animates the course proof only when reduced motion is not requested", async ({ page }) => {
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ courses: [publicCourse] }),
  }));

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const cover = page.locator(".marketing-course-cover");
  const outline = page.locator(".marketing-course-outline");
  await expect(cover).toBeVisible();
  await expect(cover).toHaveCSS("animation-name", "marketing-course-cover-enter");
  await expect(outline).toHaveCSS("animation-name", "marketing-course-outline-enter");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(cover).toBeVisible();
  await expect(cover).toHaveCSS("animation-name", "none");
  await expect(outline).toHaveCSS("animation-name", "none");
});

test("keeps the primary landing action in the first viewport", async ({ page }) => {
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ courses: [publicCourse] }),
  }));

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const primary = page.locator(".marketing-hero").getByRole("link", { name: "Explore course outcomes" });
    await expect(primary).toBeVisible();
    const bounds = await primary.boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  }
});
