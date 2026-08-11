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

export function buildRepairPlan(report: ValidationReport): RepairPlan {
  const automaticIssues = report.issues.filter((issue) => issue.repairability === "automatic");
  return {
    courseId: report.courseId,
    baseSnapshotHash: report.snapshotHash,
    contractVersion: report.contractVersion,
    operations: automaticIssues.map((issue) => ({
      issueCode: issue.code,
      targetPath: issue.path,
      operation: issue.code === "CQ_STRUCTURE_001"
        ? "regenerate_subtree"
        : issue.code === "CQ_LAB_001" || issue.code === "CQ_VISUAL_003"
          ? "remove"
          : "replace",
      rationale: issue.message,
    })),
    manualIssueCodes: report.issues
      .filter((issue) => issue.repairability === "manual" || issue.repairability === "assisted")
      .map((issue) => issue.code),
  };
}

export function assertRepairBaseSnapshot(plan: RepairPlan, currentSnapshotHash: string) {
  if (plan.baseSnapshotHash !== currentSnapshotHash) {
    throw new Error("The course changed after this repair was planned. Revalidate the current draft before applying repairs.");
  }
}
