import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  deleteFlashcardDeck,
  flashcardErrorResponse,
  getFlashcardDeckDetail,
  updateFlashcardDeck,
} from "@/lib/flashcards-server";

interface RouteParams {
  params: Promise<{ deckId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const account = await requireAcceptedAccount(request);
    const { deckId } = await params;
    const detail = await getFlashcardDeckDetail(account, deckId);
    return Response.json(detail, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return flashcardErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "The flashcard deck could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const account = await requireAcceptedAccount(request);
    const { deckId } = await params;
    const body = await readJsonBody(request, 256_000);
    const detail = await updateFlashcardDeck(account, deckId, body);
    return Response.json(detail, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? flashcardErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "The flashcard deck could not be saved." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const account = await requireAcceptedAccount(request);
    const { deckId } = await params;
    await deleteFlashcardDeck(account, deckId);
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return flashcardErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "The flashcard deck could not be removed." }, { status: 500 });
  }
}
