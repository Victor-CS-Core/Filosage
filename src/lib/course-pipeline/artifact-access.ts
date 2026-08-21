import "server-only";

import type { Course, LessonData } from "@/lib/course-types";
import { getCourse, getLesson, getStoredDocument } from "@/lib/document-store";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";

export class PublishedReleaseUnavailableError extends Error {
  constructor(public readonly courseId: string, public readonly lessonId?: string) {
    super(lessonId
      ? "The published lesson release is temporarily unavailable."
      : "The published course release is temporarily unavailable.");
    this.name = "PublishedReleaseUnavailableError";
  }
}

export async function getCourseRuntimeArtifact(courseId: string): Promise<Course | null> {
  const root = await getCourse(courseId) as Course | null;
  if (!root) return null;
  if (!root.isPublic) return root;
  if (typeof root.publishedReleaseId !== "string") {
    if (courseUsesPipelineV2(root as unknown as Record<string, unknown>)) throw new PublishedReleaseUnavailableError(courseId);
    return root;
  }
  const release = await getStoredDocument(`courseReleases/${root.publishedReleaseId}`);
  if (!release?.course || typeof release.course !== "object") {
    throw new PublishedReleaseUnavailableError(courseId);
  }
  return {
    ...(release.course as Course),
    id: root.id ?? courseId,
    courseId: root.courseId ?? root.id ?? courseId,
    authorId: root.authorId,
    isPublic: true,
    publishedReleaseId: root.publishedReleaseId,
  } as Course;
}

export async function getLessonRuntimeArtifact(
  courseId: string,
  lessonId: string,
  course?: Course | null,
): Promise<LessonData | null> {
  const runtimeCourse = course ?? await getCourseRuntimeArtifact(courseId);
  if (!runtimeCourse) return null;
  if (
    runtimeCourse.isPublic
    && typeof runtimeCourse.publishedReleaseId !== "string"
    && courseUsesPipelineV2(runtimeCourse as unknown as Record<string, unknown>)
  ) {
    throw new PublishedReleaseUnavailableError(courseId, lessonId);
  }
  if (runtimeCourse.isPublic && typeof runtimeCourse.publishedReleaseId === "string") {
    const releasedLesson = await getStoredDocument(`courseReleases/${runtimeCourse.publishedReleaseId}/lessons/${lessonId}`);
    if (!releasedLesson?.lesson || typeof releasedLesson.lesson !== "object") {
      throw new PublishedReleaseUnavailableError(courseId, lessonId);
    }
    return releasedLesson.lesson as LessonData;
  }
  return getLesson(courseId, lessonId) as Promise<LessonData | null>;
}

export function publishedReleaseUnavailableResponse(error: unknown) {
  if (!(error instanceof PublishedReleaseUnavailableError)) return null;
  return Response.json(
    { error: error.message, code: "PUBLISHED_RELEASE_UNAVAILABLE" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
