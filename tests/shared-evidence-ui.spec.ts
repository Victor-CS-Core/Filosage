import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  SHARED_EVIDENCE_PRIVATE_CANARIES,
  SHARED_EVIDENCE_TOKEN,
} from "./fixtures/shared-evidence-store.mjs";

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).include("main").analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test("renders privacy-safe professional evidence with inspectable proof", async ({ page }, testInfo) => {
  await page.goto(`/evidence/shared/${SHARED_EVIDENCE_TOKEN}`);

  await expect(page.getByRole("heading", { level: 1, name: "Decision Architecture" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Privacy-preserving learning snapshot" })).toBeVisible();
  await expect(page.getByText("This is learning evidence, not an accredited credential.", { exact: false })).toBeVisible();
  await expect(page.getByText("Identity, private notes, and raw responses are omitted.", { exact: false })).toBeVisible();
  await expect(page.locator('time[datetime="2026-08-16T13:30:00.000Z"]')).toHaveText("Aug 16, 2026");
  await expect(page.locator('time[datetime="2030-01-15T13:30:00.000Z"]')).toHaveText("Jan 15, 2030");

  const summary = page.getByRole("region", { name: "Evidence summary" });
  await expect(summary.getByText("A progression signal derived from saved practice and assessment evidence.")).toBeVisible();
  await expect(summary.getByText("Comparable assessment moved from 40% to 70%.")).toBeVisible();

  await expect(page.getByRole("heading", { level: 2, name: "What the evidence shows" })).toBeVisible();
  await expect(page.getByText("demonstrated · 1 record", { exact: true })).toBeVisible();
  await expect(page.getByText("practicing · 3 records", { exact: true })).toBeVisible();

  await expect(page.getByRole("heading", { level: 2, name: "Evidence behind these results" })).toBeVisible();
  await expect(page.getByText("Decision framing lesson", { exact: true })).toBeVisible();
  await expect(page.getByText("Transfer practice", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs further work", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Learner-reported", { exact: true })).toBeVisible();
  await expect(page.getByText("Server-verified", { exact: true }).first()).toBeVisible();

  await expect(page.getByRole("heading", { level: 2, name: "Latest capstone assessment" })).toBeVisible();
  await expect(page.getByText("Assessed Aug 16, 2026 · Attempt 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Criterion progression across 2 assessed attempts" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "How to read this report" })).toBeVisible();

  const renderedText = await page.locator("main").innerText();
  for (const canary of SHARED_EVIDENCE_PRIVATE_CANARIES) expect(renderedText).not.toContain(canary);

  const substantiveSizes = await page.locator([
    ".shared-evidence-trust p",
    ".shared-evidence-metrics p",
    ".shared-evidence-objectives li p",
    ".shared-evidence-ledger dd",
    ".shared-evidence-method p",
  ].join(",")).evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(Math.min(...substantiveSizes)).toBeGreaterThanOrEqual(14);
  const compactSizes = await page.locator(".shared-evidence-metrics span, .shared-evidence-objectives li span").evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(Math.min(...compactSizes)).toBeGreaterThanOrEqual(12);

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await expectNoAccessibilityViolations(page);

  if (testInfo.project.name === "desktop-chromium") {
    const response = await page.request.get(`/api/evidence-shares/${SHARED_EVIDENCE_TOKEN}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const body = await response.text();
    for (const canary of SHARED_EVIDENCE_PRIVATE_CANARIES) expect(body).not.toContain(canary);
  }
});

test("gives unavailable evidence recipients a privacy-safe recovery path", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.locator("main")).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await page.evaluate(() => localStorage.removeItem("filosage:analytics:consent:v1"));
  await page.goto("/evidence/shared/invalid");

  await expect(page.getByRole("heading", { level: 1, name: "This report is no longer available." })).toBeVisible();
  await expect(page.getByText("Ask the learner to create a new evidence link.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "How evidence reports work" })).toHaveAttribute("href", "/support/articles/read-evidence-report");
  await expect(page.locator(".analytics-consent")).toHaveCount(0);

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await expectNoAccessibilityViolations(page);
});
