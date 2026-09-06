import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("durable course operations recover accounting and reject competing owners", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/fixtures/generation-operations-behavior.ts"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "" },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("# fail 0");
});
