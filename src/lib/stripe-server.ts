import "server-only";

import Stripe from "stripe";
import { getStoredDocument, putStoredDocument } from "@/lib/firebase-server";
import type { ServerAccount } from "@/lib/account-server";

type BillingInterval = "monthly" | "annual";

function requiredStripeSecret() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Stripe is not configured.");
  return secret;
}

export function stripeClient() {
  return new Stripe(requiredStripeSecret());
}

export function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL is required for billing.");
  return value.replace(/\/$/, "");
}

export function priceForInterval(interval: BillingInterval) {
  const value = interval === "annual"
    ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID?.trim()
    : process.env.STRIPE_PRO_MONTHLY_PRICE_ID?.trim();
  if (!value) throw new Error(`${interval === "annual" ? "Annual" : "Monthly"} Pro billing is not configured.`);
  return value;
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export async function createCheckoutSession(account: ServerAccount, interval: BillingInterval) {
  const stripe = stripeClient();
  const baseUrl = siteUrl();
  const customer = account.billingCustomerId?.startsWith("cus_") ? account.billingCustomerId : undefined;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceForInterval(interval), quantity: 1 }],
    success_url: `${baseUrl}/pricing?checkout=success`,
    cancel_url: `${baseUrl}/pricing?checkout=canceled`,
    client_reference_id: account.uid,
    customer,
    customer_email: customer ? undefined : account.email,
    allow_promotion_codes: true,
    metadata: { erudoza_uid: account.uid, erudoza_plan: "pro" },
    subscription_data: { metadata: { erudoza_uid: account.uid, erudoza_plan: "pro" } },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
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

function supportedProPrice(subscription: Stripe.Subscription) {
  const allowed = new Set([
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID?.trim(),
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID?.trim(),
  ].filter((value): value is string => Boolean(value)));
  return subscription.items.data.some((item) => allowed.has(item.price.id));
}

function subscriptionStatus(status: Stripe.Subscription.Status): ServerAccount["subscriptionStatus"] {
  if (status === "trialing" || status === "active" || status === "past_due" || status === "canceled") return status;
  return "none";
}

export async function syncStripeSubscription(subscription: Stripe.Subscription, fallbackUid?: string) {
  const uid = subscription.metadata.erudoza_uid || fallbackUid;
  if (!uid) return false;

  const current = await getStoredDocument(`users/${uid}`);
  if (!current) return false;
  const status = subscriptionStatus(subscription.status);
  const proEligible = supportedProPrice(subscription) && (status === "active" || status === "trialing");
  const periodEnd = subscription.items.data.reduce(
    (latest, item) => Math.max(latest, item.current_period_end),
    0,
  );
  const currentPeriodEnd = periodEnd > 0 ? new Date(periodEnd * 1_000).toISOString() : null;
  await putStoredDocument(`users/${uid}`, {
    ...current,
    billingCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    billingSubscriptionId: subscription.id,
    subscriptionStatus: proEligible ? status : status === "past_due" ? "past_due" : "canceled",
    currentPeriodEnd,
    billingPriceId: subscription.items.data[0]?.price.id ?? null,
    updatedAt: new Date().toISOString(),
  });
  return true;
}
