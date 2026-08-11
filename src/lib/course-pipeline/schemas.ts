import { z } from "zod";
import { COURSE_PIPELINE_VERSIONS } from "@/lib/course-pipeline/contract";

const objectiveIdSchema = z.string().trim().regex(/^objective-[a-z0-9-]+$/);

export const labPlanSchema = z.object({
  applicability: z.enum(["required", "recommended", "not_applicable"]),
  rationale: z.string().trim().min(12).max(500),
  objectiveIds: z.array(objectiveIdSchema).min(1).max(5),
  registryVersion: z.literal(COURSE_PIPELINE_VERSIONS.labRegistry),
}).strict();

export const visualPlanSchema = z.object({
  applicability: z.enum(["essential", "helpful", "decorative_only", "not_useful"]),
  rationale: z.string().trim().min(12).max(500),
  objectiveIds: z.array(objectiveIdSchema).min(1).max(5),
  policyVersion: z.literal(COURSE_PIPELINE_VERSIONS.visualPolicy),
  accessibleFallback: z.object({
    kind: z.enum(["text", "table"]),
    content: z.string().trim().min(40).max(4_000),
  }).strict().optional(),
}).strict();

export const validationIssueSchema = z.object({
  code: z.string().regex(/^CQ_[A-Z]+_\d{3}$/),
  severity: z.enum(["blocker", "error", "warning", "info"]),
  category: z.string().min(1),
  path: z.string().min(1),
  message: z.string().min(1),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  evidence: z.array(z.string()).optional(),
  repairability: z.enum(["automatic", "assisted", "manual", "not_applicable"]),
  suggestedAction: z.string().optional(),
  source: z.enum(["schema", "deterministic", "semantic", "source_integrity", "security", "accessibility", "asset", "runtime"]),
  contractVersion: z.literal(COURSE_PIPELINE_VERSIONS.qualityContract),
});

export const validationReportSchema = z.object({
  courseId: z.string().min(1),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  contractVersion: z.literal(COURSE_PIPELINE_VERSIONS.qualityContract),
  validatedAt: z.string().datetime(),
  publishable: z.boolean(),
  requiresManualReview: z.boolean(),
  issues: z.array(validationIssueSchema),
  warnings: z.array(validationIssueSchema),
  passedRuleCodes: z.array(z.string().regex(/^CQ_[A-Z]+_\d{3}$/)),
  evaluatorMetadata: z.record(z.string(), z.unknown()).optional(),
});

export const repairOperationSchema = z.object({
  issueCode: z.string().regex(/^CQ_[A-Z]+_\d{3}$/),
  targetPath: z.string().min(1),
  operation: z.enum(["add", "replace", "remove", "regenerate_subtree"]),
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  value: z.unknown().optional(),
  rationale: z.string().min(1),
});
