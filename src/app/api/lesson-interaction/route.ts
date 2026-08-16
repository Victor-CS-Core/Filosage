import { z } from "zod";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { getStoredDocument, runStoredDocumentTransaction } from "@/lib/firebase-server";
import { deriveLessonInteractions } from "@/lib/lesson-interactions";
import {
  interactionDocumentId,
  issueInteractionReceipt,
  type InteractionReceiptClaims,
} from "@/lib/interaction-receipts";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import type { Course, LessonData } from "@/lib/course-types";
import { publicationContentHash } from "@/lib/publication-content";
import {
  getCourseRuntimeArtifact,
  getLessonRuntimeArtifact,
  publishedReleaseUnavailableResponse,
} from "@/lib/course-pipeline/artifact-access";
import { buildInteractionAttemptMutation } from "@/lib/course-pipeline/interaction-attempt";

const attemptSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
  progressOperationId: z.string().trim().regex(/^[A-Za-z0-9_-]{12,200}$/),
  interactionId: z.string().trim().regex(/^interaction-[a-z0-9-]+$/).max(90),
  itemId: z.string().trim().regex(/^item-[a-z0-9-]+$/).max(90),
  selectedIndex: z.number().int().min(0).max(3),
}).strict();

const hydrationSchema = attemptSchema.pick({
  courseId: true,
  lessonId: true,
  progressOperationId: true,
  interactionId: true,
});

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

async function loadRecognition(
  account: Awaited<ReturnType<typeof requireAcceptedAccount>>,
  courseId: string,
  lessonId: string,
  interactionId: string,
) {
  const course = await getCourseRuntimeArtifact(courseId) as Course | null;
  if (!course) return { error: Response.json({ error: "Course not found." }, { status: 404 }) };
  if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
    return { error: Response.json({ error: "You do not have access to this course." }, { status: 403 }) };
  }
  const lesson = await getLessonRuntimeArtifact(courseId, lessonId, course) as LessonData | null;
  const matchedInteraction = lesson
    ? deriveLessonInteractions(lesson).find((candidate) => candidate.id === interactionId)
    : null;
  const interaction = matchedInteraction?.type === "recognition" ? matchedInteraction : null;
  if (!lesson || !interaction) return { error: Response.json({ error: "Practice lab not found." }, { status: 404 }) };
  return { course, lesson, interaction, artifactHash: await publicationContentHash(interaction) };
}

export async function GET(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const limited = await enforceDurableRateLimit(request, "lesson-interaction-read", 120, 60_000, account.uid);
    if (limited) return limited;
    const url = new URL(request.url);
    const parsed = hydrationSchema.safeParse({
      courseId: url.searchParams.get("courseId"),
      lessonId: url.searchParams.get("lessonId"),
      interactionId: url.searchParams.get("interactionId"),
    });
    if (!parsed.success) return Response.json({ error: "This practice lab request is not valid." }, { status: 400 });
    const { courseId, lessonId, progressOperationId, interactionId } = parsed.data;
    const loaded = await loadRecognition(account, courseId, lessonId, interactionId);
    if (loaded.error) return loaded.error;
    const interaction = loaded.interaction;
    const artifactHash = loaded.artifactHash;
    const storedResults = await Promise.all(interaction.items.map(async (item) => {
      const documentId = await interactionDocumentId(courseId, lessonId, progressOperationId, interactionId, item.id, artifactHash);
      const stored = await getStoredDocument(`users/${account.uid}/lessonInteraction/${documentId}`);
      if (!stored || numberValue(stored.attempts) < 1) return null;
      const attempts = numberValue(stored.attempts);
      const firstAttemptCorrect = stored.firstAttemptCorrect === true;
      const mastered = stored.mastered === true;
      const receipt = mastered ? await issueInteractionReceipt({
        version: 3,
        uid: account.uid,
        courseId,
        lessonId,
        progressOperationId,
        interactionId,
        itemId: item.id,
        artifactHash,
        attempts,
        firstAttemptCorrect,
        issuedAt: Date.now(),
      }) : undefined;
      return { itemId: item.id, attempts, firstAttemptCorrect, mastered, receipt };
    }));
    const itemResults = storedResults.filter((result): result is NonNullable<typeof result> => Boolean(result));
    const evidence = {
      interactionId,
      itemCount: interaction.items.length,
      minimumFirstAttemptCorrect: interaction.mastery.minimumFirstAttemptCorrect,
      firstAttemptCorrect: itemResults.filter((result) => result.firstAttemptCorrect).length,
      attempts: itemResults.reduce((sum, result) => sum + result.attempts, 0),
      completed: itemResults.length === interaction.items.length && itemResults.every((result) => result.mastered),
      itemResults,
    };
    return Response.json({ evidence }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    console.error(JSON.stringify({
      event: "lesson_interaction_hydration_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    return Response.json({ error: "Saved practice progress could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const limited = await enforceDurableRateLimit(request, "lesson-interaction", 80, 60_000, account.uid);
    if (limited) return limited;
    const parsed = attemptSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) return Response.json({ error: "This lab attempt is not valid." }, { status: 400 });

    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
      return Response.json(
        { error: "Retry-safe practice requires an idempotency key.", code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { courseId, lessonId, progressOperationId, interactionId, itemId, selectedIndex } = parsed.data;
    const loaded = await loadRecognition(account, courseId, lessonId, interactionId);
    if (loaded.error) return loaded.error;
    const interaction = loaded.interaction;
    const artifactHash = loaded.artifactHash;
    const item = interaction?.items.find((candidate) => candidate.id === itemId);
    if (!item) return Response.json({ error: "Practice item not found." }, { status: 404 });

    const correct = selectedIndex === item.correctIndex;
    const documentId = await interactionDocumentId(courseId, lessonId, progressOperationId, interactionId, itemId, artifactHash);
    const path = `users/${account.uid}/lessonInteraction/${documentId}`;
    const mutationId = await publicationContentHash({ uid: account.uid, idempotencyKey });
    const mutationPath = `users/${account.uid}/lessonInteractionMutations/${mutationId}`;
    const payloadHash = await publicationContentHash({ ...parsed.data, artifactHash });
    const now = Date.now();
    const result = await runStoredDocumentTransaction([path, mutationPath], (documents) =>
      buildInteractionAttemptMutation(documents, path, mutationPath, {
        courseId,
        lessonId,
        progressOperationId,
        interactionId,
        itemId,
        artifactHash,
        payloadHash,
        correct,
        now,
      }));

    let receipt: string | undefined;
    if (result.correct) {
      const claims: InteractionReceiptClaims = {
        version: 3,
        uid: account.uid,
        courseId,
        lessonId,
        progressOperationId,
        interactionId,
        itemId,
        artifactHash,
        attempts: result.attempts,
        firstAttemptCorrect: result.firstAttemptCorrect,
        issuedAt: now,
      };
      receipt = await issueInteractionReceipt(claims);
    }
    return Response.json(
      { correct: result.correct, attempts: result.attempts, firstAttemptCorrect: result.firstAttemptCorrect, receipt, recovered: result.recovered },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH") {
      return Response.json(
        { error: "This practice retry key belongs to a different answer.", code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(JSON.stringify({
      event: "lesson_interaction_verification_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    return Response.json({ error: "This practice response could not be verified. Try again." }, { status: 500 });
  }
}
