import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fixtureDiagnostics, scanDiagnostics, summarizeFixtureTests, summarizeScan } from "../../scripts/semgrep-report.mjs";

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

test("incomplete scans preserve only known error types and verified input locations without becoming successful", () => {
  const raw = { ...clean(), results: [finding()], errors: [
    { type: "Syntax error", path: "scripts/example.mjs", message: "PRIVATE SOURCE",
      spans: [{ file: "scripts/example.mjs", start: { line: 12, col: 5 }, source_hash: "PRIVATE SOURCE" }] },
    { type: ["PartialParsing", [{ path: "src/app/api/example/route.ts", start: { line: 8, col: 1 }, message: "PRIVATE SOURCE" }]],
      long_msg: "PRIVATE SOURCE", rule_id: "PRIVATE SOURCE" },
  ] };
  const diagnostic = scanDiagnostics(raw, contract, clean().paths.scanned);
  assert.deepEqual(diagnostic, {
    errorCount: 2, errors: [
      { type: "Syntax error", locations: [{ path: "scripts/example.mjs", line: 12 }] },
      { type: "PartialParsing", locations: [{ path: "src/app/api/example/route.ts", line: 8 }] },
    ],
    findingCount: 1, findings: [{ ruleId: "filosage-request-sql-injection", path: "src/app/api/example/route.ts", line: 7, column: 2 }],
    truncated: false,
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE SOURCE|message|source_hash|long_msg/);
  assert.throws(() => summarizeScan(raw, 1, contract), /incomplete/);
});

test("incomplete diagnostics redact malformed, unknown and private paths even if the scanner calls them scanned", () => {
  const privatePaths = ["/private", "C:\\private", "src/../private", "src/private\nvalue", "src/untracked-private.ts", ".env.local"];
  const raw = { ...clean(), paths: { scanned: privatePaths }, errors: [null,
    { type: "PRIVATE SOURCE", path: "scripts/example.mjs" },
    ...privatePaths.map((path) => ({ type: "Timeout", path, spans: [{ file: path, start: { line: 1 } }] })),
    { type: "Syntax error", spans: [{ file: "scripts/example.mjs", start: { line: "PRIVATE SOURCE" } }] },
  ], results: [null, { ...finding(), check_id: "PRIVATE SOURCE" }, ...privatePaths.map((path) => ({ ...finding(), path })),
    { ...finding(), start: { line: 0, col: 1 } }] };
  const diagnostic = scanDiagnostics(raw, contract, clean().paths.scanned);
  assert.equal(diagnostic.errors[0].type, "Unknown scanner error");
  assert.equal(diagnostic.errors[1].type, "Unknown scanner error");
  assert.deepEqual(diagnostic.errors.at(-1), { type: "Syntax error", locations: [{ path: "scripts/example.mjs" }] });
  assert.deepEqual(diagnostic.findings, []);
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE SOURCE|private|untracked|\.env/);
  assert.throws(() => summarizeScan(raw, 1, contract), /incomplete/);
  for (const invalid of [null, {}, { errors: "PRIVATE SOURCE", results: {} }]) {
    assert.deepEqual(scanDiagnostics(invalid, contract, []), { errorCount: null, errors: [], findingCount: null, findings: [], truncated: false });
  }
});

test("incomplete diagnostics cap retained errors, locations and findings while keeping total counts", () => {
  const raw = { ...clean(), errors: Array.from({ length: 200 }, () => ({ type: "Timeout", path: "scripts/example.mjs" })),
    results: Array.from({ length: 200 }, finding) };
  const diagnostic = scanDiagnostics(raw, contract, clean().paths.scanned);
  assert.equal(diagnostic.errorCount, 200);
  assert.equal(diagnostic.findingCount, 200);
  assert.equal(diagnostic.errors.length, 20);
  assert.equal(diagnostic.findings.length, 20);
  assert.equal(diagnostic.truncated, true);
  const manyLocations = scanDiagnostics({ ...clean(), errors: [{ type: "Syntax error",
    spans: Array.from({ length: 10 }, (_, index) => ({ file: "scripts/example.mjs", start: { line: index + 1 } })) }] }, contract, clean().paths.scanned);
  assert.deepEqual(manyLocations.errors[0].locations, [
    { path: "scripts/example.mjs", line: 1 }, { path: "scripts/example.mjs", line: 2 }, { path: "scripts/example.mjs", line: 3 },
  ]);
  assert.equal(manyLocations.truncated, true);
});

test("the capability-free scanner writes private reports as the invoking host identity", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "filosage-scanner-runner-test-"));
  const bin = join(sandbox, "bin");
  const sourceSha = "a".repeat(40);
  mkdirSync(bin);
  // A caller may place TMPDIR inside this ESM repository. Keep the fake CLI
  // executables in their own CommonJS package regardless of ancestor metadata.
  writeFileSync(join(sandbox, "package.json"), JSON.stringify({ type: "commonjs" }));
  const fakeGit = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "rev-parse") { process.stdout.write("${sourceSha}\\n"); process.exit(0); }
if (args[0] === "ls-files") {
  const targets = args.slice(args.indexOf("--") + 1);
  const files = targets.includes("security/semgrep/probe")
    ? ["security/semgrep/probe/unsafe.ts"]
    : ["src/example.ts", "scripts/example.mjs", ".github/workflows/example.yml"];
  process.stdout.write(files.join("\\0") + "\\0");
  process.exit(0);
}
process.exit(2);
`;
  const fakeDocker = `#!/usr/bin/env node
const { mkdirSync, statSync, writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "pull") process.exit(0);
if (args[0] !== "run") process.exit(2);
const expectedUser = process.getuid() + ":" + process.getgid();
const userIndex = args.indexOf("--user");
if (userIndex < 0 || args[userIndex + 1] !== expectedUser) process.exit(2);
if (!args.includes("none") || !args.includes("ALL") || !args.includes("no-new-privileges")) process.exit(2);
if (!args.some((value) => value.startsWith("type=bind,src=") && value.endsWith(",dst=/src,readonly"))) process.exit(2);
const mount = args.find((value) => value.startsWith("type=bind,src=") && value.endsWith(",dst=/out"));
if (!mount) process.exit(2);
const outputDirectory = mount.slice("type=bind,src=".length, -",dst=/out".length);
if ((statSync(outputDirectory).mode & 0o777) !== 0o700) process.exit(2);
const environments = args.flatMap((value, index) => value === "--env" ? [args[index + 1]] : []);
if (!environments.includes("HOME=/out")) process.exit(2);
mkdirSync(join(outputDirectory, ".cache"), { recursive: true });
if (args.includes("--version")) { process.stdout.write("1.177.0\\n"); process.exit(0); }
if (args.includes("--test")) { process.stdout.write("6/6: ✓ All tests passed\\n"); process.exit(0); }
const outputIndex = args.indexOf("--json-output");
if (outputIndex < 0) process.exit(2);
const outputName = basename(args[outputIndex + 1]);
const probe = outputName === "probe.json";
const paths = probe
  ? ["security/semgrep/probe/unsafe.ts"]
  : ["src/example.ts", "scripts/example.mjs", ".github/workflows/example.yml"];
const results = probe ? [{
  check_id: "filosage-request-sql-injection",
  path: paths[0],
  start: { line: 1, col: 1 },
}] : [];
writeFileSync(join(outputDirectory, outputName), JSON.stringify({
  version: "1.177.0", results, errors: [], skipped_rules: [], paths: { scanned: paths },
}));
process.exit(probe ? 1 : 0);
`;
  writeFileSync(join(bin, "git"), fakeGit, { mode: 0o755 });
  writeFileSync(join(bin, "docker"), fakeDocker, { mode: 0o755 });
  chmodSync(join(bin, "git"), 0o755);
  chmodSync(join(bin, "docker"), 0o755);
  try {
    const result = spawnSync(process.execPath, [resolve("scripts/run-security-scan.mjs")], {
      cwd: sandbox,
      encoding: "utf8",
      env: { ...process.env, EXPECTED_RELEASE_SHA: sourceSha, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const summary = JSON.parse(readFileSync(join(sandbox, "test-results/security/summary.json"), "utf8"));
    assert.equal(summary.status, "passed");
    assert.equal(summary.fixtureTests, "passed");
    assert.equal(summary.syntheticFailure, "passed");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
