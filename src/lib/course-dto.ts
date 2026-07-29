import "server-only";

import type { Course, LessonData } from "@/lib/course-types";
import { curateLessonVisuals } from "@/lib/lesson-visuals";
import { lessonVisualsEnabled } from "@/lib/feature-flags";
import { normalizeStructuredMarkdown } from "@/lib/markdown";
import { inspectGeneratedContent, sanitizeGeneratedValue } from "@/lib/content-language";

function structuredText(value: unknown) {
  return typeof value === "string" ? normalizeStructuredMarkdown(value) : "";
}

function guidedPracticeDto(value: unknown): LessonData["guidedPractice"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const practice = value as Record<string, unknown>;
  const prompt = structuredText(practice.prompt);
  const modelAnswer = structuredText(practice.modelAnswer);
  const steps = Array.isArray(practice.steps)
    ? practice.steps.filter((item): item is string => typeof item === "string").map(normalizeStructuredMarkdown)
    : [];
  return prompt && modelAnswer && steps.length ? { prompt, steps, modelAnswer } : undefined;
}

function transferTaskDto(value: unknown): LessonData["transferTask"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const task = value as Record<string, unknown>;
  const prompt = structuredText(task.prompt);
  const modelResponse = structuredText(task.modelResponse);
  const successCriteria = Array.isArray(task.successCriteria)
    ? task.successCriteria.filter((item): item is string => typeof item === "string")
    : [];
  return prompt && modelResponse && successCriteria.length
    ? { prompt, successCriteria, modelResponse }
    : undefined;
}

export function toCourseDto(value: Record<string, unknown> | Course, canManage = false): Course {
  const raw = value as Record<string, unknown>;
  const topic = String(raw.topic ?? "");
  const repairedForDisplay = inspectGeneratedContent(raw, topic).length > 0;
  const safe = sanitizeGeneratedValue(raw, topic) as Record<string, unknown>;
  return {
    id: typeof safe.id === "string" ? safe.id : undefined,
    courseId: typeof safe.id === "string" ? safe.id : undefined,
    topic,
    mission: typeof safe.mission === "string" ? safe.mission : undefined,
    modules: Array.isArray(safe.modules) ? safe.modules as Course["modules"] : [],
    authorName: typeof safe.authorName === "string" ? safe.authorName : undefined,
    isPublic: raw.isPublic === true,
    level: raw.level as Course["level"],
    estimatedMinutes: typeof raw.estimatedMinutes === "number" ? raw.estimatedMinutes : undefined,
    outcome: typeof safe.outcome === "string" ? safe.outcome : undefined,
    prerequisites: Array.isArray(safe.prerequisites) ? safe.prerequisites.filter((item): item is string => typeof item === "string") : undefined,
    category: typeof safe.category === "string" ? safe.category : undefined,
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
    capstone: safe.capstone && typeof safe.capstone === "object"
      ? safe.capstone as Course["capstone"]
      : undefined,
    aiAssisted: raw.aiAssisted === true
      || (typeof raw.id === "string" && !raw.id.startsWith("catalog-")),
    canManage,
    contentIntegrity: repairedForDisplay ? { repairedForDisplay: true } : undefined,
  };
}

export function toLessonDto(value: Record<string, unknown>, courseAiAssisted = false, topic = ""): LessonData {
  const safeValue = sanitizeGeneratedValue(value, topic) as Record<string, unknown>;
  value = safeValue;
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
    guidedPractice: guidedPracticeDto(value.guidedPractice),
    transferTask: transferTaskDto(value.transferTask),
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
