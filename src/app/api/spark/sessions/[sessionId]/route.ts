import { withAccountRequest, authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { readSparkSessionPage, sparkRepositoryErrorResponse } from "@/lib/spark/repository";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

async function handleGET(request: Request, { params }: RouteParams) {
  try {
    const account = await requireAcceptedAccount(request);
    const { sessionId } = await params;
    if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(sessionId)) {
      return Response.json({ error: "Choose a valid Spark session." }, { status: 400 });
    }
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isInteger(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 20;
    const after = url.searchParams.get("after")?.trim() || undefined;
    const result = await readSparkSessionPage(account, sessionId, { limit, after });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return sparkRepositoryErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Spark session history is temporarily unavailable." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);