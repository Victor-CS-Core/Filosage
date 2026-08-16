import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireRecentlyAuthenticatedOwner } from "@/lib/auth-server";
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
    const permittedOwner = await requireCommandCenterPermission(request, "publish_reply");
    const owner = await requireRecentlyAuthenticatedOwner(
      request,
      "Sign in again before publishing a learner-visible reply.",
      "RECENT_AUTHENTICATION_REQUIRED",
    );
    if (owner.uid !== permittedOwner.uid) {
      return Response.json({ error: "Owner access is required." }, { status: 403 });
    }
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
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      return Response.json(
        { error: "A valid Idempotency-Key header is required." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const result = await addCommandCenterPublicReply({
      actorUid: owner.uid,
      ticketId,
      idempotencyKey,
      ...parsed.data,
    });
    return Response.json(
      result,
      {
        status: result.recovered ? 200 : 201,
        headers: {
          "Cache-Control": "private, no-store",
          ...(result.recovered ? { "X-Idempotent-Replay": "true" } : {}),
        },
      },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The public reply could not be published." }, { status: 500 });
  }
}
