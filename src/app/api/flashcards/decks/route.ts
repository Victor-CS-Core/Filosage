import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  createCustomFlashcardDeck,
  flashcardErrorResponse,
  listFlashcardDecks,
} from "@/lib/flashcards-server";
import { flashcardFeatureConfiguration } from "@/lib/flashcard-feature";
import { planAllows } from "@/lib/membership-plans";

export async function GET(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const decks = await listFlashcardDecks(account);
    const flags = flashcardFeatureConfiguration();
    return Response.json({
      decks,
      availability: {
        decksEnabled: flags.decksEnabled,
        generationEnabled: flags.generationEnabled,
        canCreateCustomDeck: account.isOwner || planAllows(account.plan, "create_custom_flashcard_deck"),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return flashcardErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your flashcard decks could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const body = await readJsonBody(request, 256_000);
    const detail = await createCustomFlashcardDeck(
      account,
      body,
      request.headers.get("idempotency-key")?.trim() ?? "",
    );
    return Response.json(detail, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? flashcardErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "The custom deck could not be created." }, { status: 500 });
  }
}
