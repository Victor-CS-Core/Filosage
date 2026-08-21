import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const discoverSpecs = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return discoverSpecs(path);
    return entry.isFile() && path.endsWith(".spec.ts") ? [path] : [];
  });

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
const suiteManifest = read("scripts/playwright-suite-manifest.ts");

test("the app trusts Easy Auth headers only when the platform auth resource is configured", () => {
  expect(azureBicep).toContain(
    "var directGoogleConfigured = directGoogleAuthEnabled && !empty(googleClientId) && !empty(googleClientSecret)",
  );
  expect(azureBicep).toContain(
    "var externalIdConfigurationComplete = !empty(externalIdClientId) && !empty(externalIdClientSecret) && !empty(externalIdIssuer) && !empty(externalIdWellKnownConfiguration)",
  );
  expect(azureBicep).toContain(
    "var easyAuthConfigured = directGoogleConfigured || externalIdConfigurationComplete",
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
  expect(stagingWorkflow).toContain("properties.latestRevisionFqdn");
  expect(stagingWorkflow).toContain("steps.deploy_revision.outputs.revision");
  expect(stagingWorkflow).toContain("steps.deploy_revision.outputs.revision_url");
  expect(stagingWorkflow).toContain('npm run check:release-safety -- "${{ steps.deploy_revision.outputs.revision_url }}"');
  expect(stagingWorkflow).not.toContain("properties.template.containers[0].env[?name=='BILLING_ENABLED'].value");
  expect(stagingWorkflow.indexOf("Verify the deployed release safety policy")).toBeLessThan(
    stagingWorkflow.indexOf("Assign verified revision label"),
  );
});

test("promotion restores the previous traffic weights when verification fails or is cancelled", () => {
  expect(promotionWorkflow).toContain("Verify the deployed release safety policy");
  expect(promotionWorkflow).toContain("TARGET_REVISION=");
  expect(promotionWorkflow).toContain("properties.configuration.ingress.traffic");
  expect(promotionWorkflow).toContain('npm run check:release-safety -- "$TARGET_URL"');
  expect(promotionWorkflow).not.toContain("properties.template.containers[0].env[?name=='BILLING_ENABLED'].value");
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
  expect(playwrightConfig).toContain("dedicatedSuites");
  expect(playwrightConfig).toContain("contractSuites");
  expect(playwrightConfig).toContain("apiSuites");
  expect(suiteManifest).toContain("command-center-v2-contract.spec.ts");
  expect(suiteManifest).toContain("command-center-v2-ui.spec.ts");
  expect(suiteManifest).toContain("shared-evidence-ui.spec.ts");
  expect(playwrightConfig).toContain("workers: 1");
  expect(playwrightConfig).not.toContain("workers: process.env.CI ? 1 : 2");
});

test("every Playwright spec belongs to exactly one execution lane", async () => {
  const manifestPath = "scripts/playwright-suite-manifest.ts";
  expect(existsSync(manifestPath)).toBe(true);
  const {
    apiSuites,
    contractSuites,
    dedicatedSuites,
    deviceSensitiveSuites,
    singleEngineSuites,
  } = await import("../scripts/playwright-suite-manifest.ts");
  const categorized = [
    ...apiSuites,
    ...contractSuites,
    ...dedicatedSuites,
    ...deviceSensitiveSuites,
    ...singleEngineSuites,
  ];
  const discovered = discoverSpecs("tests").sort();

  expect(new Set(categorized).size).toBe(categorized.length);
  expect(categorized.toSorted()).toEqual(discovered);
  expect(contractSuites).toHaveLength(28);
  expect(apiSuites).toHaveLength(2);
  expect(singleEngineSuites).toHaveLength(11);
  expect(deviceSensitiveSuites).toHaveLength(13);
  expect(dedicatedSuites).toHaveLength(3);
});

test("keeps separate-value Playwright grep options out of suite routing", async () => {
  const { classifyPlaywrightSuiteArguments } = await import("../scripts/playwright-suite-manifest.ts");
  expect(classifyPlaywrightSuiteArguments(["-G", "marketing-gauntlet.spec.ts", "--list"])).toEqual({
    invalidSelectors: [],
    optionArgs: ["-G", "marketing-gauntlet.spec.ts", "--list"],
    selectors: [],
  });
});

test("the browser matrix starts only one isolated Next server at a time", () => {
  expect(packageJson.scripts["test:e2e"]).toBe(
    "node --experimental-strip-types scripts/run-playwright-suites.mjs",
  );
  expect(packageJson.scripts["test:contracts"]).toBe("playwright test --config=playwright.contracts.config.ts");
  expect(packageJson.scripts["test:api"]).toBe("playwright test --config=playwright.api.config.ts");
  expect(packageJson.scripts["test:browser"]).toBe("node --experimental-strip-types scripts/run-playwright-matrix.mjs");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/run-playwright-matrix.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "" },
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  const plan = JSON.parse(result.stdout) as {
    projects: string[];
    batchesByProject: Record<string, string[][]>;
    batchSize: number;
  };
  expect(plan.projects).toEqual(["chromium", "mobile-chromium", "mobile-webkit"]);
  expect(plan.batchSize).toBe(3);
  expect(Object.values(plan.batchesByProject).flat(2)).toHaveLength(50);
  expect(plan.batchesByProject.chromium.flat()).toHaveLength(24);
  expect(plan.batchesByProject["mobile-chromium"].flat()).toHaveLength(13);
  expect(plan.batchesByProject["mobile-webkit"].flat()).toHaveLength(13);
  expect(Object.values(plan.batchesByProject).flat(2)).not.toContain("tests/shared-evidence-ui.spec.ts");
  expect(plan.batchesByProject["mobile-chromium"].flat()).not.toContain("tests/marketing-gauntlet.spec.ts");
  expect(plan.batchesByProject["mobile-webkit"].flat()).not.toContain("tests/marketing-gauntlet.spec.ts");
  const basenameOnly = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/run-playwright-matrix.mjs", "marketing-gauntlet.spec.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "" },
      encoding: "utf8",
    },
  );
  expect(basenameOnly.status, basenameOnly.stderr).toBe(0);
  const basenamePlan = JSON.parse(basenameOnly.stdout).batchesByProject as Record<string, string[][]>;
  expect(basenamePlan.chromium.flat()).toEqual(["marketing-gauntlet.spec.ts"]);
  expect(basenamePlan["mobile-chromium"].flat()).toEqual([]);
  expect(basenamePlan["mobile-webkit"].flat()).toEqual([]);
  const unknownFile = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/run-playwright-matrix.mjs", "tests/not-a-suite.spec.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "" },
      encoding: "utf8",
    },
  );
  expect(unknownFile.status).toBe(2);
  expect(unknownFile.stderr).toContain("No browser suite owns");
  const incompatibleProject = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/run-playwright-matrix.mjs", "marketing-gauntlet.spec.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "mobile-webkit" },
      encoding: "utf8",
    },
  );
  expect(incompatibleProject.status).toBe(2);
  expect(incompatibleProject.stderr).toContain("No selected browser project owns");
  for (const malformed of ["marketing-gauntlet.spec.tsjunk", "marketing-gauntlet.spec.ts:abc"]) {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/run-playwright-matrix.mjs", malformed],
      {
        cwd: process.cwd(),
        env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "" },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid Playwright suite selector");
  }
  const grepOnly = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "scripts/run-playwright-matrix.mjs",
      "--grep=marketing-gauntlet.spec.ts",
      "--list",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "" },
      encoding: "utf8",
    },
  );
  expect(grepOnly.status, grepOnly.stderr).toBe(0);
  const grepPlan = JSON.parse(grepOnly.stdout).batchesByProject as Record<string, string[][]>;
  expect(grepPlan.chromium).toHaveLength(1);
  expect(grepPlan["mobile-chromium"]).toEqual([]);
  expect(grepPlan["mobile-webkit"]).toEqual([]);
  const webkitOnly = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/run-playwright-matrix.mjs"], {
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

test("the umbrella runner routes file filters to exactly one execution lane", () => {
  const runner = "scripts/run-playwright-suites.mjs";
  expect(existsSync(runner)).toBe(true);

  const contractsOnly = spawnSync(
    process.execPath,
    ["--experimental-strip-types", runner, "tests/release-hardening.spec.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_SUITES_DRY_RUN: "1" },
      encoding: "utf8",
    },
  );
  expect(contractsOnly.status, contractsOnly.stderr).toBe(0);
  expect(JSON.parse(contractsOnly.stdout)).toEqual({
    lanes: [{ name: "contracts", args: ["tests/release-hardening.spec.ts"] }],
  });

  const basenameOnly = spawnSync(
    process.execPath,
    ["--experimental-strip-types", runner, "release-hardening.spec.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_SUITES_DRY_RUN: "1" },
      encoding: "utf8",
    },
  );
  expect(basenameOnly.status, basenameOnly.stderr).toBe(0);
  expect(JSON.parse(basenameOnly.stdout)).toEqual({
    lanes: [{ name: "contracts", args: ["release-hardening.spec.ts"] }],
  });

  const filteredList = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      runner,
      "--grep=marketing-gauntlet.spec.ts",
      "--list",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  expect(filteredList.status, filteredList.stderr).toBe(0);
  expect(filteredList.stdout).toContain("=== Playwright lane: browser ===");
  expect(filteredList.stdout).not.toContain("=== Playwright lane: contracts ===");
  expect(filteredList.stdout).toContain("marketing-gauntlet.spec.ts");

  const malformed = spawnSync(
    process.execPath,
    ["--experimental-strip-types", runner, "marketing-gauntlet.spec.tsjunk"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_SUITES_DRY_RUN: "1" },
      encoding: "utf8",
    },
  );
  expect(malformed.status).toBe(2);
  expect(malformed.stderr).toContain("Invalid Playwright suite selector");

  const bogusPrefix = spawnSync(
    process.execPath,
    ["--experimental-strip-types", runner, "bogus/tests/release-hardening.spec.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_SUITES_DRY_RUN: "1" },
      encoding: "utf8",
    },
  );
  expect(bogusPrefix.status).toBe(2);
  expect(bogusPrefix.stderr).toContain("No Playwright execution lane owns");

  const unknown = spawnSync(
    process.execPath,
    ["--experimental-strip-types", runner, "tests/not-a-suite.spec.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_SUITES_DRY_RUN: "1" },
      encoding: "utf8",
    },
  );
  expect(unknown.status).toBe(2);
  expect(unknown.stderr).toContain("No Playwright execution lane owns");
});

test("the contract lane executes process-level release checks instead of skipping them", () => {
  const releaseScripts = read("tests/release-scripts.spec.ts");
  expect(releaseScripts).not.toContain('test.skip(testInfo.project.name !== "chromium"');
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
  expect(readme).toContain("Anonymous discovery: inspect published outcomes, modules, lesson titles, assessment structure, and source status; lesson bodies and learner work remain account-bound");
  expect(readme).toContain("Filosage Plus: two monthly course credits with rollover up to twenty-four");
  expect(readme).toContain("Filosage Pro: five monthly course credits with rollover up to sixty");
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
  expect(workflow).toContain("npm run test:contracts");
  expect(workflow).toContain("npm run test:api && npm run test:browser");
  expect(workflow).toContain("NODE_OPTIONS: --max-old-space-size=3072");
  expect(workflow).toContain("actions/upload-artifact@v4");
});
