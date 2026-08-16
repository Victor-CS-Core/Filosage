import { buildAdaptiveReviewQueue, type AdaptiveReviewCandidate } from "@/lib/adaptive-learning";
import {
  projectLearnerReadiness,
  type ObjectiveRelationshipIndex,
  type ReadinessSignal,
} from "@/lib/learner-readiness";
import type { CourseProgress, LessonProgress, ReviewRecord } from "@/lib/learning-types";
import { normalizeObjectiveId } from "@/lib/learning-design";
import { composeInterleavedReviewSession } from "@/lib/retrieval-planning";

function canonicalProgressObjective(lesson: LessonProgress) {
  if (lesson.objectiveId) return normalizeObjectiveId(lesson.objectiveId);
  const coordinates = /^(\d+)-(\d+)$/.exec(lesson.lessonId);
  return coordinates ? `objective-m${coordinates[1]}-l${coordinates[2]}` : null;
}

function runtimeObjectiveId(courseId: string, objectiveId: string) {
  return `${courseId}::${objectiveId}`;
}

function persistedObjectiveId(objectiveId: string) {
  const separator = objectiveId.indexOf("::");
  return separator >= 0 ? objectiveId.slice(separator + 2) : objectiveId;
}

function signalFor(
  courseId: string,
  lesson: LessonProgress,
  objectiveId: string,
  record?: ReviewRecord,
): ReadinessSignal {
  const observedAt = record?.observedAt ?? lesson.lastStudiedAt;
  const score = record?.score ?? lesson.score;
  const evidence = {
    id: `${courseId}:${lesson.lessonId}:${record ? `review:${observedAt}` : "completion"}`,
    objectiveId,
    type: "retrieval" as const,
    result: (score ?? 0) >= 0.7 ? "passed" as const : "needs_work" as const,
    observedAt,
    score,
  };
  const authority = record?.evidenceAuthority ?? lesson.evidenceAuthority;
  if (authority === "criterion-assessed") {
    return {
      evidence,
      evidenceConfidence: "criterion-assessed",
      assessmentVersion: "capability-cycle-v1",
      reviewKind: record?.kind,
    };
  }
  if (authority === "receipt-verified") {
    return {
      evidence,
      evidenceConfidence: "receipt-verified",
      receiptVerifiedAt: observedAt,
      reviewKind: record?.kind,
    };
  }
  return {
    evidence,
    evidenceConfidence: "activity-observed",
    reviewKind: record?.kind,
  };
}

export function progressReadinessContext(progress: readonly CourseProgress[]) {
  const objectiveIds: string[] = [];
  const prerequisitesByObjectiveId: Record<string, string[]> = {};
  const unresolvedPrerequisitesByObjectiveId: Record<string, string[]> = {};
  const signals: ReadinessSignal[] = [];

  for (const course of progress) {
    for (const lesson of Object.values(course.lessons)) {
      const persistedId = canonicalProgressObjective(lesson);
      if (!persistedId) continue;
      const objectiveId = runtimeObjectiveId(course.courseId, persistedId);
      objectiveIds.push(objectiveId);
      prerequisitesByObjectiveId[objectiveId] = (lesson.prerequisiteObjectiveIds ?? [])
        .flatMap((value) => {
          const normalized = normalizeObjectiveId(value);
          return normalized ? [runtimeObjectiveId(course.courseId, normalized)] : [];
        });
      unresolvedPrerequisitesByObjectiveId[objectiveId] = [];
      signals.push(signalFor(course.courseId, lesson, objectiveId));
      for (const record of lesson.reviewHistory ?? []) {
        signals.push(signalFor(course.courseId, lesson, objectiveId, record));
      }
    }
  }
  const relationships: ObjectiveRelationshipIndex = {
    objectiveIds: [...new Set(objectiveIds)],
    prerequisitesByObjectiveId,
    unresolvedPrerequisitesByObjectiveId,
  };
  return {
    relationships,
    readiness: projectLearnerReadiness({ relationships, signals }),
  };
}

export function buildPrerequisiteSafeReviewQueue(
  progress: readonly CourseProgress[],
  now = new Date(),
): AdaptiveReviewCandidate[] {
  const lessons = new Map(progress.flatMap((course) => Object.values(course.lessons)
    .map((lesson) => [`${course.courseId}:${lesson.lessonId}`, lesson] as const)));
  const { relationships, readiness } = progressReadinessContext(progress);
  const candidates = buildAdaptiveReviewQueue([...progress], now).flatMap((candidate) => {
    const lesson = lessons.get(`${candidate.courseId}:${candidate.lessonId}`);
    const persistedId = lesson ? canonicalProgressObjective(lesson) : null;
    if (!lesson || !persistedId) return [];
    const objectiveId = runtimeObjectiveId(candidate.courseId, persistedId);
    const persistedVariants = lesson.retrievalVariantBank ?? [];
    const variants = (persistedVariants.length ? persistedVariants : [{
      id: `legacy-schedule-${candidate.lessonId.replace(/[^a-z0-9-]+/gi, "-")}`,
      objectiveId: persistedId,
      contextKey: "legacy-scheduling-only",
    }]).map((variant) => ({ ...variant, objectiveId }));
    return [{
      ...candidate,
      objectiveId,
      prerequisiteObjectiveIds: (lesson.prerequisiteObjectiveIds ?? []).flatMap((value) => {
        const normalized = normalizeObjectiveId(value);
        return normalized ? [runtimeObjectiveId(candidate.courseId, normalized)] : [];
      }),
      unresolvedPrerequisiteTitles: [],
      variants,
      variantExposures: lesson.retrievalVariantExposures ?? [],
    }];
  });
  return composeInterleavedReviewSession({
    candidates,
    readiness,
    relationships,
    now,
    limit: 100,
  }).map((item) => ({
    ...item.candidate,
    objectiveId: persistedObjectiveId(item.candidate.objectiveId),
  }));
}
