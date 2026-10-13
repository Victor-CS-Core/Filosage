import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function runFixture(fixture: string, marker: string) {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx",
    fixture,
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 110_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(marker));
}

test("successful course deletion refunds once; retries and concurrent duplicates cannot double-refund", { timeout: 120_000 }, () => {
  // Real DELETE route + real local store. See
  // tests/fixtures/course-credit-refund-behavior.mjs.
  runFixture("tests/fixtures/course-credit-refund-behavior.mjs", "COURSE_CREDIT_REFUND_BEHAVIOR_OK");
});

test("failed deletion preserves the credit and an interrupted refund recovers exactly once", { timeout: 120_000 }, () => {
  // deleteCourse stubbed to fail before commit; the durable refund intent
  // then drives recovery once the course is actually gone. See
  // tests/fixtures/course-credit-refund-recovery-behavior.mjs.
  runFixture("tests/fixtures/course-credit-refund-recovery-behavior.mjs", "COURSE_CREDIT_REFUND_RECOVERY_OK");
});

test("monthly-cap refusal settles the intent without minting a refund", { timeout: 120_000 }, () => {
  // Real DELETE route with the month's refunds already at the cap. See
  // tests/fixtures/course-credit-refund-limits-behavior.mjs.
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx",
    "tests/fixtures/course-credit-refund-limits-behavior.mjs", "monthly-cap",
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 110_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /COURSE_CREDIT_MONTHLY_CAP_OK/);
});

test("delayed settlement is judged by the intent recordedAt, not settlement time", { timeout: 120_000 }, () => {
  // Intent recorded 20h after redemption; recovery runs 50h after
  // redemption and still refunds, while the no-intent control is refused
  // as outside_window. See
  // tests/fixtures/course-credit-refund-limits-behavior.mjs.
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx",
    "tests/fixtures/course-credit-refund-limits-behavior.mjs", "recorded-at-window",
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 110_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /COURSE_CREDIT_RECORDED_AT_WINDOW_OK/);
});
