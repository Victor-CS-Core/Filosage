import type { IssueSeverity, IssueSource, Repairability, ValidationIssue } from "@/lib/course-pipeline/contract";
import { COURSE_PIPELINE_VERSIONS } from "@/lib/course-pipeline/contract";

export interface QualityRuleDefinition {
  code: string;
  version: number;
  purpose: string;
  classification: "deterministic" | "semantic";
  severity: IssueSeverity;
  source: IssueSource;
  repairability: Repairability;
  suggestedAction: string;
}

export const COURSE_QUALITY_RULES = {
  COURSE_SCHEMA: {
    code: "CQ_SCHEMA_001", version: 1, purpose: "Require a renderable supported course schema", classification: "deterministic", severity: "blocker", source: "schema", repairability: "assisted", suggestedAction: "Open the invalid course field or migrate the legacy draft.",
  },
  LESSON_SCHEMA: {
    code: "CQ_SCHEMA_002", version: 1, purpose: "Require every generated lesson to use a renderable schema", classification: "deterministic", severity: "blocker", source: "schema", repairability: "assisted", suggestedAction: "Open the invalid lesson field and repair its structure.",
  },
  LEGACY_ADAPTER: {
    code: "CQ_SCHEMA_003", version: 1, purpose: "Validate legacy content through a non-destructive compatibility adapter", classification: "deterministic", severity: "warning", source: "schema", repairability: "not_applicable", suggestedAction: "Keep the legacy release intact; upgrade metadata only when the author edits the draft.",
  },
  LEGACY_REVIEW_REQUIRED: {
    code: "CQ_SCHEMA_004", version: 1, purpose: "Prevent legacy drafts without current alignment metadata from self-certifying", classification: "deterministic", severity: "error", source: "schema", repairability: "manual", suggestedAction: "Review the preserved legacy draft or upgrade it through an explicit author edit; do not regenerate it silently.",
  },
  LESSON_MISSING: {
    code: "CQ_STRUCTURE_001", version: 1, purpose: "Require every outlined lesson before publication", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Open the missing lesson and generate it against the current course snapshot.",
  },
  OBJECTIVE_MISSING: {
    code: "CQ_ALIGNMENT_001", version: 1, purpose: "Require an observable lesson objective", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Add a measurable learner action.",
  },
  MODE_ACTIVITY_MISSING: {
    code: "CQ_ALIGNMENT_002", version: 1, purpose: "Require the planned lesson activity when the plan declares a mode", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Add or realign the activity for this lesson.",
  },
  OBJECTIVE_RELATIONSHIP: {
    code: "CQ_ALIGNMENT_003", version: 1, purpose: "Map each planned objective to instruction using stable IDs", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Restore the objective ID mapping without changing the objective text.",
  },
  CONNECTION_MISSING: {
    code: "CQ_ALIGNMENT_004", version: 1, purpose: "Require substantive lessons to connect to the surrounding learning sequence", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Explain what this lesson builds on or prepares the learner to do next.",
  },
  COURSE_COHERENCE: {
    code: "CQ_ALIGNMENT_005", version: 1, purpose: "Keep milestones, artifact work, and the capstone coherent", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Realign the named milestone or capstone field with the course outcome and artifact.",
  },
  ASSESSMENT_MISSING: {
    code: "CQ_ASSESSMENT_001", version: 1, purpose: "Require an assessment with valid feedback", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Add an objective-aligned check and answer feedback.",
  },
  ASSESSMENT_RELATIONSHIP: {
    code: "CQ_ASSESSMENT_002", version: 1, purpose: "Map every required objective to an assessment using stable IDs", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Map the assessment to the objective it actually tests or replace the assessment.",
  },
  PREREQUISITE_INVALID: {
    code: "CQ_RELATIONSHIP_001", version: 1, purpose: "Keep prerequisite relationships acyclic and resolvable", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Select an earlier lesson or remove the invalid prerequisite.",
  },
  DUPLICATE_LESSON: {
    code: "CQ_COMPLETENESS_001", version: 1, purpose: "Prevent duplicate lessons from replacing intentional progression", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Differentiate or remove the duplicate lesson.",
  },
  LESSON_COMPLETENESS: {
    code: "CQ_COMPLETENESS_002", version: 1, purpose: "Require the core parts of a substantive lesson while permitting declared lesson-kind exceptions", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Complete the missing lesson element or declare a supported non-substantive lesson kind.",
  },
  LEARNING_DESIGN_CONTRACT: {
    code: "CQ_PEDAGOGY_001", version: 1, purpose: "Require a versioned course brief and one bounded design plan for every lesson", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Repair the learning brief, lesson plan, or objective relationship without regenerating valid content.",
  },
  SINGLE_WIN_LESSON: {
    code: "CQ_PEDAGOGY_002", version: 1, purpose: "Keep each generated lesson within one observable win and its explanation and practice budget", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Narrow only the affected lesson and keep its guided and transfer work distinct.",
  },
  RETRIEVAL_FEEDBACK_PLAN: {
    code: "CQ_PEDAGOGY_003", version: 1, purpose: "Require prerequisite-safe retrieval, misconception checks, and feedback after learner commitment", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Repair the affected retrieval or feedback plan while preserving trusted learner evidence.",
  },
  CONCISE_EXPLANATION: {
    code: "CQ_ENRICHMENT_001", version: 1, purpose: "Suggest more explanation without imposing a prose quota", classification: "deterministic", severity: "warning", source: "deterministic", repairability: "not_applicable", suggestedAction: "Add detail only if the activity does not already teach the objective.",
  },
  MODE_VARIETY: {
    code: "CQ_ENRICHMENT_002", version: 1, purpose: "Suggest useful variety without rejecting a coherent repeated format", classification: "deterministic", severity: "warning", source: "deterministic", repairability: "not_applicable", suggestedAction: "Vary the activity only when it improves the learning sequence.",
  },
  LAB_UNSUPPORTED: {
    code: "CQ_LAB_001", version: 1, purpose: "Prevent unsupported interactive output", classification: "deterministic", severity: "blocker", source: "runtime", repairability: "automatic", suggestedAction: "Replace it with a registered lab or a noninteractive exercise.",
  },
  LAB_OPTIONAL_MISSING: {
    code: "CQ_LAB_002", version: 1, purpose: "Treat recommended labs as optional enrichment", classification: "deterministic", severity: "warning", source: "runtime", repairability: "not_applicable", suggestedAction: "Add a lab only when meaningful interaction improves the objective.",
  },
  LAB_REQUIRED_MISSING: {
    code: "CQ_LAB_003", version: 1, purpose: "Require meaningful feedback practice only when the stored objective plan marks it required", classification: "deterministic", severity: "blocker", source: "runtime", repairability: "assisted", suggestedAction: "Add a registered objective-aligned lab or change the applicability plan with a documented rationale.",
  },
  LAB_PLAN_INVALID: {
    code: "CQ_LAB_004", version: 1, purpose: "Require a complete versioned lab applicability plan", classification: "deterministic", severity: "blocker", source: "schema", repairability: "assisted", suggestedAction: "Correct the lab applicability, rationale, objective mapping, and registry version.",
  },
  VISUAL_ESSENTIAL_MISSING: {
    code: "CQ_VISUAL_001", version: 1, purpose: "Require an essential visual or equivalent fallback", classification: "deterministic", severity: "blocker", source: "asset", repairability: "automatic", suggestedAction: "Add an equivalent accessible text fallback derived from the existing validated lesson content.",
  },
  VISUAL_UNSUPPORTED: {
    code: "CQ_VISUAL_003", version: 1, purpose: "Prevent unsupported instructional visual output", classification: "deterministic", severity: "blocker", source: "runtime", repairability: "automatic", suggestedAction: "Replace it with a registered visual or an accessible prose or table fallback.",
  },
  VISUAL_OPTIONAL_MISSING: {
    code: "CQ_VISUAL_002", version: 1, purpose: "Keep helpful visual failures from denying publication", classification: "deterministic", severity: "warning", source: "asset", repairability: "not_applicable", suggestedAction: "Publish with the accessible fallback or retry the visual later.",
  },
  VISUAL_PLAN_INVALID: {
    code: "CQ_VISUAL_004", version: 1, purpose: "Require a complete versioned visual applicability and fallback plan", classification: "deterministic", severity: "blocker", source: "schema", repairability: "assisted", suggestedAction: "Correct the visual applicability, rationale, objective mapping, policy version, or accessible fallback.",
  },
  SOURCE_UNSAFE: {
    code: "CQ_SOURCE_001", version: 1, purpose: "Reject unsafe or malformed source destinations", classification: "deterministic", severity: "blocker", source: "source_integrity", repairability: "assisted", suggestedAction: "Remove or replace the unsafe source URL.",
  },
  SOURCE_REVIEW_REQUIRED: {
    code: "CQ_SOURCE_002", version: 1, purpose: "Route deterministically identified high-stakes or disputed evidence to human review", classification: "deterministic", severity: "error", source: "source_integrity", repairability: "manual", suggestedAction: "Verify the claim against an authoritative source.",
  },
  SOURCE_ASSIGNMENT_INVALID: {
    code: "CQ_SOURCE_003", version: 4, purpose: "Require every lesson to declare a mutually exclusive verified-source or model-knowledge basis", classification: "deterministic", severity: "blocker", source: "source_integrity", repairability: "assisted", suggestedAction: "Assign eligible evidence to a verified-source lesson, or mark it model-knowledge and remove source assignments without discarding the course.",
  },
  SOURCE_CITATION_INVALID: {
    code: "CQ_SOURCE_004", version: 4, purpose: "Require each verified-source lesson to cite relevant assigned evidence and every model-knowledge lesson to remain citation-free", classification: "deterministic", severity: "blocker", source: "source_integrity", repairability: "assisted", suggestedAction: "Correct the verified citation, or remove every citation and source reference from a model-knowledge lesson without inventing support.",
  },
  SOURCE_RESEARCH_INVALID: {
    code: "CQ_SOURCE_005", version: 2, purpose: "Require current API provenance for retained evidence and an exact layered evidence profile while permitting sparse or empty research", classification: "deterministic", severity: "blocker", source: "source_integrity", repairability: "assisted", suggestedAction: "Repair only invalid provenance or evidence labels; preserve the course and use disclosed model knowledge when trusted evidence is unavailable.",
  },
  SEMANTIC_REVIEW_REQUIRED: {
    code: "CQ_SEMANTIC_001", version: 1, purpose: "Require calibrated semantic or human review before V2 publication", classification: "semantic", severity: "error", source: "semantic", repairability: "manual", suggestedAction: "Review accuracy, coherence, filler, and objective-to-assessment meaning on this exact snapshot.",
  },
  ACCESSIBILITY_RUNTIME_REVIEW: {
    code: "CQ_ACCESSIBILITY_001", version: 1, purpose: "Require runtime accessibility verification when automation has not executed", classification: "semantic", severity: "error", source: "accessibility", repairability: "manual", suggestedAction: "Verify keyboard, screen-reader, contrast, and fallback behavior on this exact snapshot.",
  },
  ASSET_AVAILABILITY_REVIEW: {
    code: "CQ_ASSET_001", version: 1, purpose: "Require runtime verification for required assets when availability checks have not executed", classification: "semantic", severity: "error", source: "asset", repairability: "manual", suggestedAction: "Verify required visuals and interactive assets render with their accessible fallbacks.",
  },
  CONTENT_INTEGRITY: {
    code: "CQ_SECURITY_001", version: 1, purpose: "Reject model-control fragments, malformed scripts, and unsafe generated content", classification: "deterministic", severity: "blocker", source: "security", repairability: "assisted", suggestedAction: "Remove the unsafe fragment and regenerate only the affected field.",
  },
  LANGUAGE_CONFORMANCE: {
    code: "CQ_LANGUAGE_001", version: 1, purpose: "Require generated instruction to use the requested language or bilingual combination", classification: "deterministic", severity: "blocker", source: "deterministic", repairability: "assisted", suggestedAction: "Regenerate or translate the affected instructional fields in the requested language.",
  },
  SNAPSHOT_STALE: {
    code: "CQ_PUBLICATION_001", version: 1, purpose: "Publish only the exact validated snapshot", classification: "deterministic", severity: "blocker", source: "runtime", repairability: "not_applicable", suggestedAction: "Revalidate the current draft before publishing.",
  },
} as const satisfies Record<string, QualityRuleDefinition>;

export const COURSE_QUALITY_RULE_CODES = Object.values(COURSE_QUALITY_RULES).map((rule) => rule.code);

export function issueFromRule(
  rule: QualityRuleDefinition,
  path: string,
  message: string,
  overrides: Partial<Pick<ValidationIssue, "severity" | "repairability" | "suggestedAction" | "evidence" | "expected" | "actual">> = {},
): ValidationIssue {
  return {
    code: rule.code,
    severity: overrides.severity ?? rule.severity,
    category: rule.code.split("_").slice(0, 2).join("_").toLowerCase(),
    path,
    message,
    repairability: overrides.repairability ?? rule.repairability,
    suggestedAction: overrides.suggestedAction ?? rule.suggestedAction,
    source: rule.source,
    contractVersion: COURSE_PIPELINE_VERSIONS.qualityContract,
    evidence: overrides.evidence,
    expected: overrides.expected,
    actual: overrides.actual,
  };
}
