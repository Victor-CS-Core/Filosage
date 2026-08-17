import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import { apiSuites, suitePatterns } from "./scripts/playwright-suite-manifest";
import { playwrightServerSettings } from "./tests/fixtures/playwright-server";

const server = playwrightServerSettings(3480);
const testStoreDir = `.filosage-local-test/api-${server.id}`;
const testDistDir = `.next/playwright-api-${server.id}`;
const lifecycleDir = resolve(testStoreDir, "server");

export default defineConfig({
  testDir: "./tests",
  testMatch: suitePatterns(apiSuites),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "line",
  globalTeardown: server.external ? undefined : "./tests/fixtures/playwright-global-teardown.ts",
  metadata: server.external ? {} : { filosagePlaywrightLifecycleDirs: [lifecycleDir] },
  use: {
    baseURL: server.baseURL,
    trace: "on-first-retry",
    storageState: {
      cookies: [],
      origins: [{
        origin: server.baseURL,
        localStorage: [{ name: "filosage:analytics:consent:v1", value: "declined" }],
      }],
    },
  },
  projects: [{ name: "api" }],
  webServer: server.external
    ? undefined
    : {
        command: "node scripts/playwright-next-server.mjs",
        url: server.baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          FILOSAGE_LOCAL_DIR: testStoreDir,
          FILOSAGE_NEXT_DIST_DIR: testDistDir,
          FILOSAGE_PLAYWRIGHT_LIFECYCLE_DIR: lifecycleDir,
          HOSTNAME: "127.0.0.1",
          PORT: String(server.port),
          OPENAI_API_KEY: "",
          COMMAND_CENTER_DRAFTS_ENABLED: "true",
        },
      },
});
