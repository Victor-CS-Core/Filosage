import { billingConfiguration } from "@/lib/runtime-config";
import { readBoundedRequestText } from "@/lib/bounded-request-body";
import { putStoredDocument, runStoredDocumentTransaction } from "@/lib/firebase-server";
import { recordBillingConsent, resolvedSubscriptionOffer, stripeClient, syncStripeSubscription } from "@/lib/stripe-server";
import type Stripe from "stripe";
import { reportOperationalEvent } from "@/lib/operational-alerts";
import { serverEnvironment } from "@/lib/runtime-environment";
import { recordServerProductEvent } from "@/lib/product-events-server";
import { isBillingInterval, isPaidLearnerPlan } from "@/lib/membership-plans";

export const runtime = "nodejs";

// A crashed handler leaves its claim in "processing"; Stripe retries are
// allowed to reclaim it after this window because subscription syncs are
// idempotent.
const PROCESSING_RETRY_MS = 5 * 60_000;
const MAX_WEBHOOK_BODY_BYTES = 1_048_576;

function subscriptionEventDetails(subscription: Stripe.Subscription, includeDeclared = false) {
  try {
    const resolved = resolvedSubscriptionOffer(subscription);
    return {
      planId: resolved.planId,
      billingInterval: resolved.billingInterval,
      offerVersion: resolved.offerVersion,
      priceId: resolved.priceId,
    };
  } catch {
    if (!includeDeclared) return {};
    const declaredPlanId = isPaidLearnerPlan(subscription.metadata.erudoza_plan) ? subscription.metadata.erudoza_plan : undefined;
    const declaredBillingInterval = isBillingInterval(subscription.metadata.erudoza_interval) ? subscription.metadata.erudoza_interval : undefined;
    return {
      ...(declaredPlanId ? { declaredPlanId } : {}),
      ...(declaredBillingInterval ? { declaredBillingInterval } : {}),
      ...(subscription.metadata.offer_version ? { declaredOfferVersion: subscription.metadata.offer_version } : {}),
    };
  }
}

function stripeEventAuditDetails(event: Stripe.Event) {
  const eventCreatedAt = new Date(event.created * 1_000).toISOString();
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const details = subscriptionEventDetails(subscription, true);
    const currentPeriodEnd = subscription.items.data.reduce((latest, item) => Math.max(latest, item.current_period_end), 0);
    return {
      eventCreatedAt,
      stripeSubscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(subscription.canceled_at ? { canceledAt: new Date(subscription.canceled_at * 1_000).toISOString() } : {}),
      ...(subscription.trial_end ? { trialEnd: new Date(subscription.trial_end * 1_000).toISOString() } : {}),
      ...(currentPeriodEnd ? { currentPeriodEnd: new Date(currentPeriodEnd * 1_000).toISOString() } : {}),
      ...(details.planId ? { planId: details.planId } : {}),
      ...(details.billingInterval ? { billingInterval: details.billingInterval } : {}),
      ...(details.offerVersion ? { offerVersion: details.offerVersion } : {}),
      ...(details.priceId ? { priceId: details.priceId } : {}),
      ...("declaredPlanId" in details ? { declaredPlanId: details.declaredPlanId } : {}),
      ...("declaredBillingInterval" in details ? { declaredBillingInterval: details.declaredBillingInterval } : {}),
      ...("declaredOfferVersion" in details ? { declaredOfferVersion: details.declaredOfferVersion } : {}),
    };
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const planId = isPaidLearnerPlan(session.metadata?.erudoza_plan) ? session.metadata.erudoza_plan : undefined;
    const billingInterval = isBillingInterval(session.metadata?.erudoza_interval) ? session.metadata.erudoza_interval : undefined;
    return {
      eventCreatedAt,
      ...(planId ? { planId } : {}),
      ...(billingInterval ? { billingInterval } : {}),
      ...(session.metadata?.offer_version ? { offerVersion: session.metadata.offer_version } : {}),
      ...(typeof session.amount_total === "number" ? { amountTotalMinor: session.amount_total } : {}),
      ...(session.currency ? { currency: session.currency.toLowerCase() } : {}),
    };
  }
  return { eventCreatedAt };
}

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
  const secret = serverEnvironment.STRIPE_WEBHOOK_SECRET?.trim();
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
  const claimedAt = new Date();
  const claimed = await claimEvent(eventPath, claimedAt);
  if (!claimed) return Response.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === "string") {
          const subscription = await stripeClient().subscriptions.retrieve(session.subscription);
          await recordBillingConsent(session, subscription, event);
          const uid = subscription.metadata.erudoza_uid || session.client_reference_id || undefined;
          const synchronized = await syncStripeSubscription(subscription, uid, event.created);
          if (synchronized && uid) {
            await recordServerProductEvent("subscription_started", {
              route: "/pricing",
              actorId: uid,
              eventId: `stripe-started-${event.id}`,
              ...subscriptionEventDetails(subscription),
            });
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        {
          const subscription = event.data.object as Stripe.Subscription;
          const synchronized = await syncStripeSubscription(subscription, undefined, event.created);
          const uid = subscription.metadata.erudoza_uid;
          if (event.type === "customer.subscription.deleted" && synchronized && uid) {
            await recordServerProductEvent("subscription_canceled", {
              route: "/pricing",
              actorId: uid,
              eventId: `stripe-canceled-${event.id}`,
              ...subscriptionEventDetails(subscription),
            });
          }
        }
        break;
      default:
        break;
    }
  } catch (error) {
    await putStoredDocument(eventPath, {
      type: event.type,
      status: "failed",
      claimedAt: claimedAt.toISOString(),
      failedAt: new Date().toISOString(),
      retryable: true,
      ...stripeEventAuditDetails(event),
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

  await putStoredDocument(eventPath, {
    type: event.type,
    status: "processed",
    claimedAt: claimedAt.toISOString(),
    processedAt: new Date().toISOString(),
    ...stripeEventAuditDetails(event),
  });
  return Response.json({ received: true });
}
