import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireRecentlyAuthenticatedOwner } from "@/lib/auth-server";
import { commandCenterAuthorizationResponse, requireCommandCenterPermission } from "@/lib/command-center-auth";
import { commandCenterDraftReviewSchema } from "@/lib/command-center-draft-schema";
import { commandCenterErrorResponse, reviewCommandCenterDraft } from "@/lib/command-center-server";

export async function PATCH(request: Request, context: { params: Promise<{ draftId: string }> }) {
  try {
    await requireCommandCenterPermission(request, "review_draft");
    const owner = await requireRecentlyAuthenticatedOwner(request);
    const { draftId } = await context.params;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(draftId)) {
      return Response.json({ error: "Invalid draft." }, { status: 400 });
    }
    const parsed = commandCenterDraftReviewSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Record a review reason." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const draft = await reviewCommandCenterDraft({ actorUid: owner.uid, draftId, ...parsed.data });
    return Response.json(
      { draft, executed: false, sent: false, simulationMode: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The draft decision could not be recorded." }, { status: 500 });
  }
}
