import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const azureBicep = read("infra/azure/main.bicep");
const stagingWorkflow = read(".github/workflows/azure-staging.yml");
const promotionWorkflow = read(".github/workflows/azure-promote-staging.yml");
const playwrightConfig = read("playwright.config.ts");
const createPage = read("src/app/create/page.tsx");
const createStyles = read("src/app/create/create.module.css");
const marketingStyles = read("src/styles/brand/marketing.css");
const privacyNotice = read("src/app/privacy/page.tsx");
const readme = read("README.md");
const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const matrixRunner = read("scripts/run-playwright-matrix.mjs");

test("the app trusts Easy Auth headers only when the platform auth resource is configured", () => {
  expect(azureBicep).toContain(
    "var easyAuthConfigured = !empty(googleClientId) && !empty(googleClientSecret)",
  );
  expect(azureBicep).toContain(
    "{ name: 'AZURE_EASY_AUTH_ENABLED', value: string(easyAuthConfigured) }",
  );
  expect(azureBicep).toContain(
    "resource appAuth 'Microsoft.App/containerApps/authConfigs@2025-01-01' = if (deployApplication && easyAuthConfigured)",
  );
});

test("staging explicitly preserves the closed-billing release boundary", () => {
  expect(stagingWorkflow).toContain('"BILLING_ENABLED=false"');
  expect(stagingWorkflow).toContain("Verify the deployed release safety policy");
  expect(stagingWorkflow).toContain("az containerapp revision show");
  expect(stagingWorkflow).toContain("steps.deploy_revision.outputs.revision");
  expect(stagingWorkflow.indexOf("Verify the deployed release safety policy")).toBeLessThan(
    stagingWorkflow.indexOf("Assign verified revision label"),
  );
});

test("promotion restores the previous traffic weights when verification fails or is cancelled", () => {
  expect(promotionWorkflow).toContain("Verify the deployed release safety policy");
  expect(promotionWorkflow).toContain("TARGET_REVISION=");
  expect(promotionWorkflow).toContain("az containerapp revision show");
  expect(promotionWorkflow.indexOf("Verify the deployed release safety policy")).toBeLessThan(
    promotionWorkflow.indexOf("Switch staging traffic"),
  );
  expect(promotionWorkflow).toContain("id: capture_traffic");
  expect(promotionWorkflow).toContain("id: traffic_switch");
  expect(promotionWorkflow).toContain("az containerapp ingress traffic show");
  expect(promotionWorkflow).toContain("const traffic = JSON.parse");
  expect(promotionWorkflow).toContain("traffic.length !== 2");
  expect(promotionWorkflow).toContain("blueWeight + greenWeight !== 100");
  expect(promotionWorkflow).not.toContain("jq ");
  expect(promotionWorkflow).toContain("if: (failure() || cancelled()) && steps.capture_traffic.outcome == 'success'");
  expect(promotionWorkflow).not.toContain("steps.traffic_switch.outcome == 'success'");
  expect(promotionWorkflow).toContain('"blue=${{ steps.capture_traffic.outputs.blue_weight }}"');
  expect(promotionWorkflow).toContain('"green=${{ steps.capture_traffic.outputs.green_weight }}"');
});

test("the general browser matrix excludes suites that require dedicated seeded servers", () => {
  expect(playwrightConfig).toContain("testIgnore:");
  expect(playwrightConfig).toContain('"command-center-v2-contract.spec.ts"');
  expect(playwrightConfig).toContain('"command-center-v2-ui.spec.ts"');
  expect(playwrightConfig).toContain('"shared-evidence-ui.spec.ts"');
  expect(playwrightConfig).toContain("workers: 1");
  expect(playwrightConfig).not.toContain("workers: process.env.CI ? 1 : 2");
});

test("the browser matrix starts only one isolated Next server at a time", () => {
  expect(packageJson.scripts["test:e2e"]).toBe("node scripts/run-playwright-matrix.mjs");
  const result = spawnSync(process.execPath, ["scripts/run-playwright-matrix.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "" },
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  const plan = JSON.parse(result.stdout) as { projects: string[]; batches: string[][]; batchSize: number };
  expect(plan.projects).toEqual(["chromium", "mobile-chromium", "mobile-webkit"]);
  expect(plan.batchSize).toBe(3);
  expect(plan.batches.length).toBeGreaterThan(1);
  expect(plan.batches.every((batch) => batch.length > 0 && batch.length <= plan.batchSize)).toBe(true);
  expect(plan.batches.flat()).not.toContain("tests/shared-evidence-ui.spec.ts");
  const webkitOnly = spawnSync(process.execPath, ["scripts/run-playwright-matrix.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "mobile-webkit" },
    encoding: "utf8",
  });
  expect(webkitOnly.status, webkitOnly.stderr).toBe(0);
  expect(JSON.parse(webkitOnly.stdout).projects).toEqual(["mobile-webkit"]);
  expect(playwrightConfig).toContain("FILOSAGE_PLAYWRIGHT_PROJECT");
  expect(matrixRunner).toContain('require.resolve("@playwright/test/cli")');
  expect(matrixRunner).not.toContain("npx.cmd");
});

test("course creation exposes progress values and visible keyboard focus", () => {
  expect(createPage).toContain('aria-valuemin={0}');
  expect(createPage).toContain('aria-valuemax={100}');
  expect(createPage).toContain('aria-valuenow={generationProgress}');
  expect(createStyles).toMatch(/\.approachGroup label:has\(input:focus-visible\)[\s\S]*?outline:/);
});

test("small uppercase marketing notes use the higher-contrast text token", () => {
  expect(marketingStyles).toMatch(/\.marketing-story-note\s*\{[^}]*color:\s*var\(--ink-secondary\)/);
});

test("the privacy notice describes the automated account export honestly", () => {
  expect(privacyNotice).toContain("Operational owner drafts and internal notes are not included in the automated learner export");
  expect(privacyNotice).not.toContain("Drafts linked to your account are included in your account-data export");
});

test("the README describes the current visitor and paid-plan contracts", () => {
  expect(readme).toContain("Anonymous discovery: inspect published course outcomes and structure without lesson access");
  expect(readme).toContain("Filosage Plus: two complete private-course credits each month");
  expect(readme).toContain("Filosage Pro: five complete course credits each month");
  expect(readme).not.toContain("Anonymous learning: open discovery, published lessons");
  expect(readme).not.toContain("one active private course");
});

test("pull requests and main are protected by an automatic engineering quality workflow", () => {
  const workflowPath = ".github/workflows/quality-gate.yml";
  expect(existsSync(workflowPath)).toBe(true);
  const workflow = existsSync(workflowPath) ? read(workflowPath) : "";
  expect(workflow).toContain("pull_request:");
  expect(workflow).toContain("push:");
  expect(workflow).toContain("npm run lint");
  expect(workflow).toContain("npx tsc --noEmit --incremental false");
  expect(workflow).toContain("npm run build");
  expect(workflow).toContain("npm audit --audit-level=high");
  expect(workflow).toContain("npm run test:command-center:v2");
  expect(workflow).toContain("npm run test:command-center:v2:ui");
  expect(workflow).toContain("npm run test:shared-evidence:ui");
  expect(workflow).toContain("npm run test:e2e");
  expect(workflow).toContain("NODE_OPTIONS: --max-old-space-size=3072");
  expect(workflow).toContain("actions/upload-artifact@v4");
});
