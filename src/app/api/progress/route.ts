import { authorizationResponse, requireAcceptedAccount, requireAccount } from "@/lib/auth-server";
import {
  getCourse,
  getStoredDocument,
  listStoredDocuments,
  runStoredDocumentTransaction,
} from "@/lib/firebase-server";
import { progressUpdateSchema, validationMessage } from "@/lib/validation";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";
import type { Course } from "@/lib/course-types";
import { findCourseLesson, findNextLesson } from "@/lib/course-progress";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";

function asCourseProgress(value: Record<string, unknown>): CourseProgress {
  const lessons = value.lessons && typeof value.lessons === "object" ? value.lessons as Record<string, LessonProgress> : {};
  const inferredMinutes = Object.values(lessons).reduce(
    (sum, lesson) => sum + (lesson.estimatedMinutes ?? 0),
    0,
  );
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    courseId: String(value.courseId ?? value.id ?? ""),
    topic: String(value.topic ?? ""),
    lastLessonId: String(value.lastLessonId ?? ""),
    lastLessonTitle: String(value.lastLessonTitle ?? "Continue learning"),
    nextLessonId: typeof value.nextLessonId === "string" ? value.nextLessonId : null,
    nextLessonTitle: typeof value.nextLessonTitle === "string" ? value.nextLessonTitle : null,
    completedLessonIds: Array.isArray(value.completedLessonIds) ? value.completedLessonIds.map(String) : [],
    lessons,
    totalLessons: typeof value.totalLessons === "number" ? value.totalLessons : undefined,
    lastActivityAt: String(value.lastActivityAt ?? ""),
    startedAt: String(value.startedAt ?? value.lastActivityAt ?? ""),
    studyMinutes: typeof value.studyMinutes === "number" && value.studyMinutes > 0 ? value.studyMinutes : inferredMinutes,
  };
}

async function hydrateNextLesson(progress: CourseProgress) {
  if (progress.nextLessonId !== null && progress.nextLessonId !== undefined) return progress;
  const course = await getCourse(progress.courseId) as Course | null;
  if (!course) return progress;
  const next = findNextLesson(course, progress.completedLessonIds);
  return { ...progress, nextLessonId: next?.id ?? null, nextLessonTitle: next?.title ?? null };
}

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");
    if (courseId) {
      const progress = await getStoredDocument(`users/${account.uid}/courseProgress/${courseId}`);
      return Response.json(
        { progress: progress ? await hydrateNextLesson(asCourseProgress(progress)) : null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const documents = await listStoredDocuments(`users/${account.uid}/courseProgress`, 100);
    const progress = await Promise.all(documents
      .map(asCourseProgress)
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
      .map(hydrateNextLesson));
    return Response.json({ progress }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Progress fetch failed:", error);
    return Response.json({ error: "Learning progress is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const parsed = progressUpdateSchema.safeParse(await readJsonBody(request, 8_192));
    if (!parsed.success) {
      return Response.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }

    const update = parsed.data;
    const course = await getCourse(update.courseId) as Course | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }

    const canonical = findCourseLesson(course, update.lessonId);
    if (!canonical) return Response.json({ error: "This lesson is not part of the course." }, { status: 400 });

    const path = `users/${account.uid}/courseProgress/${update.courseId}`;
    const now = new Date();
    const intervals = [1, 3, 7, 14, 30, 60];
    const firstTryRate = update.totalQuestions ? update.firstAttemptCorrect / update.totalQuestions : 1;
    let nextReviewAt = now.toISOString();
    const saved = await runStoredDocumentTransaction([path], (documents) => {
      const previous = documents[path] ? asCourseProgress(documents[path] as Record<string, unknown>) : null;
      const previousLesson = previous?.lessons[update.lessonId];
      const successfulReview = update.review === true && firstTryRate >= 0.8;
      const intervalStage = successfulReview
        ? Math.min((previousLesson?.intervalStage ?? 0) + 1, intervals.length - 1)
        : 0;
      const intervalDays = update.confidence === "low"
        ? Math.max(1, Math.floor(intervals[intervalStage] / 2))
        : intervals[intervalStage];
      nextReviewAt = new Date(now.getTime() + intervalDays * 86_400_000).toISOString();
      const completedLessonIds = Array.from(new Set([...(previous?.completedLessonIds ?? []), update.lessonId]));
      const firstCompletion = !previousLesson?.completedAt;
      const next = findNextLesson(course, completedLessonIds);
      const lessonProgress: LessonProgress = {
        lessonId: update.lessonId,
        lessonTitle: canonical.lesson.title,
        status: successfulReview ? "mastered" : "learned",
        attempts: update.attempts,
        totalQuestions: update.totalQuestions,
        firstAttemptCorrect: update.firstAttemptCorrect,
        confidence: update.confidence,
        intervalStage,
        nextReviewAt,
        lastStudiedAt: now.toISOString(),
        completedAt: previousLesson?.completedAt ?? now.toISOString(),
        estimatedMinutes: canonical.lesson.estimatedMinutes ?? update.estimatedMinutes ?? previousLesson?.estimatedMinutes,
      };
      const progress: CourseProgress = {
        courseId: update.courseId,
        topic: course.topic,
        lastLessonId: update.lessonId,
        lastLessonTitle: canonical.lesson.title,
        nextLessonId: next?.id ?? null,
        nextLessonTitle: next?.title ?? null,
        completedLessonIds,
        totalLessons: course.modules.reduce((sum, courseModule) => sum + courseModule.lessons.length, 0),
        lessons: { ...(previous?.lessons ?? {}), [update.lessonId]: lessonProgress },
        lastActivityAt: now.toISOString(),
        startedAt: previous?.startedAt ?? now.toISOString(),
        studyMinutes: (previous?.studyMinutes ?? 0) + (firstCompletion ? (canonical.lesson.estimatedMinutes ?? update.estimatedMinutes ?? 0) : 0),
      };
      return { writes: [{ path, data: progress as unknown as Record<string, unknown> }], result: progress };
    });

    return Response.json(
      { progress: saved, nextReviewAt },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Progress save failed:", error);
    return Response.json({ error: "Progress could not be saved." }, { status: 500 });
  }
}
