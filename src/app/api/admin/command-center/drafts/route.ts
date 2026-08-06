import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { aiQuotaResponse } from "@/lib/ai-usage";
import { authorizationResponse } from "@/lib/auth-server";
import { commandCenterAuthorizationResponse, requireCommandCenterPermission } from "@/lib/command-center-auth";
import { commandCenterDraftRequestSchema } from "@/lib/command-center-draft-schema";
import {
  commandCenterDraftGenerationResponse,
  generateCommandCenterDraft,
} from "@/lib/command-center-draft-server";
import { commandCenterErrorResponse } from "@/lib/command-center-server";

export async function POST(request: Request) {
  try {
    const owner = await requireCommandCenterPermission(request, "generate_draft");
    const parsed = commandCenterDraftRequestSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Check the draft request." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const result = await generateCommandCenterDraft({
      account: owner,
      ...parsed.data,
      idempotencyKey: request.headers.get("idempotency-key"),
    });
    return Response.json(result, {
      status: result.recovered ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? aiQuotaResponse(error)
      ?? commandCenterDraftGenerationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "The review draft could not be generated." }, { status: 500 });
  }
}
