import { expect, test } from "@playwright/test";
import type { Course } from "../src/lib/course-types";
import { matchesSearchQuery, normalizeSearchText } from "../src/lib/search";
import { restoreLocalLearner } from "./fixtures/local-learner";

const searchableCourses: Course[] = [
  {
    id: "cafe-systems",
    courseId: "cafe-systems",
    topic: "Café systems",
    mission: "Map resilient feedback loops in a real service.",
    outcome: "Explain where a small intervention changes the system.",
    category: "Strategy",
    level: "Foundations",
    isPublic: true,
    modules: [{
      title: "Feedback foundations",
      description: "Trace reinforcing and balancing loops.",
      lessons: [{ title: "Leverage points", concept: "Find the smallest useful intervention." }],
    }],
  },
  {
    id: "interface-prototype",
    courseId: "interface-prototype",
    topic: "Interface decisions",
    mission: "Build a defensible prototype for a complex workflow.",
    outcome: "Test an accessible interaction model.",
    category: "Design",
    level: "Intermediate",
    isPublic: true,
    modules: [{
      title: "Prototype and test",
      lessons: [{ title: "Keyboard pathways", concept: "Validate focus order and recovery." }],
    }],
  },
];

test("normalizes accents and matches unordered terms across indexed fields", () => {
  expect(normalizeSearchText("  CAFÉ—Systems  ")).toBe("cafe systems");
  expect(matchesSearchQuery("loops café", ["Café systems", "Map resilient feedback loops"])).toBe(true);
  expect(matchesSearchQuery("status pro", ["Pro", "active status"])).toBe(true);
  expect(matchesSearchQuery("missing term", ["Café systems", "feedback loops"])).toBe(false);
});

test("course-library search handles URL queries, lesson metadata, filters, and reset on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: searchableCourses } }));
  await page.goto("/library?q=cafe%20loops");

  await expect(page.getByRole("heading", { name: "Café systems" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Interface decisions" })).toHaveCount(0);

  await page.getByRole("button", { name: "Search and filter" }).click();
  const filters = page.getByRole("dialog", { name: "Find the right course" });
  const search = filters.getByRole("searchbox", { name: "Search published courses" });
  await search.fill("keyboard prototype");
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "keyboard prototype");
  await expect(filters.getByRole("button", { name: "Show 1 course" })).toBeVisible();

  await filters.getByLabel("Level").selectOption("Foundations");
  await expect(page).toHaveURL((url) => url.searchParams.get("level") === "Foundations");
  await expect(filters.getByRole("button", { name: "Show 0 courses" })).toBeVisible();
  await filters.getByRole("button", { name: "Reset" }).click();
  await expect(search).toHaveValue("");
  await expect(page).toHaveURL((url) => !url.searchParams.has("q") && !url.searchParams.has("level") && !url.searchParams.has("commitment"));
  await expect(filters.getByRole("button", { name: "Show 2 courses" })).toBeVisible();
});

test("dashboard defers global search to the Command Center", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The dashboard and Command Center handoff only needs one browser project.");
  await restoreLocalLearner(page);
  await page.route("**/api/account", (route) => route.fulfill({ json: {
    access: "pro",
    plan: "pro",
    isOwner: true,
    accountStatus: "active",
    displayName: "Search Tester",
    legalAcceptanceRequired: false,
    quotas: [],
  } }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: searchableCourses } }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.goto("/");

  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Welcome back, Search." })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Today's learning brief" })).toBeVisible();

  await page.getByRole("button", { name: /Search or jump anywhere/ }).click();
  const commandCenter = page.getByRole("dialog", { name: "Filosage Command Center" });
  const commandSearch = commandCenter.getByRole("combobox", { name: "Search Filosage" });
  await commandSearch.fill("published explore");
  await commandCenter.getByRole("option", { name: /Explore Discover published courses/ }).click();
  await expect(page).toHaveURL(/\/library$/);
});
