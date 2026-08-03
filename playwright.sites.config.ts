import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { playwrightServerSettings } from "./tests/fixtures/playwright-server";

const server = playwrightServerSettings(3200);
const lifecycleDir = resolve(`.erudoza-local-test/sites-${server.id}`);

export default defineConfig({
  testDir: "./tests",
  testMatch: "sites-smoke.spec.ts",
  globalTeardown: server.external ? undefined : "./tests/fixtures/playwright-global-teardown.ts",
  metadata: server.external ? {} : { erudozaPlaywrightLifecycleDir: lifecycleDir },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: server.baseURL,
    storageState: {
      cookies: [],
      origins: [{
        origin: server.baseURL,
        localStorage: [{ name: "erudoza:analytics:consent:v1", value: "declined" }],
      }],
    },
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: server.external
    ? undefined
    : {
      // The build is created by `test:smoke:sites`; Vite preview exercises the
      // production Sites worker in the credential-free local Cloudflare runtime.
      command: "node scripts/playwright-sites-server.mjs",
      url: server.baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ERUDOZA_PLAYWRIGHT_LIFECYCLE_DIR: lifecycleDir,
        HOSTNAME: "127.0.0.1",
        PORT: String(server.port),
      },
    },
});
