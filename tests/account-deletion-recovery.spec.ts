import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("account deletion rejects a paused real mastery route after removing the account", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx",
    "tests/fixtures/account-deletion-recovery-behavior.mjs",
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("ACCOUNT_DELETION_RECOVERY_BEHAVIOR_OK");
});

test("deletion stages, concurrent request scopes, inventory limits, billing and asset recovery execute against the real local store", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx",
    "tests/fixtures/account-lifecycle-behavior.mjs",
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("ACCOUNT_LIFECYCLE_BEHAVIOR_OK");
});

test("expired banner attempts cannot recreate remote data after deletion completes", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx",
    "tests/fixtures/banner-deletion-race.mjs",
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("BANNER_DELETION_RACE_OK");
});
