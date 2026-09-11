import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureDiagnostics, summarizeFixtureTests, summarizeScan } from "../../scripts/semgrep-report.mjs";

const contract = {
  version: "1.177.0", ruleIds: ["filosage-request-sql-injection"],
  targets: ["src", "scripts", ".github/workflows"],
};
const clean = () => ({
  version: "1.177.0", results: [], errors: [], skipped_rules: [],
  paths: { scanned: ["src/app/api/example/route.ts", "scripts/example.mjs", ".github/workflows/example.yml"] },
});
const finding = () => ({
  check_id: "filosage-request-sql-injection", path: "src/app/api/example/route.ts",
  start: { line: 7, col: 2 }, end: { line: 7, col: 44 },
  extra: { severity: "ERROR", message: "PRIVATE SOURCE", lines: "PRIVATE SOURCE", metadata: { private: "PRIVATE SOURCE" } },
});

test("fixture success requires every expected detector to run", () => {
  assert.equal(summarizeFixtureTests("6/6: ✓ All tests passed\nNo tests for fixes found.\n", 0, 6), 6);
  for (const [output, exit] of [["", 0], ["0/0: ✓ All tests passed\n", 0], ["5/5: ✓ All tests passed\n", 0],
    ["5/6: 1 unit tests did not pass\n", 1], ["6/6: ✓ All tests passed\n", 2]]) {
    assert.throws(() => summarizeFixtureTests(output, exit, 6), /fixture/);
  }
});

test("fixture-only diagnostics are bounded plain text, never terminal controls", () => {
  const diagnostic = fixtureDiagnostics(`synthetic fixture\n${String.fromCharCode(0, 27)}\t${"x".repeat(20_000)}`);
  assert.equal(diagnostic.length, 8_192);
  assert.ok(diagnostic.startsWith("synthetic fixture\n\t"));
  assert.ok([...diagnostic].every((character) => character.charCodeAt(0) >= 32 || "\n\t".includes(character)));
});

test("a valid clean scan must cover every configured source target", () => {
  assert.deepEqual(summarizeScan(clean(), 0, contract), {
    status: "passed", scannerVersion: "1.177.0", scannedFiles: 3,
    coverage: { src: 1, scripts: 1, ".github/workflows": 1 }, findings: [],
  });
  for (const scanned of [[], ["src/only.ts"], ["elsewhere/file.ts"]]) {
    assert.throws(() => summarizeScan({ ...clean(), paths: { scanned } }, 0, contract), /coverage/);
  }
});

test("a finding fails the gate and only its rule and source location enter the report", () => {
  const result = summarizeScan({ ...clean(), results: [finding()] }, 1, contract);
  assert.equal(result.status, "findings");
  assert.deepEqual(result.findings, [{ ruleId: "filosage-request-sql-injection", path: "src/app/api/example/route.ts", line: 7, column: 2 }]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE SOURCE|metadata|lines|message/);
});

test("scanner failures, partial scans and contradictory exit statuses cannot become clean results", () => {
  for (const code of [null, 2, 3, 7, 124]) assert.throws(() => summarizeScan(clean(), code, contract), /exit/);
  assert.throws(() => summarizeScan(clean(), 1, contract), /exit/);
  assert.throws(() => summarizeScan({ ...clean(), results: [finding()] }, 0, contract), /exit/);
  for (const errors of [[{ message: "private parser contents" }], undefined, {}]) {
    assert.throws(() => summarizeScan({ ...clean(), errors }, 0, contract), /incomplete/);
  }
  assert.throws(() => summarizeScan({ ...clean(), skipped_rules: [{}] }, 0, contract), /incomplete/);
  assert.throws(() => summarizeScan({ ...clean(), version: "different" }, 0, contract), /version/);
});

test("malformed results, unexpected rules and unsafe paths are rejected without echoing their contents", () => {
  for (const raw of [null, {}, { ...clean(), results: null }]) assert.throws(() => summarizeScan(raw, 0, contract));
  for (const path of ["../private", "/private", "src/../private", "src/secret\nvalue", "C:\\private"]) {
    assert.throws(() => summarizeScan({ ...clean(), results: [{ ...finding(), path }] }, 1, contract), /location/);
  }
  assert.throws(() => summarizeScan({ ...clean(), results: [{ ...finding(), check_id: "private-rule-content" }] }, 1, contract), /rule/);
  assert.throws(() => summarizeScan({ ...clean(), results: [{ ...finding(), start: { line: 0, col: 1 } }] }, 1, contract), /location/);
});
