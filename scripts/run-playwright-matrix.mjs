import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  browserSuitesByProject,
  classifyPlaywrightSuiteArguments,
  suiteSelectorMatches,
} from "./playwright-suite-manifest.ts";

const allProjects = Object.keys(browserSuitesByProject);
const requestedProjects = process.env.PLAYWRIGHT_MATRIX_PROJECTS
  ?.split(",")
  .map((project) => project.trim())
  .filter(Boolean);
const projects = requestedProjects?.length ? requestedProjects : allProjects;
const unknownProjects = projects.filter((project) => !allProjects.includes(project));
if (unknownProjects.length > 0) {
  console.error(`Unknown PLAYWRIGHT_MATRIX_PROJECTS: ${unknownProjects.join(", ")}`);
  process.exit(2);
}
const batchSize = 3;
const forwardedArgs = process.argv.slice(2);
if (forwardedArgs.some((argument) => argument === "--project" || argument.startsWith("--project="))) {
  console.error("test:e2e owns the browser-project matrix; pass Playwright filters other than --project.");
  process.exit(2);
}
const {
  invalidSelectors,
  optionArgs,
  selectors: requestedSelectors,
} = classifyPlaywrightSuiteArguments(forwardedArgs);
if (invalidSelectors.length > 0) {
  console.error(`Invalid Playwright suite selector: ${invalidSelectors.join(", ")}`);
  process.exit(2);
}
const requestedFiles = requestedSelectors.map(({ path }) => path);
const allBrowserSuites = Object.values(browserSuitesByProject).flat();
const unknownSelectors = requestedSelectors.filter(({ path }) => (
  !allBrowserSuites.some((suite) => suiteSelectorMatches(path, suite))
));
if (unknownSelectors.length > 0) {
  console.error(`No browser suite owns: ${unknownSelectors.map(({ argument }) => argument).join(", ")}`);
  process.exit(2);
}
const unownedBySelectedProjects = requestedSelectors.filter(({ path }) => (
  !projects.some((project) => browserSuitesByProject[project].some((suite) => suiteSelectorMatches(path, suite)))
));
if (unownedBySelectedProjects.length > 0) {
  console.error(
    `No selected browser project owns: ${unownedBySelectedProjects.map(({ argument }) => argument).join(", ")}`,
  );
  process.exit(2);
}
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const batchesFor = (projectFiles) => Array.from(
  { length: Math.ceil(projectFiles.length / batchSize) },
  (_, index) => projectFiles.slice(index * batchSize, (index + 1) * batchSize),
);
const hasTestFilter = optionArgs.some((argument) => (
  argument === "--grep"
  || argument === "-g"
  || argument === "--grep-invert"
  || argument === "-G"
  || argument.startsWith("--grep=")
  || argument.startsWith("--grep-invert=")
  || argument === "--last-failed"
  || argument === "--only-changed"
  || argument.startsWith("--only-changed=")
));
const projectHasMatches = (project, args) => {
  const discoveryArgs = [
    playwrightCli,
    "test",
    `--project=${project}`,
    ...args,
    ...(args.includes("--list") ? [] : ["--list"]),
    "--pass-with-no-tests",
    "--reporter=line",
  ];
  const result = spawnSync(process.execPath, discoveryArgs, {
    cwd: process.cwd(),
    env: { ...process.env, FILOSAGE_PLAYWRIGHT_PROJECT: project },
    encoding: "utf8",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  const totals = [...(result.stdout ?? "").matchAll(/Total:\s+(\d+)\s+tests?/g)];
  if (totals.length === 0) {
    console.error(`Unable to discover filtered Playwright tests for project ${project}.`);
    process.exit(2);
  }
  return totals.some((match) => Number(match[1]) > 0);
};
const batchesByProject = Object.fromEntries(projects.map((project) => {
  const projectFiles = browserSuitesByProject[project];
  if (forwardedArgs.length === 0) {
    return [project, batchesFor(projectFiles)];
  }
  if (requestedFiles.length === 0) {
    if (!hasTestFilter) {
      return [project, batchesFor(projectFiles).map((batch) => [...optionArgs, ...batch])];
    }
    return [project, projectHasMatches(project, forwardedArgs) ? [forwardedArgs] : []];
  }
  const projectSelectors = requestedSelectors.filter(({ path }) => (
    projectFiles.some((suite) => suiteSelectorMatches(path, suite))
  ));
  return [
    project,
    projectSelectors.length > 0
      ? [[...optionArgs, ...projectSelectors.map(({ argument }) => argument)]]
      : [],
  ];
}));

if (process.env.PLAYWRIGHT_MATRIX_DRY_RUN === "1") {
  process.stdout.write(JSON.stringify({ projects, batchesByProject, batchSize }));
  process.exit(0);
}

if (forwardedArgs.length > 0 && requestedFiles.length === 0 && Object.values(batchesByProject).flat().length === 0) {
  console.error("No Playwright tests matched the provided browser filters.");
  process.exit(2);
}
for (const project of projects) {
  const projectBatches = batchesByProject[project];
  for (const [index, batch] of projectBatches.entries()) {
    console.log(`\n=== Playwright project: ${project}; batch ${index + 1}/${projectBatches.length} ===`);
    const result = spawnSync(
      process.execPath,
      [playwrightCli, "test", `--project=${project}`, ...batch],
      {
        cwd: process.cwd(),
        env: { ...process.env, FILOSAGE_PLAYWRIGHT_PROJECT: project },
        stdio: "inherit",
      },
    );
    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}
