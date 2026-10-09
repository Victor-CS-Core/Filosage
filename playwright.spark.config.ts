import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import { playwrightServerSettings } from "./tests/fixtures/playwright-server";

const server = playwrightServerSettings(3490);
const testStoreDir = `.filosage-local-test/spark-${server.id}`;
const testDistDir = `.next/playwright-spark-${server.id}`;
const lifecycleDir = resolve(testStoreDir, "server");
process.env.FILOSAGE_SPARK_TEST_STORE_DIR = testStoreDir;

export default defineConfig({
  testDir: "./tests",
  testMatch: "spark-ui.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "line",
  globalTeardown: server.external ? undefined : "./tests/fixtures/playwright-global-teardown.ts",
  metadata: server.external ? {} : { filosagePlaywrightLifecycleDirs: [lifecycleDir] },
  use: {
    baseURL: server.baseURL,
    trace: "retain-on-failure",
    storageState: {
      cookies: [],
      origins: [{ origin: server.baseURL, localStorage: [{ name: "filosage:analytics:consent:v1", value: "declined" }] }],
    },
  },
  projects: [320, 390, 768, 1024].map((width) => ({
    name: `spark-${width}`,
    use: { viewport: { width, height: width <= 390 ? 844 : 900 } },
  })),
  webServer: server.external ? undefined : {
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
      SPARK_ENABLED: "true",
      NEXT_PUBLIC_SPARK_ENABLED: "true",
      SPARK_LIVE_AI_ENABLED: "false",
      SPARK_PREPARE_ENABLED: "false",
      SPARK_SEMANTIC_RETRIEVAL_ENABLED: "false",
    },
  },
});