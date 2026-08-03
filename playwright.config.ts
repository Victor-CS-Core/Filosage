import { rmSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Tests get their own port and their own throwaway local-mode store so they
// never reuse (or pollute) a dev server the developer is actively browsing.
const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;
const testStoreDir = ".erudoza-local-test";
if (process.env.PLAYWRIGHT_EXTERNAL_SERVER !== "1") {
  rmSync(testStoreDir, { recursive: true, force: true });
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1"
    ? undefined
    : {
      // Launch Next directly so Playwright owns the actual server process.
      // npm.cmd leaves a Windows child process alive after the tests finish,
      // which prevents release runs from returning a final pass/fail result.
      command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      env: { ERUDOZA_LOCAL_DIR: testStoreDir },
    },
});
