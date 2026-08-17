import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { playwrightServerSettings } from "./tests/fixtures/playwright-server";

// Owned runs get fixed loopback ports plus isolated Next build/lock files and
// local-mode stores per browser project. External mode starts and deletes nothing.
const server = playwrightServerSettings();
const projectServer = (offset: number) => {
  if (server.external) return server;
  const port = server.port + offset;
  if (port > 65_535) {
    throw new Error(`PLAYWRIGHT_PORT must leave room for three project servers; received ${server.port}.`);
  }
  return { ...server, port, id: String(port), baseURL: `http://127.0.0.1:${port}` };
};
const ownedProjects = [
  { name: "chromium", server: projectServer(0), device: devices["Desktop Chrome"] },
  { name: "mobile-chromium", server: projectServer(1), device: devices["Pixel 7"] },
  { name: "mobile-webkit", server: projectServer(2), device: devices["iPhone 13"] },
].map((project) => {
  const testStoreDir = `.filosage-local-test/${project.server.id}`;
  return {
    ...project,
    testStoreDir,
    testDistDir: `.next/playwright-${project.server.id}`,
    lifecycleDir: resolve(testStoreDir, "server"),
  };
});

const browserState = (baseURL: string) => ({
  baseURL,
  storageState: {
    cookies: [],
    origins: [{
      origin: baseURL,
      localStorage: [{ name: "filosage:analytics:consent:v1", value: "declined" }],
    }],
  },
});

export default defineConfig({
  testDir: "./tests",
  // These suites own seeded servers and run through their dedicated configs.
  testIgnore: [
    "**/command-center-v2-contract.spec.ts",
    "**/command-center-v2-ui.spec.ts",
    "**/shared-evidence-ui.spec.ts",
  ],
  globalTeardown: server.external ? undefined : "./tests/fixtures/playwright-global-teardown.ts",
  metadata: server.external
    ? {}
    : { filosagePlaywrightLifecycleDirs: ownedProjects.map((project) => project.lifecycleDir) },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  use: {
    trace: "on-first-retry",
  },
  projects: ownedProjects.map((project) => ({
    name: project.name,
    use: { ...project.device, ...browserState(project.server.baseURL) },
  })),
  webServer: server.external
    ? undefined
    : ownedProjects.map((project) => ({
      // The test-only custom server avoids Next CLI's forked Windows process;
      // global teardown asks this exact owned process to close before the
      // Playwright web-server plugin performs its final cleanup.
      command: "node scripts/playwright-next-server.mjs",
      url: project.server.baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        FILOSAGE_LOCAL_DIR: project.testStoreDir,
        FILOSAGE_NEXT_DIST_DIR: project.testDistDir,
        FILOSAGE_PLAYWRIGHT_LIFECYCLE_DIR: project.lifecycleDir,
        HOSTNAME: "127.0.0.1",
        PORT: String(project.server.port),
        OPENAI_API_KEY: "",
        COMMAND_CENTER_DRAFTS_ENABLED: "true",
      },
    })),
});
