import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { billingConfiguration } from "@/lib/runtime-config";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "billing-checkout", 8);
  if (limited) return limited;
  try {
    assertTrustedMutation(request);
    await requireAccount(request);
    if (!billingConfiguration().configured) return Response.json({ error: "Paid subscriptions are not available yet." }, { status: 503 });
    return Response.json({ error: "Checkout provider integration is not enabled in this deployment." }, { status: 501 });
  } catch (error) {
    return apiRequestErrorResponse(error) ?? authorizationResponse(error) ?? Response.json({ error: "Checkout could not be started." }, { status: 500 });
  }
}
