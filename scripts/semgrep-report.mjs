function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function safePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !value.startsWith("/") && !/[\\:]/.test(value) && ![...value].some((character) => character.charCodeAt(0) < 32)
    && !value.split("/").some((part) => part === ".." || part === "." || !part);
}

// CLI error_type labels from the pinned Semgrep 1.177.0 output schema. Never
// serialize an unknown label or the payload attached to a variant wholesale.
const errorTypes = new Set([
  "Lexical error", "Syntax error", "Other syntax error", "AST builder error", "Rule parse error",
  "SemgrepWarning", "SemgrepError", "InvalidRuleSchemaError", "UnknownLanguageError", "Invalid YAML",
  "Internal matching error", "Semgrep match found", "Too many matches", "Fatal error", "Timeout",
  "Out of memory", "Fixpoint timeout", "Stack overflow", "Timeout during interfile analysis",
  "OOM during interfile analysis", "Missing plugin", "Pattern parse error", "Incompatible rule",
  "PatternParseError", "PartialParsing", "IncompatibleRule", "DependencyResolutionError",
]);
const diagnosticLimit = 20;

/** Diagnostics never establish scan success. Paths must come from trusted input
 * inventory (for example git ls-files), not the scanner's own paths.scanned. */
export function scanDiagnostics(raw, contract, inputPaths) {
  const allowed = new Set(inputPaths.filter((path) => safePath(path)
    && contract.targets.some((target) => path.startsWith(`${target}/`))));
  const errors = object(raw) && Array.isArray(raw.errors) ? raw.errors : null;
  const results = object(raw) && Array.isArray(raw.results) ? raw.results : null;
  let truncated = (errors?.length ?? 0) > diagnosticLimit || (results?.length ?? 0) > diagnosticLimit;
  const diagnostics = (errors ?? []).slice(0, diagnosticLimit).map((error) => {
    const value = object(error) ? error : {};
    const type = Array.isArray(value.type) ? value.type[0] : value.type;
    const candidates = [
      ...(Array.isArray(value.spans) ? value.spans.filter(object).map((span) => ({ path: span.file, start: span.start })) : []),
      ...(type === "PartialParsing" && Array.isArray(value.type[1]) ? value.type[1].filter(object) : []),
      { path: value.path },
    ];
    const locations = [];
    for (const candidate of candidates) {
      if (!allowed.has(candidate.path)) continue;
      const line = object(candidate.start) && Number.isSafeInteger(candidate.start.line) && candidate.start.line > 0 ? candidate.start.line : null;
      if (locations.some((location) => location.path === candidate.path && (line === null || location.line === line))) continue;
      if (locations.length === 3) { truncated = true; break; }
      locations.push({ path: candidate.path, ...(line === null ? {} : { line }) });
    }
    return { type: errorTypes.has(type) ? type : "Unknown scanner error", locations };
  });
  const findings = [];
  for (const result of (results ?? []).slice(0, diagnosticLimit)) {
    if (!object(result) || !contract.ruleIds.includes(result.check_id) || !allowed.has(result.path)
      || !object(result.start) || !Number.isSafeInteger(result.start.line) || result.start.line < 1
      || !Number.isSafeInteger(result.start.col) || result.start.col < 1) continue;
    findings.push({ ruleId: result.check_id, path: result.path, line: result.start.line, column: result.start.col });
  }
  return { errorCount: errors?.length ?? null, errors: diagnostics, findingCount: results?.length ?? null, findings, truncated };
}

/** Only call for project-owned synthetic fixture tests, never source scans. */
export function fixtureDiagnostics(output) {
  return [...output].filter((character) => character.charCodeAt(0) >= 32 || "\n\t".includes(character)).join("").slice(0, 8_192);
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
