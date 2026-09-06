import { withAccountRequest } from "@/lib/auth-server";
import { z } from "zod";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";
import {
  commandCenterErrorResponse,
  reviewContentReportWithCommandCenterSync,
} from "@/lib/command-center-server";

interface RouteParams {
  params: Promise<{ reportId: string }>;
}

const updateSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
}).strict();

async function handlePATCH(request: Request, { params }: RouteParams) {
  try {
    assertTrustedMutation(request);
    const owner = await requireOwner(request);
    const { reportId } = await params;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(reportId)) {
      return Response.json({ error: "Invalid report." }, { status: 400 });
    }
    const parsed = updateSchema.safeParse(await readJsonBody(request, 1_024));
    if (!parsed.success) return Response.json({ error: "Choose a valid review outcome." }, { status: 400 });
    const result = await reviewContentReportWithCommandCenterSync({
      actorUid: owner.uid,
      reportId,
      status: parsed.data.status,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The content report could not be updated." }, { status: 500 });
  }
}

export const PATCH = withAccountRequest(handlePATCH);
