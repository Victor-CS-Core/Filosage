import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  { name: "stripe-live-key", expression: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { name: "stripe-webhook-secret", expression: /\bwhsec_[A-Za-z0-9]{16,}\b/g },
  { name: "openai-api-key", expression: /\b(?:sk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,})\b/g },
  { name: "github-token", expression: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "github-fine-grained-token", expression: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "google-api-key", expression: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: "azure-storage-account-key", expression: /\bAccountKey=[A-Za-z0-9+/]{40,}={0,2}\b/g },
  { name: "postgres-credential-url", expression: /\bpostgres(?:ql)?:\/\/[^:\s/'"]{1,128}:[^@\s/'"]{16,}@[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9_-]+/g },
  { name: "private-key", expression: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

function trackedFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    console.error("Tracked-file secret scan could not enumerate Git files.");
    process.exit(2);
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

function explicitFakeFixture(line, match) {
  if (!line.includes("secret-scan: allow-test-fixture")) return false;
  const normalized = match.toLowerCase();
  if (normalized.includes("example") || normalized.includes("placeholder") || normalized.includes("testfixture")) return true;
  const payload = match.replace(/^[^-_]+(?:[-_](?:live|test))?[-_]?/i, "");
  return new Set(payload.toLowerCase()).size <= 2;
}

const findings = [];
for (const path of trackedFiles()) {
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    findings.push(`${path}:0 [unreadable-tracked-file]`);
    continue;
  }
  if (bytes.includes(0)) continue;
  const lines = bytes.toString("utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const pattern of patterns) {
      pattern.expression.lastIndex = 0;
      for (const match of line.matchAll(pattern.expression)) {
        if (explicitFakeFixture(line, match[0])) continue;
        findings.push(`${path}:${index + 1} [${pattern.name}]`);
      }
    }
  }
}

if (findings.length) {
  console.error("Potential tracked secrets detected. Values were redacted:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Tracked-file secret scan passed.");
