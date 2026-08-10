import "server-only";

import Stripe from "stripe";
import { runStoredDocumentTransaction } from "@/lib/firebase-server";
import type { ServerAccount } from "@/lib/account-server";
import {
  priceMatchesOffer,
  membershipPriceMappings,
  type BillingInterval,
  type PaidLearnerPlan,
} from "@/lib/billing-offer";
import {
  isBillingInterval,
  isPaidLearnerPlan,
  offerFor,
  paidPlanFor,
} from "@/lib/membership-plans";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { serverEnvironment } from "@/lib/runtime-environment";

const CHECKOUT_CLAIM_STALE_MS = 2 * 60_000;

export class BillingCheckoutInProgressError extends Error {}

type CheckoutClaim =
  | { action: "reuse"; url: string }
  | { action: "busy" }
  | {
    action: "create";
    path: string;
    claimId: string;
    planId: PaidLearnerPlan;
    interval: BillingInterval;
    previousSessionId?: string;
  };

function requiredStripeSecret() {
  const secret = serverEnvironment.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Stripe is not configured.");
  return secret;
}

export function stripeClient() {
  return new Stripe(requiredStripeSecret());
}

export function siteUrl() {
  const value = serverEnvironment.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL is required for billing.");
  return value.replace(/\/$/, "");
}

export function priceForPlanInterval(planId: PaidLearnerPlan, interval: BillingInterval) {
  const prefix = planId === "plus" ? "STRIPE_PLUS" : "STRIPE_PRO";
  const key = `${prefix}_${interval === "annual" ? "ANNUAL" : "MONTHLY"}_PRICE_ID`;
  const value = serverEnvironment[key]?.trim();
  if (!value) throw new Error(`${interval === "annual" ? "Annual" : "Monthly"} ${paidPlanFor(planId).name} billing is not configured.`);
  return value;
}

async function stableStripeCustomer(stripe: Stripe, account: ServerAccount) {
  if (account.billingCustomerId?.startsWith("cus_")) return account.billingCustomerId;

  const created = await stripe.customers.create({
    email: account.email,
    name: account.displayName,
    metadata: { filosage_uid: account.uid },
  }, {
    idempotencyKey: `filosage-customer-v1-${account.uid}`,
  });
  const accountPath = `users/${account.uid}`;
  return runStoredDocumentTransaction([accountPath], (documents) => {
    const current = documents[accountPath];
    if (!current) throw new Error("The billing account no longer exists.");
    const existing = typeof current.billingCustomerId === "string"
      && current.billingCustomerId.startsWith("cus_")
      ? current.billingCustomerId
      : null;
    if (existing) return { writes: [], result: existing };
    return {
      writes: [{
        path: accountPath,
        data: {
          ...current,
          billingCustomerId: created.id,
          updatedAt: new Date().toISOString(),
        },
      }],
      result: created.id,
    };
  });
}

async function validatedPrice(stripe: Stripe, planId: PaidLearnerPlan, interval: BillingInterval) {
  const priceId = priceForPlanInterval(planId, interval);
  const price = await stripe.prices.retrieve(priceId);
  const valid = priceMatchesOffer(planId, interval, {
    active: price.active,
    currency: price.currency,
    unitAmount: price.unit_amount,
    type: price.type,
    recurringInterval: price.recurring?.interval,
    recurringIntervalCount: price.recurring?.interval_count,
  });
  if (!valid) {
    throw new Error(`The configured ${interval} Stripe Price does not match the published Filosage offer.`);
  }
  return price.id;
}

async function claimCheckout(account: ServerAccount, requestedPlanId: PaidLearnerPlan, requestedInterval: BillingInterval) {
  const path = `users/${account.uid}/billingCheckout/current`;
  const now = new Date();
  return runStoredDocumentTransaction<CheckoutClaim>([path], (documents) => {
    const existing = documents[path];
    const status = typeof existing?.status === "string" ? existing.status : "";
    const claimedAt = typeof existing?.claimedAt === "string" ? Date.parse(existing.claimedAt) : 0;
    const expiresAt = typeof existing?.expiresAt === "string" ? Date.parse(existing.expiresAt) : 0;
    const existingInterval = isBillingInterval(existing?.interval) ? existing.interval : requestedInterval;
    const existingPlanId = isPaidLearnerPlan(existing?.planId) ? existing.planId : requestedPlanId;

    if (status === "open" && expiresAt > now.getTime() && typeof existing?.url === "string") {
      if (existingInterval === requestedInterval && existingPlanId === requestedPlanId) {
        return { writes: [], result: { action: "reuse" as const, url: existing.url } };
      }
    }

    if ((status === "creating" || status === "replacing")
      && now.getTime() - claimedAt <= CHECKOUT_CLAIM_STALE_MS) {
      return { writes: [], result: { action: "busy" as const } };
    }

    const resumingStaleClaim = (status === "creating" || status === "replacing")
      && typeof existing?.claimId === "string";
    const claimId = resumingStaleClaim ? String(existing.claimId) : crypto.randomUUID();
    const interval = resumingStaleClaim ? existingInterval : requestedInterval;
    const planId = resumingStaleClaim ? existingPlanId : requestedPlanId;
    const previousSessionId = !resumingStaleClaim
      && status === "open"
      && typeof existing?.sessionId === "string"
      ? existing.sessionId
      : undefined;
    return {
      writes: [{
        path,
        data: {
          status: previousSessionId ? "replacing" : "creating",
          claimId,
          planId,
          interval,
          previousSessionId: previousSessionId ?? null,
          claimedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      }],
      result: { action: "create" as const, path, claimId, planId, interval, previousSessionId },
    };
  });
}

async function markCheckoutClaimFailed(path: string, claimId: string) {
  await runStoredDocumentTransaction([path], (documents) => {
    const existing = documents[path];
    if (existing?.claimId !== claimId) return { writes: [], result: undefined };
    return {
      writes: [{
        path,
        data: {
          ...existing,
          status: "failed",
          failedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }],
      result: undefined,
    };
  });
}

export async function createCheckoutSession(account: ServerAccount, planId: PaidLearnerPlan, interval: BillingInterval) {
  const stripe = stripeClient();
  const baseUrl = siteUrl();
  const claim = await claimCheckout(account, planId, interval);
  if (claim.action === "reuse") return claim.url;
  if (claim.action === "busy") throw new BillingCheckoutInProgressError("A secure checkout is already being prepared. Try again in a moment.");

  try {
    if (claim.previousSessionId?.startsWith("cs_")) {
      await stripe.checkout.sessions.expire(claim.previousSessionId);
    }
    const [customer, price] = await Promise.all([
      stableStripeCustomer(stripe, account),
      validatedPrice(stripe, claim.planId, claim.interval),
    ]);
    const plan = paidPlanFor(claim.planId);
    const offer = offerFor(claim.planId, claim.interval);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${baseUrl}/pricing?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=canceled`,
      client_reference_id: account.uid,
      customer,
      allow_promotion_codes: true,
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        submit: {
          message: claim.interval === "annual"
            ? `${plan.name} renews automatically each year until canceled. Manage or cancel online from your account.`
            : `${plan.name} renews automatically each month until canceled. Manage or cancel online from your account.`,
        },
      },
      metadata: {
        filosage_uid: account.uid,
        filosage_plan: claim.planId,
        filosage_interval: claim.interval,
        offer_version: plan.offerVersion,
        offer_currency: plan.currency,
        offer_amount_minor: String(offer.amountMinor),
        automatic_renewal: "true",
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      },
      subscription_data: {
        metadata: {
          filosage_uid: account.uid,
          filosage_plan: claim.planId,
          filosage_interval: claim.interval,
          offer_version: plan.offerVersion,
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
        },
      },
      expires_at: Math.floor(Date.now() / 1_000) + (31 * 60),
    }, {
      idempotencyKey: `filosage-checkout-v3-${claim.claimId}`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");

    const opened = await runStoredDocumentTransaction([claim.path], (documents) => {
      const existing = documents[claim.path];
      if (existing?.claimId !== claim.claimId) return { writes: [], result: false };
      return {
        writes: [{
          path: claim.path,
          data: {
            status: "open",
            claimId: claim.claimId,
            planId: claim.planId,
            interval: claim.interval,
            sessionId: session.id,
            url: session.url,
            expiresAt: new Date(session.expires_at * 1_000).toISOString(),
            createdAt: new Date(session.created * 1_000).toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }],
        result: true,
      };
    });
    if (!opened) {
      await stripe.checkout.sessions.expire(session.id);
      throw new Error("A newer checkout attempt replaced this session.");
    }
    return session.url;
  } catch (error) {
    await markCheckoutClaimFailed(claim.path, claim.claimId).catch(() => undefined);
    throw error;
  }
}

export async function createBillingPortalSession(account: ServerAccount) {
  if (!account.billingCustomerId?.startsWith("cus_")) {
    throw new Error("No Stripe customer is available for this account yet.");
  }
  const session = await stripeClient().billingPortal.sessions.create({
    customer: account.billingCustomerId,
    return_url: `${siteUrl()}/pricing`,
  });
  return session.url;
}

function configuredPriceMap() {
  const mappings = membershipPriceMappings({
    STRIPE_PLUS_MONTHLY_PRICE_ID: serverEnvironment.STRIPE_PLUS_MONTHLY_PRICE_ID,
    STRIPE_PLUS_ANNUAL_PRICE_ID: serverEnvironment.STRIPE_PLUS_ANNUAL_PRICE_ID,
    STRIPE_PRO_MONTHLY_PRICE_ID: serverEnvironment.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_ANNUAL_PRICE_ID: serverEnvironment.STRIPE_PRO_ANNUAL_PRICE_ID,
    STRIPE_PRO_LEGACY_PRICE_IDS: serverEnvironment.STRIPE_PRO_LEGACY_PRICE_IDS,
  });
  const byId = new Map(mappings.map((mapping) => [mapping.priceId, mapping]));
  if (!byId.size) throw new Error("No supported Filosage membership Prices are configured.");
  return byId;
}

function supportedSubscriptionPrice(subscription: Stripe.Subscription) {
  const configured = configuredPriceMap();
  const matches = subscription.items.data.flatMap((item) => {
    const mapping = configured.get(item.price.id);
    if (!mapping) return [];
    if (!mapping.legacy) return [{ item, mapping }];
    const interval: BillingInterval = item.price.recurring?.interval === "year" ? "annual" : "monthly";
    return [{ item, mapping: { ...mapping, interval } }];
  });
  if (matches.length !== 1) {
    throw new Error(`Stripe subscription ${subscription.id} must resolve to exactly one recognized membership Price; access was left unchanged.`);
  }
  return matches[0];
}

export function resolvedSubscriptionOffer(subscription: Stripe.Subscription) {
  const resolved = supportedSubscriptionPrice(subscription);
  return {
    item: resolved.item,
    priceId: resolved.item.price.id,
    planId: resolved.mapping.planId,
    billingInterval: resolved.mapping.interval,
    offerVersion: resolved.mapping.offerVersion,
  };
}

function subscriptionStatus(status: Stripe.Subscription.Status): ServerAccount["subscriptionStatus"] {
  if (status === "trialing" || status === "active" || status === "past_due" || status === "canceled") return status;
  return "none";
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  fallbackUid?: string,
  eventCreated?: number,
) {
  const uid = subscription.metadata.filosage_uid || fallbackUid;
  if (!uid) return false;

  const status = subscriptionStatus(subscription.status);
  const resolved = resolvedSubscriptionOffer(subscription);
  const paidEligible = status === "active" || status === "trialing";
  const periodEnd = subscription.items.data.reduce(
    (latest, item) => Math.max(latest, item.current_period_end),
    0,
  );
  const currentPeriodEnd = periodEnd > 0 ? new Date(periodEnd * 1_000).toISOString() : null;
  const path = `users/${uid}`;

  return runStoredDocumentTransaction([path], (documents) => {
    const current = documents[path];
    if (!current) return { writes: [], result: false };
    // Stripe does not guarantee webhook order: ignore events older than the
    // one that produced the currently stored billing state.
    const storedEventCreated = typeof current.billingEventCreated === "number" ? current.billingEventCreated : 0;
    if (eventCreated !== undefined && eventCreated < storedEventCreated) {
      return { writes: [], result: true };
    }
    return {
      writes: [{
        path,
        data: {
          ...current,
          billingCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
          billingSubscriptionId: subscription.id,
          billingRawStatus: subscription.status,
          billingCancelAtPeriodEnd: subscription.cancel_at_period_end,
          billingCanceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1_000).toISOString() : null,
          billingTrialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1_000).toISOString() : null,
          subscriptionStatus: paidEligible ? status : status === "past_due" ? "past_due" : "canceled",
          billingPlan: resolved.planId,
          billingInterval: resolved.billingInterval,
          currentPeriodEnd,
          billingPriceId: resolved.priceId,
          billingEventCreated: eventCreated ?? storedEventCreated,
          updatedAt: new Date().toISOString(),
        },
      }],
      result: true,
    };
  });
}

export async function recordBillingConsent(
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription,
  event: Pick<Stripe.Event, "id" | "created">,
) {
  const uid = session.metadata?.filosage_uid || session.client_reference_id;
  const interval = session.metadata?.filosage_interval;
  const planId = session.metadata?.filosage_plan;
  if (!uid || !isBillingInterval(interval) || !isPaidLearnerPlan(planId)) {
    throw new Error("Checkout consent is missing account, plan, or interval metadata.");
  }
  if (session.consent?.terms_of_service !== "accepted") {
    throw new Error("Stripe Checkout did not record required Terms acceptance.");
  }
  const plan = paidPlanFor(planId);
  if (session.currency?.toLowerCase() !== plan.currency || typeof session.amount_total !== "number") {
    throw new Error("Stripe Checkout did not return a complete USD amount snapshot.");
  }
  const resolved = supportedSubscriptionPrice(subscription);
  const price = resolved.item.price;
  const offer = offerFor(planId, interval);
  if (resolved.mapping.planId !== planId || resolved.mapping.interval !== interval || price.unit_amount !== offer.amountMinor) {
    throw new Error("The completed subscription does not match the accepted Filosage offer.");
  }

  const path = `users/${uid}/billingConsents/${session.id}`;
  const snapshot = {
    uid,
    checkoutSessionId: session.id,
    subscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id,
    planId,
    interval,
    currency: session.currency.toLowerCase(),
    listedAmountMinor: offer.amountMinor,
    subtotalAmountMinor: session.amount_subtotal,
    chargedAmountMinor: session.amount_total,
    automaticRenewal: true,
    onlineCancellationAvailable: true,
    termsAccepted: true,
    termsVersion: session.metadata?.terms_version ?? null,
    privacyVersion: session.metadata?.privacy_version ?? null,
    offerVersion: session.metadata?.offer_version ?? null,
    stripeEventId: event.id,
    acceptedAt: new Date(event.created * 1_000).toISOString(),
  };

  const checkoutPath = `users/${uid}/billingCheckout/current`;
  return runStoredDocumentTransaction([path, checkoutPath], (documents) => {
    const existing = documents[path];
    const currentCheckout = documents[checkoutPath];
    const checkoutWrite = currentCheckout?.sessionId === session.id
      ? [{
        path: checkoutPath,
        data: {
          ...currentCheckout,
          status: "completed",
          completedAt: snapshot.acceptedAt,
          updatedAt: new Date().toISOString(),
        },
      }]
      : [];
    if (existing) {
      const sameConsent = existing.checkoutSessionId === snapshot.checkoutSessionId
        && existing.subscriptionId === snapshot.subscriptionId
        && existing.termsAccepted === true;
      if (!sameConsent) throw new Error("Stored checkout consent conflicts with the verified Stripe event.");
      return { writes: checkoutWrite, result: false };
    }
    return { writes: [{ path, data: snapshot }, ...checkoutWrite], result: true };
  });
}
