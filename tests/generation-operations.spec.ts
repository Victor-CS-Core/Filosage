import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("durable course operations recover accounting and reject competing owners", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--test", "--test-reporter=tap", "tests/fixtures/generation-operations-behavior.ts"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "" },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("# fail 0");
});

test("generic AI products fail closed across pre-checkpoint and legacy post-product crashes", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--test", "--test-reporter=tap", "tests/fixtures/generic-ai-product-recovery-behavior.ts"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "", OPENAI_API_KEY: "" },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("# fail 0");
  expect(result.stdout).toContain("# pass 14");
});

test("generic AI routes recover every provider, checkpoint, accounting, product, and response kill point", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--experimental-test-module-mocks", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/fixtures/generic-ai-route-recovery-behavior.ts"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 60_000,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "", OPENAI_API_KEY: "" },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("# fail 0");
  expect(result.stdout).toContain("# pass 34");
});
