function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function safePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !value.startsWith("/") && !/[\\:]/.test(value) && ![...value].some((character) => character.charCodeAt(0) < 32)
    && !value.split("/").some((part) => part === ".." || part === "." || !part);
}

/** The pinned CLI documents this summary; reject zero or omitted rule tests. */
export function summarizeFixtureTests(output, exitCode, expectedCount) {
  const summary = output.match(/(?:^|\n)(\d+)\/(\d+):[^\r\n]*All tests passed(?:\r?\n|$)/);
  if (exitCode !== 0 || !Number.isSafeInteger(expectedCount) || expectedCount < 1 || !summary
    || Number(summary[1]) !== expectedCount || Number(summary[2]) !== expectedCount) {
    throw new Error("Scanner positive and safe fixture tests did not all run successfully.");
  }
  return expectedCount;
}

/** Fail closed, and never copy scanner messages, excerpts or arbitrary metadata. */
export function summarizeScan(raw, exitCode, contract) {
  if (!object(raw) || !Array.isArray(raw.results)) throw new Error("Invalid scanner report.");
  if (raw.version !== contract.version) throw new Error("Unexpected scanner version.");
  if (!Array.isArray(raw.errors) || raw.errors.length || (raw.skipped_rules !== undefined
    && (!Array.isArray(raw.skipped_rules) || raw.skipped_rules.length))) throw new Error("Scanner report is incomplete.");
  if (![0, 1].includes(exitCode) || exitCode !== (raw.results.length ? 1 : 0)) throw new Error("Scanner exit status does not confirm a complete result.");
  if (!object(raw.paths) || !Array.isArray(raw.paths.scanned) || !raw.paths.scanned.every(safePath)) throw new Error("Invalid source coverage.");
  const scanned = new Set(raw.paths.scanned);
  const coverage = Object.fromEntries(contract.targets.map((target) => [
    target, [...scanned].filter((path) => path.startsWith(`${target}/`)).length,
  ]));
  if (!scanned.size || Object.values(coverage).some((count) => !count)) throw new Error("Incomplete source coverage.");
  const findings = raw.results.map((result) => {
    if (!object(result) || !contract.ruleIds.includes(result.check_id)) throw new Error("Unexpected scanner rule.");
    if (!safePath(result.path) || !scanned.has(result.path) || !object(result.start)
      || !Number.isSafeInteger(result.start.line) || result.start.line < 1
      || !Number.isSafeInteger(result.start.col) || result.start.col < 1) throw new Error("Invalid finding location.");
    return { ruleId: result.check_id, path: result.path, line: result.start.line, column: result.start.col };
  });
  return { status: findings.length ? "findings" : "passed", scannerVersion: raw.version, scannedFiles: scanned.size, coverage, findings };
}
