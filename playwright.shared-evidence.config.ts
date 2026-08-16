import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { playwrightServerSettings } from "./tests/fixtures/playwright-server";

const server = playwrightServerSettings(3440);
if (server.external) {
  throw new Error("The shared-evidence UI suite owns its seeded local server; PLAYWRIGHT_EXTERNAL_SERVER is not supported.");
}

const testStoreDir = `.filosage-local-test/shared-evidence-${server.id}`;
const testDistDir = `.next/playwright-shared-evidence-${server.id}`;
const lifecycleDir = resolve(testStoreDir, "server");

export default defineConfig({
  testDir: "./tests",
  testMatch: "shared-evidence-ui.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "line",
  globalTeardown: "./tests/fixtures/playwright-global-teardown.ts",
  metadata: { filosagePlaywrightLifecycleDirs: [lifecycleDir] },
  use: {
    baseURL: server.baseURL,
    trace: "retain-on-failure",
    storageState: {
      cookies: [],
      origins: [{
        origin: server.baseURL,
        localStorage: [{ name: "filosage:analytics:consent:v1", value: "declined" }],
      }],
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: "node scripts/playwright-next-server.mjs",
    url: server.baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      FILOSAGE_LOCAL_DIR: testStoreDir,
      FILOSAGE_NEXT_DIST_DIR: testDistDir,
      FILOSAGE_PLAYWRIGHT_LIFECYCLE_DIR: lifecycleDir,
      FILOSAGE_PLAYWRIGHT_SEED: "shared-evidence",
      HOSTNAME: "127.0.0.1",
      PORT: String(server.port),
      OPENAI_API_KEY: "",
    },
  },
});
