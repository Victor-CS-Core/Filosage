import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { browserSuitesByProject } from "../scripts/playwright-suite-manifest";

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
const releaseDeployment = read("scripts/azure-blue-green.mjs");
const qualityWorkflow = read(".github/workflows/quality-gate.yml");
const fullRegressionWorkflowPath = ".github/workflows/full-regression.yml";
const fullRegressionWorkflow = existsSync(fullRegressionWorkflowPath) ? read(fullRegressionWorkflowPath) : "";
const workflowPaths = readdirSync(".github/workflows")
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => `.github/workflows/${name}`)
  .sort();
const playwrightConfig = read("playwright.config.ts");
const createPage = read("src/app/create/page.tsx");
const createStyles = read("src/app/create/create.module.css");
const marketingStyles = read("src/styles/brand/marketing.css");
const privacyNotice = read("src/app/privacy/page.tsx");
const readme = read("README.md");
const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const matrixRunner = read("scripts/run-playwright-matrix.mjs");
const smokeRunner = read("scripts/run-playwright-smoke.mjs");
const suiteManifest = read("scripts/playwright-suite-manifest.ts");
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");

const discoverBrowserTests = (project: string, extraArgs: string[] = []) => {
  const directory = mkdtempSync(resolve(".browser-discovery-"));
  const outputPath = resolve(directory, "list.txt");
  const output = openSync(outputPath, "wx", 0o600);
  try {
    // A file avoids losing the tail of the CLI's piped stdout at process exit.
    const result = spawnSync(
      process.execPath,
      [playwrightCli, "test", "--config=playwright.config.ts", ...extraArgs, "--list", "--reporter=line"],
      {
        cwd: process.cwd(),
        env: { ...process.env, FILOSAGE_PLAYWRIGHT_PROJECT: project },
        encoding: "utf8", stdio: ["ignore", output, "pipe"], timeout: 60_000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const listing = readFileSync(outputPath, "utf8");
    const match = listing.match(/Total:\s+(\d+)\s+tests?/);
    expect(match, listing).not.toBeNull();
    return Number(match?.[1]);
  } finally {
    closeSync(output);
    rmSync(directory, { recursive: true, force: true });
  }
};

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
  expect(releaseDeployment).toContain('BILLING_ENABLED: "false"');
  expect(releaseDeployment).toContain('BILLING_ROLLOUT_MODE: "closed"');
  expect(releaseDeployment).toContain('check("check-release-safety.mjs", [origin], options)');
  expect(releaseDeployment.indexOf("smoke(candidate);")).toBeLessThan(releaseDeployment.indexOf("const traffic = candidateTraffic(before, revisionName)"));
  expect(stagingWorkflow).toContain("node scripts/azure-blue-green.mjs stage");
});

test("failed promotion restores only the reviewed compatible predecessor from known traffic", () => {
  expect(promotionWorkflow).toContain("if: failure() || cancelled()");
  expect(promotionWorkflow).toContain("node scripts/azure-blue-green.mjs rollback");
  expect(releaseDeployment).toContain('json(path)');
  expect(releaseDeployment).toContain("validateHostedReview(verified.packet, candidate)");
  expect(releaseDeployment).toContain("verify(candidate, true)");
  expect(releaseDeployment).toContain('"--revision-weight", `${candidate.previous.revision}=100`, `${candidate.revision}=0`');
  expect(releaseDeployment).toContain("traffic restoration alone is insufficient");
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
  expect(contractSuites).toHaveLength(39);
  expect(apiSuites).toHaveLength(2);
  expect(singleEngineSuites).toHaveLength(18);
  expect(deviceSensitiveSuites).toHaveLength(8);
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
    batchStrategy: string;
    estimatedLoadsByProject: Record<string, number[]>;
    projects: string[];
    batchesByProject: Record<string, string[][]>;
    batchSize: number;
    runtime: {
      cleanupDistDirectories: string[];
      distNamespace: string;
      reuseCompiledOutput: boolean;
    };
  };
  expect(plan.projects).toEqual(["chromium", "mobile-chromium", "mobile-webkit"]);
  expect(plan.batchStrategy).toBe("estimated-test-load");
  expect(plan.batchSize).toBe(3);
  expect(plan.runtime.reuseCompiledOutput).toBe(true);
  expect(plan.runtime.distNamespace).toMatch(/^matrix-[a-z0-9-]+$/);
  expect(plan.runtime.cleanupDistDirectories).toEqual([
    `.next/playwright-3100-${plan.runtime.distNamespace}`,
    `.next/playwright-3101-${plan.runtime.distNamespace}`,
    `.next/playwright-3102-${plan.runtime.distNamespace}`,
  ]);
  const mobileChromiumLoads = plan.estimatedLoadsByProject["mobile-chromium"];
  expect(Math.max(...mobileChromiumLoads) - Math.min(...mobileChromiumLoads)).toBeLessThanOrEqual(3);
  for (const project of plan.projects) {
    const batches = plan.batchesByProject[project];
    const ownedSuites = browserSuitesByProject[project as keyof typeof browserSuitesByProject];
    // Exact inventory equality catches omitted, duplicated and cross-project suites as ownership grows.
    expect(batches.flat().toSorted()).toEqual([...ownedSuites].toSorted());
    expect(batches).toHaveLength(Math.ceil(ownedSuites.length / plan.batchSize));
    expect(batches.every((batch) => batch.length > 0 && batch.length <= plan.batchSize)).toBe(true);
  }
  expect(plan.batchesByProject["mobile-chromium"].flat()).not.toContain("tests/course-learning-flow.spec.ts");
  expect(plan.batchesByProject["mobile-chromium"].flat()).not.toContain("tests/support-wiki.spec.ts");
  expect(Object.values(plan.batchesByProject).flat(2)).not.toContain("tests/shared-evidence-ui.spec.ts");
  expect(plan.batchesByProject["mobile-chromium"].flat()).not.toContain("tests/marketing-gauntlet.spec.ts");
  expect(plan.batchesByProject["mobile-webkit"].flat()).not.toContain("tests/marketing-gauntlet.spec.ts");
  const desktopBatchContaining = (suite: string) => plan.batchesByProject.chromium.find((batch) => batch.includes(suite));
  expect(desktopBatchContaining("tests/course-learning-flow.spec.ts")).not.toContain("tests/example.spec.ts");
  expect(desktopBatchContaining("tests/auth-linking.spec.ts")).not.toContain("tests/billing-lifecycle.spec.ts");
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
  const reporterOnly = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/run-playwright-matrix.mjs", "--reporter=line"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1", PLAYWRIGHT_MATRIX_PROJECTS: "chromium" },
      encoding: "utf8",
    },
  );
  expect(reporterOnly.status, reporterOnly.stderr).toBe(0);
  const reporterPlan = JSON.parse(reporterOnly.stdout).batchesByProject.chromium as string[][];
  expect(reporterPlan).toHaveLength(9);
  expect(reporterPlan.every((batch) => (
    batch[0] === "--reporter=line" && batch.filter((item) => item.endsWith(".spec.ts")).length <= 3
  ))).toBe(true);
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

test("a reusable Playwright build cache rejects links while exact cleanup removes only the link", async () => {
  const {
    resetPlaywrightOwnedDirectory,
    resolvePlaywrightOwnedDirectory,
  } = await import("../scripts/playwright-owned-directory.mjs");
  const suffix = `${process.pid}-${Date.now()}`;
  const target = `.next/playwright-owned-target-${suffix}`;
  const link = `.next/playwright-owned-link-${suffix}`;
  resetPlaywrightOwnedDirectory(link, ".next");
  resetPlaywrightOwnedDirectory(target, ".next");
  mkdirSync(target, { recursive: true });
  symlinkSync(resolve(target), resolve(link), "junction");
  try {
    expect(() => resolvePlaywrightOwnedDirectory(link, ".next")).toThrow(/link/i);
  } finally {
    resetPlaywrightOwnedDirectory(link, ".next");
    resetPlaywrightOwnedDirectory(target, ".next");
  }
  expect(existsSync(link)).toBe(false);
  expect(existsSync(target)).toBe(false);
});

test("the required quality gate runs a bounded Chromium smoke suite while exhaustive coverage is scheduled separately", () => {
  expect(packageJson.scripts["test:browser:smoke"]).toBe(
    "node --experimental-strip-types scripts/run-playwright-smoke.mjs",
  );
  const smoke = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/run-playwright-smoke.mjs"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "1" },
      encoding: "utf8",
    },
  );
  expect(smoke.status, smoke.stderr).toBe(0);
  const smokePlan = JSON.parse(smoke.stdout) as {
    projects: string[];
    batchesByProject: Record<string, string[][]>;
  };
  expect(smokePlan.projects).toEqual(["chromium"]);
  expect(smokePlan.batchesByProject.chromium).toHaveLength(1);
  expect(smokePlan.batchesByProject.chromium.flat()).toEqual([
    "--grep=@smoke",
    "tests/account-storage-isolation.spec.ts",
    "tests/account-onboarding.spec.ts",
    "tests/analytics-consent.spec.ts",
    "tests/auth-accessibility.spec.ts",
    "tests/auth-linking.spec.ts",
    "tests/billing-lifecycle.spec.ts",
    "tests/command-center.spec.ts",
    "tests/publication-override.spec.ts",
    "tests/release-recovery.spec.ts",
    "tests/support-center.spec.ts",
  ]);
  expect(smokeRunner).toContain('"--grep=@smoke"');
  const smokeTests = discoverBrowserTests("chromium", smokePlan.batchesByProject.chromium.flat());
  expect(smokeTests).toBeGreaterThanOrEqual(14);
  expect(smokeTests).toBeLessThanOrEqual(30);
  expect(qualityWorkflow).toContain("needs: static-and-release-contracts");
  expect(qualityWorkflow).toContain("npm run test:api -- --output=test-results/api --reporter=line,blob");
  expect(qualityWorkflow).toContain("run: npm run test:browser:smoke");
  expect(qualityWorkflow).not.toContain("npm run test:api && npm run test:browser\n");
  expect(existsSync(fullRegressionWorkflowPath)).toBe(true);
  expect(fullRegressionWorkflow).toContain("schedule:");
  expect(fullRegressionWorkflow).toContain("workflow_dispatch:");
  expect(fullRegressionWorkflow).toContain("npm run test:contracts -- tests/tier-consistency-contracts.spec.ts");
  expect(fullRegressionWorkflow).toContain("run: npm run test:api --");
  expect(fullRegressionWorkflow).toContain("run: npm run test:browser\n");
  expect(fullRegressionWorkflow).toContain("npm run test:command-center:v2");
  expect(fullRegressionWorkflow).toContain("npm run test:command-center:v2:ui");
  expect(fullRegressionWorkflow).toContain("npm run test:shared-evidence:ui");
  expect(fullRegressionWorkflow.match(/runs-on:/g)).toHaveLength(1);
});

test("mobile projects execute only explicitly owned cross-device behavior", () => {
  const chromium = discoverBrowserTests("chromium");
  const mobileChromium = discoverBrowserTests("mobile-chromium");
  const mobileWebkit = discoverBrowserTests("mobile-webkit");
  expect(chromium).toBeGreaterThanOrEqual(280);
  expect(mobileChromium).toBeGreaterThan(0);
  expect(mobileChromium).toBeLessThanOrEqual(35);
  expect(mobileWebkit).toBeGreaterThan(0);
  expect(mobileWebkit).toBeLessThanOrEqual(40);
  expect(chromium + mobileChromium + mobileWebkit).toBeLessThanOrEqual(365);
});

test("release workflows accept only exact successful workflow evidence", () => {
  const script = "scripts/check-workflow-run-evidence.mjs";
  const sha = "a".repeat(40);
  const privateSentinel = "workflow-private-input-must-never-appear";
  const evidence = {
    note: privateSentinel,
    total_count: 1,
    workflow_runs: [{
      conclusion: "success",
      head_sha: sha,
      path: ".github/workflows/quality-gate.yml",
      status: "completed",
    }],
  };
  const run = (body: unknown, expectedSha = sha, expectedPath = ".github/workflows/quality-gate.yml") => spawnSync(
    process.execPath,
    [script, expectedSha, expectedPath],
    { cwd: process.cwd(), input: JSON.stringify(body), encoding: "utf8" },
  );
  // Runtime diagnostics are independent of the bounded application output contract.
  const applicationStderr = (stderr: string) => stderr.split("\n").filter((line) => (
    !/^\(node:\d+\) \[UNDICI-EHPA\] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time\.$/.test(line)
    && !/^\(node:\d+\) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set\.$/.test(line)
    && line !== "(Use `node --trace-warnings ...` to show where the warning was created)"
  )).join("\n");
  const accepted = run(evidence);
  expect(accepted.status, accepted.stderr).toBe(0);
  expect(accepted.stdout).toBe("Workflow evidence verified.\n");
  expect(applicationStderr(accepted.stderr)).toBe("");
  expect(accepted.stdout + accepted.stderr).not.toContain(privateSentinel);
  for (const invalid of [
    { ...evidence, workflow_runs: [{ ...evidence.workflow_runs[0], conclusion: "failure" }] },
    { ...evidence, workflow_runs: [{ ...evidence.workflow_runs[0], head_sha: "b".repeat(40) }] },
    { ...evidence, workflow_runs: [{ ...evidence.workflow_runs[0], path: ".github/workflows/other.yml" }] },
    { ...evidence, workflow_runs: [] },
    { workflow_runs: "invalid" },
  ]) {
    const rejected = run(invalid);
    expect(rejected.status).toBe(1);
    expect(applicationStderr(rejected.stderr)).toBe("Required workflow evidence is unavailable.\n");
    expect(rejected.stdout).toBe("");
    expect(rejected.stdout + rejected.stderr).not.toContain(privateSentinel);
  }
  const oversized = run({ workflow_runs: [{ note: "x".repeat(70_000) }] });
  expect(oversized.status).toBe(1);
  expect(applicationStderr(oversized.stderr)).toBe("Required workflow evidence is unavailable.\n");
  expect(oversized.stdout).toBe("");
  expect(releaseDeployment).toContain("result.head_sha !== sha");
  expect(releaseDeployment).toContain("result.conclusion !== \"success\"");
  expect(releaseDeployment).toContain(".github/workflows/full-regression.yml");
  expect(stagingWorkflow).not.toContain("- run: npm ci");
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

test("course creation announces observed stages and preserves visible keyboard focus", () => {
  expect(createPage).toContain('role="status" aria-live="polite" aria-atomic="true">{generationStage}');
  expect(createPage).not.toContain('aria-valuenow={generationProgress}');
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
  const workflow = existsSync(workflowPath) ? qualityWorkflow : "";
  expect(workflow).toContain("pull_request:");
  expect(workflow).toContain("push:");
  expect(workflow).toContain("npm run lint");
  expect(workflow).toContain("npx tsc --noEmit --incremental false");
  expect(workflow).toContain("npm run build");
  expect(workflow).toContain("npm audit --audit-level=high");
  expect(workflow).toContain("npm run test:contracts");
  expect(workflow).toContain("run: npm run test:api --");
  expect(workflow).toContain("run: npm run test:browser:smoke");
  expect(workflow).toContain("NODE_OPTIONS: --max-old-space-size=3072");
  expect(workflow).toContain("actions/upload-artifact@");
  expect(fullRegressionWorkflow).toContain("npm run test:command-center:v2");
  expect(fullRegressionWorkflow).toContain("npm run test:command-center:v2:ui");
  expect(fullRegressionWorkflow).toContain("npm run test:shared-evidence:ui");
  expect(fullRegressionWorkflow).toContain("run: npm run test:api --");
  expect(fullRegressionWorkflow).toContain("run: npm run test:browser\n");
});

test("release automation pins third-party actions and includes dependency and code security gates", () => {
  expect(workflowPaths.length).toBeGreaterThan(0);
  for (const path of workflowPaths) {
    const workflow = read(path);
    expect(workflow, `${path} must declare least-privilege permissions`).toMatch(/^permissions:\s*\n/m);
    for (const line of workflow.split(/\r?\n/)) {
      const reference = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#\s*(v[^\s]+))?\s*$/);
      if (!reference || reference[1].startsWith("./")) continue;
      expect(reference[1], `${path}: ${line.trim()}`).toMatch(/^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)*@[a-f0-9]{40}$/);
      expect(reference[2], `${path}: pinned actions retain a readable release comment`).toMatch(/^v\d/);
    }
  }

  expect(existsSync(".github/dependabot.yml")).toBe(true);
  const dependabot = read(".github/dependabot.yml");
  expect(dependabot).toContain('package-ecosystem: "npm"');
  expect(dependabot).toContain('package-ecosystem: "github-actions"');
  expect(dependabot.match(/open-pull-requests-limit:/g)).toHaveLength(2);

  expect(existsSync(".github/workflows/codeql.yml")).toBe(true);
  const codeql = existsSync(".github/workflows/codeql.yml") ? read(".github/workflows/codeql.yml") : "";
  expect(codeql).toContain("security-events: write");
  expect(codeql).toContain("github/codeql-action/init@");
  expect(codeql).toContain("github/codeql-action/analyze@");
  expect(codeql).not.toContain("id-token: write");

  expect(packageJson.scripts["check:secrets"]).toBe("node scripts/check-tracked-secrets.mjs");
  expect(qualityWorkflow).toContain("npm audit --omit=dev --audit-level=high");
  expect(qualityWorkflow).toContain("npm audit --audit-level=high");
  expect(qualityWorkflow).toContain("npm run check:secrets");
});

test("browser batches retain failures, retries, skips and distinct merged evidence", () => {
  test.setTimeout(120_000);
  const fixture = mkdtempSync(resolve(".matrix-fixture-"));
  const runId = `evidence-${process.pid}-${Date.now()}`;
  const evidenceDirectory = resolve(fixture, "playwright-report", `matrix-${runId}`);
  const fixtureSuites = ["failure", "retry", "skip", "pass-a", "pass-b", "pass-c", "pass-d"]
    .map((name) => `tests/${name}.spec.ts`);
  try {
    mkdirSync(`${fixture}/tests`);
    mkdirSync(`${fixture}/scripts`);
    symlinkSync(resolve("node_modules"), `${fixture}/node_modules`, "dir");
    writeFileSync(`${fixture}/package.json`, '{"type":"module"}');
    writeFileSync(`${fixture}/scripts/run-playwright-matrix.mjs`, matrixRunner);
    writeFileSync(`${fixture}/scripts/playwright-owned-directory.mjs`, read("scripts/playwright-owned-directory.mjs"));
    // Exercise the real runner with a fixed inventory, independent of new product suites and load estimates.
    writeFileSync(`${fixture}/scripts/playwright-suite-manifest.ts`, `
      export { classifyPlaywrightSuiteArguments, suiteSelectorMatches } from ${JSON.stringify(new URL("../scripts/playwright-suite-manifest.ts", import.meta.url).href)};
      export const browserSuitesByProject = { chromium: ${JSON.stringify(fixtureSuites)} };
      export const browserSuiteEstimatedTestLoad = {};
    `);
    writeFileSync(`${fixture}/playwright.config.ts`, `export default {
      testDir: './tests', retries: 1, workers: 1,
      projects: [{ name: 'chromium' }],
    };`);
    for (const suite of fixtureSuites) {
      const name = suite.slice("tests/".length);
      const behavior = name === "failure.spec.ts"
        ? 'expect(false, "retained permanent failure").toBe(true);'
        : name === "retry.spec.ts"
          ? 'expect(testInfo.retry, "retained first attempt").toBe(1);'
          : name === "skip.spec.ts"
            ? 'test.skip(true, "intentional fixture skip reason");'
            : 'expect(true).toBe(true);';
      writeFileSync(`${fixture}/tests/${name}`, `import { test, expect } from '@playwright/test';
        test('${name}', async ({}, testInfo) => { ${behavior} });`);
    }
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types", "scripts/run-playwright-matrix.mjs",
    ], {
      cwd: fixture, encoding: "utf8", timeout: 110_000,
      env: { ...process.env, PLAYWRIGHT_MATRIX_PROJECTS: "chromium", PLAYWRIGHT_MATRIX_RUN_ID: runId },
    });
    expect(result.status, result.stderr).toBe(1);
    expect(existsSync(`${evidenceDirectory}/batches.json`), result.stdout).toBe(true);
    const outcomes = JSON.parse(read(`${evidenceDirectory}/batches.json`)) as {
      batches: Array<{ status: string; resultsDirectory: string; blobDirectory: string }>;
      mergeExitCode: number;
    };
    expect(outcomes.batches).toHaveLength(3);
    expect(outcomes.batches.every((batch) => ["passed", "failed"].includes(batch.status))).toBe(true);
    expect(outcomes.batches.filter((batch) => batch.status === "failed")).toHaveLength(1);
    expect(outcomes.batches[0].status).toBe("failed");
    expect(outcomes.batches.slice(1).every((batch) => batch.status === "passed")).toBe(true);
    expect(new Set(outcomes.batches.map((batch) => batch.resultsDirectory)).size).toBe(3);
    expect(new Set(outcomes.batches.map((batch) => batch.blobDirectory)).size).toBe(3);
    for (const batch of outcomes.batches) {
      expect(readdirSync(batch.blobDirectory).filter((file) => file.endsWith(".zip"))).toHaveLength(1);
    }
    expect(outcomes.mergeExitCode).toBe(0);
    const mergedText = read(`${evidenceDirectory}/merged/results.json`);
    const merged = JSON.parse(mergedText) as { stats: { unexpected: number; flaky: number; skipped: number; expected: number } };
    expect(merged.stats).toMatchObject({ unexpected: 1, flaky: 1, skipped: 1, expected: 4 });
    for (const suite of fixtureSuites) expect(mergedText).toContain(suite.slice("tests/".length));
    expect(mergedText).toContain("retained permanent failure");
    expect(mergedText).toContain("retained first attempt");
    expect(mergedText).toContain("intentional fixture skip reason");
    expect(existsSync(`${evidenceDirectory}/merged/index.html`)).toBe(true);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    expect(existsSync(fixture), "The completed fixture must remove only its own temporary tree.").toBe(false);
  }
});

test("list-only browser discovery preserves retained evidence and keeps JSON on stdout", () => {
  const fixture = mkdtempSync(resolve(".matrix-list-fixture-"));
  try {
    mkdirSync(`${fixture}/tests`);
    mkdirSync(`${fixture}/playwright-report/retained`, { recursive: true });
    symlinkSync(resolve("scripts"), `${fixture}/scripts`, "dir");
    symlinkSync(resolve("node_modules"), `${fixture}/node_modules`, "dir");
    writeFileSync(`${fixture}/package.json`, '{"type":"module"}');
    writeFileSync(`${fixture}/playwright.config.ts`, `export default {
      testDir: './tests', reporter: 'html', projects: [{ name: 'chromium' }],
    };`);
    writeFileSync(`${fixture}/tests/example.spec.ts`, `import { test } from '@playwright/test';
      test('discover without running', () => { throw new Error('must never execute'); });`);
    const sentinel = `${fixture}/playwright-report/retained/existing-evidence.txt`;
    writeFileSync(sentinel, "retained previous failure");
    for (const reporterArgs of [[], ["--reporter=json"], ["--reporter", "json"], ["--reporter=html"]]) {
      const result = spawnSync(process.execPath, [
        "--experimental-strip-types", "scripts/run-playwright-matrix.mjs", "--list",
        "tests/example.spec.ts", ...reporterArgs,
      ], {
        cwd: fixture, encoding: "utf8", timeout: 15_000,
        env: {
          ...process.env, PLAYWRIGHT_MATRIX_PROJECTS: "chromium",
          PLAYWRIGHT_JSON_OUTPUT_NAME: `${fixture}/redirected-json.json`,
          PLAYWRIGHT_JSON_OUTPUT_DIR: fixture,
          PLAYWRIGHT_JSON_OUTPUT_FILE: reporterArgs.includes("json") ? `${fixture}/redirected-file.json` : undefined,
          PLAYWRIGHT_HTML_OPEN: "never",
        },
      });
      expect(result.status, result.stderr).toBe(reporterArgs.includes("--reporter=html") ? 2 : 0);
      expect(existsSync(sentinel), result.stdout).toBe(true);
      expect(read(sentinel)).toBe("retained previous failure");
      expect(existsSync(`${fixture}/playwright-report/index.html`)).toBe(false);
      expect(existsSync(`${fixture}/redirected-json.json`)).toBe(false);
      expect(existsSync(`${fixture}/redirected-file.json`)).toBe(false);
      if (reporterArgs.join(" ").includes("json")) expect(result.stdout).toContain('"suites"');
      if (reporterArgs.includes("--reporter=html")) expect(result.stderr).toContain("stdout-only reporters");
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
