import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { playwrightServerSettings } from "./tests/fixtures/playwright-server";

const server = playwrightServerSettings(3400);
if (server.external) {
  throw new Error("The Command Center v2 contract suite owns and seeds its local server; PLAYWRIGHT_EXTERNAL_SERVER is not supported.");
}
if (server.port === 65_535) {
  throw new Error("PLAYWRIGHT_PORT must leave the following port available for the isolated founder fixture server.");
}

const testStoreDir = `.filosage-local-test/command-center-v2-${server.id}`;
const testDistDir = `.next/playwright-command-center-v2-${server.id}`;
const lifecycleDir = resolve(testStoreDir, "server");
const founderPort = server.port + 1;
const founderBaseURL = `http://127.0.0.1:${founderPort}`;
const founderStoreDir = `.filosage-local-test/command-center-v2-founder-${founderPort}`;
const founderDistDir = `.next/playwright-command-center-v2-founder-${founderPort}`;
const founderLifecycleDir = resolve(founderStoreDir, "server");

export default defineConfig({
  testDir: "./tests",
  testMatch: "command-center-v2-contract.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "line",
  globalTeardown: "./tests/fixtures/playwright-global-teardown.ts",
  metadata: {
    commandCenterV2FounderBaseURL: founderBaseURL,
    filosagePlaywrightLifecycleDirs: [lifecycleDir, founderLifecycleDir],
  },
  use: {
    ...devices["Desktop Chrome"],
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
  projects: [{ name: "command-center-v2-chromium" }],
  webServer: [
    {
      command: "node scripts/playwright-next-server.mjs",
      url: server.baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        FILOSAGE_LOCAL_DIR: testStoreDir,
        FILOSAGE_NEXT_DIST_DIR: testDistDir,
        FILOSAGE_PLAYWRIGHT_LIFECYCLE_DIR: lifecycleDir,
        FILOSAGE_PLAYWRIGHT_SEED: "command-center-v2-contract",
        HOSTNAME: "127.0.0.1",
        PORT: String(server.port),
        OPENAI_API_KEY: "",
        COMMAND_CENTER_DRAFTS_ENABLED: "true",
      },
    },
    {
      command: "node scripts/playwright-next-server.mjs",
      url: founderBaseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        FILOSAGE_LOCAL_DIR: founderStoreDir,
        FILOSAGE_NEXT_DIST_DIR: founderDistDir,
        FILOSAGE_PLAYWRIGHT_LIFECYCLE_DIR: founderLifecycleDir,
        FILOSAGE_PLAYWRIGHT_SEED: "command-center-v2-founder",
        HOSTNAME: "127.0.0.1",
        PORT: String(founderPort),
        OPENAI_API_KEY: "",
        COMMAND_CENTER_DRAFTS_ENABLED: "true",
      },
    },
  ],
});
