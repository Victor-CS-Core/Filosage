import { authorizationResponse, requireAcceptedAccount, requireAccount } from "@/lib/auth-server";
import {
  deleteStoredDocuments,
  getStoredDocument,
  listStoredDocuments,
  runStoredDocumentTransaction,
} from "@/lib/document-store";
import { progressUpdateSchema, validationMessage } from "@/lib/validation";
import type { CapstoneAssessment, CourseProgress, LessonProgress } from "@/lib/learning-types";
import type { Course, LessonData } from "@/lib/course-types";
import { findCourseLesson, findNextLesson } from "@/lib/course-progress";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { nextDueKind, scheduleAdaptiveReview, updateDelayedChecks } from "@/lib/adaptive-learning";
import { verifyActivityReceipt } from "@/lib/activity-receipts";
import { deriveLessonInteractions } from "@/lib/lesson-interactions";
import { verifyInteractionReceipt } from "@/lib/interaction-receipts";
import {
  getCourseRuntimeArtifact,
  getLessonRuntimeArtifact,
  publishedReleaseUnavailableResponse,
} from "@/lib/course-pipeline/artifact-access";
import { publicationContentHash } from "@/lib/publication-content";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import { canonicalLessonObjectiveId } from "@/lib/course-pipeline/relationships";
import { retrievalVariantsForQuizBank } from "@/lib/retrieval-planning";
import { capabilitiesForAccount } from "@/lib/membership-access";

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

function asCourseProgress(value: Record<string, unknown>, includePrivateOperations = false): CourseProgress {
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
    ...(includePrivateOperations && Array.isArray(value.recentOperations) ? {
      recentOperations: value.recentOperations
        .filter((item): item is NonNullable<CourseProgress["recentOperations"]>[number] => Boolean(item) && typeof item === "object")
        .slice(-50),
    } : {}),
  };
}

function progressForAccount(progress: CourseProgress, advancedCapstoneAnalysis: boolean): CourseProgress {
  if (advancedCapstoneAnalysis || !progress.capstone?.history) return progress;
  return { ...progress, capstone: { ...progress.capstone, history: undefined } };
}

class ProgressOperationConflictError extends Error {}
class ProgressReviewConflictError extends Error {}

async function resolveActiveProgress(
  progress: CourseProgress,
  account: { uid: string; isOwner: boolean },
) {
  const course = await getCourseRuntimeArtifact(progress.courseId) as Course | null;
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
    const advancedCapstoneAnalysis = capabilitiesForAccount(account).advancedCapstoneAnalysis;
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
        { progress: resolved?.progress ? progressForAccount(resolved.progress, advancedCapstoneAnalysis) : null },
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
      resolution.progress ? [progressForAccount(resolution.progress, advancedCapstoneAnalysis)] : [],
    );
    return Response.json({ progress }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    console.error(JSON.stringify({ event: "progress_fetch_failed", ...safeModelErrorDetails(error) }));
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
    const operationId = request.headers.get("idempotency-key")?.trim();
    if (!operationId || !/^[A-Za-z0-9_-]{12,200}$/.test(operationId)) {
      return Response.json({ error: "A valid idempotency key is required to save progress." }, { status: 400 });
    }
    const course = await getCourseRuntimeArtifact(submitted.courseId) as Course | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }

    const canonical = findCourseLesson(course, submitted.lessonId);
    if (!canonical) return Response.json({ error: "This lesson is not part of the course." }, { status: 400 });
    const lesson = await getLessonRuntimeArtifact(submitted.courseId, submitted.lessonId, course);
    if (!lesson) return Response.json({ error: "Generate or open the lesson before completing it." }, { status: 409 });

    const quizzes = Array.isArray(lesson.quizzes) ? lesson.quizzes : [];
    const lessonPlan = course.learningDesign?.lessonPlans.find((plan) => plan.lessonId === submitted.lessonId);
    const objectiveId = canonical.lesson.objectiveId
      ?? lessonPlan?.scopeBudget.primaryObjectiveId
      ?? canonicalLessonObjectiveId(canonical.moduleIndex, canonical.lessonIndex);
    const retrievalVariants = retrievalVariantsForQuizBank(quizzes, objectiveId, submitted.lessonId);
    const reviewQuizIndexes = quizzes.flatMap((quiz, index) => quiz.intendedUse === "initial" ? [] : [index]);
    if (submitted.retrievalVariantId
      && !retrievalVariants.some((variant) => variant.id === submitted.retrievalVariantId)) {
      return Response.json(
        { error: "This retrieval variant is not part of the saved lesson." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const quizArtifactHashes = await Promise.all(quizzes.map((quiz) => publicationContentHash(quiz)));
    const evidence = submitted.activityEvidence;
    const quizEvidence = evidence?.quizResults ?? [];
    const observedRetrievalVariantIds = quizEvidence.flatMap((result) => {
      const variant = retrievalVariants[result.quizIndex];
      return variant ? [variant.id] : [];
    });
    if (submitted.retrievalVariantIds
      && (submitted.retrievalVariantIds.length !== observedRetrievalVariantIds.length
        || submitted.retrievalVariantIds.some((variantId, index) => variantId !== observedRetrievalVariantIds[index]))) {
      return Response.json(
        { error: "The retrieval exposure list does not match the saved lesson activities." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (submitted.retrievalVariantId && !observedRetrievalVariantIds.includes(submitted.retrievalVariantId)) {
      return Response.json(
        { error: "The selected retrieval variant was not completed." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const evidenceIndexes = new Set(quizEvidence.map((result) => result.quizIndex));
    const initialQuizIndexes = quizzes.flatMap((quiz, index) => quiz.intendedUse === "review" ? [] : [index]);
    const evidenceIsComplete = evidenceIndexes.size === initialQuizIndexes.length
      && quizEvidence.length === initialQuizIndexes.length
      && initialQuizIndexes.every((index) => evidenceIndexes.has(index));
    const reviewEvidenceIsComplete = submitted.review === true
      && reviewQuizIndexes.length > 0
      && quizEvidence.length === 1
      && evidenceIndexes.size === 1
      && reviewQuizIndexes.includes(quizEvidence[0]?.quizIndex ?? -1)
      && Boolean(submitted.retrievalVariantId)
      && submitted.retrievalVariantIds?.length === 1
      && submitted.retrievalVariantIds[0] === submitted.retrievalVariantId;
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
    const practiceInteraction = deriveLessonInteractions(lesson as unknown as LessonData)
      .find((interaction) => interaction.type === "recognition" && interaction.purpose === "practice");
    const interactionArtifactHash = practiceInteraction ? await publicationContentHash(practiceInteraction) : undefined;
    const interactionEvidence = evidence?.interactionEvidence;
    const expectedInteractionItemIds = new Set(practiceInteraction?.items.map((item) => item.id) ?? []);
    const submittedInteractionItemIds = new Set(interactionEvidence?.itemResults.map((item) => item.itemId) ?? []);
    const interactionIsComplete = !practiceInteraction || Boolean(
      interactionEvidence
      && interactionEvidence.interactionId === practiceInteraction.id
      && interactionEvidence.itemCount === practiceInteraction.items.length
      && interactionEvidence.minimumFirstAttemptCorrect === practiceInteraction.mastery.minimumFirstAttemptCorrect
      && interactionEvidence.completed
      && interactionEvidence.itemResults.length === practiceInteraction.items.length
      && submittedInteractionItemIds.size === expectedInteractionItemIds.size
      && [...submittedInteractionItemIds].every((itemId) => expectedInteractionItemIds.has(itemId))
      && interactionEvidence.itemResults.every((item) => item.mastered)
      && interactionEvidence.firstAttemptCorrect === interactionEvidence.itemResults.filter((item) => item.firstAttemptCorrect).length
      && interactionEvidence.attempts === interactionEvidence.itemResults.reduce((sum, item) => sum + item.attempts, 0)
    );
    if (!submitted.review && (!evidence || !evidenceIsComplete || !experienceIsComplete || !interactionIsComplete || (transferTaskRequired && transferResponse.length < 20))) {
      return Response.json(
        { error: "Complete the active lesson response, practice lab, retrieval checks, and transfer task before finishing the lesson." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (submitted.review && (!evidence || !reviewEvidenceIsComplete)) {
      return Response.json(
        { error: "Complete exactly one saved review check before finishing this review." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const requiresVerifiedActivity = quizEvidence.length > 0;
    const verifiedClaims = requiresVerifiedActivity
      ? await Promise.all(quizEvidence.map((result) =>
        result.receipt
          ? verifyActivityReceipt(result.receipt, {
            uid: account.uid,
            courseId: submitted.courseId,
            lessonId: submitted.lessonId,
            progressOperationId: operationId,
            quizIndex: result.quizIndex,
            artifactHash: quizArtifactHashes[result.quizIndex] ?? "",
          })
          : Promise.resolve(null),
      ))
      : [];
    if (requiresVerifiedActivity && verifiedClaims.some((claims) => !claims)) {
      return Response.json(
        { error: "Complete each saved lesson activity in this session before continuing." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const verifiedInteractionClaims = !submitted.review && practiceInteraction
      ? await Promise.all((interactionEvidence?.itemResults ?? []).map((result) =>
        result.receipt
          ? verifyInteractionReceipt(result.receipt, {
            uid: account.uid,
            courseId: submitted.courseId,
            lessonId: submitted.lessonId,
            progressOperationId: operationId,
            interactionId: practiceInteraction.id,
            itemId: result.itemId,
            artifactHash: interactionArtifactHash ?? "",
          })
          : Promise.resolve(null),
      ))
      : [];
    if (practiceInteraction && !submitted.review && verifiedInteractionClaims.some((claims) => !claims)) {
      return Response.json(
        { error: "Complete each practice-lab item in this session before finishing the lesson." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const quizFirstAttemptCorrect = requiresVerifiedActivity
      ? verifiedClaims.filter((claims) => claims?.firstAttemptCorrect).length
      : quizEvidence.filter((result) => result.firstAttemptCorrect).length;
    const quizAttempts = requiresVerifiedActivity
      ? verifiedClaims.reduce((sum, claims) => sum + (claims?.attempts ?? 0), 0)
      : quizEvidence.reduce((sum, result) => sum + result.attempts, 0);
    const totalQuestions = quizEvidence.length + verifiedInteractionClaims.length;
    const firstAttemptCorrect = quizFirstAttemptCorrect
      + verifiedInteractionClaims.filter((claims) => claims?.firstAttemptCorrect).length;
    const attempts = quizAttempts
      + verifiedInteractionClaims.reduce((sum, claims) => sum + (claims?.attempts ?? 0), 0);
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
    const verifiedReceiptCount = verifiedClaims.filter(Boolean).length + verifiedInteractionClaims.filter(Boolean).length;
    const submittedReceiptCount = quizEvidence.length + (!submitted.review ? interactionEvidence?.itemResults.length ?? 0 : 0);
    const evidenceAuthority = verifiedReceiptCount > 0
      && verifiedReceiptCount === submittedReceiptCount
      && (submitted.review || lessonPlan?.feedback.completionEvidence === "demonstrated")
      ? "receipt-verified" as const
      : "activity-observed" as const;
    const assessmentIds = [...new Set(quizEvidence.flatMap((result) => {
      const assessmentId = quizzes[result.quizIndex]?.assessmentId;
      return assessmentId ? [assessmentId] : [];
    }))];
    const criterionIds = !submitted.review && transferResponse.length >= 20
      ? [...new Set(lesson.transferTask?.criterionIds ?? [])]
      : [];
    const retrievalVariantBank = retrievalVariants.filter((_, index) => reviewQuizIndexes.includes(index));
    const operationFingerprint = await publicationContentHash({
      courseId: update.courseId,
      lessonId: update.lessonId,
      review: update.review === true,
      reviewKind: update.reviewKind,
      confidence: update.confidence,
      quizEvidence: quizEvidence.map(({ quizIndex, attempts: submittedAttempts, firstAttemptCorrect: submittedCorrect }) => ({
        quizIndex,
        attempts: submittedAttempts,
        firstAttemptCorrect: submittedCorrect,
      })),
      observedRetrievalVariantIds,
      assessmentIds,
      criterionIds,
    });

    const path = `users/${account.uid}/courseProgress/${update.courseId}`;
    const reviewReceiptIssuedAt = submitted.review ? verifiedClaims[0]?.issuedAt : undefined;
    const now = new Date(reviewReceiptIssuedAt ?? Date.now());
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
      const previous = documents[path] ? asCourseProgress(documents[path] as Record<string, unknown>, true) : null;
      const previousOperation = previous?.recentOperations?.find((operation) => operation.id === operationId);
      if (previousOperation) {
        if (previousOperation.fingerprint !== operationFingerprint) throw new ProgressOperationConflictError();
        return {
          writes: [],
          result: { progress: previous, response: previousOperation.response },
        };
      }
      const previousLesson = previous?.lessons[update.lessonId];
      const reviewKind = update.review ? update.reviewKind ?? "spaced" : undefined;
      if (update.review) {
        const completedBeforeReview = Boolean(
          previousLesson?.completedAt
          && previous?.completedLessonIds.includes(update.lessonId),
        );
        const due = previousLesson ? nextDueKind(previousLesson, now) : null;
        if (!completedBeforeReview || !due || due.kind !== reviewKind) {
          throw new ProgressReviewConflictError("This review is not due for a previously completed lesson.");
        }
      }
      adaptiveResult = scheduleAdaptiveReview({
        score: firstTryRate,
        confidence: update.confidence,
        previousStage: previousLesson?.intervalStage,
        isReview: update.review === true,
        now,
      });
      const completedLessonIds = update.review
        ? [...(previous?.completedLessonIds ?? [])]
        : Array.from(new Set([...(previous?.completedLessonIds ?? []), update.lessonId]));
      const firstCompletion = !update.review && !previousLesson?.completedAt;
      const next = findNextLesson(course, completedLessonIds);
      const completedAt = previousLesson?.completedAt ?? observedAt;
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
          retrievalVariantId: update.retrievalVariantId,
          evidenceAuthority,
          assessmentIds,
          criterionIds,
        },
      ].slice(-50) : previousLesson?.reviewHistory;
      const lessonProgress: LessonProgress = {
        lessonId: update.lessonId,
        lessonTitle: canonical.lesson.title,
        objectiveId,
        prerequisiteObjectiveIds: lessonPlan?.prerequisites.objectiveIds ?? previousLesson?.prerequisiteObjectiveIds,
        status: update.review && evidenceAuthority === "receipt-verified" && adaptiveResult.performanceBand === "secure" ? "mastered" : "learned",
        evidenceAuthority,
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
        retrievalVariantExposures: [
          ...(previousLesson?.retrievalVariantExposures ?? []),
          ...observedRetrievalVariantIds.map((variantId) => ({ variantId, seenAt: observedAt })),
        ].slice(-100),
        retrievalVariantBank,
        assessmentIds,
        criterionIds,
        estimatedMinutes: canonical.lesson.estimatedMinutes ?? update.estimatedMinutes ?? previousLesson?.estimatedMinutes,
        misconception: canonical.lesson.misconception ?? previousLesson?.misconception,
        experienceEvidence: update.activityEvidence?.experienceEvidence ?? previousLesson?.experienceEvidence,
        interactionEvidence: update.activityEvidence?.interactionEvidence ?? previousLesson?.interactionEvidence,
      };
      const operationResponse = {
        nextReviewAt: adaptiveResult.nextReviewAt,
        calibration: adaptiveResult.calibration,
        performanceBand: adaptiveResult.performanceBand,
        intervalDays: adaptiveResult.intervalDays,
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
        recentOperations: [
          ...(previous?.recentOperations ?? []),
          { id: operationId, fingerprint: operationFingerprint, observedAt, response: operationResponse },
        ].slice(-50),
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
        result: { progress, response: operationResponse },
      };
    });

    const publicProgress = { ...saved.progress };
    delete publicProgress.recentOperations;
    return Response.json(
      {
        progress: publicProgress,
        ...saved.response,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ProgressReviewConflictError) {
      return Response.json({ error: error.message }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof ProgressOperationConflictError) {
      return Response.json({ error: "That progress operation key was already used for different learning evidence." }, { status: 409 });
    }
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({ event: "progress_save_failed", ...safeModelErrorDetails(error) }));
    return Response.json({ error: "Progress could not be saved." }, { status: 500 });
  }
}
