import { z } from "zod";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { getStoredDocument, putStoredDocument } from "@/lib/firebase-server";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";

interface RouteParams {
  params: Promise<{ reportId: string }>;
}

const updateSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
}).strict();

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    assertTrustedMutation(request);
    const owner = await requireOwner(request);
    const { reportId } = await params;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(reportId)) {
      return Response.json({ error: "Invalid report." }, { status: 400 });
    }
    const parsed = updateSchema.safeParse(await readJsonBody(request, 1_024));
    if (!parsed.success) return Response.json({ error: "Choose a valid review outcome." }, { status: 400 });
    const path = `contentReports/${reportId}`;
    const report = await getStoredDocument(path);
    if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
    await putStoredDocument(path, {
      ...report,
      status: parsed.data.status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: owner.uid,
    });
    return Response.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "The content report could not be updated." }, { status: 500 });
  }
}
