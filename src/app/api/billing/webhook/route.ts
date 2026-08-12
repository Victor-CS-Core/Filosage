import { billingConfiguration } from "@/lib/runtime-config";
import { readBoundedRequestText } from "@/lib/bounded-request-body";
import { putStoredDocument, runStoredDocumentTransaction } from "@/lib/firebase-server";
import {
  BillingConsentRequiredError,
  recordBillingConsent,
  recordSubscriptionConsentFromCheckout,
  resolvedSubscriptionOffer,
  stripeClient,
  stripeInvoicePaymentSnapshot,
  stripeInvoiceSubscriptionId,
  syncStripeSubscription,
  verifyCheckoutFulfillment,
  type BillingPaymentSnapshot,
} from "@/lib/stripe-server";
import type Stripe from "stripe";
import { reportOperationalEvent } from "@/lib/operational-alerts";
import { serverEnvironment } from "@/lib/runtime-environment";
import { recordServerProductEvent } from "@/lib/product-events-server";
import { isBillingInterval, isPaidLearnerPlan } from "@/lib/membership-plans";
import {
  billingWebhookClaimDisposition,
  chargeLifecyclePaymentState,
  invoiceLifecyclePaymentOverride,
  terminalSubscriptionCanBeAcknowledgedWithoutAccount,
} from "@/lib/billing-lock";

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
    const declaredPlanId = isPaidLearnerPlan(subscription.metadata.filosage_plan) ? subscription.metadata.filosage_plan : undefined;
    const declaredBillingInterval = isBillingInterval(subscription.metadata.filosage_interval) ? subscription.metadata.filosage_interval : undefined;
    return {
      ...(declaredPlanId ? { declaredPlanId } : {}),
      ...(declaredBillingInterval ? { declaredBillingInterval } : {}),
      ...(subscription.metadata.offer_version ? { declaredOfferVersion: subscription.metadata.offer_version } : {}),
    };
  }
}

function stripeEventAuditDetails(event: Stripe.Event) {
  const eventCreatedAt = new Date(event.created * 1_000).toISOString();
  if (event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
    || event.type === "customer.subscription.deleted"
    || event.type === "customer.subscription.paused"
    || event.type === "customer.subscription.resumed") {
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
    const planId = isPaidLearnerPlan(session.metadata?.filosage_plan) ? session.metadata.filosage_plan : undefined;
    const billingInterval = isBillingInterval(session.metadata?.filosage_interval) ? session.metadata.filosage_interval : undefined;
    return {
      eventCreatedAt,
      ...(planId ? { planId } : {}),
      ...(billingInterval ? { billingInterval } : {}),
      ...(session.metadata?.offer_version ? { offerVersion: session.metadata.offer_version } : {}),
      ...(typeof session.amount_total === "number" ? { amountTotalMinor: session.amount_total } : {}),
      ...(session.currency ? { currency: session.currency.toLowerCase() } : {}),
    };
  }
  if (event.type === "invoice.paid"
    || event.type === "invoice.payment_failed"
    || event.type === "invoice.finalization_failed"
    || event.type === "invoice.payment_action_required"
    || event.type === "invoice.marked_uncollectible"
    || event.type === "invoice.voided") {
    const invoice = event.data.object as Stripe.Invoice;
    return {
      eventCreatedAt,
      stripeInvoiceId: invoice.id,
      stripeInvoiceStatus: invoice.status,
      invoicePaid: invoice.status === "paid",
      invoiceAttemptCount: invoice.attempt_count,
      amountDueMinor: invoice.amount_due,
      amountPaidMinor: invoice.amount_paid,
      currency: invoice.currency.toLowerCase(),
    };
  }
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    return {
      eventCreatedAt,
      stripeChargeId: charge.id,
      amountMinor: charge.amount,
      amountRefundedMinor: charge.amount_refunded,
      fullyRefunded: charge.refunded,
      currency: charge.currency.toLowerCase(),
    };
  }
  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    return {
      eventCreatedAt,
      stripeDisputeId: dispute.id,
      stripeDisputeStatus: dispute.status,
      amountMinor: dispute.amount,
      currency: dispute.currency.toLowerCase(),
    };
  }
  return { eventCreatedAt };
}

async function claimEvent(eventPath: string, now: Date) {
  return runStoredDocumentTransaction([eventPath], (documents) => {
    const existing = documents[eventPath];
    const disposition = billingWebhookClaimDisposition(existing, now.getTime(), PROCESSING_RETRY_MS);
    if (disposition !== "claim") return { writes: [], result: disposition };
    return {
      writes: [{
        path: eventPath,
        data: { status: "processing", claimedAt: now.toISOString() },
      }],
      result: "claimed" as const,
    };
  });
}

function subscriptionId(value: string | Stripe.Subscription | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function latestInvoiceId(subscription: Stripe.Subscription) {
  const invoice = subscription.latest_invoice;
  if (!invoice) return null;
  return typeof invoice === "string" ? invoice : invoice.id;
}

async function currentSubscription(subscription: Stripe.Subscription) {
  return stripeClient().subscriptions.retrieve(subscription.id);
}

async function currentSubscriptionPayment(subscription: Stripe.Subscription) {
  const invoiceId = latestInvoiceId(subscription);
  if (!invoiceId) return undefined;
  const invoice = await stripeClient().invoices.retrieve(invoiceId);
  if (stripeInvoiceSubscriptionId(invoice) !== subscription.id) {
    throw new Error(`Stripe invoice ${invoice.id} does not belong to subscription ${subscription.id}.`);
  }
  if (invoice.status !== "paid") return undefined;
  return stripeInvoicePaymentSnapshot(invoice);
}

async function syncSubscriptionWithConsentBootstrap(
  subscription: Stripe.Subscription,
  event: Pick<Stripe.Event, "id" | "created" | "type">,
  payment?: BillingPaymentSnapshot,
  fallbackUid?: string,
) {
  try {
    return await syncStripeSubscription(subscription, { event, payment, fallbackUid });
  } catch (error) {
    if (!(error instanceof BillingConsentRequiredError)) throw error;
    // Strictly validate the current Checkout snapshot only while establishing
    // the durable subscription/customer consent binding. Renewals with that
    // binding bypass this bootstrap and preserve their historical consent.
    await recordSubscriptionConsentFromCheckout(stripeClient(), subscription, event);
    return syncStripeSubscription(subscription, { event, payment, fallbackUid });
  }
}

async function invoiceForCharge(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!paymentIntentId) return null;
  const payments = await stripeClient().invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntentId },
    limit: 10,
  });
  if (payments.data.length > 1) {
    throw new Error(`Stripe charge ${charge.id} resolved to more than one invoice payment.`);
  }
  const invoice = payments.data[0]?.invoice;
  if (!invoice || (typeof invoice !== "string" && "deleted" in invoice && invoice.deleted)) return null;
  const invoiceId = typeof invoice === "string" ? invoice : invoice.id;
  return stripeClient().invoices.retrieve(invoiceId);
}

async function reconcileInvoice(
  event: Pick<Stripe.Event, "id" | "created" | "type">,
  eventInvoice: Stripe.Invoice,
  override?: BillingPaymentSnapshot["state"],
) {
  const stripe = stripeClient();
  const invoice = await stripe.invoices.retrieve(eventInvoice.id);
  const stripeSubscriptionId = stripeInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return false;
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const paymentSnapshot = latestInvoiceId(subscription) === invoice.id
    ? stripeInvoicePaymentSnapshot(invoice, override)
    : await currentSubscriptionPayment(subscription);
  const payment = paymentSnapshot?.state === "unknown" ? undefined : paymentSnapshot;
  const synchronized = await syncSubscriptionWithConsentBootstrap(subscription, event, payment);
  if (!synchronized && !terminalSubscriptionCanBeAcknowledgedWithoutAccount(subscription.status)) {
    throw new Error(`Stripe subscription ${subscription.id} could not be bound to a Filosage account.`);
  }
  return true;
}

async function reconcileCharge(
  event: Pick<Stripe.Event, "id" | "created" | "type">,
  eventCharge: Stripe.Charge,
  state: BillingPaymentSnapshot["state"] | "refund",
) {
  const charge = await stripeClient().charges.retrieve(eventCharge.id);
  const invoice = await invoiceForCharge(charge);
  if (!invoice) return false;
  const resolvedState = chargeLifecyclePaymentState(state, {
    amount: charge.amount,
    amountRefunded: charge.amount_refunded,
    refunded: charge.refunded,
  });
  return reconcileInvoice(event, invoice, resolvedState);
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
  const claim = await claimEvent(eventPath, claimedAt);
  if (claim === "processed") return Response.json({ received: true, duplicate: true });
  if (claim === "in_flight") {
    return Response.json(
      { error: "This Stripe event is already processing; retry later." },
      { status: 409, headers: { "Retry-After": "5" } },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeSubscriptionId = subscriptionId(session.subscription);
        if (!stripeSubscriptionId) throw new Error("Completed subscription Checkout has no Stripe subscription.");
        {
          const stripe = stripeClient();
          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const payment = await verifyCheckoutFulfillment(stripe, session, subscription);
          const consentRecorded = await recordBillingConsent(session, subscription, event);
          if (consentRecorded === null) {
            if (terminalSubscriptionCanBeAcknowledgedWithoutAccount(subscription.status)) break;
            throw new Error(`Stripe subscription ${subscription.id} completed for a missing Filosage account.`);
          }
          const uid = subscription.metadata.filosage_uid || session.client_reference_id || undefined;
          const synchronized = await syncStripeSubscription(subscription, {
            event,
            fallbackUid: uid,
            payment,
          });
          if (!synchronized) throw new Error(`Stripe subscription ${subscription.id} could not be bound to a Filosage account.`);
          if (consentRecorded && uid) {
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
      case "invoice.paid":
      case "invoice.payment_failed":
      case "invoice.finalization_failed":
      case "invoice.payment_action_required":
      case "invoice.marked_uncollectible":
      case "invoice.voided": {
        const handled = await reconcileInvoice(
          event,
          event.data.object as Stripe.Invoice,
          invoiceLifecyclePaymentOverride(event.type),
        );
        if (!handled) {
          console.info("Ignoring a verified Stripe invoice event that is not attached to a subscription:", event.id);
        }
        if (event.type !== "invoice.paid" && handled) {
          await reportOperationalEvent({
            severity: "warning",
            code: `billing.${event.type.replaceAll(".", "_")}`,
            message: "A Stripe subscription requires billing recovery attention.",
            deduplicationKey: event.id,
            context: { eventId: event.id, eventType: event.type },
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        {
          const subscription = await currentSubscription(event.data.object as Stripe.Subscription);
          const payment = await currentSubscriptionPayment(subscription);
          const synchronized = await syncSubscriptionWithConsentBootstrap(subscription, event, payment);
          const uid = subscription.metadata.filosage_uid;
          if (!synchronized && !terminalSubscriptionCanBeAcknowledgedWithoutAccount(subscription.status)) {
            throw new Error(`Stripe subscription ${subscription.id} could not be bound to a Filosage account.`);
          }
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
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await reconcileCharge(event, charge, "refund");
        break;
      }
      case "charge.dispute.created": {
        const dispute = await stripeClient().disputes.retrieve((event.data.object as Stripe.Dispute).id);
        const charge = typeof dispute.charge === "string"
          ? await stripeClient().charges.retrieve(dispute.charge)
          : dispute.charge;
        const recovered = dispute.status === "won" || dispute.status === "prevented" || dispute.status === "warning_closed";
        await reconcileCharge(event, charge, recovered ? "paid" : "disputed");
        break;
      }
      case "charge.dispute.closed": {
        const dispute = await stripeClient().disputes.retrieve((event.data.object as Stripe.Dispute).id);
        const charge = typeof dispute.charge === "string"
          ? await stripeClient().charges.retrieve(dispute.charge)
          : dispute.charge;
        const recovered = dispute.status === "won" || dispute.status === "prevented" || dispute.status === "warning_closed";
        await reconcileCharge(event, charge, recovered ? "paid" : "disputed");
        break;
      }
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
      deduplicationKey: event.id,
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
