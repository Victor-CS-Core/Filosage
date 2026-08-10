import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse } from "@/lib/auth-server";
import {
  commandCenterAuthorizationResponse,
  requireCommandCenterPermission,
} from "@/lib/command-center-auth";
import {
  commandCenterErrorResponse,
  createManualCommandCenterTicket,
} from "@/lib/command-center-server";
import { commandCenterTicketCategories } from "@/lib/command-center-types";

const ticketSchema = z.object({
  category: z.enum(commandCenterTicketCategories),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  subject: z.string().trim().min(5).max(160),
  summary: z.string().trim().min(10).max(2_000),
  confirmedFacts: z.array(z.string().trim().min(1).max(240)).max(10).default([]),
  unverifiedClaims: z.array(z.string().trim().min(1).max(240)).max(10).default([]),
  tags: z.array(z.string().trim().regex(/^[a-z0-9-]{1,32}$/)).max(10).default([]),
}).strict();

export async function POST(request: Request) {
  try {
    const owner = await requireCommandCenterPermission(request, "triage");
    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey && (idempotencyKey.length < 12 || idempotencyKey.length > 200)) {
      return Response.json(
        { error: "The idempotency key must contain 12 to 200 characters." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const parsed = ticketSchema.safeParse(await readJsonBody(request, 8_192));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Check the ticket details." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const ticket = await createManualCommandCenterTicket({ actorUid: owner.uid, idempotencyKey, ...parsed.data });
    return Response.json({ ticket }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The ticket could not be created." }, { status: 500 });
  }
}
