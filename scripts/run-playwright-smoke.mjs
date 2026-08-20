import { spawnSync } from "node:child_process";
import { smokeBrowserSuites } from "./playwright-suite-manifest.ts";

const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "scripts/run-playwright-matrix.mjs",
    ...smokeBrowserSuites,
    "--grep=@smoke",
    ...process.argv.slice(2),
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_MATRIX_PROJECTS: "chromium" },
    stdio: "inherit",
  },
);

if (result.error) {
  process.stderr.write("The Chromium smoke suite could not start.\n");
  process.exit(1);
}
process.exit(result.status ?? 1);
