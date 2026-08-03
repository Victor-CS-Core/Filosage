import { authorizationResponse, requireAcceptedAccount, requireAccount } from "@/lib/auth-server";
import {
  deleteStoredDocuments,
  getCourse,
  getLesson,
  getStoredDocument,
  listStoredDocuments,
  runStoredDocumentTransaction,
} from "@/lib/firebase-server";
import { progressUpdateSchema, validationMessage } from "@/lib/validation";
import type { CapstoneAssessment, CourseProgress, LessonProgress } from "@/lib/learning-types";
import type { Course } from "@/lib/course-types";
import { findCourseLesson, findNextLesson } from "@/lib/course-progress";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { scheduleAdaptiveReview, updateDelayedChecks } from "@/lib/adaptive-learning";
import { verifyActivityReceipt } from "@/lib/activity-receipts";

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

async function resolveActiveProgress(
  progress: CourseProgress,
  account: { uid: string; isOwner: boolean },
) {
  const course = await getCourse(progress.courseId) as Course | null;
  if (!course) return { status: "deleted" as const, progress: null };
  if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
    return { status: "inaccessible" as const, progress: null };
  }
  if (progress.nextLessonId !== null && progress.nextLessonId !== undefined) {
    return { status: "active" as const, progress };
  }
  const next = findNextLesson(course, progress.completedLessonIds);
  return {
    status: "active" as const,
    progress: { ...progress, nextLessonId: next?.id ?? null, nextLessonTitle: next?.title ?? null },
  };
}

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");
    if (courseId) {
      const path = `users/${account.uid}/courseProgress/${courseId}`;
      const stored = await getStoredDocument(path);
      const resolved = stored
        ? await resolveActiveProgress(asCourseProgress(stored), account)
        : null;
      if (resolved?.status === "deleted") await deleteStoredDocuments([path]);
      return Response.json(
        { progress: resolved?.progress ?? null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const documents = await listStoredDocuments(`users/${account.uid}/courseProgress`, 100);
    const records = documents
      .map((document) => ({ document, progress: asCourseProgress(document) }))
      .sort((left, right) => right.progress.lastActivityAt.localeCompare(left.progress.lastActivityAt));
    const resolutions = await Promise.all(records.map(async (record) => ({
      document: record.document,
      courseId: record.progress.courseId,
      resolution: await resolveActiveProgress(record.progress, account),
    })));
    const stalePaths = resolutions.flatMap(({ courseId: deletedCourseId, document, resolution }) =>
      resolution.status === "deleted"
        ? [`users/${account.uid}/courseProgress/${document.id ?? deletedCourseId}`]
        : [],
    );
    await deleteStoredDocuments(stalePaths);
    const progress = resolutions.flatMap(({ resolution }) =>
      resolution.progress ? [resolution.progress] : [],
    );
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
    const parsed = progressUpdateSchema.safeParse(await readJsonBody(request, 16_384));
    if (!parsed.success) {
      return Response.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }

    const submitted = parsed.data;
    const course = await getCourse(submitted.courseId) as Course | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }

    const canonical = findCourseLesson(course, submitted.lessonId);
    if (!canonical) return Response.json({ error: "This lesson is not part of the course." }, { status: 400 });
    const lesson = await getLesson(submitted.courseId, submitted.lessonId);
    if (!lesson) return Response.json({ error: "Generate or open the lesson before completing it." }, { status: 409 });

    const quizzes = Array.isArray(lesson.quizzes) ? lesson.quizzes : [];
    const evidence = submitted.activityEvidence;
    const quizEvidence = evidence?.quizResults ?? [];
    const evidenceIndexes = new Set(quizEvidence.map((result) => result.quizIndex));
    const evidenceIsComplete = evidenceIndexes.size === quizzes.length
      && quizEvidence.length === quizzes.length
      && quizEvidence.every((result) => result.quizIndex < quizzes.length);
    const transferTaskRequired = Boolean(
      lesson.transferTask
      && typeof lesson.transferTask === "object"
      && !Array.isArray(lesson.transferTask),
    );
    const transferResponse = evidence?.transferResponse?.trim() ?? "";
    const expectedExperienceType = lesson.experience
      && typeof lesson.experience === "object"
      && !Array.isArray(lesson.experience)
      && typeof (lesson.experience as Record<string, unknown>).type === "string"
      ? String((lesson.experience as Record<string, unknown>).type)
      : null;
    const experienceEvidence = evidence?.experienceEvidence;
    const experienceIsComplete = !expectedExperienceType || Boolean(
      experienceEvidence?.completed
      && experienceEvidence.type === expectedExperienceType
      && experienceEvidence.response.trim().length >= 20,
    );
    if (!submitted.review && (!evidence || !evidenceIsComplete || !experienceIsComplete || (transferTaskRequired && transferResponse.length < 20))) {
      return Response.json(
        { error: "Complete the active lesson response, every retrieval check, and the transfer task before finishing the lesson." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const requiresVerifiedAuthorActivity = !submitted.review
      && !account.isOwner
      && course.authorId === account.uid
      && !course.isPublic;
    const verifiedClaims = requiresVerifiedAuthorActivity
      ? await Promise.all(quizEvidence.map((result) =>
        result.receipt
          ? verifyActivityReceipt(result.receipt, {
            uid: account.uid,
            courseId: submitted.courseId,
            lessonId: submitted.lessonId,
            quizIndex: result.quizIndex,
          })
          : Promise.resolve(null),
      ))
      : [];
    if (requiresVerifiedAuthorActivity && verifiedClaims.some((claims) => !claims)) {
      return Response.json(
        { error: "Complete each lesson activity in this session before unlocking the next lesson." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const totalQuestions = quizEvidence.length;
    const firstAttemptCorrect = requiresVerifiedAuthorActivity
      ? verifiedClaims.filter((claims) => claims?.firstAttemptCorrect).length
      : quizEvidence.filter((result) => result.firstAttemptCorrect).length;
    const attempts = requiresVerifiedAuthorActivity
      ? verifiedClaims.reduce((sum, claims) => sum + (claims?.attempts ?? 0), 0)
      : quizEvidence.reduce((sum, result) => sum + result.attempts, 0);
    const confidences = quizEvidence.map((result) => result.confidence);
    const confidence = confidences.includes("low") ? "low"
      : confidences.includes("medium") ? "medium"
        : submitted.confidence;
    const update = {
      ...submitted,
      totalQuestions,
      firstAttemptCorrect,
      attempts,
      confidence,
    };

    const path = `users/${account.uid}/courseProgress/${update.courseId}`;
    const now = new Date();
    const observedAt = now.toISOString();
    const engagementPath = `userEngagement/${account.uid}`;
    const engagementShard = stableShard(account.uid, 16);
    const dailyEngagementPath = `engagementDaily/${now.toISOString().slice(0, 10)}__${engagementShard}`;
    const firstTryRate = update.totalQuestions ? update.firstAttemptCorrect / update.totalQuestions : 1;
    let adaptiveResult = scheduleAdaptiveReview({
      score: firstTryRate,
      confidence: update.confidence,
      isReview: update.review === true,
      now,
    });
    const saved = await runStoredDocumentTransaction(
      [path, engagementPath, dailyEngagementPath],
      (documents) => {
      const previous = documents[path] ? asCourseProgress(documents[path] as Record<string, unknown>) : null;
      const previousLesson = previous?.lessons[update.lessonId];
      adaptiveResult = scheduleAdaptiveReview({
        score: firstTryRate,
        confidence: update.confidence,
        previousStage: previousLesson?.intervalStage,
        isReview: update.review === true,
        now,
      });
      const completedLessonIds = Array.from(new Set([...(previous?.completedLessonIds ?? []), update.lessonId]));
      const firstCompletion = !previousLesson?.completedAt;
      const next = findNextLesson(course, completedLessonIds);
      const completedAt = previousLesson?.completedAt ?? observedAt;
      const reviewKind = update.review ? update.reviewKind ?? "spaced" : undefined;
      const delayedChecks = updateDelayedChecks(
        completedAt,
        previousLesson?.delayedChecks,
        reviewKind,
        observedAt,
      );
      const reviewHistory = update.review ? [
        ...(previousLesson?.reviewHistory ?? []),
        {
          kind: reviewKind ?? "spaced",
          observedAt,
          score: adaptiveResult.score,
          confidence: update.confidence,
          calibration: adaptiveResult.calibration,
          performanceBand: adaptiveResult.performanceBand,
          intervalStage: adaptiveResult.intervalStage,
        },
      ].slice(-50) : previousLesson?.reviewHistory;
      const lessonProgress: LessonProgress = {
        lessonId: update.lessonId,
        lessonTitle: canonical.lesson.title,
        status: update.review && adaptiveResult.performanceBand === "secure" ? "mastered" : "learned",
        attempts: update.attempts,
        totalQuestions: update.totalQuestions,
        firstAttemptCorrect: update.firstAttemptCorrect,
        score: adaptiveResult.score,
        confidence: update.confidence,
        calibration: adaptiveResult.calibration,
        performanceBand: adaptiveResult.performanceBand,
        intervalStage: adaptiveResult.intervalStage,
        nextReviewAt: adaptiveResult.nextReviewAt,
        lastStudiedAt: observedAt,
        completedAt,
        delayedChecks,
        reviewHistory,
        estimatedMinutes: canonical.lesson.estimatedMinutes ?? update.estimatedMinutes ?? previousLesson?.estimatedMinutes,
        misconception: canonical.lesson.misconception ?? previousLesson?.misconception,
        experienceEvidence: update.activityEvidence?.experienceEvidence ?? previousLesson?.experienceEvidence,
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
        capstone: previous?.capstone,
        lastActivityAt: observedAt,
        startedAt: previous?.startedAt ?? observedAt,
        studyMinutes: (previous?.studyMinutes ?? 0) + (firstCompletion ? (canonical.lesson.estimatedMinutes ?? update.estimatedMinutes ?? 0) : 0),
      };
      const studyMinutesAdded = firstCompletion
        ? canonical.lesson.estimatedMinutes ?? update.estimatedMinutes ?? 0
        : 0;
      const engagement = documents[engagementPath];
      const daily = documents[dailyEngagementPath];
      return {
        writes: [
          { path, data: progress as unknown as Record<string, unknown> },
          {
            path: engagementPath,
            data: {
              ...(engagement ?? {}),
              uid: account.uid,
              coursesStarted: numberValue(engagement?.coursesStarted) + (previous ? 0 : 1),
              lessonsCompleted: numberValue(engagement?.lessonsCompleted) + (firstCompletion ? 1 : 0),
              studyMinutes: numberValue(engagement?.studyMinutes) + studyMinutesAdded,
              retrievalSessions: numberValue(engagement?.retrievalSessions) + 1,
              reviewSessions: numberValue(engagement?.reviewSessions) + (update.review ? 1 : 0),
              delayedCheckSessions: numberValue(engagement?.delayedCheckSessions) + (update.reviewKind?.startsWith("delayed-") ? 1 : 0),
              calibratedSessions: numberValue(engagement?.calibratedSessions) + (adaptiveResult.calibration === "calibrated" ? 1 : 0),
              overconfidenceSignals: numberValue(engagement?.overconfidenceSignals) + (adaptiveResult.calibration === "overconfident" ? 1 : 0),
              questionsAnswered: numberValue(engagement?.questionsAnswered) + update.totalQuestions,
              correctAnswers: numberValue(engagement?.correctAnswers) + update.firstAttemptCorrect,
              lastActivityAt: now.toISOString(),
              lastCourseId: update.courseId,
              lastTopic: course.topic,
              updatedAt: now.toISOString(),
            },
          },
          {
            path: dailyEngagementPath,
            data: {
              ...(daily ?? {}),
              date: now.toISOString().slice(0, 10),
              shard: engagementShard,
              coursesStarted: numberValue(daily?.coursesStarted) + (previous ? 0 : 1),
              lessonsCompleted: numberValue(daily?.lessonsCompleted) + (firstCompletion ? 1 : 0),
              studyMinutes: numberValue(daily?.studyMinutes) + studyMinutesAdded,
              retrievalSessions: numberValue(daily?.retrievalSessions) + 1,
              reviewSessions: numberValue(daily?.reviewSessions) + (update.review ? 1 : 0),
              delayedCheckSessions: numberValue(daily?.delayedCheckSessions) + (update.reviewKind?.startsWith("delayed-") ? 1 : 0),
              questionsAnswered: numberValue(daily?.questionsAnswered) + update.totalQuestions,
              correctAnswers: numberValue(daily?.correctAnswers) + update.firstAttemptCorrect,
              updatedAt: now.toISOString(),
            },
          },
        ],
        result: progress,
      };
    });

    return Response.json(
      {
        progress: saved,
        nextReviewAt: adaptiveResult.nextReviewAt,
        calibration: adaptiveResult.calibration,
        performanceBand: adaptiveResult.performanceBand,
        intervalDays: adaptiveResult.intervalDays,
      },
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
