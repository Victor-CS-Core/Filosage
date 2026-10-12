import type { CapstoneAssessment, CourseProgress, LessonProgress } from "@/lib/learning-types";

/**
 * Shared progress document normalization for web and mobile routes.
 * Extracted from src/app/api/progress/route.ts to prevent drift.
 */

export function stableShard(value: string, shardCount: number): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % shardCount;
}

export function asCourseProgress(
  value: Record<string, unknown>,
  includePrivateOperations = false,
): CourseProgress {
  const lessons = value.lessons && typeof value.lessons === "object"
    ? value.lessons as Record<string, LessonProgress>
    : {};
  const inferredMinutes = Object.values(lessons).reduce(
    (sum, lesson) => sum + (lesson.estimatedMinutes ?? 0),
    0,
  );
  const studyMinutes = typeof value.studyMinutes === "number" && value.studyMinutes > 0
    ? value.studyMinutes
    : inferredMinutes;
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    courseId: String(value.courseId ?? value.id ?? ""),
    topic: String(value.topic ?? ""),
    lastLessonId: String(value.lastLessonId ?? ""),
    lastLessonTitle: String(value.lastLessonTitle ?? "Continue learning"),
    nextLessonId: typeof value.nextLessonId === "string" ? value.nextLessonId : null,
    nextLessonTitle: typeof value.nextLessonTitle === "string" ? value.nextLessonTitle : null,
    completedLessonIds: Array.isArray(value.completedLessonIds)
      ? value.completedLessonIds.map(String)
      : [],
    lessons,
    totalLessons: typeof value.totalLessons === "number" ? value.totalLessons : undefined,
    lastActivityAt: String(value.lastActivityAt ?? ""),
    startedAt: String(value.startedAt ?? value.lastActivityAt ?? ""),
    studyMinutes,
    capstone: value.capstone && typeof value.capstone === "object"
      ? value.capstone as CapstoneAssessment
      : undefined,
    ...(includePrivateOperations && Array.isArray(value.recentOperations) ? {
      recentOperations: (value.recentOperations as unknown[])
        .filter((item): item is NonNullable<CourseProgress["recentOperations"]>[number] =>
          Boolean(item) && typeof item === "object")
        .slice(-50),
    } : {}),
  } as CourseProgress;
}
