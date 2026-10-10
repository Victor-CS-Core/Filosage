import { z } from "zod";
import { withAccountRequest, requireAcceptedAccount, authorizationResponse } from "@/lib/auth-server";
import { readJsonBody, apiRequestErrorResponse } from "@/lib/api-security";
import { validationMessage } from "@/lib/validation";
import { runStoredDocumentTransaction } from "@/lib/document-store";
import { getCourseRuntimeArtifact, publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";
import { findCourseLesson, findNextLesson } from "@/lib/course-progress";
import { canonicalLessonObjectiveId } from "@/lib/course-pipeline/relationships";
import { scheduleAdaptiveReview } from "@/lib/adaptive-learning";
import type { CapstoneAssessment, CourseProgress, LessonProgress } from "@/lib/learning-types";
import type { Course } from "@/lib/course-types";

/**
 * Mobile lesson completions (Filosage iOS app).
 *
 * The web's POST /api/progress requires session-scoped activity receipts minted
 * by the browser lesson player, so a native client cannot replay that contract.
 * This endpoint accepts the same kind of event (a finished lesson) under the
 * app's bearer-token auth and writes the exact same courseProgress documents,
 * so filosage.com sees app study as first-class progress. Reviews and quiz
 * analytics stay web-only for now: the app records no question evidence, so
 * totals stay at zero and evidenceAuthority is "activity-observed".
 */

const mobileCompletionSchema = z.object({
  courseId: z.string().min(1).max(200),
  lessonId: z.string().regex(/^\d{1,3}-\d{1,3}$/, "Use the lesson's position, like 0-2."),
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stableShard(value: string, shardCount: number) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % shardCount;
}

// Same normalizer as the web progress route so legacy or partial documents are
// read with identical semantics.
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
    capstone: value.capstone && typeof value.capstone === "object" ? value.capstone as CapstoneAssessment : undefined,
  };
}

async function handlePOST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const parsed = mobileCompletionSchema.safeParse(await readJsonBody(request, 2048));
    if (!parsed.success) {
      return Response.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }
    const submitted = parsed.data;

    const course = await getCourseRuntimeArtifact(submitted.courseId) as Course | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }
    const canonical = findCourseLesson(course, submitted.lessonId);
    if (!canonical) {
      return Response.json({ error: "This lesson is not part of the course." }, { status: 400 });
    }

    const now = new Date();
    const observedAt = now.toISOString();
    // The app sends no quiz evidence; treat the read as a confident first pass
    // so the lesson still gets a sane spaced-review schedule on the web.
    const confidence = submitted.confidence ?? "medium";
    const adaptive = scheduleAdaptiveReview({ score: 1, confidence, isReview: false, now });

    const progressPath = `users/${account.uid}/courseProgress/${submitted.courseId}`;
    const engagementPath = `userEngagement/${account.uid}`;
    const engagementShard = stableShard(account.uid, 16);
    const dailyEngagementPath = `engagementDaily/${now.toISOString().slice(0, 10)}__${engagementShard}`;

    const saved = await runStoredDocumentTransaction(
      [progressPath, engagementPath, dailyEngagementPath],
      (documents) => {
        const previous = documents[progressPath]
          ? asCourseProgress(documents[progressPath] as Record<string, unknown>)
          : null;

        // Idempotent: re-sending a completion (offline retry, second device)
        // never double-counts or rewrites the original completion time.
        if (previous?.completedLessonIds.includes(submitted.lessonId)) {
          return { writes: [] as Array<{ path: string; data: Record<string, unknown> }>, result: { progress: previous, alreadyCompleted: true } };
        }

        const completedLessonIds = Array.from(new Set([...(previous?.completedLessonIds ?? []), submitted.lessonId]));
        const next = findNextLesson(course, completedLessonIds);
        const firstCompletion = !previous?.lessons[submitted.lessonId]?.completedAt;
        const studyMinutesAdded = firstCompletion ? canonical.lesson.estimatedMinutes ?? 0 : 0;

        const lessonProgress: LessonProgress = {
          lessonId: submitted.lessonId,
          lessonTitle: canonical.lesson.title,
          objectiveId: canonical.lesson.objectiveId
            ?? canonicalLessonObjectiveId(canonical.moduleIndex, canonical.lessonIndex),
          status: "learned",
          evidenceAuthority: "activity-observed",
          attempts: 0,
          totalQuestions: 0,
          firstAttemptCorrect: 0,
          score: adaptive.score,
          confidence,
          calibration: adaptive.calibration,
          performanceBand: adaptive.performanceBand,
          intervalStage: adaptive.intervalStage,
          nextReviewAt: adaptive.nextReviewAt,
          lastStudiedAt: observedAt,
          completedAt: observedAt,
          estimatedMinutes: canonical.lesson.estimatedMinutes,
          misconception: canonical.lesson.misconception,
        };

        const progress: CourseProgress = {
          courseId: submitted.courseId,
          topic: course.topic,
          lastLessonId: submitted.lessonId,
          lastLessonTitle: canonical.lesson.title,
          nextLessonId: next?.id ?? null,
          nextLessonTitle: next?.title ?? null,
          completedLessonIds,
          lessons: { ...(previous?.lessons ?? {}), [submitted.lessonId]: lessonProgress },
          totalLessons: course.modules.reduce((sum, courseModule) => sum + courseModule.lessons.length, 0),
          lastActivityAt: observedAt,
          startedAt: previous?.startedAt ?? observedAt,
          studyMinutes: (previous?.studyMinutes ?? 0) + studyMinutesAdded,
        };

        const engagement = documents[engagementPath];
        const daily = documents[dailyEngagementPath];
        const engagementPatch = {
          uid: account.uid,
          coursesStarted: numberValue(engagement?.coursesStarted) + (previous ? 0 : 1),
          lessonsCompleted: numberValue(engagement?.lessonsCompleted) + (firstCompletion ? 1 : 0),
          studyMinutes: numberValue(engagement?.studyMinutes) + studyMinutesAdded,
          questionsAnswered: numberValue(engagement?.questionsAnswered),
          correctAnswers: numberValue(engagement?.correctAnswers),
          lastActivityAt: observedAt,
          lastCourseId: submitted.courseId,
          lastTopic: course.topic,
          updatedAt: observedAt,
        };
        const dailyPatch = {
          date: now.toISOString().slice(0, 10),
          shard: engagementShard,
          coursesStarted: numberValue(daily?.coursesStarted) + (previous ? 0 : 1),
          lessonsCompleted: numberValue(daily?.lessonsCompleted) + (firstCompletion ? 1 : 0),
          studyMinutes: numberValue(daily?.studyMinutes) + studyMinutesAdded,
          questionsAnswered: numberValue(daily?.questionsAnswered),
          correctAnswers: numberValue(daily?.correctAnswers),
          updatedAt: observedAt,
        };

        return {
          writes: [
            { path: progressPath, data: progress as unknown as Record<string, unknown> },
            { path: engagementPath, data: { ...(engagement ?? {}), ...engagementPatch } },
            { path: dailyEngagementPath, data: { ...(daily ?? {}), ...dailyPatch } },
          ],
          result: { progress, alreadyCompleted: false },
        };
      },
    );

    const publicProgress = { ...saved.progress };
    delete publicProgress.recentOperations;
    return Response.json(
      {
        progress: publicProgress,
        alreadyCompleted: saved.alreadyCompleted,
        nextReviewAt: adaptive.nextReviewAt,
        intervalDays: adaptive.intervalDays,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({
      event: "progress_mobile_save_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return Response.json({ error: "Progress could not be saved." }, { status: 500 });
  }
}

export const POST = withAccountRequest(handlePOST);
