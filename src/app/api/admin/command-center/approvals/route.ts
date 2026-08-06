import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse } from "@/lib/auth-server";
import {
  commandCenterAuthorizationResponse,
  requireCommandCenterPermission,
} from "@/lib/command-center-auth";
import {
  commandCenterErrorResponse,
  createCommandCenterApproval,
} from "@/lib/command-center-server";
import { commandCenterApprovalActionTypes } from "@/lib/command-center-types";

const approvalSchema = z.object({
  ticketId: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/),
  expectedTicketVersion: z.number().int().positive(),
  actionType: z.enum(commandCenterApprovalActionTypes),
  proposedAction: z.string().trim().min(10).max(500),
  riskLevel: z.enum(["medium", "high", "critical"]),
  sideEffects: z.array(z.string().trim().min(3).max(240)).min(1).max(10),
  affectedRecords: z.array(z.string().trim().min(3).max(240)).min(1).max(20),
  policyReferences: z.array(z.string().trim().min(3).max(160)).min(1).max(10),
  expiresInHours: z.number().int().min(1).max(72),
}).strict();

export async function POST(request: Request) {
  try {
    const owner = await requireCommandCenterPermission(request, "request_approval");
    const parsed = approvalSchema.safeParse(await readJsonBody(request, 12_288));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Check the approval request." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const approval = await createCommandCenterApproval({ actorUid: owner.uid, ...parsed.data });
    return Response.json({ approval }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The approval request could not be created." }, { status: 500 });
  }
}
