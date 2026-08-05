import type { LessonMode } from "@/lib/course-types";
import { lessonQualityIssues, LESSON_QUALITY_GATE_VERSION } from "@/lib/lesson-quality";
import { INTERACTION_QUALITY_GATE_VERSION } from "@/lib/lesson-interactions";
import { lessonDataSchema } from "@/lib/validation";

export interface PublicationLessonFailure {
  lessonId: string;
  issues: string[];
  category: "structure" | "quality";
  overridable: boolean;
  generatedWithQualityGate?: string;
  currentQualityGate: string;
}

export interface CoursePublishReadiness {
  ready: boolean;
  readyCount: number;
  totalCount: number;
  missingLessonIds: string[];
  invalidLessonIds: string[];
  invalidLessons: PublicationLessonFailure[];
  legacyLessonIds: string[];
  legacyInteractionLessonIds: string[];
}

function schemaIssues(value: unknown) {
  const parsed = lessonDataSchema.safeParse(value);
  if (parsed.success) return { lesson: parsed.data, issues: [] };

  const issues = parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "Lesson data"}: ${issue.message}`);
  return { lesson: null, issues: issues.length ? issues : ["The lesson uses an incomplete legacy structure."] };
}

export function inspectCoursePublishReadiness(
  lessons: Array<Record<string, unknown>>,
  expectedLessonIds: string[],
  topic: string,
  expectedModesByLessonId: Readonly<Record<string, LessonMode | undefined>> = {},
): CoursePublishReadiness {
  const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  const missingLessonIds = expectedLessonIds.filter((lessonId) => !lessonsById.has(lessonId));
  const invalidLessons = expectedLessonIds.flatMap((lessonId): PublicationLessonFailure[] => {
    const raw = lessonsById.get(lessonId);
    if (!raw) return [];
    const parsed = schemaIssues(raw);
    const schemaVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1;
    const expectedMode = schemaVersion >= 4 || Boolean(raw.experience)
      ? expectedModesByLessonId[lessonId]
      : undefined;
    const issues = parsed.lesson
      ? lessonQualityIssues(parsed.lesson, topic, expectedMode, { requireInteractionV2: schemaVersion >= 5 })
      : parsed.issues;
    return issues.length ? [{
      lessonId,
      issues,
      category: parsed.lesson ? "quality" : "structure",
      overridable: Boolean(parsed.lesson),
      generatedWithQualityGate: typeof raw.qualityGateVersion === "string" ? raw.qualityGateVersion : undefined,
      currentQualityGate: LESSON_QUALITY_GATE_VERSION,
    }] : [];
  });
  const invalidLessonIds = invalidLessons.map((lesson) => lesson.lessonId);
  const legacyLessonIds = expectedLessonIds.filter((lessonId) => {
    const raw = lessonsById.get(lessonId);
    return Boolean(raw) && raw?.qualityGateVersion !== LESSON_QUALITY_GATE_VERSION;
  });
  const legacyInteractionLessonIds = expectedLessonIds.filter((lessonId) => {
    const raw = lessonsById.get(lessonId);
    const schemaVersion = typeof raw?.schemaVersion === "number" ? raw.schemaVersion : 1;
    return Boolean(raw)
      && (schemaVersion < 5 || raw?.interactionQualityGateVersion !== INTERACTION_QUALITY_GATE_VERSION);
  });
  const readyCount = expectedLessonIds.length - missingLessonIds.length - invalidLessonIds.length;

  return {
    ready: missingLessonIds.length === 0 && invalidLessonIds.length === 0,
    readyCount,
    totalCount: expectedLessonIds.length,
    missingLessonIds,
    invalidLessonIds,
    invalidLessons,
    legacyLessonIds,
    legacyInteractionLessonIds,
  };
}
