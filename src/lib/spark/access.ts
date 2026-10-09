import "server-only";

import type { ServerAccount } from "@/lib/account-server";
import { findCourseLesson } from "@/lib/course-progress";
import {
  getCourseRuntimeArtifact,
  getLessonRuntimeArtifact,
} from "@/lib/course-pipeline/artifact-access";
import { publicationContentHash } from "@/lib/publication-content";
import type { Course, LessonData, LessonSummary } from "@/lib/course-types";

export class SparkAccessError extends Error {
  constructor(
    public readonly status: 403 | 404 | 409,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface SparkLessonContext {
  course: Course;
  lesson: LessonData;
  summary: LessonSummary;
  courseId: string;
  lessonId: string;
  lessonVersion: string;
  contentHash: string;
}

export function sparkSafeId(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return /^[a-z0-9]/.test(normalized) ? normalized : fallback;
}

export async function requireSparkLessonAccess(
  account: Pick<ServerAccount, "uid" | "isOwner">,
  courseId: string,
  lessonId: string,
  requestedVersion?: string,
): Promise<SparkLessonContext> {
  const course = await getCourseRuntimeArtifact(courseId) as Course | null;
  if (!course) throw new SparkAccessError(404, "SPARK_COURSE_NOT_FOUND", "Course not found.");
  if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
    throw new SparkAccessError(403, "SPARK_COURSE_FORBIDDEN", "You do not have access to this course.");
  }
  const canonical = findCourseLesson(course, lessonId);
  if (!canonical) {
    throw new SparkAccessError(404, "SPARK_LESSON_NOT_FOUND", "This lesson is not part of the course.");
  }
  const lesson = await getLessonRuntimeArtifact(courseId, lessonId, course) as LessonData | null;
  if (!lesson) throw new SparkAccessError(404, "SPARK_LESSON_NOT_FOUND", "This lesson is not available yet.");
  const contentHash = await publicationContentHash({ summary: canonical.lesson, lesson });
  const lessonVersion = `lesson-${contentHash.slice(0, 32)}`;
  if (requestedVersion && requestedVersion !== lessonVersion) {
    throw new SparkAccessError(409, "SPARK_STALE_LESSON", "This lesson changed. Reload Spark before continuing.");
  }
  return {
    course,
    lesson,
    summary: canonical.lesson,
    courseId,
    lessonId,
    lessonVersion,
    contentHash,
  };
}

export function sparkAccessErrorResponse(error: unknown) {
  if (!(error instanceof SparkAccessError)) return null;
  return Response.json(
    { error: error.message, code: error.code },
    { status: error.status, headers: { "Cache-Control": "private, no-store" } },
  );
}