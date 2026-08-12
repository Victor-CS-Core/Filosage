import type { RepairOperation, ValidationReport } from "@/lib/course-pipeline/contract";

export const REPAIR_ATTEMPT_LIMITS = {
  deterministic: 1,
  semantic: 2,
} as const;

export interface RepairPlan {
  courseId: string;
  baseSnapshotHash: string;
  contractVersion: string;
  operations: RepairOperation[];
  manualIssueCodes: string[];
}

const SAFE_DETERMINISTIC_REPAIR_CODES = new Set(["CQ_LAB_001", "CQ_VISUAL_003"]);

export function buildRepairPlan(report: ValidationReport): RepairPlan {
  const automaticIssues = report.issues.filter((issue) =>
    issue.repairability === "automatic" && SAFE_DETERMINISTIC_REPAIR_CODES.has(issue.code));
  return {
    courseId: report.courseId,
    baseSnapshotHash: report.snapshotHash,
    contractVersion: report.contractVersion,
    operations: automaticIssues.map((issue) => ({
      issueCode: issue.code,
      targetPath: issue.path,
      operation: "remove",
      rationale: issue.message,
    })),
    manualIssueCodes: report.issues
      .filter((issue) => issue.repairability === "manual"
        || issue.repairability === "assisted"
        || (issue.repairability === "automatic" && !SAFE_DETERMINISTIC_REPAIR_CODES.has(issue.code)))
      .map((issue) => issue.code),
  };
}

export function assertRepairBaseSnapshot(plan: RepairPlan, currentSnapshotHash: string) {
  if (plan.baseSnapshotHash !== currentSnapshotHash) {
    throw new Error("The course changed after this repair was planned. Revalidate the current draft before applying repairs.");
  }
}
