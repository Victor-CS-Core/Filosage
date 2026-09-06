import "server-only";

import type { Course, LessonData } from "@/lib/course-types";
import { assertLocallySafeContentBatch, MODERATION_MODEL } from "@/lib/content-safety";
import { LESSON_QUALITY_GATE_VERSION } from "@/lib/lesson-quality";
import {
  assessCourseForPublication,
  type PublicationAssessment,
} from "@/lib/publication-assessment";
import type { PublicationLessonFailure } from "@/lib/publication-readiness";
import {
  publicationContentFingerprint,
  publicationContentHash,
} from "@/lib/publication-content";
import { parseCourseCandidate, parseLessonCandidate } from "@/lib/course-pipeline/compatibility";
import type { PublicationDecision, ValidationReport } from "@/lib/course-pipeline/contract";
import { publicationDecisionFromReport, validateCourseCandidateV2 } from "@/lib/course-pipeline/validation";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { recordCoursePipelineEvent } from "@/lib/course-pipeline/observability";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { expectedLessonModes } from "@/lib/course-progress";
import { currentManualReviewResolution, publicationEvidenceFingerprint, publicationProofIsCurrent, PUBLICATION_PROOF_POLICY_VERSION, validationEvidenceFingerprint, type PublicationProof } from "@/lib/publication-proofs";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";

export const PUBLICATION_REVIEW_VERSION = "publication-v5-snapshot-proof";
export const PUBLICATION_SAFETY_REVIEW_BASIS = "generation-output-moderation+publication-local-scan";
export const EXPLICIT_PUBLICATION_SAFETY_BASIS = "publication-local-scan+explicit-safety-review";

type PublicationSafetyReviewBasis = typeof PUBLICATION_SAFETY_REVIEW_BASIS
  | typeof EXPLICIT_PUBLICATION_SAFETY_BASIS;

export interface PublicationLessonReview {
  lessonId: string;
  contentHash: string;
  status: "approved" | "owner_override";
  reviewedAt: string;
  reviewedBy: string;
  reviewerRole: "author" | "owner";
  moderationModel: string;
  reviewVersion: string;
  qualityGateVersion: string;
  factualReviewStatus: "unverified";
  safetyReviewBasis: PublicationSafetyReviewBasis;
  sourceUpdatedAt?: string;
  sourceFingerprint: string;
}

export class PublicationReviewError extends Error {
  constructor(
    message: string,
    public readonly invalidLessonIds: string[] = [],
    public readonly invalidLessons: PublicationLessonFailure[] = [],
    public readonly assessment?: PublicationAssessment,
    public readonly assessmentHash?: string,
    public readonly validationReport?: ValidationReport,
    public readonly publicationDecision?: PublicationDecision,
  ) {
    super(message);
    this.name = "PublicationReviewError";
  }
}

export interface PublicationOwnerOverride {
  auditEventId: string;
  actorUid: string;
  reason: string;
  assessmentHash: string;
  issueCodes: string[];
  assessmentVersion: string;
  courseQualityGateVersion: string;
  lessonQualityGateVersion: string;
}

export async function generatedContentHash(value: unknown) {
  return publicationContentHash(value);
}

/** Generated provenance uses the same snapshot-bound proof contract as every draft. */
export async function buildGeneratedCoursePublication(
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  publisher: { uid: string; isOwner: boolean },
) {
  if (course.aiAssisted !== true) {
    throw new PublicationReviewError("This course does not have generated-course provenance.");
  }
  return reviewCourse(course, lessons, expectedLessonIds, publisher);
}

/** Explicit validation scans locally; missing historical moderation remains a manual issue. */
export async function buildPublicationValidationProof(
  course: Course & Record<string, unknown>, lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[], reviewer: { uid: string },
): Promise<PublicationProof> {
  const byId = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  const orderedLessons = expectedLessonIds.map((id) => byId.get(id) ?? { missingLessonId: id });
  const validationReport = await validateCourseCandidateV2(course, lessons, expectedLessonIds, expectedLessonModes(course));
  await assertLocallySafeContentBatch([course, ...orderedLessons].map((document) => JSON.stringify(document)), {
    uid: reviewer.uid, feature: "lesson_generation", stage: "output",
  });
  return {
    version: 1, policyVersion: PUBLICATION_PROOF_POLICY_VERSION,
    snapshotHash: validationReport.snapshotHash,
    courseId: String(course.id ?? course.courseId ?? "unpersisted-course"),
    lessonIds: expectedLessonIds, evidenceFingerprint: publicationEvidenceFingerprint(course, orderedLessons),
    safety: { status: "passed", basis: "publication-local-scan", reviewedAt: new Date().toISOString() },
    validationReport,
  };
}

async function assessmentContentHash(
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  assessment: PublicationAssessment,
) {
  const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  return generatedContentHash({
    course,
    lessons: expectedLessonIds.map((lessonId) => lessonsById.get(lessonId) ?? { missingLessonId: lessonId }),
    assessmentVersion: assessment.assessmentVersion,
    issues: assessment.issues.map(({ code, category, message, lessonId, overridable }) => ({
      code,
      category,
      message,
      lessonId,
      overridable,
    })),
  });
}

function assessmentMessage(assessment: PublicationAssessment) {
  if (assessment.missingLessonIds.length) return "Generate every lesson before publishing.";
  if (assessment.nonOverridableIssues.length) {
    return assessment.nonOverridableIssues[0]?.message
      ?? "The course has a structural or source-security problem that must be corrected.";
  }
  if (assessment.invalidLessonIds.length) {
    return "One or more lessons must be regenerated to meet the current teaching and language standard.";
  }
  return "The course needs review before publication.";
}

async function reviewCourse(
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  reviewer: { uid: string; isOwner: boolean },
  ownerOverride?: { reason: string; expectedAssessmentHash: string },
) {
  const assessment = assessCourseForPublication(
    course,
    lessons,
    expectedLessonIds,
    expectedLessonModes(course),
  );
  const assessmentHash = await assessmentContentHash(course, lessons, expectedLessonIds, assessment);
  const flags = coursePipelineFeatureFlags(reviewer);
  const pipelineV2Artifact = courseUsesPipelineV2(course);
  const publicationV2Active = flags.publicationV2 && pipelineV2Artifact;
  if (pipelineV2Artifact && !flags.publicationV2) {
    throw new PublicationReviewError("V2 publication is paused; this draft cannot use the legacy publication path.");
  }
  const validationReport = await validateCourseCandidateV2(course, lessons, expectedLessonIds, expectedLessonModes(course));
  const publicationDecision = publicationDecisionFromReport(validationReport);
  const byId = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  const orderedLessons = expectedLessonIds.map((id) => byId.get(id) ?? { missingLessonId: id });
  const proof = course.publicationProof as PublicationProof | undefined;
  if (!publicationProofIsCurrent(course, orderedLessons, expectedLessonIds, validationReport.snapshotHash, proof)
    || validationEvidenceFingerprint(proof.validationReport) !== validationEvidenceFingerprint(validationReport)) {
    throw new PublicationReviewError("Validate this exact draft to obtain a current publication proof.",
      assessment.invalidLessonIds, assessment.invalidLessons, assessment, assessmentHash, validationReport, publicationDecision);
  }
  const manualReviewResolution = currentManualReviewResolution(course, validationReport.snapshotHash);
  const manualReviewApproved = publicationDecision.decision === "manual_review" && Boolean(manualReviewResolution);

  if (validationReport) {
    const v1Decision = assessment.nonOverridableIssues.length
      ? "blocked"
      : assessment.overridableIssues.length
        ? "needs_repair"
        : "publishable";
    const v2Decision = publicationDecision?.decision ?? "blocked";
    await recordCoursePipelineEvent({
      event: "course_publication_decided",
      correlationId: String(course.pipelineCorrelationId ?? crypto.randomUUID()),
      courseId: String(course.id ?? course.courseId ?? "unknown"),
      actorHash: await openAiSafetyIdentifier(reviewer.uid),
      outcome: v2Decision,
      ruleCodes: [...validationReport.issues, ...validationReport.warnings].map((issue) => issue.code),
      contractVersion: validationReport.contractVersion,
      snapshotHash: validationReport.snapshotHash,
      featureFlags: flags,
      comparison: {
        v1Decision,
        v2Decision,
        disagrees: v1Decision !== v2Decision,
        mode: flags.shadowMode && !publicationV2Active ? "shadow" : "active",
      },
    });
  }

  if (publicationDecision.decision !== "publishable" && !manualReviewApproved) {
    const firstIssue = validationReport?.issues[0];
    throw new PublicationReviewError(
      firstIssue?.message ?? "The current course snapshot is not ready to publish.",
      assessment.invalidLessonIds,
      assessment.invalidLessons,
      assessment,
      assessmentHash,
      validationReport,
      publicationDecision,
    );
  }

  if (assessment.nonOverridableIssues.length) {
    throw new PublicationReviewError(
      assessmentMessage(assessment),
      assessment.invalidLessonIds,
      assessment.invalidLessons,
      assessment,
      assessmentHash,
    );
  }

  const parsedOutline = parseCourseCandidate(course);
  const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  const parsedLessons = expectedLessonIds.flatMap((lessonId) => {
    const raw = lessonsById.get(lessonId);
    const parsed = raw ? parseLessonCandidate(raw) : null;
    return raw && parsed?.success ? [{ lessonId, raw, lesson: parsed.data as LessonData }] : [];
  });
  if (!parsedOutline.success || parsedLessons.length !== expectedLessonIds.length) {
    throw new PublicationReviewError(
      "The course changed during publication review. Try publishing again.",
      assessment.invalidLessonIds,
      assessment.invalidLessons,
      assessment,
      assessmentHash,
    );
  }

  // Safety is deliberately evaluated before any quality override is accepted.
  // An owner can override pedagogical warnings, never this boundary.
  await assertLocallySafeContentBatch([
    JSON.stringify(parsedOutline.data),
    ...parsedLessons.map(({ lesson }) => JSON.stringify(lesson)),
  ], {
    uid: reviewer.uid,
    feature: "lesson_generation",
    stage: "output",
  });

  if (!publicationV2Active && !ownerOverride && assessment.overridableIssues.length) {
    throw new PublicationReviewError(
      assessmentMessage(assessment),
      assessment.invalidLessonIds,
      assessment.invalidLessons,
      assessment,
      assessmentHash,
    );
  }
  if (ownerOverride) {
    if (!reviewer.isOwner || !assessment.overrideEligible) {
      throw new PublicationReviewError(
        "There is no current quality-only publication failure eligible for owner override.",
        assessment.invalidLessonIds,
        assessment.invalidLessons,
        assessment,
        assessmentHash,
      );
    }
    if (ownerOverride.expectedAssessmentHash !== assessmentHash) {
      throw new PublicationReviewError(
        "The course changed after the failed publication review. Run the normal review again.",
        assessment.invalidLessonIds,
        assessment.invalidLessons,
        assessment,
        assessmentHash,
      );
    }
  }

  const safetyReviewBasis: PublicationSafetyReviewBasis = validationReport.issues.some((issue) => issue.code === "CQ_SAFETY_001")
    ? EXPLICIT_PUBLICATION_SAFETY_BASIS : PUBLICATION_SAFETY_REVIEW_BASIS;
  const moderationModel = safetyReviewBasis === EXPLICIT_PUBLICATION_SAFETY_BASIS ? "not_executed" : MODERATION_MODEL;
  const status = ownerOverride ? "owner_override" as const : "approved" as const;
  const reviewedAt = new Date().toISOString();
  const reviews: PublicationLessonReview[] = [];
  for (const { lessonId, raw } of parsedLessons) {
    reviews.push({
      lessonId,
      contentHash: await generatedContentHash(raw),
      status,
      reviewedAt,
      reviewedBy: reviewer.uid,
      reviewerRole: reviewer.isOwner ? "owner" : "author",
      moderationModel,
      reviewVersion: PUBLICATION_REVIEW_VERSION,
      qualityGateVersion: LESSON_QUALITY_GATE_VERSION,
      factualReviewStatus: "unverified",
      safetyReviewBasis,
      sourceUpdatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
      sourceFingerprint: publicationContentFingerprint(raw),
    });
  }

  const outlineHash = await generatedContentHash(parsedOutline.data);
  return {
    status,
    reviewedAt,
    outlineHash,
    reviews,
    moderationModel,
    reviewVersion: PUBLICATION_REVIEW_VERSION,
    factualReviewStatus: "unverified" as const,
    safetyReviewBasis,
    sourceUpdatedAt: typeof course.updatedAt === "string" ? course.updatedAt : undefined,
    sourceFingerprint: publicationContentFingerprint(course),
    assessment,
    assessmentHash,
    validationReport,
    publicationDecision,
    artifactSnapshotHash: validationReport.snapshotHash,
    publicationProof: proof,
    qualityContractVersion: validationReport?.contractVersion,
    manualReviewResolutionId: manualReviewApproved ? manualReviewResolution?.reviewId : undefined,
    ownerOverride: ownerOverride ? {
      auditEventId: crypto.randomUUID(),
      actorUid: reviewer.uid,
      reason: ownerOverride.reason,
      assessmentHash,
      issueCodes: assessment.overridableIssues.map((issue) => issue.code),
      assessmentVersion: assessment.assessmentVersion,
      courseQualityGateVersion: assessment.courseQualityGateVersion,
      lessonQualityGateVersion: assessment.lessonQualityGateVersion,
    } satisfies PublicationOwnerOverride : undefined,
  };
}

export async function reviewCourseForPublication(
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  reviewer: { uid: string; isOwner: boolean },
) {
  return reviewCourse(course, lessons, expectedLessonIds, reviewer);
}

export async function reviewCourseForOwnerOverride(
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  reviewer: { uid: string; isOwner: boolean },
  override: { reason: string; expectedAssessmentHash: string },
) {
  return reviewCourse(course, lessons, expectedLessonIds, reviewer, override);
}
