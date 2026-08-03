import { billingConfiguration } from "@/lib/runtime-config";
import { readBoundedRequestText } from "@/lib/bounded-request-body";
import { putStoredDocument, runStoredDocumentTransaction } from "@/lib/firebase-server";
import { recordBillingConsent, stripeClient, syncStripeSubscription } from "@/lib/stripe-server";
import type Stripe from "stripe";
import { reportOperationalEvent } from "@/lib/operational-alerts";

export const runtime = "nodejs";

// A crashed handler leaves its claim in "processing"; Stripe retries are
// allowed to reclaim it after this window because subscription syncs are
// idempotent.
const PROCESSING_RETRY_MS = 5 * 60_000;
const MAX_WEBHOOK_BODY_BYTES = 1_048_576;

async function claimEvent(eventPath: string, now: Date) {
  return runStoredDocumentTransaction([eventPath], (documents) => {
    const existing = documents[eventPath];
    if (existing) {
      const processedAt = typeof existing.processedAt === "string" ? existing.processedAt : undefined;
      const claimedAt = typeof existing.claimedAt === "string" ? Date.parse(existing.claimedAt) : 0;
      const staleClaim = !processedAt && now.getTime() - claimedAt > PROCESSING_RETRY_MS;
      if (!staleClaim) return { writes: [], result: false };
    }
    return {
      writes: [{
        path: eventPath,
        data: { status: "processing", claimedAt: now.toISOString() },
      }],
      result: true,
    };
  });
}

export async function POST(request: Request) {
  // The checkout lock stops new purchases. Existing subscribers still need
  // signed webhook events to update access, cancellation, and payment state.
  if (!billingConfiguration().webhookReady) return Response.json({ error: "Billing is not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !secret) return Response.json({ error: "Invalid Stripe webhook." }, { status: 400 });

  let rawBody: string | null;
  try {
    rawBody = await readBoundedRequestText(request, MAX_WEBHOOK_BODY_BYTES);
  } catch {
    return Response.json({ error: "Invalid Stripe webhook body." }, { status: 400 });
  }
  if (rawBody === null) return Response.json({ error: "Stripe webhook body is too large." }, { status: 413 });

  let event: Stripe.Event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(rawBody, signature, secret);
  } catch {
    return Response.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  const eventPath = `stripeEvents/${event.id}`;
  const claimed = await claimEvent(eventPath, new Date());
  if (!claimed) return Response.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === "string") {
          const subscription = await stripeClient().subscriptions.retrieve(session.subscription);
          await recordBillingConsent(session, subscription, event);
          await syncStripeSubscription(subscription, session.client_reference_id ?? undefined, event.created);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncStripeSubscription(event.data.object as Stripe.Subscription, undefined, event.created);
        break;
      default:
        break;
    }
  } catch (error) {
    await putStoredDocument(eventPath, {
      type: event.type,
      status: "failed",
      failedAt: new Date().toISOString(),
      retryable: true,
    });
    console.error("Stripe webhook processing failed:", event.id, event.type, error);
    await reportOperationalEvent({
      severity: "critical",
      code: "billing.webhook_failed",
      message: "A verified Stripe event failed during entitlement synchronization.",
      context: { eventId: event.id, eventType: event.type },
    });
    return Response.json({ error: "Webhook processing failed and will be retried." }, { status: 500 });
  }

  await putStoredDocument(eventPath, { type: event.type, status: "processed", processedAt: new Date().toISOString() });
  return Response.json({ received: true });
}
