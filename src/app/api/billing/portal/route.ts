import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { billingConfiguration } from "@/lib/runtime-config";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";
import { createBillingPortalSession } from "@/lib/stripe-server";

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "billing-portal", 8);
  if (limited) return limited;
  try {
    assertTrustedMutation(request);
    const account = await requireAcceptedAccount(request);
    if (!billingConfiguration().managementReady) return Response.json({ error: "Billing management is not available yet." }, { status: 503 });
    const url = await createBillingPortalSession(account);
    return Response.json({ url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error) ?? authorizationResponse(error) ?? Response.json({ error: "Billing management could not be opened." }, { status: 500 });
  }
}
