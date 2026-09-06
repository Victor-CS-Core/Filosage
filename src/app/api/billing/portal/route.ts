import { withAccountRequest, AuthorizationError, authorizationResponse, hasCurrentLegalAcceptance, requireAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";
import { parseBillingPortalRequest } from "@/lib/billing-portal";
import { billingConfiguration } from "@/lib/runtime-config";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { createBillingPortalSession } from "@/lib/stripe-server";

async function handlePOST(request: Request) {
  try {
    assertTrustedMutation(request);
    const account = await requireAccount(request);
    const limited = await enforceDurableRateLimit(request, "billing-portal", 8, 60_000, account.uid);
    if (limited) return limited;
    if (!billingConfiguration().managementReady) return Response.json({ error: "Billing management is not available yet." }, { status: 503 });
    const action = parseBillingPortalRequest(await readJsonBody(request, 1_024));
    if (!action) return Response.json({ error: "Choose a valid Stripe billing action." }, { status: 400 });
    if (action === "change_plan" && (account.accountStatus === "suspended" || !hasCurrentLegalAcceptance(account))) {
      throw new AuthorizationError(403, "Plan changes require an active account and current Terms acceptance. You can still update your payment method or cancel.");
    }
    const url = await createBillingPortalSession(account, action);
    return Response.json({ url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error) ?? authorizationResponse(error) ?? Response.json({ error: "Billing management could not be opened." }, { status: 500 });
  }
}

export const POST = withAccountRequest(handlePOST);
