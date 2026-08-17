import { defineConfig } from "@playwright/test";
import { contractSuites, suitePatterns } from "./scripts/playwright-suite-manifest";

export default defineConfig({
  testDir: "./tests",
  testMatch: suitePatterns(contractSuites),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: "line",
  projects: [{ name: "contracts" }],
});
