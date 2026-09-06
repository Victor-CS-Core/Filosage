import { withAccountRequest } from "@/lib/auth-server";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  aiQuotaResponse,
  finalizeAiUsage,
  reserveAiUsage,
  type AiReservation,
} from "@/lib/ai-usage";
import { ContentSafetyError } from "@/lib/content-safety";
import { generateFlashcardDeck } from "@/lib/flashcard-generation-server";
import {
  assertGenerationEnabled,
  createGeneratedFlashcardDraft,
  flashcardErrorResponse,
  getFlashcardDeckDetail,
} from "@/lib/flashcards-server";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import { aiUsageProfileMetadata, openAiExecutionProfile } from "@/lib/openai-generation";
import { publicationContentHash } from "@/lib/publication-content";

async function handlePOST(request: Request) {
  let reservation: AiReservation | null = null;
  const profile = openAiExecutionProfile("flashcard.standard");
  try {
    assertGenerationEnabled();
    const account = await requireAcceptedAccount(request);
    const body = await readJsonBody(request, 32_000);
    const fingerprint = await publicationContentHash(body);
    reservation = await reserveAiUsage(
      account,
      "flashcard_generation",
      request.headers.get("idempotency-key"),
      fingerprint,
      { allowCompletedReplay: true },
    );
    if (reservation.recovered) {
      if (!reservation.recoveredResultId) {
        throw new Error("Completed flashcard generation is missing its result reference.");
      }
      const detail = await getFlashcardDeckDetail(account, reservation.recoveredResultId);
      reservation = null;
      return Response.json(
        { ...detail, replayed: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const generated = await generateFlashcardDeck(account, body);
    const detail = await createGeneratedFlashcardDraft({
      account,
      deckId: reservation.requestId.slice(0, 40),
      courseId: generated.input.courseId,
      courseTopic: generated.courseTopic,
      moduleIndex: generated.input.moduleIndex ?? null,
      lessonIds: generated.lessonIds,
      scope: generated.input.scope,
      depth: generated.input.depth,
      emphasis: generated.input.emphasis,
      includeAttemptedChecks: generated.input.includeAttemptedChecks,
      sourceFingerprint: generated.sourceFingerprint,
      output: generated.output,
      sources: generated.sources,
    });
    await finalizeAiUsage(reservation, {
      usageSamples: generated.usageSamples,
      responseId: generated.responseId,
      resultId: detail.deck.id,
      ...aiUsageProfileMetadata(profile),
    });
    reservation = null;
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
