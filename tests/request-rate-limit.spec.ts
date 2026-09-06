import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("durable request protection ignores forged ingress headers and shares account/global limits", () => {
  const result = spawnSync(process.execPath, ["tests/fixtures/request-rate-limit-behavior.mjs"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("REQUEST_RATE_LIMIT_BEHAVIOR_OK");
});
