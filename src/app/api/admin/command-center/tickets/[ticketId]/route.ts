import { withAccountRequest } from "@/lib/auth-server";
import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse } from "@/lib/auth-server";
import {
  commandCenterAuthorizationResponse,
  requireCommandCenterPermission,
} from "@/lib/command-center-auth";
import {
  commandCenterErrorResponse,
  updateCommandCenterTicket,
} from "@/lib/command-center-server";

const updateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(["new", "triaged", "waiting_for_admin", "approved", "in_progress", "resolved", "closed"]).optional(),
  assignedRole: z.literal("owner").optional(),
  tags: z.array(z.string().trim().regex(/^[a-z0-9-]{1,32}$/)).max(10).optional(),
  note: z.string().trim().min(2).max(2_000).optional(),
}).strict().refine((value) => value.status || value.assignedRole || value.tags || value.note, {
  message: "Choose at least one ticket update.",
});

async function handlePATCH(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const owner = await requireCommandCenterPermission(request, "triage");
    const { ticketId } = await context.params;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(ticketId)) {
      return Response.json({ error: "Invalid ticket." }, { status: 400 });
    }
    const parsed = updateSchema.safeParse(await readJsonBody(request, 8_192));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Check the ticket update." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const ticket = await updateCommandCenterTicket({ actorUid: owner.uid, ticketId, ...parsed.data });
    return Response.json({ ticket }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The ticket could not be updated." }, { status: 500 });
  }
}

export const PATCH = withAccountRequest(handlePATCH);
