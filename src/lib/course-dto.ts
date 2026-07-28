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
    banner: raw.banner
      && typeof raw.banner === "object"
      && typeof (raw.banner as Record<string, unknown>).assetId === "string"
      && /^[a-f0-9]{32}$/.test(String((raw.banner as Record<string, unknown>).assetId))
      && (raw.banner as Record<string, unknown>).version === 1
      ? {
          assetId: String((raw.banner as Record<string, unknown>).assetId),
          version: 1,
          generatedAt: typeof (raw.banner as Record<string, unknown>).generatedAt === "string"
            ? String((raw.banner as Record<string, unknown>).generatedAt)
            : undefined,
        }
      : undefined,
    canRegenerateBanner: canManage
      ? Number(raw.bannerRegenerationCount ?? 0) < 1
      : undefined,
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
  const rawSources = Array.isArray(value.sourceReferences)
    ? value.sourceReferences.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
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
    provenance: {
      contentVersion: `lesson-v${typeof value.schemaVersion === "number" ? value.schemaVersion : 1}`,
      generatedAt: typeof value.generatedAt === "string"
        ? value.generatedAt
        : typeof value.createdAt === "string"
          ? value.createdAt
          : undefined,
      generationModel: typeof value.generationModel === "string" ? value.generationModel : undefined,
      promptVersion: typeof value.promptVersion === "string" ? value.promptVersion : undefined,
      qualityGateVersion: typeof value.qualityGateVersion === "string" ? value.qualityGateVersion : undefined,
      sources: rawSources.flatMap((item) => {
        if (typeof item.label !== "string") return [];
        return [{
          label: item.label,
          url: typeof item.url === "string" && item.url.startsWith("https://") ? item.url : undefined,
        }];
      }),
    },
  };
}
