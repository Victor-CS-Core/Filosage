import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  browserSuiteEstimatedTestLoad,
  browserSuitesByProject,
  classifyPlaywrightSuiteArguments,
  suiteSelectorMatches,
} from "./playwright-suite-manifest.ts";
import { resetPlaywrightOwnedDirectory } from "./playwright-owned-directory.mjs";

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
const batchStrategy = "estimated-test-load";
const requestedRunId = process.env.PLAYWRIGHT_MATRIX_RUN_ID?.trim();
if (requestedRunId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedRunId)) {
  console.error(`Invalid PLAYWRIGHT_MATRIX_RUN_ID: ${JSON.stringify(requestedRunId)}`);
  process.exit(2);
}
const generatedRunId = `${process.pid.toString(36)}-${Date.now().toString(36)}`;
const distNamespace = `matrix-${requestedRunId ?? generatedRunId}`;
const basePort = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
if (!Number.isInteger(basePort) || basePort < 1 || basePort + allProjects.length - 1 > 65_535) {
  console.error(`PLAYWRIGHT_PORT must leave room for three project servers; received ${JSON.stringify(process.env.PLAYWRIGHT_PORT)}.`);
  process.exit(2);
}
const cleanupDistDirectories = projects.map((project) => {
  const projectOffset = allProjects.indexOf(project);
  return `.next/playwright-${basePort + projectOffset}-${distNamespace}`;
});
const runtime = { cleanupDistDirectories, distNamespace, reuseCompiledOutput: true };
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
const estimatedLoadFor = (project, file) => browserSuiteEstimatedTestLoad[project]?.[file] ?? 1;
const batchesFor = (project, projectFiles) => {
  const indexedFiles = projectFiles.map((file, index) => ({
    file,
    index,
    load: estimatedLoadFor(project, file),
  }));
  const batches = Array.from(
    { length: Math.ceil(projectFiles.length / batchSize) },
    () => ({ files: [], load: 0 }),
  );
  for (const entry of indexedFiles.toSorted((left, right) => right.load - left.load || left.index - right.index)) {
    const target = batches
      .map((batch, index) => ({ batch, index }))
      .filter(({ batch }) => batch.files.length < batchSize)
      .toSorted((left, right) => left.batch.load - right.batch.load || left.index - right.index)[0].batch;
    target.files.push(entry);
    target.load += entry.load;
  }
  return batches.map(({ files }) => files.toSorted((left, right) => left.index - right.index).map(({ file }) => file));
};
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
    return [project, batchesFor(project, projectFiles)];
  }
  if (requestedFiles.length === 0) {
    if (!hasTestFilter) {
      return [project, batchesFor(project, projectFiles).map((batch) => [...optionArgs, ...batch])];
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
const estimatedLoadsByProject = Object.fromEntries(projects.map((project) => [
  project,
  batchesByProject[project].map((batch) => batch.reduce((total, item) => {
    const suite = browserSuitesByProject[project].find((candidate) => suiteSelectorMatches(item, candidate));
    return total + (suite ? estimatedLoadFor(project, suite) : 0);
  }, 0)),
]));

if (process.env.PLAYWRIGHT_MATRIX_DRY_RUN === "1") {
  process.stdout.write(JSON.stringify({ batchStrategy, estimatedLoadsByProject, projects, batchesByProject, batchSize, runtime }));
  process.exit(0);
}

if (forwardedArgs.length > 0 && requestedFiles.length === 0 && Object.values(batchesByProject).flat().length === 0) {
  console.error("No Playwright tests matched the provided browser filters.");
  process.exit(2);
}
// Each invocation owns its evidence; later batches must never erase earlier failures.
const listOnly = optionArgs.includes("--list");
let listReporter = "line";
if (listOnly) {
  const stdoutReporters = new Set(["line", "list", "dot", "json", "null"]);
  for (let index = 0; index < optionArgs.length; index += 1) {
    const argument = optionArgs[index];
    if (argument === "--reporter" || argument.startsWith("--reporter=")) {
      const requested = argument === "--reporter" ? optionArgs[++index] : argument.slice("--reporter=".length);
      if (!requested || requested.split(",").some((reporter) => !stdoutReporters.has(reporter))) {
        console.error("List-only discovery accepts stdout-only reporters: line, list, dot, json, null.");
        process.exit(2);
      }
      listReporter = requested;
    }
  }
}
const evidenceDirectory = resolve("playwright-report", distNamespace);
const mergedBlobDirectory = resolve(evidenceDirectory, "blobs");
const mergedDirectory = resolve(evidenceDirectory, "merged");
const outcomes = {
  runId: distNamespace,
  projects,
  skippedProjects: projects.filter((project) => batchesByProject[project].length === 0)
    .map((project) => ({ project, reason: "No selected suites belong to this project." })),
  batches: projects.flatMap((project) => batchesByProject[project].map((args, index) => ({
    project,
    batch: index + 1,
    args,
    status: "pending",
    exitCode: null,
    resultsDirectory: resolve("test-results", distNamespace, project, `batch-${index + 1}`),
    blobDirectory: resolve(evidenceDirectory, project, `batch-${index + 1}`, "blob"),
    htmlDirectory: resolve(evidenceDirectory, project, `batch-${index + 1}`, "html"),
  }))),
  mergeExitCode: null,
};
const writeOutcomes = () => {
  if (!listOnly) writeFileSync(resolve(evidenceDirectory, "batches.json"), `${JSON.stringify(outcomes, null, 2)}\n`);
};
if (!listOnly) {
  mkdirSync(resolve("playwright-report"), { recursive: true });
  // An explicit run ID must not silently mix with evidence from an earlier invocation.
  mkdirSync(evidenceDirectory);
  mkdirSync(mergedBlobDirectory);
  writeOutcomes();
}
let matrixExitCode = 0;
try {
  for (const outcome of outcomes.batches) {
    const { project, batch, args } = outcome;
    console.log(`\n=== Playwright project: ${project}; batch ${batch}/${batchesByProject[project].length} ===`);
    outcome.status = "running";
    writeOutcomes();
    const result = spawnSync(
      process.execPath,
      [playwrightCli, "test", `--project=${project}`, ...args, ...(!listOnly ? [
        `--output=${outcome.resultsDirectory}`, "--reporter=line,blob,html",
      ] : [`--reporter=${listReporter}`])],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FILOSAGE_PLAYWRIGHT_DIST_NAMESPACE: distNamespace,
          FILOSAGE_PLAYWRIGHT_PROJECT: project,
          FILOSAGE_PLAYWRIGHT_REUSE_DIST: "1",
          ...(!listOnly ? {
            PLAYWRIGHT_BLOB_OUTPUT_DIR: outcome.blobDirectory,
            PLAYWRIGHT_BLOB_OUTPUT_FILE: undefined,
            PLAYWRIGHT_HTML_OUTPUT_DIR: outcome.htmlDirectory,
            PLAYWRIGHT_HTML_OPEN: "never",
          } : {
            // JSON list callers must also stay on stdout even when a parent sets report paths.
            PLAYWRIGHT_JSON_OUTPUT_NAME: undefined,
            PLAYWRIGHT_JSON_OUTPUT_DIR: undefined,
            PLAYWRIGHT_JSON_OUTPUT_FILE: undefined,
          }),
        },
        stdio: "inherit",
      },
    );
    outcome.exitCode = result.status ?? 1;
    outcome.status = result.error ? "could-not-start" : outcome.exitCode === 0 ? "passed" : "failed";
    if (result.error) console.error(result.error.message);
    if (outcome.exitCode !== 0 && matrixExitCode === 0) matrixExitCode = outcome.exitCode;
    if (!listOnly) {
      // Blob reporter clears its own directory, so collect from isolated batch directories.
      let blobs = [];
      try { blobs = readdirSync(outcome.blobDirectory).filter((file) => file.endsWith(".zip")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      for (const [index, file] of blobs.entries()) {
        copyFileSync(resolve(outcome.blobDirectory, file), resolve(mergedBlobDirectory, `${project}-${batch}-${index}.zip`));
      }
      if (blobs.length === 0) {
        outcome.status = "missing-evidence";
        if (matrixExitCode === 0) matrixExitCode = 1;
      }
    }
    writeOutcomes();
  }
} finally {
  if (!listOnly && readdirSync(mergedBlobDirectory).length > 0) {
    const merge = spawnSync(process.execPath, [playwrightCli, "merge-reports", "--reporter=html,json", mergedBlobDirectory], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_HTML_OUTPUT_DIR: mergedDirectory,
        PLAYWRIGHT_HTML_OPEN: "never",
        PLAYWRIGHT_JSON_OUTPUT_NAME: resolve(mergedDirectory, "results.json"),
      },
      stdio: "inherit",
    });
    outcomes.mergeExitCode = merge.status ?? 1;
    if (merge.error) console.error(merge.error.message);
    if (outcomes.mergeExitCode !== 0 && matrixExitCode === 0) matrixExitCode = outcomes.mergeExitCode;
    writeOutcomes();
  }
  for (const directory of cleanupDistDirectories) {
    resetPlaywrightOwnedDirectory(directory, ".next");
  }
}
if (matrixExitCode !== 0) process.exit(matrixExitCode);
