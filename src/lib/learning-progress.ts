"use client";

import type { CourseProgress, ProgressUpdate } from "@/lib/learning-types";
import { scheduleAdaptiveReview, updateDelayedChecks } from "@/lib/adaptive-learning";

const INDEX_KEY = "filosage-learning-state-v2";
const LEGACY_INDEX_KEY = "teach-learning-state-v2";

function readIndex(): Record<string, CourseProgress> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(INDEX_KEY) ?? localStorage.getItem(LEGACY_INDEX_KEY) ?? "{}";
    const value = JSON.parse(stored);
    if (!localStorage.getItem(INDEX_KEY) && localStorage.getItem(LEGACY_INDEX_KEY)) {
      localStorage.setItem(INDEX_KEY, JSON.stringify(value));
    }
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeIndex(index: Record<string, CourseProgress>) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function removeFromStoredIndex(key: string, courseId: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value) || !(courseId in value)) return;
    delete value[courseId];
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    localStorage.removeItem(key);
  }
}

export function listLocalProgress() {
  return Object.values(readIndex()).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export function getLocalProgress(courseId: string, topic = "") {
  const index = readIndex();
  const current = index[courseId];
  if (current) return current;

  // Preserve progress created by the original device-only implementation.
  try {
    const completed = JSON.parse(
      localStorage.getItem(`filosage-progress:${courseId}`)
      ?? localStorage.getItem(`teach-progress:${courseId}`)
      ?? "[]",
    );
    if (Array.isArray(completed) && completed.length) {
      const migrated: CourseProgress = {
        courseId,
        topic,
        lastLessonId: String(completed[completed.length - 1] ?? ""),
        lastLessonTitle: "Continue your course",
        nextLessonId: null,
        nextLessonTitle: null,
        completedLessonIds: completed.map(String),
        lessons: {},
        studyMinutes: 0,
        lastActivityAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      };
      index[courseId] = migrated;
      writeIndex(index);
      return migrated;
    }
  } catch {
    // A damaged legacy value should not block learning.
  }
  return null;
}

export function removeLocalProgress(courseId: string) {
  if (typeof window === "undefined") return;
  removeFromStoredIndex(INDEX_KEY, courseId);
  removeFromStoredIndex(LEGACY_INDEX_KEY, courseId);
  localStorage.removeItem(`filosage-progress:${courseId}`);
  localStorage.removeItem(`teach-progress:${courseId}`);
}

export function saveLocalProgress(update: ProgressUpdate) {
  const now = new Date();
  const observedAt = now.toISOString();
  const index = readIndex();
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
  writeIndex(index);
  localStorage.setItem(`filosage-progress:${update.courseId}`, JSON.stringify(completedLessonIds));
  return next;
}
