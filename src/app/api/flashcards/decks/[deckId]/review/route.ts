import { z } from "zod";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { flashcardRatingSchema } from "@/lib/flashcards";
import { flashcardErrorResponse, rateFlashcard } from "@/lib/flashcards-server";

interface RouteParams {
  params: Promise<{ deckId: string }>;
}

const inputSchema = z.object({
  cardId: z.string().trim().min(8).max(120),
  rating: flashcardRatingSchema,
}).strict();

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const account = await requireAcceptedAccount(request);
    const { deckId } = await params;
    const parsed = inputSchema.safeParse(await readJsonBody(request, 8_000));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid review rating." }, { status: 400 });
    const review = await rateFlashcard(account, deckId, parsed.data.cardId, parsed.data.rating);
    return Response.json({ review }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? flashcardErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your flashcard rating could not be saved." }, { status: 500 });
  }
}
