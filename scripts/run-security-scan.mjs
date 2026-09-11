import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fixtureDiagnostics, scanDiagnostics, summarizeFixtureTests, summarizeScan } from "./semgrep-report.mjs";

const root = process.cwd();
const output = resolve("test-results/security");
const temporary = mkdtempSync(join(tmpdir(), "filosage-semgrep-"));
const manifest = JSON.parse(readFileSync(new URL("../security/semgrep/manifest.json", import.meta.url), "utf8"));
const privacyFlags = ["--oss-only", "--metrics=off", "--disable-version-check", "--disable-nosem", "--no-rewrite-rule-ids"];
const evidence = { schemaVersion: 1, status: "failed", sourceSha: null, scannerVersion: manifest.version,
  scannerImage: manifest.image, fixtureTests: "not-run", syntheticFailure: "not-run" };
mkdirSync(output, { recursive: true });

function run(binary, args, timeout) {
  return spawnSync(binary, args, { cwd: root, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function scanner(args, timeout = 240_000) {
  const name = `filosage-semgrep-${randomUUID()}`;
  const result = run("docker", ["run", "--rm", "--name", name, "--network", "none", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--mount", `type=bind,src=${root},dst=/src,readonly`,
    "--mount", `type=bind,src=${temporary},dst=/out`, "--workdir", "/src", "--entrypoint", "semgrep",
    "--env", "SEMGREP_SEND_METRICS=off", "--env", "SEMGREP_ENABLE_VERSION_CHECK=0", manifest.image, ...args], timeout);
  if (result.error) {
    // Clean up only this invocation's uniquely named container after a killed client.
    run("docker", ["rm", "--force", name], 15_000);
    throw new Error("Scanner process could not complete within its deadline.");
  }
  return result;
}

function scan(targets, filename) {
  const inventory = run("git", ["ls-files", "-z", "--", ...targets], 10_000);
  if (inventory.status !== 0) throw new Error("Scanner input inventory could not be verified.");
  const result = scanner(["scan", "--config", "security/semgrep/rules", ...privacyFlags,
    "--strict", "--error", "--quiet", "--json-output", `/out/${filename}`, ...targets]);
  let raw;
  try { raw = JSON.parse(readFileSync(join(temporary, filename), "utf8")); }
  catch { throw new Error("Scanner did not produce a readable JSON report."); }
  // Retain safe diagnostics before validation can throw and finally removes raw
  // reports. Even a useful partial result must still fail the strict gate.
  evidence[filename === "probe.json" ? "syntheticDiagnostics" : "sourceDiagnostics"] = scanDiagnostics(
    raw, { ...manifest, targets }, inventory.stdout.split("\0").filter(Boolean),
  );
  return summarizeScan(raw, result.status, { ...manifest, targets });
}

try {
  if (!/^semgrep\/semgrep@sha256:[a-f0-9]{64}$/.test(manifest.image)) throw new Error("Scanner image must use an immutable digest.");
  const sha = run("git", ["rev-parse", "HEAD"], 10_000);
  evidence.sourceSha = sha.stdout?.trim();
  if (sha.status !== 0 || !/^[a-f0-9]{40}$/.test(evidence.sourceSha ?? "")
    || evidence.sourceSha !== process.env.EXPECTED_RELEASE_SHA) throw new Error("Scanner checkout does not match the expected release SHA.");
  if (run("docker", ["pull", manifest.image], 120_000).status !== 0) throw new Error("Pinned scanner image could not be pulled.");
  const version = scanner(["--version"], 30_000);
  if (version.status !== 0 || version.stdout.trim() !== manifest.version) throw new Error("Pinned scanner version could not be verified.");
  const fixtures = scanner(["scan", "--test", "--strict", "--config", "security/semgrep/rules", "security/semgrep/tests", ...privacyFlags], 120_000);
  evidence.fixtureTests = "failed";
  evidence.fixtureExitCode = fixtures.status;
  // This command reads only synthetic fixtures. Application scan output never
  // enters this diagnostic field, including failures and parse errors.
  evidence.fixtureDiagnostics = fixtureDiagnostics(`${fixtures.stdout}\n${fixtures.stderr}`);
  evidence.fixtureRuleCount = summarizeFixtureTests(`${fixtures.stdout}\n${fixtures.stderr}`, fixtures.status, manifest.ruleIds.length);
  evidence.fixtureTests = "passed";
  const probe = scan(["security/semgrep/probe"], "probe.json");
  if (probe.status !== "findings" || !probe.findings.some((finding) => finding.ruleId === "filosage-request-sql-injection")) {
    evidence.syntheticFailure = "failed";
    throw new Error("Synthetic SQL vulnerability did not fail the scanner gate.");
  }
  evidence.syntheticFailure = "passed";
  const result = scan(manifest.targets, "scan.json");
  Object.assign(evidence, result);
  if (result.status !== "passed") process.exitCode = 1;
} catch (error) {
  // Deliberately do not expose stdout/stderr or scanner-supplied error content.
  evidence.failure = error instanceof Error ? error.message : "Security scanner did not complete.";
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, "summary.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Security scan: ${evidence.status}; fixtures: ${evidence.fixtureTests}; synthetic failure: ${evidence.syntheticFailure}.`);
  if (evidence.failure) console.error(evidence.failure);
  rmSync(temporary, { recursive: true, force: true });
}
