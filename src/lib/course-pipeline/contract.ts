export const COURSE_PIPELINE_VERSIONS = {
  courseSchema: 5,
  qualityContract: "course-quality-v2.0.0",
  generationPrompt: "2026-08-11-course-pipeline-v2",
  repairPrompt: "2026-08-11-targeted-repair-v2",
  semanticEvaluator: "2026-08-11-semantic-critic-v2",
  labRegistry: "lab-capabilities-v2.0.0",
  visualPolicy: "visual-support-v2.0.0",
  sourcePolicy: "source-integrity-v3.0.0",
} as const;

export type CourseStage =
  | "draft"
  | "planning"
  | "generating"
  | "enriching"
  | "validating"
  | "needs_repair"
  | "repairing"
  | "ready_to_publish"
  | "publishing"
  | "published"
  | "manual_review"
  | "failed";

export type IssueSeverity = "blocker" | "error" | "warning" | "info";
export type Repairability = "automatic" | "assisted" | "manual" | "not_applicable";
export type IssueSource =
  | "schema"
  | "deterministic"
  | "semantic"
  | "source_integrity"
  | "security"
  | "accessibility"
  | "asset"
  | "runtime";

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  category: string;
  path: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
  evidence?: string[];
  repairability: Repairability;
  suggestedAction?: string;
  source: IssueSource;
  contractVersion: string;
}

export interface ValidationReport {
  courseId: string;
  snapshotHash: string;
  contractVersion: string;
  validatedAt: string;
  publishable: boolean;
  requiresManualReview: boolean;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
  passedRuleCodes: string[];
  evaluatorMetadata?: Record<string, unknown>;
}

export interface RepairOperation {
  issueCode: string;
  targetPath: string;
  operation: "add" | "replace" | "remove" | "regenerate_subtree";
  beforeHash?: string;
  value?: unknown;
  rationale: string;
}

export interface PublicationDecision {
  decision: "publishable" | "needs_repair" | "manual_review" | "blocked";
  snapshotHash: string;
  contractVersion: string;
  report: ValidationReport;
  automaticRepairAvailable: boolean;
}

export type LabApplicability = "required" | "recommended" | "not_applicable";
export type VisualApplicability = "essential" | "helpful" | "decorative_only" | "not_useful";

export interface CourseArtifactProvenance {
  courseSchemaVersion: number;
  qualityContractVersion: string;
  generationPromptVersion: string;
  repairPromptVersion: string;
  semanticEvaluatorVersion: string;
  semanticEvaluatorStatus: "executed" | "not_executed";
  repairPromptStatus: "executed" | "not_executed";
  labRegistryVersion: string;
  visualPolicyVersion: string;
  sourcePolicyVersion: string;
  provider: string;
  model: string;
  contentHash?: string;
}

export const COURSE_ARTIFACT_PROVENANCE_DEFAULTS = {
  courseSchemaVersion: COURSE_PIPELINE_VERSIONS.courseSchema,
  qualityContractVersion: COURSE_PIPELINE_VERSIONS.qualityContract,
  generationPromptVersion: COURSE_PIPELINE_VERSIONS.generationPrompt,
  repairPromptVersion: COURSE_PIPELINE_VERSIONS.repairPrompt,
  repairPromptStatus: "not_executed",
  semanticEvaluatorVersion: COURSE_PIPELINE_VERSIONS.semanticEvaluator,
  semanticEvaluatorStatus: "not_executed",
  labRegistryVersion: COURSE_PIPELINE_VERSIONS.labRegistry,
  visualPolicyVersion: COURSE_PIPELINE_VERSIONS.visualPolicy,
  sourcePolicyVersion: COURSE_PIPELINE_VERSIONS.sourcePolicy,
} as const;
