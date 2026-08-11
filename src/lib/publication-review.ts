import "server-only";

import type { Course, LessonData } from "@/lib/course-types";
import { assertLocallySafeContentBatch, MODERATION_MODEL } from "@/lib/content-safety";
import { LESSON_QUALITY_GATE_VERSION } from "@/lib/lesson-quality";
import {
  assessCourseForPublication,
  type PublicationAssessment,
} from "@/lib/publication-assessment";
import type { PublicationLessonFailure } from "@/lib/publication-readiness";
import { publicationContentFingerprint, publicationContentHash } from "@/lib/publication-content";
import { parseCourseCandidate, parseLessonCandidate } from "@/lib/course-pipeline/compatibility";
import type { PublicationDecision, ValidationReport } from "@/lib/course-pipeline/contract";
import { publicationDecisionFromReport, validateCourseCandidateV2 } from "@/lib/course-pipeline/validation";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { recordCoursePipelineEvent } from "@/lib/course-pipeline/observability";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { expectedLessonModes } from "@/lib/course-progress";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";

export const PUBLICATION_REVIEW_VERSION = "publication-v3-classified-override";
export const PUBLICATION_SAFETY_REVIEW_BASIS = "generation-output-moderation+publication-local-scan";

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
  safetyReviewBasis: typeof PUBLICATION_SAFETY_REVIEW_BASIS;
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
  const validationV2Active = flags.validationV2 && pipelineV2Artifact;
  const publicationV2Active = flags.publicationV2 && pipelineV2Artifact;
  const validationReport = (validationV2Active || publicationV2Active || flags.shadowMode)
    ? await validateCourseCandidateV2(course, lessons, expectedLessonIds, expectedLessonModes(course))
    : undefined;
  const publicationDecision = validationReport ? publicationDecisionFromReport(validationReport) : undefined;
  const manualReviewResolution = course.manualReviewResolution as {
    status?: string;
    snapshotHash?: string;
    contractVersion?: string;
    reviewId?: string;
  } | undefined;
  const manualReviewApproved = publicationDecision?.decision === "manual_review"
    && manualReviewResolution?.status === "approved"
    && manualReviewResolution.snapshotHash === validationReport?.snapshotHash
    && manualReviewResolution.contractVersion === validationReport?.contractVersion;

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

  if (publicationV2Active && publicationDecision?.decision !== "publishable" && !manualReviewApproved) {
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

  if (!publicationV2Active && assessment.nonOverridableIssues.length) {
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
      moderationModel: MODERATION_MODEL,
      reviewVersion: PUBLICATION_REVIEW_VERSION,
      qualityGateVersion: LESSON_QUALITY_GATE_VERSION,
      factualReviewStatus: "unverified",
      safetyReviewBasis: PUBLICATION_SAFETY_REVIEW_BASIS,
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
    moderationModel: MODERATION_MODEL,
    reviewVersion: PUBLICATION_REVIEW_VERSION,
    factualReviewStatus: "unverified" as const,
    safetyReviewBasis: PUBLICATION_SAFETY_REVIEW_BASIS,
    sourceUpdatedAt: typeof course.updatedAt === "string" ? course.updatedAt : undefined,
    sourceFingerprint: publicationContentFingerprint(course),
    assessment,
    assessmentHash,
    validationReport,
    publicationDecision,
    artifactSnapshotHash: validationReport?.snapshotHash ?? assessmentHash,
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
