import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { validatePostgresTestUrl } from "./fixture.ts";

test("PostgreSQL fixtures accept only an explicit literal-loopback designated test database", () => {
  for (const url of [
    "postgresql://filosage_test:test@127.0.0.1:5432/filosage_integration_test",
    "postgres://filosage_test:test@[::1]:5432/filosage_integration_test",
  ]) assert.equal(validatePostgresTestUrl(url), url);
});

test("PostgreSQL fixture target rejection is bounded and never echoes connection credentials", () => {
  for (const value of [
    undefined, "", "not-a-url",
    "postgresql://filosage_test:private-value@production.example:5432/filosage_integration_test",
    "postgresql://filosage_test:private-value@127.0.0.1:5432/production",
    "postgresql://filosage_test:private-value@localhost:5432/filosage_integration_test",
    "postgresql://filosage_test:private-value@127.0.0.1:5432/filosage_integration_test?host=production.example",
    "postgresql://filosage_test:private-value@127.0.0.1:5432/filosage_integration_test?options=-csearch_path=production",
    "postgresql://filosage_test:private-value@127.0.0.1:5432/filosage_integration_test#production",
    "https://filosage_test:private-value@127.0.0.1:5432/filosage_integration_test",
    "postgresql://production:private-value@127.0.0.1:5432/filosage_integration_test",
    "postgresql://filosage_test:private-value@127.0.0.1/filosage_integration_test",
    "postgresql://filosage_test@127.0.0.1:5432/filosage_integration_test",
  ]) {
    assert.throws(() => validatePostgresTestUrl(value), {
      message: "FILOSAGE_POSTGRES_TEST_URL must explicitly use the filosage_test role, a loopback IP and port, and the filosage_integration_test database without URL options.",
    });
  }
});


test("PostgreSQL fixtures never fall back to the application's general DATABASE_URL", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e",
    'import { createPostgresFixture } from "./tests/postgres/fixture.ts"; await createPostgresFixture();',
  ], {
    cwd: process.cwd(), encoding: "utf8", timeout: 5_000,
    env: { ...process.env, FILOSAGE_POSTGRES_TEST_URL: undefined, DATABASE_URL: "postgresql://never-use-this-private-value@production.example/production" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FILOSAGE_POSTGRES_TEST_URL must explicitly/);
  assert.doesNotMatch(result.stdout + result.stderr, /never-use-this-private-value|ECONNREFUSED|ENOTFOUND/);
});
