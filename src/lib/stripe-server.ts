import "server-only";

import Stripe from "stripe";
import { runStoredDocumentTransaction } from "@/lib/firebase-server";
import type { ServerAccount } from "@/lib/account-server";
import {
  offerForInterval,
  priceMatchesOffer,
  PRO_OFFER,
  PRO_OFFER_VERSION,
  type BillingInterval,
} from "@/lib/billing-offer";
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

export function priceForInterval(interval: BillingInterval) {
  const value = interval === "annual"
    ? serverEnvironment.STRIPE_PRO_ANNUAL_PRICE_ID?.trim()
    : serverEnvironment.STRIPE_PRO_MONTHLY_PRICE_ID?.trim();
  if (!value) throw new Error(`${interval === "annual" ? "Annual" : "Monthly"} Pro billing is not configured.`);
  return value;
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

async function stableStripeCustomer(stripe: Stripe, account: ServerAccount) {
  if (account.billingCustomerId?.startsWith("cus_")) return account.billingCustomerId;

  const created = await stripe.customers.create({
    email: account.email,
    name: account.displayName,
    metadata: { erudoza_uid: account.uid },
  }, {
    idempotencyKey: `erudoza-customer-v1-${account.uid}`,
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

async function validatedPrice(stripe: Stripe, interval: BillingInterval) {
  const priceId = priceForInterval(interval);
  const price = await stripe.prices.retrieve(priceId);
  const valid = priceMatchesOffer(interval, {
    active: price.active,
    currency: price.currency,
    unitAmount: price.unit_amount,
    type: price.type,
    recurringInterval: price.recurring?.interval,
    recurringIntervalCount: price.recurring?.interval_count,
  });
  if (!valid) {
    throw new Error(`The configured ${interval} Stripe Price does not match the published Erudoza offer.`);
  }
  return price.id;
}

async function claimCheckout(account: ServerAccount, requestedInterval: BillingInterval) {
  const path = `users/${account.uid}/billingCheckout/current`;
  const now = new Date();
  return runStoredDocumentTransaction<CheckoutClaim>([path], (documents) => {
    const existing = documents[path];
    const status = typeof existing?.status === "string" ? existing.status : "";
    const claimedAt = typeof existing?.claimedAt === "string" ? Date.parse(existing.claimedAt) : 0;
    const expiresAt = typeof existing?.expiresAt === "string" ? Date.parse(existing.expiresAt) : 0;
    const existingInterval = isBillingInterval(existing?.interval) ? existing.interval : requestedInterval;

    if (status === "open" && expiresAt > now.getTime() && typeof existing?.url === "string") {
      if (existingInterval === requestedInterval) {
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
          interval,
          previousSessionId: previousSessionId ?? null,
          claimedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      }],
      result: { action: "create" as const, path, claimId, interval, previousSessionId },
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

export async function createCheckoutSession(account: ServerAccount, interval: BillingInterval) {
  const stripe = stripeClient();
  const baseUrl = siteUrl();
  const claim = await claimCheckout(account, interval);
  if (claim.action === "reuse") return claim.url;
  if (claim.action === "busy") throw new BillingCheckoutInProgressError("A secure checkout is already being prepared. Try again in a moment.");

  try {
    if (claim.previousSessionId?.startsWith("cs_")) {
      await stripe.checkout.sessions.expire(claim.previousSessionId);
    }
    const [customer, price] = await Promise.all([
      stableStripeCustomer(stripe, account),
      validatedPrice(stripe, claim.interval),
    ]);
    const offer = offerForInterval(claim.interval);
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
            ? "Erudoza Pro renews automatically each year until canceled. Manage or cancel online from your account."
            : "Erudoza Pro renews automatically each month until canceled. Manage or cancel online from your account.",
        },
      },
      metadata: {
        erudoza_uid: account.uid,
        erudoza_plan: "pro",
        erudoza_interval: claim.interval,
        offer_version: PRO_OFFER_VERSION,
        offer_currency: PRO_OFFER.currency,
        offer_amount_minor: String(offer.amountMinor),
        automatic_renewal: "true",
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      },
      subscription_data: {
        metadata: {
          erudoza_uid: account.uid,
          erudoza_plan: "pro",
          erudoza_interval: claim.interval,
          offer_version: PRO_OFFER_VERSION,
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
        },
      },
      expires_at: Math.floor(Date.now() / 1_000) + (31 * 60),
    }, {
      idempotencyKey: `erudoza-checkout-v3-${claim.claimId}`,
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

function configuredProPriceIds() {
  const allowed = new Set([
    serverEnvironment.STRIPE_PRO_MONTHLY_PRICE_ID?.trim(),
    serverEnvironment.STRIPE_PRO_ANNUAL_PRICE_ID?.trim(),
    ...(serverEnvironment.STRIPE_PRO_LEGACY_PRICE_IDS ?? "").split(",").map((value) => value.trim()),
  ].filter((value): value is string => Boolean(value)));
  if (!allowed.size) throw new Error("No supported Erudoza Pro Stripe Prices are configured.");
  return allowed;
}

function supportedProPrice(subscription: Stripe.Subscription) {
  const allowed = configuredProPriceIds();
  const supported = subscription.items.data.some((item) => allowed.has(item.price.id));
  if (!supported) {
    throw new Error(`Stripe subscription ${subscription.id} uses an unrecognized Price; access was left unchanged.`);
  }
  return true;
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
  const uid = subscription.metadata.erudoza_uid || fallbackUid;
  if (!uid) return false;

  const status = subscriptionStatus(subscription.status);
  const proEligible = supportedProPrice(subscription) && (status === "active" || status === "trialing");
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
          subscriptionStatus: proEligible ? status : status === "past_due" ? "past_due" : "canceled",
          currentPeriodEnd,
          billingPriceId: subscription.items.data[0]?.price.id ?? null,
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
  const uid = session.metadata?.erudoza_uid || session.client_reference_id;
  const interval = session.metadata?.erudoza_interval;
  if (!uid || !isBillingInterval(interval)) throw new Error("Checkout consent is missing account or interval metadata.");
  if (session.consent?.terms_of_service !== "accepted") {
    throw new Error("Stripe Checkout did not record required Terms acceptance.");
  }
  if (session.currency?.toLowerCase() !== PRO_OFFER.currency || typeof session.amount_total !== "number") {
    throw new Error("Stripe Checkout did not return a complete USD amount snapshot.");
  }
  supportedProPrice(subscription);
  const price = subscription.items.data[0]?.price;
  const offer = offerForInterval(interval);
  if (!price || price.unit_amount !== offer.amountMinor) {
    throw new Error("The completed subscription does not match the accepted Erudoza offer.");
  }

  const path = `users/${uid}/billingConsents/${session.id}`;
  const snapshot = {
    uid,
    checkoutSessionId: session.id,
    subscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id,
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
