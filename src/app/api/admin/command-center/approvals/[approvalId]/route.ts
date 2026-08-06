import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireRecentlyAuthenticatedOwner } from "@/lib/auth-server";
import {
  commandCenterAuthorizationResponse,
  requireCommandCenterPermission,
} from "@/lib/command-center-auth";
import {
  commandCenterErrorResponse,
  reviewCommandCenterApproval,
} from "@/lib/command-center-server";

const reviewSchema = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    await requireCommandCenterPermission(request, "review_approval");
    const owner = await requireRecentlyAuthenticatedOwner(request);
    const { approvalId } = await context.params;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(approvalId)) {
      return Response.json({ error: "Invalid approval request." }, { status: 400 });
    }
    const parsed = reviewSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Record a decision reason." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const approval = await reviewCommandCenterApproval({ actorUid: owner.uid, approvalId, ...parsed.data });
    return Response.json(
      { approval, executed: false, simulationMode: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The approval decision could not be recorded." }, { status: 500 });
  }
}
