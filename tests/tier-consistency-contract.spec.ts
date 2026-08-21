import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { restoreLocalLearner } from "./fixtures/local-learner";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

test("Control Room reporting names and aggregates Plus and Pro explicitly", () => {
  const overview = source("src/app/api/admin/overview/route.ts");
  const page = source("src/app/admin/page.tsx");
  expect(overview).toContain("calculateMembershipAnalytics");
  expect(overview).toContain('courseBanners: 0');
  expect(overview).toContain('commandCenterDrafts: 0');
  expect(page).toContain("Free, Plus, and Pro");
  expect(page).toContain("Paid pool — Plus and Pro");
  expect(page).not.toContain("Pro pool");
  expect(page).not.toContain("Pro contribution model");
});

test("new courses keep initial banners while banner regeneration is retired", () => {
  const courseGeneration = source("src/app/api/generate-course/route.ts");
  const storage = source("src/lib/document-store.ts");
  expect(courseGeneration).toContain('reserveAiUsage(account, "course_banner", idempotencyKey)');
  expect(existsSync(resolve(root, "src/app/api/courses/[courseId]/banner/route.ts"))).toBe(false);
  expect(storage).not.toContain("claimCourseBannerRegeneration");
  expect(storage).not.toContain("finishCourseBannerRegeneration");
});

test("billing events retain tier, interval, offer, and raw lifecycle dimensions", () => {
  const checkout = source("src/app/api/billing/checkout/route.ts");
  const webhook = source("src/app/api/billing/webhook/route.ts");
  const stripe = source("src/lib/stripe-server.ts");
  expect(checkout).toContain("planId: body.planId");
  expect(checkout).toContain("billingInterval: body.interval");
  expect(webhook).toContain("stripeEventAuditDetails");
  expect(webhook).toContain("cancelAtPeriodEnd");
  expect(webhook).toContain("claimedAt: claimedAt.toISOString()");
  expect(webhook).toContain("resolvedSubscriptionOffer(subscription)");
  expect(webhook).toContain("declaredPlanId");
  expect(stripe).toContain("billingRawStatus: subscription.status");
  expect(stripe).toContain("billingCancelAtPeriodEnd: subscription.cancel_at_period_end");
  expect(stripe).toContain("billingPriceId: resolved.priceId");
});

test("Control Room launch gates use exact report counts and disclose capped sources", () => {
  const overview = source("src/app/api/admin/overview/route.ts");
  const page = source("src/app/admin/page.tsx");
  expect(overview).toContain('countCollectionDocuments("contentReports")');
  expect(overview).toContain("totalContentReportCount - resolvedContentReportCount - dismissedContentReportCount");
  expect(overview).toContain("limitedSources");
  expect(page).toContain("Some totals are partial because the reporting read limit was reached");
  expect(page).toContain("billing lock remains on");
  expect(page).toContain("billing lock is off");
});

test("manual grants cannot replace billing-managed access", () => {
  const account = source("src/lib/account-server.ts");
  const adminRoute = source("src/app/api/admin/users/[uid]/route.ts");
  const adminPage = source("src/app/admin/page.tsx");
  expect(account.indexOf(": subscribed")).toBeLessThan(account.indexOf(": manualPlanActive"));
  expect(adminRoute).toContain("This membership is managed by its Stripe subscription.");
  expect(adminRoute).toContain("status: 409");
  expect(adminPage).toContain("Membership is billing-managed");
});

test("malformed pricing intent is rejected instead of invented as Pro", () => {
  const route = source("src/app/api/pricing-intent/route.ts");
  expect(route).toContain("if (!isPaidLearnerPlan(document.planId)) return null;");
  expect(route).not.toContain('document.planId === "plus" ? "plus" : "pro"');
});

test("public and owner-facing tier copy no longer describes a two-tier product", () => {
  expect(source("src/app/library/page.tsx")).toContain("Compare memberships");
  expect(source("src/components/marketing/LandingPage.tsx")).toContain("Paid availability stays explicit");
  expect(source("src/app/api/waitlist/route.ts")).toContain("paid membership launch");
  expect(source("src/content/support/owner-documentation.ts")).toContain("Plus adds two complete private AI course credits monthly");
});

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
