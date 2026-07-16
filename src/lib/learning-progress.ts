"use client";

import type { CourseProgress, ProgressUpdate } from "@/lib/learning-types";

const INDEX_KEY = "erudoza-learning-state-v2";
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
      localStorage.getItem(`erudoza-progress:${courseId}`)
      ?? localStorage.getItem(`teach-progress:${courseId}`)
      ?? "[]",
    );
    if (Array.isArray(completed) && completed.length) {
      const migrated: CourseProgress = {
        courseId,
        topic,
        lastLessonId: String(completed.at(-1) ?? ""),
        lastLessonTitle: "Continue your course",
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

export function saveLocalProgress(update: ProgressUpdate) {
  const now = new Date();
  const index = readIndex();
  const previous = index[update.courseId];
  const previousLesson = previous?.lessons[update.lessonId];
  const intervals = [1, 3, 7, 14, 30, 60];
  const firstTryRate = update.totalQuestions
    ? update.firstAttemptCorrect / update.totalQuestions
    : 1;
  const successfulReview = update.review && firstTryRate >= 0.8;
  const nextStage = successfulReview
    ? Math.min((previousLesson?.intervalStage ?? 0) + 1, intervals.length - 1)
    : 0;
  const days = update.confidence === "low"
    ? Math.max(1, Math.floor(intervals[nextStage] / 2))
    : intervals[nextStage];
  const nextReviewAt = new Date(now.getTime() + days * 86_400_000).toISOString();
  const completedLessonIds = Array.from(new Set([...(previous?.completedLessonIds ?? []), update.lessonId]));
  const firstCompletion = !previousLesson?.completedAt;

  const next: CourseProgress = {
    courseId: update.courseId,
    topic: update.topic,
    lastLessonId: update.lessonId,
    lastLessonTitle: update.lessonTitle,
    completedLessonIds,
    totalLessons: update.totalLessons ?? previous?.totalLessons,
    lessons: {
      ...(previous?.lessons ?? {}),
      [update.lessonId]: {
        lessonId: update.lessonId,
        lessonTitle: update.lessonTitle,
        status: successfulReview ? "mastered" : "learned",
        attempts: update.attempts,
        totalQuestions: update.totalQuestions,
        firstAttemptCorrect: update.firstAttemptCorrect,
        confidence: update.confidence,
        intervalStage: nextStage,
        nextReviewAt,
        lastStudiedAt: now.toISOString(),
        completedAt: previousLesson?.completedAt ?? now.toISOString(),
        estimatedMinutes: update.estimatedMinutes ?? previousLesson?.estimatedMinutes,
      },
    },
    studyMinutes: (previous?.studyMinutes ?? 0) + (firstCompletion ? (update.estimatedMinutes ?? 0) : 0),
    lastActivityAt: now.toISOString(),
    startedAt: previous?.startedAt ?? now.toISOString(),
  };

  index[update.courseId] = next;
  writeIndex(index);
  localStorage.setItem(`erudoza-progress:${update.courseId}`, JSON.stringify(completedLessonIds));
  return next;
}
