import type { ValidationReport } from "../../../src/lib/course-pipeline/contract";

export function scoreContractInvariants(report: ValidationReport) {
  const unexplainedIssues = [...report.issues, ...report.warnings].filter((issue) =>
    !issue.code || !issue.path || !issue.contractVersion || !issue.suggestedAction,
  );
  return {
    typedDiagnostics: unexplainedIssues.length === 0,
    warningsDoNotBlock: !(report.publishable === false && report.issues.length === 0 && report.requiresManualReview === false),
    snapshotBound: /^[a-f0-9]{64}$/.test(report.snapshotHash),
    unexplainedIssueCount: unexplainedIssues.length,
  };
}
