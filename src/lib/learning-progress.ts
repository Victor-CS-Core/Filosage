"use client";

import type { CourseProgress, ProgressUpdate } from "@/lib/learning-types";
import { scheduleAdaptiveReview, updateDelayedChecks } from "@/lib/adaptive-learning";

import { activeLearnerUid, readLearnerStorage, writeLearnerStorage } from "@/lib/learner-storage";

function readIndex(uid: string | null): Record<string, CourseProgress> {
  const value = readLearnerStorage<Record<string, CourseProgress>>(uid, "progress");
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function listLocalProgress(uid = activeLearnerUid()) {
  return Object.values(readIndex(uid)).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export function getLocalProgress(courseId: string, uid = activeLearnerUid()) {
  return readIndex(uid)[courseId] ?? null;
}

export function removeLocalProgress(courseId: string, uid = activeLearnerUid()) {
  const index = readIndex(uid);
  delete index[courseId];
  writeLearnerStorage(uid, "progress", "all", index);
}

export function saveLocalProgress(update: ProgressUpdate, uid = activeLearnerUid()) {
  const now = new Date();
  const observedAt = now.toISOString();
  const index = readIndex(uid);
  const previous = index[update.courseId];
  const previousLesson = previous?.lessons[update.lessonId];
  const firstTryRate = update.totalQuestions
    ? update.firstAttemptCorrect / update.totalQuestions
    : 1;
  const schedule = scheduleAdaptiveReview({
    score: firstTryRate,
    confidence: update.confidence,
    previousStage: previousLesson?.intervalStage,
    isReview: update.review === true,
    now,
  });
  const completedLessonIds = Array.from(new Set([...(previous?.completedLessonIds ?? []), update.lessonId]));
  const firstCompletion = !previousLesson?.completedAt;
  const completedAt = previousLesson?.completedAt ?? observedAt;
  const reviewKind = update.review ? update.reviewKind ?? "spaced" : undefined;
  const delayedChecks = updateDelayedChecks(
    completedAt,
    previousLesson?.delayedChecks,
    reviewKind,
    observedAt,
  );
  const reviewHistory = update.review ? [
    ...(previousLesson?.reviewHistory ?? []),
    {
      kind: reviewKind ?? "spaced",
      observedAt,
      score: schedule.score,
      confidence: update.confidence,
      calibration: schedule.calibration,
      performanceBand: schedule.performanceBand,
      intervalStage: schedule.intervalStage,
      retrievalVariantId: update.retrievalVariantId,
      evidenceAuthority: "activity-observed" as const,
    },
  ].slice(-50) : previousLesson?.reviewHistory;

  const next: CourseProgress = {
    courseId: update.courseId,
    topic: update.topic,
    lastLessonId: update.lessonId,
    lastLessonTitle: update.lessonTitle,
    nextLessonId: update.nextLessonId ?? null,
    nextLessonTitle: update.nextLessonTitle ?? null,
    completedLessonIds,
    totalLessons: update.totalLessons ?? previous?.totalLessons,
    lessons: {
      ...(previous?.lessons ?? {}),
      [update.lessonId]: {
        lessonId: update.lessonId,
        lessonTitle: update.lessonTitle,
        objectiveId: update.objectiveId ?? previousLesson?.objectiveId,
        prerequisiteObjectiveIds: update.prerequisiteObjectiveIds ?? previousLesson?.prerequisiteObjectiveIds,
        status: "learned",
        evidenceAuthority: "activity-observed",
        attempts: update.attempts,
        totalQuestions: update.totalQuestions,
        firstAttemptCorrect: update.firstAttemptCorrect,
        score: schedule.score,
        confidence: update.confidence,
        calibration: schedule.calibration,
        performanceBand: schedule.performanceBand,
        intervalStage: schedule.intervalStage,
        nextReviewAt: schedule.nextReviewAt,
        lastStudiedAt: observedAt,
        completedAt,
        delayedChecks,
        reviewHistory,
        retrievalVariantExposures: [
          ...(previousLesson?.retrievalVariantExposures ?? []),
          ...(update.retrievalVariantIds ?? []).map((variantId) => ({ variantId, seenAt: observedAt })),
        ].slice(-100),
        retrievalVariantBank: update.retrievalVariantBank ?? previousLesson?.retrievalVariantBank,
        estimatedMinutes: update.estimatedMinutes ?? previousLesson?.estimatedMinutes,
        misconception: update.misconception ?? previousLesson?.misconception,
        experienceEvidence: update.activityEvidence?.experienceEvidence ?? previousLesson?.experienceEvidence,
        interactionEvidence: update.activityEvidence?.interactionEvidence ?? previousLesson?.interactionEvidence,
      },
    },
    capstone: previous?.capstone,
    studyMinutes: (previous?.studyMinutes ?? 0) + (firstCompletion ? (update.estimatedMinutes ?? 0) : 0),
    lastActivityAt: observedAt,
    startedAt: previous?.startedAt ?? observedAt,
  };

  index[update.courseId] = next;
  writeLearnerStorage(uid, "progress", "all", index);
  return next;
}
