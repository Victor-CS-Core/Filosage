import { withAccountRequest } from "@/lib/auth-server";
import { authorizationResponse } from "@/lib/auth-server";
import {
  commandCenterAuthorizationResponse,
  requireCommandCenterPermission,
} from "@/lib/command-center-auth";
import { getCommandCenterSnapshot } from "@/lib/command-center-server";

async function handleGET(request: Request) {
  try {
    await requireCommandCenterPermission(request, "view");
    return Response.json(
      await getCommandCenterSnapshot(),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return commandCenterAuthorizationResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json(
        { error: "The command center could not be loaded." },
        { status: 500, headers: { "Cache-Control": "private, no-store" } },
      );
  }
}

export const GET = withAccountRequest(handleGET);
