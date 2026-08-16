import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { supportArticles } from "../src/content/support/articles";
import type { OwnerDocumentation } from "../src/content/support/owner-documentation-types";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const root = process.cwd();
const wikiCheck = resolve(root, "scripts/check-support-wiki.mjs");

test.describe.configure({ mode: "serial" });

function run(args: string[], body = "") {
  return spawnSync(process.execPath, [wikiCheck, ...args], {
    cwd: root,
    env: { ...process.env, SUPPORT_WIKI_PR_BODY: body },
    encoding: "utf8",
  });
}

async function prepareLocalOwner(page: import("@playwright/test").Page) {
  const acceptance = await page.request.post("/api/legal/acceptance", {
    headers: { Authorization: "Bearer playwright-local-owner" },
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(acceptance.ok()).toBe(true);
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
}

test("validates support articles and blocks undocumented mapped feature changes", ({ request }, testInfo) => {
  void request;
  test.skip(testInfo.project.name !== "chromium", "One process-level documentation contract is sufficient.");

  const integrity = run([]);
  expect(integrity.status, integrity.stderr).toBe(0);
  expect(integrity.stdout).toContain("Support wiki validation passed");

  const undocumented = run(["--changed", "src/components/LessonStudyTools.tsx"]);
  expect(undocumented.status).toBe(1);
  expect(undocumented.stderr).toContain("Lesson study tools -> use-study-tools");

  const unmappedPage = run(["--changed", "src/app/new-learning-tool/page.tsx"]);
  expect(unmappedPage.status).toBe(1);
  expect(unmappedPage.stderr).toContain("missing from the feature map");

  const documented = run([
    "--changed", "src/components/LessonStudyTools.tsx",
    "--changed", "src/content/support/articles/use-study-tools.ts",
  ]);
  expect(documented.status, documented.stderr).toBe(0);

  const reviewedNoImpact = run(
    ["--changed", "src/components/LessonStudyTools.tsx"],
    "Wiki impact: none\nWiki rationale: The refactor preserves every visible label and behavior.",
  );
  expect(reviewedNoImpact.status, reviewedNoImpact.stderr).toBe(0);
});

test("searches public guides and renders source-checked article content", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop search coverage runs once to avoid duplicate dynamic-route compilation in the shared development server.");
  await page.goto("/support");
  await expect(page.getByRole("heading", { level: 1, name: "What do you need help with?" })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search Filosage help" });
  await search.fill("billing plan");
  const results = page.getByRole("region", { name: "Support search results" });
  await expect(results.getByRole("link", { name: /Understand Free, Plus, Pro, and billing status/ })).toBeVisible();
  await search.fill("guide that does not exist");
  await expect(results.getByText("No matching guide")).toBeVisible();
  await search.press("Escape");
  await expect(results).toBeHidden();
  await expect(search).toBeFocused();
  await search.fill("billing plan");
  await results.getByRole("link", { name: /Understand Free, Plus, Pro, and billing status/ }).click();

  await expect(page).toHaveURL(/\/support\/articles\/plans-and-billing$/);
  await expect(page.getByRole("heading", { level: 1, name: "Understand Free, Plus, Pro, and billing status" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Check current checkout availability" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Manage or cancel a subscription" })).toBeVisible();
  await expect(page.getByText(/return to Filosage does not grant membership access by itself/)).toBeVisible();
  await expect(page.getByText(/return link alone does not confirm payment or subscription state and does not change access/)).toBeVisible();
  await expect(page.getByText(/launch portal is limited to reviewing the subscription, updating a payment method, viewing invoices, and canceling/)).toBeVisible();
  await expect(page.getByText(/It does not offer plan switching/)).toBeVisible();
  await expect(page.getByText(/Reviewed against the app on/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("src/app/");

  await page.goto("/support/articles/accessibility#control-motion-and-animation");
  await expect(page.getByRole("heading", { level: 1, name: "Use Filosage with accessibility settings" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Control motion and animation" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Windows 11" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "macOS" })).toBeVisible();
  await expect(page.getByText(/choice takes effect immediately and is remembered in this browser/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Microsoft's Windows instructions" })).toHaveAttribute("href", /support\.microsoft\.com/);
  await expect(page.getByRole("link", { name: "Apple's Mac motion instructions" })).toHaveAttribute("href", /support\.apple\.com/);
});

test("shows the structured handbook only to the verified owner", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Owner handbook acceptance runs once in desktop Chromium.");
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Filosage owner handbook" })).toHaveCount(0);

  await prepareLocalOwner(page);
  const handbookResponse = await page.request.get("/api/support/owner-documentation", {
    headers: { Authorization: "Bearer playwright-local-owner" },
  });
  expect(handbookResponse.ok()).toBe(true);
  const handbook = await handbookResponse.json() as OwnerDocumentation;
  const handbookDestinations = handbook.sections.flatMap((section) =>
    section.topics.flatMap((topic) => topic.links?.map((link) => link.href) ?? []),
  );
  for (const destination of handbookDestinations) {
    const response = await page.request.get(destination);
    expect(response.status(), `${destination} from the owner handbook should resolve`).toBeLessThan(400);
  }
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Filosage owner handbook" })).toBeVisible();
  await page.getByRole("link", { name: /Open handbook/ }).click();
  await expect(page).toHaveURL(/\/support\/owner$/);
  await expect(page.getByRole("heading", { level: 1, name: "Filosage owner handbook" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Support and Agent Command Center" })).toBeVisible();
  await expect(page.getByText("Reviewed sources", { exact: true }).first()).toBeVisible();
});

test("keeps article navigation and prose within a phone viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-webkit", "The mobile article contract runs in the phone-sized WebKit project.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/articles/complete-a-lesson");

  await expect(page.getByRole("heading", { level: 1, name: "Complete a lesson and its activities" })).toBeVisible();
  await expect(page.getByText("On this page", { exact: true }).first()).toBeVisible();
  const dimensions = await page.locator("body").evaluate((body) => ({ clientWidth: body.clientWidth, scrollWidth: body.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  const categoryNavigation = await page.getByRole("complementary", { name: "Support category navigation" }).locator("ul").evaluate((list) => ({ clientWidth: list.clientWidth, scrollWidth: list.scrollWidth }));
  expect(categoryNavigation.scrollWidth).toBeLessThanOrEqual(categoryNavigation.clientWidth);
});

test("resolves every wiki destination and provides reliable email fallbacks", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The complete wiki link contract runs once in desktop Chromium.");

  const destinations = new Set<string>([
    "/support",
    ...supportArticles.map((article) => `/support/articles/${article.slug}`),
  ]);
  for (const article of supportArticles) {
    for (const match of article.body.matchAll(/\[[^\]]+\]\((\/[^)\s]+)\)/g)) destinations.add(match[1].split("#", 1)[0]);
  }

  for (const destination of destinations) {
    const response = await request.get(destination);
    expect(response.status(), `${destination} should resolve`).toBeLessThan(400);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/support");
  await page.getByRole("link", { name: "Start an email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("support@filosage.com");

  await page.goto("/support/articles/getting-started");
  const contents = page.getByRole("complementary", { name: "On this page" });
  const contentsSpacing = await contents.locator("ol").evaluate((list) => {
    const item = list.querySelector("li");
    return item ? item.getBoundingClientRect().left - list.getBoundingClientRect().left : 0;
  });
  expect(contentsSpacing).toBeGreaterThanOrEqual(24);
  await contents.getByRole("link", { name: "Open your first lesson" }).click();
  await expect(page).toHaveURL(/#open-your-first-lesson$/);
  await expect(page.getByRole("heading", { level: 2, name: "Open your first lesson" })).toBeVisible();

  await page.getByRole("link", { name: "Email support", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("support@filosage.com");
});
