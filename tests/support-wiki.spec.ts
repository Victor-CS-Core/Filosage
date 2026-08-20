import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { supportArticles } from "../src/content/support/articles";
import type { OwnerDocumentation } from "../src/content/support/owner-documentation-types";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const root = process.cwd();
const wikiCheck = resolve(root, "scripts/check-support-wiki.mjs");
const articleBody = (slug: string) => supportArticles.find((article) => article.slug === slug)?.body ?? "";

test.describe.configure({ mode: "serial" });

test("covers course creation, learning plans, and professional evidence sharing", () => {
  const manifest = JSON.parse(readFileSync("docs/support/wiki-feature-map.json", "utf8")) as {
    excludedPagePrefixes: string[];
    features: Array<{ feature: string; sources: string[]; articles: string[] }>;
  };
  const creation = manifest.features.find((entry) => entry.feature === "Private AI course creation");
  const planning = manifest.features.find((entry) => entry.feature === "Personal learning plan and baseline");
  const evidence = supportArticles.find((article) => article.slug === "read-evidence-report");

  expect(manifest.excludedPagePrefixes).not.toContain("src/app/create/");
  expect(creation?.sources).toContain("src/app/create/");
  expect(creation?.articles).toContain("create-a-course");
  expect(planning?.sources).toContain("src/components/OutcomePlanner.tsx");
  expect(planning?.articles).toContain("follow-a-course");
  expect(supportArticles.some((article) => article.slug === "create-a-course")).toBe(true);
  expect(evidence?.body).toContain("## Download a professional report");
  expect(evidence?.body).toContain("## Create and revoke a share link");
});

test("documents the current sign-in, Today, profile, and private-course discovery behavior", () => {
  const signInHelp = articleBody("sign-in-help");
  const gettingStarted = articleBody("getting-started");
  const signInSummary = supportArticles.find((article) => article.slug === "sign-in-help")?.summary;
  expect(signInSummary).toBe("Use the secure sign-in methods currently available and troubleshoot Google or email-code sign-in when those methods are enabled.");
  expect(signInSummary).not.toContain("Choose Google or a private email code");
  expect(signInHelp).toContain("Google sign-in remains available when it is enabled");
  expect(signInHelp).toContain("Email-code sign-in appears only when Microsoft Entra External ID is enabled");
  expect(signInHelp).toContain("existing-account email recovery may be available before new email-code account creation");
  expect(signInHelp).toContain("Never send a password or one-time code");
  expect(signInHelp).not.toContain("choose **Continue with Google** or enter your email address");
  expect(signInHelp).not.toContain("Allow popups");
  expect(gettingStarted).toContain("confirm age eligibility");
  expect(gettingStarted).toContain("select one of the sign-in methods currently shown");
  expect(gettingStarted).toContain("Google remains available when enabled");
  expect(gettingStarted).toContain("email-code sign-in appears only when Microsoft Entra External ID is enabled");
  expect(articleBody("getting-started")).toContain("Weekly progress");
  expect(articleBody("getting-started")).toContain("Review queue");
  expect(articleBody("getting-started")).toContain("Learning streak");
  expect(articleBody("getting-started")).not.toContain("learning brief");
  expect(articleBody("manage-profile")).toContain("does not currently rearrange the fixed Today signals");
  expect(articleBody("find-a-course")).toContain("Your current courses");
  expect(articleBody("find-a-course")).toContain("My courses");
});

test("documents the complete lesson workspace, interactive practice, bookmarks, and Tutor", () => {
  expect(articleBody("complete-a-lesson")).toContain("Learn and Activities");
  expect(articleBody("complete-a-lesson")).toContain("20 meaningful characters");
  expect(articleBody("complete-a-lesson")).toContain("guided practice");
  expect(articleBody("complete-a-lesson")).toContain("focused retry");
  expect(articleBody("complete-a-lesson")).toContain("Bookmark lesson");
  expect(articleBody("use-study-tools")).toContain("Notes, Flashcards, and Next steps");
  expect(articleBody("use-study-tools")).toContain("Enter sends");
  expect(articleBody("use-study-tools")).toContain("Shift+Enter");
  expect(articleBody("use-study-tools")).toContain("verify important answers");
});

test("documents capstones, ordinary creator publishing, deletion impact, and source reporting", () => {
  expect(articleBody("complete-a-capstone")).toContain("all lessons");
  expect(articleBody("complete-a-capstone")).toContain("120 characters");
  expect(articleBody("complete-a-capstone")).toContain("one Tutor question");
  expect(articleBody("complete-a-capstone")).toContain("Needs revision");
  expect(articleBody("manage-and-publish-a-course")).toContain("Unpublish");
  expect(articleBody("manage-and-publish-a-course")).toContain("all learners");
  expect(articleBody("manage-and-publish-a-course")).toContain("permanent deletion");
  expect(articleBody("follow-a-course")).toContain("Source-backed");
  expect(articleBody("follow-a-course")).toContain("Report source");
  expect(articleBody("report-content")).toContain("Outdated information");
  expect(articleBody("report-content")).toContain("Unclear explanation");
});

test("documents schedules, outcome feedback, next outcomes, and support request tracking", () => {
  expect(articleBody("understand-progress")).toContain("preferred time");
  expect(articleBody("understand-progress")).toContain(".ics");
  expect(articleBody("understand-progress")).toContain("Email delivery is currently off");
  expect(articleBody("read-evidence-report")).toContain("1–5 usefulness rating");
  expect(articleBody("read-evidence-report")).toContain("next course");
  expect(articleBody("contact-support")).toContain("My requests");
  expect(articleBody("contact-support")).toContain("published owner reply");
});

test("validates repository-wide wiki coverage and owner handbook sections", () => {
  const checker = readFileSync("scripts/check-support-wiki.mjs", "utf8");
  const ownerHandbook = readFileSync("src/content/support/owner-documentation.ts", "utf8");
  expect(checker).toContain("repositoryPages");
  expect(checker).toContain("references missing feature source");
  expect(checker).toContain("ownerSections");
  expect(ownerHandbook).toContain("Undo an automatic repair");
  expect(ownerHandbook).toContain("exact course snapshot");
  expect(ownerHandbook).toContain("Before permanent deletion");
  expect(ownerHandbook).toContain("partial-data indicator");
  expect(ownerHandbook).toContain("recorded reason");
});

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

test("searches public guides, renders source-checked content, and resolves wiki destinations", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
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
  const billingGuide = results.getByRole("link", { name: /Understand Free, Plus, Pro, and billing status/ });
  await expect(billingGuide).toHaveAttribute("href", "/support/articles/plans-and-billing");
  await page.goto("/support/articles/plans-and-billing");

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

  const destinations = new Set<string>([
    "/support",
    ...supportArticles.map((article) => `/support/articles/${article.slug}`),
  ]);
  for (const article of supportArticles) {
    for (const match of article.body.matchAll(/\[[^\]]+\]\((\/[^)\s]+)\)/g)) destinations.add(match[1].split("#", 1)[0]);
  }

  await page.goto("/support");
  const startEmail = page.getByRole("link", { name: "Start an email", exact: true });
  await expect(startEmail).toHaveAttribute("href", /^mailto:support@filosage\.com\?/);
  await startEmail.click();
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

  const articleEmail = page.getByRole("link", { name: "Email support", exact: true });
  await expect(articleEmail).toHaveAttribute("href", /^mailto:support@filosage\.com/);
  await articleEmail.click();
  await expect(page.getByRole("status")).toContainText("support@filosage.com");

  for (const destination of destinations) {
    const response = await request.get(destination);
    expect(response.status(), `${destination} should resolve`).toBeLessThan(400);
  }
});

test("shows the structured handbook only to the verified owner", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
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
  const handbookLink = page.getByRole("link", { name: /Open handbook/ });
  await expect(handbookLink).toHaveAttribute("href", "/support/owner");
  await page.goto("/support/owner");
  await expect(page).toHaveURL(/\/support\/owner$/);
  await expect(page.getByRole("heading", { level: 1, name: "Filosage owner handbook" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Support and Agent Command Center" })).toBeVisible();
  await expect(page.getByText("Reviewed sources", { exact: true }).first()).toBeVisible();
});

test("keeps article navigation and prose within a phone viewport", { tag: "@webkit" }, async ({ page }, testInfo) => {
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
