import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse } from "@/lib/auth-server";
import { commandCenterAuthorizationResponse, requireCommandCenterPermission } from "@/lib/command-center-auth";
import { addCommandCenterPublicReply, commandCenterErrorResponse } from "@/lib/command-center-server";

const publicReplySchema = z.object({
  expectedVersion: z.number().int().positive(),
  body: z.string().trim().min(2).max(2_000),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const owner = await requireCommandCenterPermission(request, "triage");
    const { ticketId } = await context.params;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(ticketId)) {
      return Response.json({ error: "Invalid ticket." }, { status: 400 });
    }
    const parsed = publicReplySchema.safeParse(await readJsonBody(request, 8_192));
    if (!parsed.success) {
      return Response.json(
        { error: "Enter a learner-visible reply between 2 and 2,000 characters." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const ticket = await addCommandCenterPublicReply({ actorUid: owner.uid, ticketId, ...parsed.data });
    return Response.json({ ticket }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The public reply could not be published." }, { status: 500 });
  }
}
