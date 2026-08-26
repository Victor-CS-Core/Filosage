import { billingStatus } from "@/lib/billing";
import { getVerifiedUser } from "@/lib/auth-server";

export async function GET(request: Request) {
  const user = await getVerifiedUser(request);
  return Response.json(billingStatus(user?.uid), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
