import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import {
  getCourse,
  getStoredDocument,
  listStoredDocuments,
  putStoredDocument,
} from "@/lib/firebase-server";
import { progressUpdateSchema, validationMessage } from "@/lib/validation";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";

function asCourseProgress(value: Record<string, unknown>): CourseProgress {
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    courseId: String(value.courseId ?? value.id ?? ""),
    topic: String(value.topic ?? ""),
    lastLessonId: String(value.lastLessonId ?? ""),
    lastLessonTitle: String(value.lastLessonTitle ?? "Continue learning"),
    completedLessonIds: Array.isArray(value.completedLessonIds) ? value.completedLessonIds.map(String) : [],
    lessons: value.lessons && typeof value.lessons === "object" ? value.lessons as Record<string, LessonProgress> : {},
    totalLessons: typeof value.totalLessons === "number" ? value.totalLessons : undefined,
    lastActivityAt: String(value.lastActivityAt ?? ""),
    startedAt: String(value.startedAt ?? value.lastActivityAt ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");
    if (courseId) {
      const progress = await getStoredDocument(`users/${account.uid}/courseProgress/${courseId}`);
      return Response.json(
        { progress: progress ? asCourseProgress(progress) : null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const documents = await listStoredDocuments(`users/${account.uid}/courseProgress`, 100);
    const progress = documents
      .map(asCourseProgress)
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
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
    const account = await requireAccount(request);
    const parsed = progressUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }

    const update = parsed.data;
    const course = await getCourse(update.courseId);
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }

    const path = `users/${account.uid}/courseProgress/${update.courseId}`;
    const existing = await getStoredDocument(path);
    const previous = existing ? asCourseProgress(existing) : null;
    const previousLesson = previous?.lessons[update.lessonId];
    const now = new Date();
    const intervals = [1, 3, 7, 14, 30, 60];
    const firstTryRate = update.totalQuestions ? update.firstAttemptCorrect / update.totalQuestions : 1;
    const successfulReview = update.review === true && firstTryRate >= 0.8;
    const intervalStage = successfulReview
      ? Math.min((previousLesson?.intervalStage ?? 0) + 1, intervals.length - 1)
      : 0;
    const intervalDays = update.confidence === "low"
      ? Math.max(1, Math.floor(intervals[intervalStage] / 2))
      : intervals[intervalStage];
    const nextReviewAt = new Date(now.getTime() + intervalDays * 86_400_000).toISOString();
    const completedLessonIds = Array.from(new Set([...(previous?.completedLessonIds ?? []), update.lessonId]));

    const lessonProgress: LessonProgress = {
      lessonId: update.lessonId,
      lessonTitle: update.lessonTitle,
      status: successfulReview ? "mastered" : "learned",
      attempts: update.attempts,
      totalQuestions: update.totalQuestions,
      firstAttemptCorrect: update.firstAttemptCorrect,
      confidence: update.confidence,
      intervalStage,
      nextReviewAt,
      lastStudiedAt: now.toISOString(),
      completedAt: previousLesson?.completedAt ?? now.toISOString(),
    };

    const saved = await putStoredDocument(path, {
      courseId: update.courseId,
      topic: update.topic,
      lastLessonId: update.lessonId,
      lastLessonTitle: update.lessonTitle,
      completedLessonIds,
      totalLessons: update.totalLessons ?? previous?.totalLessons ?? null,
      lessons: { ...(previous?.lessons ?? {}), [update.lessonId]: lessonProgress },
      lastActivityAt: now.toISOString(),
      startedAt: previous?.startedAt ?? now.toISOString(),
    });

    return Response.json(
      { progress: asCourseProgress(saved), nextReviewAt },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Progress save failed:", error);
    return Response.json({ error: "Progress could not be saved." }, { status: 500 });
  }
}
