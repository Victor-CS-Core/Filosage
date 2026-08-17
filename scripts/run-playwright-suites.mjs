import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  apiSuites,
  classifyPlaywrightSuiteArguments,
  contractSuites,
  dedicatedSuiteConfigs,
  deviceSensitiveSuites,
  singleEngineSuites,
  suiteSelectorMatches,
} from "./playwright-suite-manifest.ts";

const browserSuites = [...deviceSensitiveSuites, ...singleEngineSuites];
const baseLanes = [
  { name: "contracts", suites: contractSuites, config: "playwright.contracts.config.ts" },
  { name: "api", suites: apiSuites, config: "playwright.api.config.ts" },
  { name: "browser", suites: browserSuites },
];
const dedicatedLanes = Object.entries(dedicatedSuiteConfigs).map(([suite, config]) => ({
  name: suite.slice("tests/".length, -".spec.ts".length),
  suites: [suite],
  config,
}));
const lanes = [...baseLanes, ...dedicatedLanes];
const forwardedArgs = process.argv.slice(2);

if (forwardedArgs.some((argument) => argument === "--project" || argument.startsWith("--project="))) {
  console.error("test:e2e owns the browser-project matrix; pass Playwright filters other than --project.");
  process.exit(2);
}

const { invalidSelectors, optionArgs, selectors } = classifyPlaywrightSuiteArguments(forwardedArgs);
if (invalidSelectors.length > 0) {
  console.error(`Invalid Playwright suite selector: ${invalidSelectors.join(", ")}`);
  process.exit(2);
}

const ownerFor = (requested) => lanes.find((lane) => lane.suites.some((suite) => (
  suiteSelectorMatches(requested, suite)
)));
const unknownSelectors = selectors.filter(({ path }) => !ownerFor(path));
if (unknownSelectors.length > 0) {
  console.error(`No Playwright execution lane owns: ${unknownSelectors.map(({ argument }) => argument).join(", ")}`);
  process.exit(2);
}

const unfilteredPlan = baseLanes.map(({ name }) => ({ name, args: forwardedArgs }));
const fileFilteredPlan = lanes.flatMap(({ name, suites }) => {
  const laneSelectors = selectors
    .filter(({ path }) => suites.some((suite) => suiteSelectorMatches(path, suite)))
    .map(({ argument }) => argument);
  return laneSelectors.length > 0 ? [{ name, args: [...optionArgs, ...laneSelectors] }] : [];
});

if (process.env.PLAYWRIGHT_SUITES_DRY_RUN === "1") {
  process.stdout.write(JSON.stringify({ lanes: selectors.length > 0 ? fileFilteredPlan : unfilteredPlan }));
  process.exit(0);
}

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const commandFor = (name, args) => {
  const lane = lanes.find((candidate) => candidate.name === name);
  if (!lane) throw new Error(`Unknown Playwright execution lane: ${name}`);
  return name === "browser"
    ? ["--experimental-strip-types", "scripts/run-playwright-matrix.mjs", ...args]
    : [playwrightCli, "test", `--config=${lane.config}`, ...args];
};
const invoke = (name, args, capture = false) => {
  const result = spawnSync(process.execPath, commandFor(name, args), {
    cwd: process.cwd(),
    env: process.env,
    ...(capture ? { encoding: "utf8" } : { stdio: "inherit" }),
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  return result;
};
const laneHasMatches = (name, args) => {
  const discoveryArgs = [
    ...args,
    ...(args.includes("--list") ? [] : ["--list"]),
    "--pass-with-no-tests",
    "--reporter=line",
  ];
  const result = invoke(name, discoveryArgs, true);
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  const totals = [...(result.stdout ?? "").matchAll(/Total:\s+(\d+)\s+tests?/g)];
  if (totals.length === 0) {
    console.error(`Unable to discover filtered Playwright tests for lane ${name}.`);
    process.exit(2);
  }
  return totals.some((match) => Number(match[1]) > 0);
};

const plan = selectors.length > 0
  ? fileFilteredPlan
  : forwardedArgs.length === 0
    ? unfilteredPlan
    : unfilteredPlan.filter(({ name, args }) => laneHasMatches(name, args));
if (plan.length === 0) {
  console.error("No Playwright tests matched the provided filters.");
  process.exit(2);
}

for (const lane of plan) {
  console.log(`\n=== Playwright lane: ${lane.name} ===`);
  const result = invoke(lane.name, lane.args);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
