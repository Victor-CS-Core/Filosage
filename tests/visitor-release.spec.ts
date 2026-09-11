import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";

const previewCourse = {
  id: "visitor-preview", courseId: "visitor-preview", isPublic: true,
  topic: "Check a claim before you share it", category: "Critical thinking",
  outcome: "Trace a claim to its source and decide whether the evidence supports it.",
  level: "Foundations", estimatedMinutes: 45,
  modules: [
    { title: "Find the original source", lessons: [{ title: "Trace the claim", estimatedMinutes: 15 }] },
    { title: "Read the evidence", lessons: [{ title: "Check the conclusion", estimatedMinutes: 15 }] },
  ],
  artifact: { title: "A claim check with your sources and conclusion" },
};

const guestSession = {
  user: null, recentAuthentication: false,
  authentication: { primaryProvider: "google", externalIdAvailable: false, externalIdNewAccountsAvailable: false, legacyGoogleAvailable: true },
};

test("records an optimized visitor performance sample", async ({ browser }) => {
  const label = process.env.VISITOR_PERF_LABEL;
  test.skip(!label, "Only run against an explicitly started optimized build.");
  const samples = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.route("**/api/auth/session", async (route) => {
      // A repeatable slow-session scenario, not a field Core Web Vitals claim.
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.fulfill({ json: { user: null, authentication: {
        primaryProvider: "google", externalIdAvailable: false,
        externalIdNewAccountsAvailable: false, legacyGoogleAvailable: true,
      } } });
    });
    await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [] } }));
    await page.goto(process.env.VISITOR_PERF_URL ?? "http://127.0.0.1:3511");
    await expect(page.locator(".marketing-hero h1")).toBeVisible();
    await expect(page.locator(".marketing-course-proof-state")).toBeVisible();
    const sample = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const scripts = resources.filter((entry) => entry.name.includes("/_next/") && entry.name.endsWith(".js"));
      return {
        ttfbMs: Math.round(nav.responseStart - nav.requestStart),
        fcpMs: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0),
        observedReadyMs: Math.round(performance.now()),
        scriptCount: scripts.length,
        scriptTransferBytes: scripts.reduce((total, entry) => total + entry.transferSize, 0),
        scriptDecodedBytes: scripts.reduce((total, entry) => total + entry.decodedBodySize, 0),
        pageHeight: document.documentElement.scrollHeight,
      };
    });
    samples.push(sample);
    await context.close();
  }
  mkdirSync("test-results/visitor-performance", { recursive: true });
  writeFileSync(`test-results/visitor-performance/${label}.json`, JSON.stringify({
    conditions: "Optimized local build, fresh Chromium context, 390x844, reduced motion, empty catalog, session response delayed 750ms; three samples. Not field CWV.", samples,
  }, null, 2));
  console.log(JSON.stringify({ label, samples }));
});

test("a failed course preview can be retried without leaving the page", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: guestSession }));
  let attempts = 0;
  await page.route("**/api/courses?scope=public", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { error: "Temporary failure" } })
      : route.fulfill({ json: { courses: [previewCourse] } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "We couldn’t load the course preview." })).toBeVisible();
  await expect(page.locator(".marketing-hero").getByRole("link", { name: "Explore courses" })).toHaveAttribute("href", "/library");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: previewCourse.topic, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View course outline" })).toHaveAttribute("href", "/course/Check%20a%20claim%20before%20you%20share%20it?id=visitor-preview");
  expect(attempts).toBe(2);
});

test("visitor page stays accessible in both themes and the mobile menu returns focus", { tag: ["@mobile", "@webkit"] }, async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("filosage:analytics:consent:v1", "declined"));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: guestSession }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [previewCourse] } }));
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: previewCourse.topic, exact: true })).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Use dark mode", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`visitor-${theme}.png`), fullPage: true });
  }
  const menu = page.getByRole("button", { name: "Open navigation menu" });
  if (await menu.isVisible()) {
    await menu.click();
    const plans = page.getByRole("navigation", { name: "Mobile public navigation" }).getByRole("link", { name: "Plans", exact: true });
    await expect(plans).toBeVisible();
    await plans.focus();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
    await expect(plans).toBeHidden();
  }
});

test("public home is usable while authentication is still resolving", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
  let releaseSession!: () => void;
  const sessionHeld = new Promise<void>((resolve) => { releaseSession = resolve; });
  await page.route("**/api/auth/session", async (route) => {
    await sessionHeld;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".marketing-hero h1")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".marketing-hero").getByRole("link", { name: "Explore courses", exact: true })).toHaveAttribute("href", "/library");
    await expect(page.locator(".marketing-sign-in")).toBeDisabled();
    await expect(page.locator(".learner-shell")).toHaveCount(0);
  } finally {
    releaseSession();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("an empty catalog leaves a useful exploration action and no missing featured anchor", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    user: null, recentAuthentication: false,
    authentication: { primaryProvider: "google", externalIdAvailable: false, externalIdNewAccountsAvailable: false, legacyGoogleAvailable: true },
  } }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [] } }));
  await page.goto("/");
  await expect(page.locator(".marketing-course-proof-state")).toBeVisible();
  const primary = page.locator(".marketing-hero").getByRole("link", { name: "Explore courses", exact: true });
  await expect(primary).toHaveAttribute("href", "/library");
  const brokenAnchors = await page.locator(".marketing-page a[href^='#']").evaluateAll((links) => links
    .map((link) => link.getAttribute("href") ?? "")
    .filter((href) => href.length > 1 && !document.getElementById(href.slice(1))));
  expect(brokenAnchors).toEqual([]);
  await primary.click();
  await expect(page).toHaveURL(/\/library$/);
});
