import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

test("support capability matches intake while durable private history remains usable", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/fixtures/support-availability-behavior.mjs"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 60_000,
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("SUPPORT_AVAILABILITY_BEHAVIOR_OK");
});
