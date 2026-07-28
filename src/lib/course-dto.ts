import "server-only";

import type { Course, LessonData } from "@/lib/course-types";
import { curateLessonVisuals } from "@/lib/lesson-visuals";
import { lessonVisualsEnabled } from "@/lib/feature-flags";

export function toCourseDto(value: Record<string, unknown> | Course, canManage = false): Course {
  const raw = value as Record<string, unknown>;
  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    courseId: typeof raw.id === "string" ? raw.id : undefined,
    topic: String(raw.topic ?? ""),
    mission: typeof raw.mission === "string" ? raw.mission : undefined,
    modules: Array.isArray(raw.modules) ? raw.modules as Course["modules"] : [],
    authorName: typeof raw.authorName === "string" ? raw.authorName : undefined,
    isPublic: raw.isPublic === true,
    level: raw.level as Course["level"],
    estimatedMinutes: typeof raw.estimatedMinutes === "number" ? raw.estimatedMinutes : undefined,
    outcome: typeof raw.outcome === "string" ? raw.outcome : undefined,
    prerequisites: Array.isArray(raw.prerequisites) ? raw.prerequisites.filter((item): item is string => typeof item === "string") : undefined,
    category: typeof raw.category === "string" ? raw.category : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : undefined,
    capstone: raw.capstone && typeof raw.capstone === "object"
      ? raw.capstone as Course["capstone"]
      : undefined,
    aiAssisted: raw.aiAssisted === true
      || (typeof raw.id === "string" && !raw.id.startsWith("catalog-")),
    canManage,
  };
}

export function toLessonDto(value: Record<string, unknown>, courseAiAssisted = false): LessonData {
  return {
    content: String(value.content ?? ""),
    quizzes: Array.isArray(value.quizzes) ? value.quizzes as LessonData["quizzes"] : [],
    learningObjective: typeof value.learningObjective === "string" ? value.learningObjective : undefined,
    connection: typeof value.connection === "string" ? value.connection : undefined,
    keyTakeaways: Array.isArray(value.keyTakeaways)
      ? value.keyTakeaways.filter((item): item is string => typeof item === "string")
      : undefined,
    visuals: lessonVisualsEnabled() ? curateLessonVisuals(value.visuals) : [],
    guidedPractice: value.guidedPractice && typeof value.guidedPractice === "object"
      ? value.guidedPractice as LessonData["guidedPractice"]
      : undefined,
    transferTask: value.transferTask && typeof value.transferTask === "object"
      ? value.transferTask as LessonData["transferTask"]
      : undefined,
    aiAssisted: value.aiAssisted === true || courseAiAssisted,
  };
}
