import { lessonQualityIssues } from "@/lib/lesson-quality";
import { lessonDataSchema } from "@/lib/validation";

export interface PublicationLessonFailure {
  lessonId: string;
  issues: string[];
}

export interface CoursePublishReadiness {
  ready: boolean;
  readyCount: number;
  totalCount: number;
  missingLessonIds: string[];
  invalidLessonIds: string[];
  invalidLessons: PublicationLessonFailure[];
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
): CoursePublishReadiness {
  const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  const missingLessonIds = expectedLessonIds.filter((lessonId) => !lessonsById.has(lessonId));
  const invalidLessons = expectedLessonIds.flatMap((lessonId): PublicationLessonFailure[] => {
    const raw = lessonsById.get(lessonId);
    if (!raw) return [];
    const parsed = schemaIssues(raw);
    const issues = parsed.lesson ? lessonQualityIssues(parsed.lesson, topic) : parsed.issues;
    return issues.length ? [{ lessonId, issues }] : [];
  });
  const invalidLessonIds = invalidLessons.map((lesson) => lesson.lessonId);
  const readyCount = expectedLessonIds.length - missingLessonIds.length - invalidLessonIds.length;

  return {
    ready: missingLessonIds.length === 0 && invalidLessonIds.length === 0,
    readyCount,
    totalCount: expectedLessonIds.length,
    missingLessonIds,
    invalidLessonIds,
    invalidLessons,
  };
}
