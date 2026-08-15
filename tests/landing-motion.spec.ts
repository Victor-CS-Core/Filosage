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
