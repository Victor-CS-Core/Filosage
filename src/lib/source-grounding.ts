import { createHash } from "node:crypto";
import { z } from "zod";
import type { CourseSource, LessonCitationSection } from "@/lib/course-types";

export const LESSON_GROUNDING_EVALUATOR_VERSION = "2026-08-14-claim-grounding-v3";
export const COURSE_GROUNDING_EVALUATOR_VERSION = "2026-08-14-outline-grounding-v2";
const LEGACY_COURSE_GROUNDING_EVALUATOR_VERSION = "2026-08-14-outline-grounding-v1";

export function supportsCourseGroundingEvaluatorVersion(version: unknown): version is string {
  return version === COURSE_GROUNDING_EVALUATOR_VERSION
    || version === LEGACY_COURSE_GROUNDING_EVALUATOR_VERSION;
}

export const lessonGroundingSchema = z.object({
  overallVerdict: z.enum(["supported", "unsupported"]),
  unsupportedClaims: z.array(z.object({
    claim: z.string().trim().min(2).max(280),
    rationale: z.string().trim().min(10).max(400),
  })).max(8),
  assessments: z.array(z.object({
    citationId: z.string().trim().regex(/^citation-[a-z0-9-]{1,60}$/),
    sourceId: z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/),
    evidenceClaimId: z.string().trim().regex(/^evidence-[a-z0-9-]{1,80}$/),
    canonicalClaim: z.string().trim().min(2).max(280).nullable(),
    canonicalSection: z.enum([
      "learning_objective", "connection", "content", "key_takeaway", "experience",
      "guided_practice", "transfer_task", "visual", "interaction", "quiz", "quiz_explanation",
    ]).nullable(),
    verdict: z.enum(["supported", "partial", "unsupported"]),
    evidenceNoteMatched: z.boolean(),
    rationale: z.string().trim().min(10).max(400),
  })).min(1).max(8),
});

export type LessonGroundingResult = z.infer<typeof lessonGroundingSchema>;

export const courseGroundingSchema = z.object({
  assessments: z.array(z.object({
    moduleIndex: z.number().int().min(0).max(5),
    lessonIndex: z.number().int().min(0).max(5),
    sourceId: z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/),
    evidenceClaimIds: z.array(z.string().trim().regex(/^evidence-[a-z0-9-]{1,80}$/)).min(1).max(6),
    verdict: z.enum(["supported", "partial", "unsupported"]),
    rationale: z.string().trim().min(10).max(400),
  })).min(1).max(36),
});

export type CourseGroundingResult = z.infer<typeof courseGroundingSchema>;

type OutlineCandidate = {
  modules?: Array<{ lessons?: Array<{ title?: string; concept?: string; objective?: string; activityPreview?: string; sourceIds?: string[] }> }>;
};

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function withoutObjectiveLinks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutObjectiveLinks);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "objectiveIds")
    .map(([key, nested]) => [key, withoutObjectiveLinks(nested)]));
}

function groundingLessonContent(lesson: Record<string, unknown>) {
  const keys = [
    "learningObjective", "connection", "keyTakeaways", "experience", "content",
    "guidedPractice", "transferTask", "visuals", "interactions", "quizzes",
  ] as const;
  return Object.fromEntries(keys.map((key) => [key, withoutObjectiveLinks(lesson[key])]));
}

function groundingSourceData(sourcePack: CourseSource[]) {
  return [...sourcePack]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((source) => ({
      id: source.id,
      researchPolicyVersion: source.researchPolicyVersion,
      evidenceValidationResponseId: source.evidenceValidationResponseId,
      evidenceClaims: [...(source.evidenceClaims ?? [])]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((evidence) => ({ id: evidence.id, claim: evidence.claim, locator: evidence.locator })),
      limitations: source.limitations,
    }));
}

export function courseGroundingFingerprint(
  outline: OutlineCandidate,
  sourcePack: CourseSource[],
  evaluatorVersion = COURSE_GROUNDING_EVALUATOR_VERSION,
) {
  return fingerprint({
    evaluatorVersion,
    outline: courseGroundingPromptData(outline, sourcePack),
    sources: groundingSourceData(sourcePack),
  });
}

export function courseGroundingPromptData(outline: OutlineCandidate, sourcePack: CourseSource[]) {
  const sourcesById = new Map(sourcePack.map((source) => [source.id, source]));
  return (outline.modules ?? []).flatMap((courseModule, moduleIndex) =>
    (courseModule.lessons ?? []).map((lesson, lessonIndex) => ({
      moduleIndex,
      lessonIndex,
      title: lesson.title,
      concept: lesson.concept,
      objective: lesson.objective,
      activityPreview: lesson.activityPreview,
      assignedEvidence: (lesson.sourceIds ?? []).map((sourceId) => {
        const source = sourcesById.get(sourceId);
        return { sourceId, evidenceClaims: source?.evidenceClaims, limitations: source?.limitations };
      }),
    })),
  );
}

export function courseGroundingIssues(
  result: CourseGroundingResult | null | undefined,
  outline: OutlineCandidate,
  sourcePack: CourseSource[],
) {
  if (!result) return ["The automatic outline-grounding evaluator did not return a structured result."];
  const lessons = (outline.modules ?? []).flatMap((courseModule, moduleIndex) =>
    (courseModule.lessons ?? []).map((lesson, lessonIndex) => ({ moduleIndex, lessonIndex, sourceIds: new Set(lesson.sourceIds ?? []) })),
  );
  const expected = new Map(lessons.map((lesson) => [`${lesson.moduleIndex}-${lesson.lessonIndex}`, lesson]));
  const supported = new Set<string>();
  const seen = new Set<string>();
  const issues: string[] = [];
  const evidenceIdsBySource = new Map(sourcePack.map((source) => [source.id, new Set((source.evidenceClaims ?? []).map((claim) => claim.id))]));
  for (const [index, assessment] of result.assessments.entries()) {
    const key = `${assessment.moduleIndex}-${assessment.lessonIndex}`;
    const lesson = expected.get(key);
    const recordKey = `${key}:${assessment.sourceId}`;
    if (!lesson || !lesson.sourceIds.has(assessment.sourceId)) {
      issues.push(`assessments[${index}] refers to a source not assigned to that lesson.`);
      continue;
    }
    if (seen.has(recordKey)) issues.push(`assessments[${index}] duplicates an outline grounding assessment.`);
    seen.add(recordKey);
    const evidenceIds = evidenceIdsBySource.get(assessment.sourceId) ?? new Set<string>();
    if (new Set(assessment.evidenceClaimIds).size !== assessment.evidenceClaimIds.length
      || assessment.evidenceClaimIds.some((evidenceClaimId) => !evidenceIds.has(evidenceClaimId))) {
      issues.push(`assessments[${index}] cites an unknown or duplicate evidence claim ID.`);
    }
    if (assessment.verdict === "supported") supported.add(key);
    else issues.push(`modules[${assessment.moduleIndex}].lessons[${assessment.lessonIndex}] is ${assessment.verdict}: ${assessment.rationale}`);
  }
  for (const key of expected.keys()) {
    if (!supported.has(key)) issues.push(`modules[${key.replace("-", "].lessons[")}] has no automatically supported source assignment.`);
  }
  return issues;
}

type CitationCandidate = {
  id: string;
  sourceId: string;
  evidenceClaimId?: string;
  claim: string;
  section: string;
};

type BindableCitationCandidate = Omit<CitationCandidate, "evidenceClaimId" | "section"> & {
  evidenceClaimId: string | undefined;
  section: LessonCitationSection;
};

export function bindLessonCitationsFromGrounding(
  result: LessonGroundingResult | null | undefined,
  citations: BindableCitationCandidate[],
) {
  const assessmentsById = new Map((result?.assessments ?? []).map((assessment) => [assessment.citationId, assessment]));
  return citations.map((citation) => {
    const assessment = assessmentsById.get(citation.id);
    if (!assessment
      || assessment.sourceId !== citation.sourceId
      || assessment.evidenceClaimId !== citation.evidenceClaimId
      || assessment.verdict !== "supported"
      || !assessment.evidenceNoteMatched
      || !assessment.canonicalClaim
      || !assessment.canonicalSection) return citation;
    return { ...citation, claim: assessment.canonicalClaim, section: assessment.canonicalSection };
  });
}

export function lessonGroundingPromptData(
  citations: CitationCandidate[],
  assignedSources: CourseSource[],
  lesson: Record<string, unknown>,
) {
  const evidenceById = new Map(assignedSources.map((source) => [source.id, source]));
  const citationData = citations.map((citation) => {
    const source = evidenceById.get(citation.sourceId);
    return {
      citationId: citation.id,
      sourceId: citation.sourceId,
      evidenceClaimId: citation.evidenceClaimId,
      claim: citation.claim,
      section: citation.section,
      evidenceClaims: source?.evidenceClaims?.filter((evidence) => evidence.id === citation.evidenceClaimId),
      sourceLabel: source?.label,
      publisher: source?.publisher,
      authorityClass: source?.authorityClass,
      evidenceType: source?.evidenceType,
      limitations: source?.limitations,
    };
  });
  return { citations: citationData, lesson: groundingLessonContent(lesson) };
}

export function lessonGroundingFingerprint(
  citations: CitationCandidate[],
  assignedSources: CourseSource[],
  lesson: Record<string, unknown>,
) {
  return fingerprint({
    evaluatorVersion: LESSON_GROUNDING_EVALUATOR_VERSION,
    groundingData: lessonGroundingPromptData(citations, assignedSources, lesson),
    sources: groundingSourceData(assignedSources),
  });
}

export function lessonGroundingIssues(
  result: LessonGroundingResult | null | undefined,
  citations: CitationCandidate[],
) {
  if (!result) return ["The automatic claim-grounding evaluator did not return a structured result."];
  const expectedById = new Map(citations.map((citation) => [citation.id, citation]));
  const seen = new Set<string>();
  const issues: string[] = [];
  if (result.overallVerdict !== "supported") issues.push("The lesson contains factual content that is not fully grounded in its assigned evidence.");
  for (const unsupported of result.unsupportedClaims) {
    issues.push(`Unsupported or uncited claim: ${unsupported.claim}. ${unsupported.rationale}`);
  }
  for (const [index, assessment] of result.assessments.entries()) {
    const expected = expectedById.get(assessment.citationId);
    if (!expected) {
      issues.push(`assessments[${index}] refers to an unknown citation.`);
      continue;
    }
    if (seen.has(assessment.citationId)) issues.push(`assessments[${index}] duplicates a citation assessment.`);
    seen.add(assessment.citationId);
    if (assessment.sourceId !== expected.sourceId) issues.push(`assessments[${index}] changed the citation source.`);
    if (assessment.evidenceClaimId !== expected.evidenceClaimId) issues.push(`assessments[${index}] changed the citation evidence claim.`);
    if (assessment.canonicalClaim !== expected.claim || assessment.canonicalSection !== expected.section) {
      issues.push(`assessments[${index}] did not return the exact verified lesson sentence and section.`);
    }
    if (assessment.verdict !== "supported" || !assessment.evidenceNoteMatched) {
      issues.push(`${assessment.citationId} is ${assessment.verdict}: ${assessment.rationale}`);
    }
  }
  for (const citation of citations) {
    if (!seen.has(citation.id)) issues.push(`${citation.id} was not evaluated for claim support.`);
  }
  return issues;
}
