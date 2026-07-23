import "server-only";

import type { Course, LessonData } from "@/lib/course-types";

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
    canManage,
  };
}

export function toLessonDto(value: Record<string, unknown>): LessonData {
  return {
    content: String(value.content ?? ""),
    diagram: String(value.diagram ?? ""),
    diagramSummary: typeof value.diagramSummary === "string" ? value.diagramSummary : undefined,
    quizzes: Array.isArray(value.quizzes) ? value.quizzes as LessonData["quizzes"] : [],
  };
}
