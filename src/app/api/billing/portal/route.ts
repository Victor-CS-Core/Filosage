import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { billingConfiguration } from "@/lib/runtime-config";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "billing-portal", 8);
  if (limited) return limited;
  try {
    assertTrustedMutation(request);
    await requireAccount(request);
    if (!billingConfiguration().configured) return Response.json({ error: "Billing management is not available yet." }, { status: 503 });
    return Response.json({ error: "Billing portal integration is not enabled in this deployment." }, { status: 501 });
  } catch (error) {
    return apiRequestErrorResponse(error) ?? authorizationResponse(error) ?? Response.json({ error: "Billing management could not be opened." }, { status: 500 });
  }
}
