import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("uses full document navigation across release-sensitive creation boundaries", { tag: "@smoke" }, async () => {
  const [segmentError, globalError, createCourse, courseMap, lessonView] = await Promise.all([
    readFile(join(process.cwd(), "src/app/error.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/app/global-error.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/app/create/page.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/app/course/[topic]/page.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/app/course/[topic]/lesson/[lessonId]/page.tsx"), "utf8"),
  ]);

  expect(segmentError).toContain('window.location.assign("/library")');
  expect(globalError).toContain('window.location.assign("/")');
  expect(segmentError).not.toContain('from "next/link"');
  expect(globalError).not.toContain('from "next/link"');
  expect(createCourse).toContain("window.location.assign(`/course/");
  expect(createCourse).not.toContain("router.push(`/course/");
  const openLesson = courseMap.match(/const openLesson = useCallback\(([\s\S]*?)\n\s*}, \[/)?.[1];
  expect(openLesson, "the course map must expose its guarded lesson-entry callback").toBeDefined();
  expect(openLesson).toContain("const lessonPath = `/course/${encodeURIComponent(topic)}/lesson/${lessonId}?id=${encodeURIComponent(courseId)}`;");
  expect(openLesson).toMatch(/if \(!user\) \{\s*openAccountEntry\(undefined, lessonPath\);\s*return;\s*}/);
  expect(openLesson).toMatch(/if \(!isCurrentLearnerSession\(session\) \|\| activeCourseViewRef\.current !== requestViewKey\) return;\s*window\.location\.assign\(lessonPath\);/);
  expect(openLesson).not.toMatch(/router\.(?:push|replace)\(/);
  expect(lessonView).toContain('<a className="lesson-nav-link lesson-nav-next"');
  expect(lessonView).toContain('<a className="lesson-nav-link lesson-nav-previous"');
});

test("gives lost learners a branded, accessible recovery path", { tag: "@smoke" }, async ({ page }) => {
  await page.goto("/this-course-does-not-exist");

  await expect(page.getByRole("heading", { name: "This path does not lead to a lesson." })).toBeVisible();
  await expect(page.getByText("Your learning progress has not been changed.")).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("id", "main-content");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.getByRole("link", { name: "Browse courses" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Find your next course." })).toBeVisible();
});
