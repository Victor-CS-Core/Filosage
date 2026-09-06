import { withAccountRequest } from "@/lib/auth-server";
import { apiRequestErrorResponse } from "@/lib/api-security";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { commandCenterErrorResponse, getUserCommandCenterTicket } from "@/lib/command-center-server";

async function handleGET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const account = await requireAcceptedAccount(request);
    const { ticketId } = await context.params;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(ticketId)) {
      return Response.json(
        { error: "Support request not found." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const ticket = await getUserCommandCenterTicket(account.uid, ticketId);
    return Response.json({ ticket }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? commandCenterErrorResponse(error)
      ?? Response.json({ error: "Your support request could not be loaded." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);
