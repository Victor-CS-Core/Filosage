import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";

const allProjects = ["chromium", "mobile-chromium", "mobile-webkit"];
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
const dedicatedSuites = new Set([
  "command-center-v2-contract.spec.ts",
  "command-center-v2-ui.spec.ts",
  "shared-evidence-ui.spec.ts",
]);
const testFiles = readdirSync("tests", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts") && !dedicatedSuites.has(entry.name))
  .map((entry) => `tests/${entry.name}`)
  .sort();
const batches = Array.from(
  { length: Math.ceil(testFiles.length / batchSize) },
  (_, index) => testFiles.slice(index * batchSize, (index + 1) * batchSize),
);
const forwardedArgs = process.argv.slice(2);

if (process.env.PLAYWRIGHT_MATRIX_DRY_RUN === "1") {
  process.stdout.write(JSON.stringify({ projects, batches, batchSize }));
  process.exit(0);
}

if (forwardedArgs.some((argument) => argument === "--project" || argument.startsWith("--project="))) {
  console.error("test:e2e owns the browser-project matrix; pass Playwright filters other than --project.");
  process.exit(2);
}

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
for (const project of projects) {
  const projectBatches = forwardedArgs.length > 0 ? [forwardedArgs] : batches;
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
