import { withAccountRequest } from "@/lib/auth-server";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  aiQuotaResponse,
  aiUsageRequestId,
  checkpointAiUsageResult,
  finalizeAiUsage,
  recoverAiUsageResult,
  reserveAiUsage,
  settleAiUsageProduct,
  type AiReservation,
} from "@/lib/ai-usage";
import { ContentSafetyError } from "@/lib/content-safety";
import { generateFlashcardDeck } from "@/lib/flashcard-generation-server";
import {
  assertGenerationEnabled,
  FlashcardServiceError,
  flashcardErrorResponse,
  generatedFlashcardDraftMutation,
  getFlashcardDeckDetail,
  prepareGeneratedFlashcardDraft,
  preparedGeneratedFlashcardDraftFromDetail,
} from "@/lib/flashcards-server";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import { aiUsageProfileMetadata, openAiExecutionProfile } from "@/lib/openai-generation";
import { publicationContentHash } from "@/lib/publication-content";
import { flashcardGenerationInputSchema, type FlashcardDeckDetail } from "@/lib/flashcards";

async function handlePOST(request: Request) {
  let reservation: AiReservation | null = null;
  const profile = openAiExecutionProfile("flashcard.standard");
  try {
    assertGenerationEnabled();
    const account = await requireAcceptedAccount(request);
    const body = await readJsonBody(request, 32_000);
    const input = flashcardGenerationInputSchema.safeParse(body);
    if (!input.success) {
      throw new FlashcardServiceError(400, "INVALID_GENERATION_REQUEST", input.error.issues[0]?.message ?? "Invalid generation request.");
    }
    const fingerprint = await publicationContentHash(body);
    const idempotencyKey = request.headers.get("idempotency-key");
    const legacyResultId = idempotencyKey
      ? (await aiUsageRequestId(account.uid, "flashcard_generation", idempotencyKey)).slice(0, 40)
      : "";
    reservation = await reserveAiUsage(
      account,
      "flashcard_generation",
      idempotencyKey,
      fingerprint,
      { allowCompletedReplay: true, legacyReplay: { profile: profile.id, resultId: legacyResultId } },
    );
    if (reservation.recovered) {
      let detail: FlashcardDeckDetail;
      if (reservation.recoveredCheckpoint) {
        const checkpoint = await recoverAiUsageResult<FlashcardDeckDetail>(reservation, {
          kind: "flashcard_deck",
          resourceId: input.data.courseId,
          resultId: reservation.requestId.slice(0, 40),
        });
        const draft = await preparedGeneratedFlashcardDraftFromDetail(account, checkpoint.result, checkpoint.productGuard, {
          deckId: checkpoint.resultId,
          courseId: input.data.courseId,
          scope: input.data.scope,
          lessonId: input.data.lessonId,
          moduleIndex: input.data.scope === "module" ? input.data.moduleIndex! : null,
          depth: input.data.depth,
          emphasis: input.data.emphasis,
          includeAttemptedChecks: input.data.includeAttemptedChecks,
        });
        if (reservation.recoveredStatus === "result_checkpointed") {
          const settlingReservation = reservation;
          reservation = null;
          detail = await settleAiUsageProduct(
            settlingReservation,
            checkpoint,
            draft.paths,
            (documents) => generatedFlashcardDraftMutation(documents, draft),
          );
        } else {
          detail = draft.detail;
        }
      } else {
        if (!reservation.recoveredResultId) {
          throw new Error("Completed flashcard generation is missing its result reference.");
        }
        detail = await getFlashcardDeckDetail(account, reservation.recoveredResultId);
        if (detail.deck.courseId !== input.data.courseId || detail.deck.kind !== "generated") {
          throw new FlashcardServiceError(409, "DECK_RECOVERY_INVALID", "The completed deck belongs to another generation request.");
        }
      }
      reservation = null;
      return Response.json(
        { ...detail, replayed: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const generated = await generateFlashcardDeck(account, input.data);
    const draft = await prepareGeneratedFlashcardDraft({
      account,
      deckId: reservation.requestId.slice(0, 40),
      courseId: generated.input.courseId,
      courseTopic: generated.courseTopic,
      moduleIndex: generated.input.scope === "module" ? generated.input.moduleIndex! : null,
      lessonIds: generated.lessonIds,
      scope: generated.input.scope,
      depth: generated.input.depth,
      emphasis: generated.input.emphasis,
      includeAttemptedChecks: generated.input.includeAttemptedChecks,
      sourceFingerprint: generated.sourceFingerprint,
      output: generated.output,
      sources: generated.sources,
    });
    const checkpoint = await checkpointAiUsageResult(reservation, {
      kind: "flashcard_deck",
      resourceId: generated.input.courseId,
      resultId: draft.detail.deck.id,
      productGuard: draft.productGuard,
      result: draft.detail,
      usage: {
        usageSamples: generated.usageSamples,
        responseId: generated.responseId,
        resultId: draft.detail.deck.id,
        ...aiUsageProfileMetadata(profile),
      },
    });
    const settlingReservation = reservation;
    reservation = null;
    const detail = await settleAiUsageProduct(
      settlingReservation,
      checkpoint,
      draft.paths,
      (documents) => generatedFlashcardDraftMutation(documents, draft),
    );
    return Response.json(
      { ...detail, replayed: false },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (reservation) {
      await finalizeAiUsage(reservation, {
        failed: true,
        ...aiUsageProfileMetadata(profile),
      }).catch((usageError) => {
        console.error(JSON.stringify({ event: "flashcard_usage_finalization_failed", ...safeModelErrorDetails(usageError) }));
      });
    }
    if (error instanceof ContentSafetyError) {
      return Response.json(
        { error: error.message, code: "CONTENT_NOT_ALLOWED", retryAt: error.retryAt },
        { status: 422, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return apiRequestErrorResponse(error)
      ?? flashcardErrorResponse(error)
      ?? aiQuotaResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json(
        { error: "The flashcard deck could not be generated." },
        { status: 500, headers: { "Cache-Control": "private, no-store" } },
      );
  }
}

export const POST = withAccountRequest(handlePOST);
