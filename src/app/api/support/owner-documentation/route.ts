import { withAccountRequest } from "@/lib/auth-server";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { ownerDocumentation } from "@/content/support/owner-documentation";

async function handleGET(request: Request) {
  try {
    await requireOwner(request);
    return Response.json(ownerDocumentation, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authorizationResponse(error)
      ?? Response.json({ error: "The owner handbook could not be loaded." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);
