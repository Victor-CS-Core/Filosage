import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();
const releaseScript = resolve(root, "scripts/check-release-env.mjs");
const healthScript = resolve(root, "scripts/check-production-health.mjs");

const validReleaseEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SITE_URL: "https://release.example",
  FIREBASE_PROJECT_ID: "erudoza-release",
  FIREBASE_CLIENT_EMAIL: "release-check@erudoza-release.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "release-check-placeholder",
  NEXT_PUBLIC_FIREBASE_API_KEY: "release-check-placeholder",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "erudoza-release.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "erudoza-release",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "erudoza-release.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:release-check",
  OPENAI_API_KEY: "release-check-placeholder",
  OWNER_EMAIL: "owner@release.example",
  ACTIVITY_RECEIPT_SECRET: "x".repeat(32),
  SITE_VERSION: "a".repeat(40),
  BILLING_ENABLED: "false",
};

test("release checks bind Firebase and production health to one full Git SHA", ({ request }, testInfo) => {
  void request;
  test.skip(testInfo.project.name !== "chromium", "One process-level release contract is sufficient.");

  const valid = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: validReleaseEnvironment,
    encoding: "utf8",
  });
  expect(valid.status, valid.stderr).toBe(0);
  expect(valid.stdout).toContain("Closed-billing release environment looks complete");

  const mismatchedProject = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "another-project" },
    encoding: "utf8",
  });
  expect(mismatchedProject.status).toBe(1);
  expect(mismatchedProject.stderr).toContain("FIREBASE_PROJECT_ID must match NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  const shortVersion = spawnSync(process.execPath, [releaseScript], {
    cwd: root,
    env: { ...validReleaseEnvironment, SITE_VERSION: "abcdef0" },
    encoding: "utf8",
  });
  expect(shortVersion.status).toBe(1);
  expect(shortVersion.stderr).toContain("full 40-character Git commit SHA");

  const missingExpectedVersion = spawnSync(process.execPath, [healthScript, "https://release.example"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(missingExpectedVersion.status).toBe(1);
  expect(missingExpectedVersion.stderr).toContain("Provide the exact deployed Git commit SHA");

  const abbreviatedExpectedVersion = spawnSync(process.execPath, [healthScript, "https://release.example", "abcdef0"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });
  expect(abbreviatedExpectedVersion.status).toBe(1);
  expect(abbreviatedExpectedVersion.stderr).toContain("full 40-character Git commit SHA");
});

test("pins the Sites compatibility date below the nodejs_compat rejection boundary", ({ request }, testInfo) => {
  void request;
  test.skip(testInfo.project.name !== "chromium", "One deployment metadata contract is sufficient.");

  const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");
  const packagePreparation = readFileSync(resolve(root, "scripts/prepare-sites-package.mjs"), "utf8");
  expect(viteConfig).toContain('const sitesProductionCompatibilityDate = "2026-08-03"');
  expect(viteConfig).not.toContain('const sitesProductionCompatibilityDate = "2026-08-04"');
  expect(viteConfig).toContain('assetFileNames: "assets/[name]-[hash].[ext]"');
  expect(viteConfig).not.toContain('"assets/app.css"');
  expect(viteConfig).toContain('"@/lib/local-store": workerSafeLocalStorePath');
  expect(packagePreparation).toContain("delete wranglerConfig.compatibility_flags");
  expect(packagePreparation).toContain('const nodeCompatibilityFlag = ["nodejs", "compat"].join("_")');
});
