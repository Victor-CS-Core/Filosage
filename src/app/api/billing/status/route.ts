import { withAccountRequest } from "@/lib/auth-server";
import { billingStatus } from "@/lib/billing";
import { getVerifiedUser } from "@/lib/auth-server";

async function handleGET(request: Request) {
  const user = await getVerifiedUser(request);
  return Response.json(billingStatus(user?.uid), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const GET = withAccountRequest(handleGET);
