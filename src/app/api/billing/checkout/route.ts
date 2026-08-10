import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";
import { subscriptionBlocksCheckout } from "@/lib/billing-lock";
import { billingConfiguration } from "@/lib/runtime-config";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { BillingCheckoutInProgressError, createCheckoutSession } from "@/lib/stripe-server";
import { recordServerProductEvent } from "@/lib/product-events-server";
import { isBillingInterval, isPaidLearnerPlan } from "@/lib/membership-plans";

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const account = await requireAcceptedAccount(request);
    const limited = await enforceDurableRateLimit(request, "billing-checkout", 8, 60_000, account.uid);
    if (limited) return limited;
    if (!billingConfiguration().checkoutReady) return Response.json({ error: "Paid subscriptions are not available yet." }, { status: 503 });
    if (subscriptionBlocksCheckout(account.subscriptionStatus)) {
      return Response.json(
        { error: "A subscription already exists for this account. Use Manage billing instead." },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const body = await readJsonBody(request, 1_024) as { planId?: unknown; interval?: unknown };
    if (!isPaidLearnerPlan(body.planId)) return Response.json({ error: "Choose Filosage Plus or Filosage Pro." }, { status: 400 });
    if (!isBillingInterval(body.interval)) return Response.json({ error: "Choose a monthly or annual billing interval." }, { status: 400 });
    const url = await createCheckoutSession(account, body.planId, body.interval);
    await recordServerProductEvent("checkout_started", {
      route: "/pricing",
      actorId: account.uid,
    });
    return Response.json({ url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof BillingCheckoutInProgressError) {
      return Response.json({ error: error.message }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    return apiRequestErrorResponse(error) ?? authorizationResponse(error) ?? Response.json({ error: "Checkout could not be started." }, { status: 500 });
  }
}
