import { billingConfiguration } from "@/lib/runtime-config";
import { getStoredDocument, putStoredDocument } from "@/lib/firebase-server";
import { stripeClient, syncStripeSubscription } from "@/lib/stripe-server";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!billingConfiguration().configured) return Response.json({ error: "Billing is not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !secret) return Response.json({ error: "Invalid Stripe webhook." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return Response.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  const eventPath = `stripeEvents/${event.id}`;
  if (await getStoredDocument(eventPath)) return Response.json({ received: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const subscription = await stripeClient().subscriptions.retrieve(session.subscription);
        await syncStripeSubscription(subscription, session.client_reference_id ?? undefined);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncStripeSubscription(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }

  await putStoredDocument(eventPath, { type: event.type, processedAt: new Date().toISOString() });
  return Response.json({ received: true });
}
