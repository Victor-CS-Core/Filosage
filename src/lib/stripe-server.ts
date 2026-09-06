import "server-only";

import Stripe from "stripe";
import { AccountLifecycleError, captureAccountGeneration, currentAccountGeneration, runWithAccountGeneration, runWithBillingContainment, type AccountGeneration } from "@/lib/account-lifecycle";
import { getStoredDocument, runStoredDocumentTransaction } from "@/lib/document-store";
import type { ServerAccount } from "@/lib/account-server";
import {
  priceMatchesOffer,
  membershipPriceMappings,
  type BillingInterval,
  type PaidLearnerPlan,
} from "@/lib/billing-offer";
import {
  CHECKOUT_ELIGIBILITY_VERSION,
  chargeLifecyclePaymentState,
  checkoutFulfillmentIsPaid,
  checkoutConsentMetadataIsCurrent,
  checkoutEligibilityAttestation,
  accountDeletionBlocksCheckout,
  durableBillingConsentMatches,
  entitlementSubscriptionStatus,
  resolvedBillingPaymentState,
  stripeCustomerBindingMatches,
  subscriptionBlocksCheckout,
  type BillingPaymentState,
  type CheckoutEligibilityAttestation,
} from "@/lib/billing-lock";
import {
  isBillingInterval,
  isPaidLearnerPlan,
  offerFor,
  paidPlanFor,
} from "@/lib/membership-plans";
import { PAID_SUBSCRIPTION_POLICY, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { serverEnvironment } from "@/lib/runtime-environment";
import { reconcileCourseCreditLedger } from "@/lib/course-credit-policy";
import {
  billingPortalSessionParameters,
  stripeSubscriptionCustomerMatches,
  type BillingPortalAction,
} from "@/lib/billing-portal";

const CHECKOUT_CLAIM_STALE_MS = 2 * 60_000;
const RECONCILIATION_LEASE_MS = 60_000;
export const BILLING_MANAGEMENT_POLICY = "hosted-management-2026-08-25-v1";

export class BillingCheckoutInProgressError extends Error {}
export class BillingConsentRequiredError extends Error {}
export class BillingAccountDeletionInProgressError extends Error {}

type CheckoutClaim =
  | { action: "reuse"; url: string }
  | { action: "busy" }
  | { action: "blocked" }
  | {
    action: "create";
    path: string;
    claimId: string;
    planId: PaidLearnerPlan;
    interval: BillingInterval;
    eligibility: CheckoutEligibilityAttestation;
    previousSessionId?: string;
    resumed: boolean;
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

function requiredStripePortalConfigurationId() {
  const value = serverEnvironment.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (!value || !/^bpc_[A-Za-z0-9]{8,}$/.test(value)) {
    throw new Error("Stripe billing management is not configured.");
  }
  return value;
}

export function priceForPlanInterval(planId: PaidLearnerPlan, interval: BillingInterval) {
  const prefix = planId === "plus" ? "STRIPE_PLUS" : "STRIPE_PRO";
  const key = `${prefix}_${interval === "annual" ? "ANNUAL" : "MONTHLY"}_PRICE_ID`;
  const value = serverEnvironment[key]?.trim();
  if (!value) throw new Error(`${interval === "annual" ? "Annual" : "Monthly"} ${paidPlanFor(planId).name} billing is not configured.`);
  return value;
}

async function stableStripeCustomer(stripe: Stripe, account: ServerAccount) {
  if (account.billingCustomerId?.startsWith("cus_")) {
    const existing = await stripe.customers.retrieve(account.billingCustomerId);
    if (!stripeCustomerBindingMatches(existing, account.uid)) {
      throw new Error("The stored Stripe customer is not bound to this Filosage account.");
    }
    return existing.id;
  }

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

async function assertCustomerHasNoNonterminalSubscription(stripe: Stripe, customerId: string) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  if (subscriptions.has_more) {
    throw new BillingCheckoutInProgressError(
      "This Stripe customer has too many subscriptions to verify automatically. Contact billing support before starting another checkout.",
    );
  }
  if (subscriptions.data.some((subscription) => subscriptionBlocksCheckout(subscription.status))) {
    throw new BillingCheckoutInProgressError(
      "A Stripe subscription already exists for this account. Use Manage billing or try again after Stripe finishes updating your account.",
    );
  }
}

async function claimCheckout(
  account: ServerAccount,
  requestedPlanId: PaidLearnerPlan,
  requestedInterval: BillingInterval,
  eligibility: CheckoutEligibilityAttestation,
) {
  const path = `users/${account.uid}/billingCheckout/current`;
  const accountPath = `users/${account.uid}`;
  const now = new Date();
  return runStoredDocumentTransaction<CheckoutClaim>([accountPath, path], (documents) => {
    const billingAccount = documents[accountPath];
    if (accountDeletionBlocksCheckout(billingAccount)) {
      return { writes: [], result: { action: "blocked" as const } };
    }
    const existing = documents[path];
    const status = typeof existing?.status === "string" ? existing.status : "";
    const claimedAt = typeof existing?.claimedAt === "string" ? Date.parse(existing.claimedAt) : 0;
    const expiresAt = typeof existing?.expiresAt === "string" ? Date.parse(existing.expiresAt) : 0;
    const existingInterval = isBillingInterval(existing?.interval) ? existing.interval : requestedInterval;
    const existingPlanId = isPaidLearnerPlan(existing?.planId) ? existing.planId : requestedPlanId;
    const existingEligibility = checkoutEligibilityAttestation(existing?.eligibility);

    if (status === "open" && expiresAt > now.getTime() && typeof existing?.url === "string") {
      if (existingInterval === requestedInterval
        && existingPlanId === requestedPlanId
        && existingEligibility) {
        return { writes: [], result: { action: "reuse" as const, url: existing.url } };
      }
    }

    if ((status === "creating" || status === "replacing")
      && now.getTime() - claimedAt <= CHECKOUT_CLAIM_STALE_MS) {
      return { writes: [], result: { action: "busy" as const } };
    }

    const resumingStaleClaim = (status === "creating" || status === "replacing")
      && typeof existing?.claimId === "string"
      && Boolean(existingEligibility);
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
          accountGeneration: currentAccountGeneration()!.generation,
          planId,
          interval,
          eligibility: resumingStaleClaim ? existingEligibility : eligibility,
          previousSessionId: previousSessionId ?? null,
          claimedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      }],
      result: {
        action: "create" as const,
        path,
        claimId,
        planId,
        interval,
        eligibility: resumingStaleClaim ? existingEligibility! : eligibility,
        previousSessionId,
        resumed: resumingStaleClaim,
      },
    };
  });
}

async function assertAccountCheckoutAllowed(uid: string) {
  const accountPath = `users/${uid}`;
  return runStoredDocumentTransaction([accountPath], (documents) => {
    const account = documents[accountPath];
    if (accountDeletionBlocksCheckout(account)) {
      throw new BillingAccountDeletionInProgressError("Account deletion is in progress; checkout is unavailable.");
    }
    return { writes: [], result: true };
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

async function recordContainedCheckoutClaim(
  generation: AccountGeneration,
  claim: Extract<CheckoutClaim, { action: "create" }>,
  outcome: { kind: "contained"; sessionId: string } | { kind: "not_created" },
  customerId?: string,
) {
  const lifecyclePath = `accountLifecycles/${generation.uid}`;
  const lifecycle = await getStoredDocument(lifecyclePath);
  if (lifecycle?.generation !== generation.generation
    || !["deleting", "deleted"].includes(String(lifecycle.state))
    || typeof lifecycle.jobId !== "string") return;
  const jobId = lifecycle.jobId;
  const jobPath = `accountDeletionJobs/${jobId}`;
  await runWithBillingContainment({ ...generation, jobId }, () =>
    runStoredDocumentTransaction([lifecyclePath, jobPath, claim.path], (documents) => {
      const current = documents[lifecyclePath];
      const job = documents[jobPath];
      const existing = documents[claim.path];
      if (current?.generation !== generation.generation || current.jobId !== jobId
        || !["deleting", "deleted"].includes(String(current.state))
        || job?.uid !== generation.uid || job.generation !== generation.generation
        || job.jobId !== jobId || job.billingCustomerId !== customerId) throw new AccountLifecycleError();
      if (!existing || existing.claimId !== claim.claimId
        || existing.accountGeneration !== generation.generation
        || !["creating", "replacing"].includes(String(existing.status))) return { writes: [], result: undefined };
      const now = new Date().toISOString();
      return { writes: [{ path: claim.path, data: {
        ...existing, status: "canceled", sessionId: outcome.kind === "contained" ? outcome.sessionId : null,
        containmentOutcome: outcome.kind,
        containmentJobId: jobId, containmentConfirmedAt: now, updatedAt: now,
      } }], result: undefined };
    }));
}

function assertBillingGeneration(lifecycle: Record<string, unknown> | null, uid: string) {
  const captured = currentAccountGeneration();
  if (!captured || captured.uid !== uid || lifecycle?.state !== "active" || lifecycle.generation !== captured.generation) {
    throw new AccountLifecycleError();
  }
}

async function withBillingAccountGeneration<T>(uid: string, work: () => Promise<T>) {
  const captured = currentAccountGeneration();
  if (captured) {
    if (captured.uid !== uid) throw new AccountLifecycleError();
    return work();
  }
  const lifecycle = await captureAccountGeneration(uid);
  if (lifecycle.state !== "active") throw new AccountLifecycleError();
  return runWithAccountGeneration(lifecycle, work);
}

export async function createCheckoutSession(
  account: ServerAccount,
  planId: PaidLearnerPlan,
  interval: BillingInterval,
  eligibility: CheckoutEligibilityAttestation,
) {
  return withBillingAccountGeneration(account.uid, () => createCheckoutSessionInGeneration(account, planId, interval, eligibility));
}

async function createCheckoutSessionInGeneration(
  account: ServerAccount,
  planId: PaidLearnerPlan,
  interval: BillingInterval,
  eligibility: CheckoutEligibilityAttestation,
) {
  const stripe = stripeClient();
  const generation = currentAccountGeneration()!;
  const baseUrl = siteUrl();
  const automaticTaxEnabled = serverEnvironment.STRIPE_TAX_READY?.trim() === "true";
  if (!automaticTaxEnabled) throw new Error("Stripe Tax readiness has not been verified.");
  const claim = await claimCheckout(account, planId, interval, eligibility);
  if (claim.action === "reuse") return claim.url;
  if (claim.action === "busy") throw new BillingCheckoutInProgressError("A secure checkout is already being prepared. Try again in a moment.");
  if (claim.action === "blocked") throw new BillingAccountDeletionInProgressError("Account deletion is in progress; checkout is unavailable.");

  // A resumed claim can represent a prior POST whose response was lost.
  let creationMayExist = claim.resumed;
  let containmentConfirmed = false;
  let customer = account.billingCustomerId;
  try {
    customer = await stableStripeCustomer(stripe, account);
    await assertCustomerHasNoNonterminalSubscription(stripe, customer);
    if (claim.previousSessionId?.startsWith("cs_")) {
      try {
        await stripe.checkout.sessions.expire(claim.previousSessionId);
      } catch (error) {
        const previous = await stripe.checkout.sessions.retrieve(claim.previousSessionId).catch(() => null);
        if (previous?.status === "complete" || previous?.subscription) {
          throw new BillingCheckoutInProgressError(
            "Your earlier checkout completed and Stripe is updating your account. Use Manage billing or try again in a moment.",
          );
        }
        throw error;
      }
    }
    const price = await validatedPrice(stripe, claim.planId, claim.interval);
    await assertAccountCheckoutAllowed(account.uid);
    const plan = paidPlanFor(claim.planId);
    const offer = offerFor(claim.planId, claim.interval);
    creationMayExist = true;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      integration_identifier: "filosage_checkout_qmvtzkrp",
      line_items: [{ price, quantity: 1 }],
      success_url: `${baseUrl}/pricing?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=canceled`,
      client_reference_id: account.uid,
      customer,
      allow_promotion_codes: true,
      automatic_tax: { enabled: automaticTaxEnabled },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        submit: {
          message: `${plan.name} is available only to ${PAID_SUBSCRIPTION_POLICY.launchMarketLabel} residents age ${PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge} or older and renews automatically ${claim.interval === "annual" ? "each year" : "each month"} until canceled. Cancel online from your account. Initial charges and annual renewals may be refunded when requested within ${PAID_SUBSCRIPTION_POLICY.refundWindowDays} days; other charges are non-refundable except as stated in the Terms or required by law.`,
        },
      },
      metadata: {
        filosage_uid: account.uid,
        filosage_account_generation: currentAccountGeneration()!.generation,
        filosage_plan: claim.planId,
        filosage_interval: claim.interval,
        offer_version: plan.offerVersion,
        offer_currency: plan.currency,
        offer_amount_minor: String(offer.amountMinor),
        automatic_renewal: "true",
        eligibility_version: claim.eligibility.version,
        age_18_or_older: String(claim.eligibility.age18OrOlder),
        us_resident: String(claim.eligibility.usResident),
        automatic_renewal_acknowledged: String(claim.eligibility.automaticRenewalAccepted),
        purchaser_minimum_age: String(PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge),
        launch_market: PAID_SUBSCRIPTION_POLICY.launchMarketCode,
        refund_window_days: String(PAID_SUBSCRIPTION_POLICY.refundWindowDays),
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      },
      subscription_data: {
        metadata: {
          filosage_uid: account.uid,
          filosage_account_generation: currentAccountGeneration()!.generation,
          filosage_plan: claim.planId,
          filosage_interval: claim.interval,
          offer_version: plan.offerVersion,
          eligibility_version: claim.eligibility.version,
          age_18_or_older: String(claim.eligibility.age18OrOlder),
          us_resident: String(claim.eligibility.usResident),
          automatic_renewal_acknowledged: String(claim.eligibility.automaticRenewalAccepted),
          purchaser_minimum_age: String(PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge),
          launch_market: PAID_SUBSCRIPTION_POLICY.launchMarketCode,
          refund_window_days: String(PAID_SUBSCRIPTION_POLICY.refundWindowDays),
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
        },
      },
      expires_at: Math.floor(Date.now() / 1_000) + (31 * 60),
    }, {
      idempotencyKey: `filosage-checkout-v4-${claim.claimId}`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");

    const accountPath = `users/${account.uid}`;
    const opened = await runStoredDocumentTransaction([accountPath, claim.path], (documents) => {
      const currentAccount = documents[accountPath];
      const existing = documents[claim.path];
      if (accountDeletionBlocksCheckout(currentAccount)
        || existing?.claimId !== claim.claimId) return { writes: [], result: false };
      return {
        writes: [{
          path: claim.path,
          data: {
            status: "open",
            claimId: claim.claimId,
            planId: claim.planId,
            interval: claim.interval,
            eligibility: claim.eligibility,
            sessionId: session.id,
            url: session.url,
            expiresAt: new Date(session.expires_at * 1_000).toISOString(),
            createdAt: new Date(session.created * 1_000).toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }],
        result: true,
      };
    }).catch((error) => {
      // A generation fence may reject the open receipt after Stripe creates the
      // session. Contain that known session before leaving this request.
      if (error instanceof AccountLifecycleError) return false;
      throw error;
    });
    if (!opened) {
      try {
        const expired = await stripe.checkout.sessions.expire(session.id);
        if (expired.id !== session.id || expired.status !== "expired") throw new Error("Stripe did not confirm Checkout expiration.");
      } catch (expirationError) {
        const currentSession = await stripe.checkout.sessions.retrieve(session.id);
        const sessionCustomerId = typeof currentSession.customer === "string"
          ? currentSession.customer : currentSession.customer?.id;
        if (currentSession.id !== session.id || sessionCustomerId !== customer
          || (currentSession.metadata?.filosage_uid || currentSession.client_reference_id) !== account.uid) {
          throw new Error("The Checkout containment confirmation does not match this account and customer.", { cause: expirationError });
        }
        const currentSubscriptionId = typeof currentSession.subscription === "string"
          ? currentSession.subscription
          : currentSession.subscription?.id;
        if (currentSubscriptionId) {
          await cancelAndConfirmStripeSubscription(stripe, currentSubscriptionId, account.uid, customer);
        } else if (currentSession.status !== "expired") {
          throw new Error("A checkout session could not be contained after account deletion started.", {
            cause: expirationError,
          });
        }
      }
      containmentConfirmed = true;
      await recordContainedCheckoutClaim(generation, claim, { kind: "contained", sessionId: session.id }, customer);
      throw new Error("A newer checkout attempt replaced this session.");
    }
    return session.url;
  } catch (error) {
    // A transport error can follow a committed Stripe creation. Preserve the
    // claim/idempotency key until its remote outcome is known.
    if (!creationMayExist) await recordContainedCheckoutClaim(generation, claim, { kind: "not_created" }, customer);
    if (!creationMayExist || containmentConfirmed) await markCheckoutClaimFailed(claim.path, claim.claimId).catch(() => undefined);
    throw error;
  }
}

export async function createBillingPortalSession(
  account: ServerAccount,
  action: BillingPortalAction,
) {
  if (!account.billingCustomerId?.startsWith("cus_")) {
    throw new Error("No Stripe customer is available for this account yet.");
  }
  const stripe = stripeClient();
  const customer = await stripe.customers.retrieve(account.billingCustomerId);
  if (!stripeCustomerBindingMatches(customer, account.uid)) {
    throw new Error("The stored Stripe customer is not bound to this Filosage account.");
  }
  const recoveryOnly = account.accountStatus === "suspended"
    || account.acceptedTermsVersion !== TERMS_VERSION
    || account.acceptedPrivacyVersion !== PRIVACY_VERSION
    || (account.subscriptionStatus !== "active" && account.subscriptionStatus !== "trialing");
  if (action === "change_plan" && recoveryOnly) {
    throw new Error("Plan changes require current Terms acceptance and an active, paid account.");
  }
  let subscriptionId: string | undefined;
  if (action !== "manage") {
    if (!account.billingSubscriptionId?.startsWith("sub_")) {
      throw new Error("No Stripe subscription is available for this billing action.");
    }
    const subscription = await stripe.subscriptions.retrieve(account.billingSubscriptionId);
    if (subscription.metadata.filosage_uid !== account.uid
      || !stripeSubscriptionCustomerMatches(subscription.customer, account.billingCustomerId)) {
      throw new Error("The stored Stripe subscription is not bound to this Filosage account.");
    }
    if (!subscriptionBlocksCheckout(subscription.status)) {
      throw new Error("The stored Stripe subscription is no longer manageable.");
    }
    if (action === "change_plan" && subscription.status !== "active" && subscription.status !== "trialing") {
      throw new Error("Recover your payment before changing plans.");
    }
    const resolved = resolvedSubscriptionOffer(subscription);
    if (resolved.priceId !== priceForPlanInterval(resolved.planId, resolved.billingInterval)) {
      throw new Error("This subscription uses a legacy Price and must be handled by billing support.");
    }
    subscriptionId = subscription.id;
  }
  const returnUrl = `${siteUrl()}/pricing`;
  const session = await stripe.billingPortal.sessions.create(billingPortalSessionParameters({
    action,
    customerId: account.billingCustomerId,
    configurationId: requiredStripePortalConfigurationId(),
    returnUrl,
    subscriptionId,
    recoveryOnly,
  }));
  return session.url;
}

function isMissingStripeResource(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError
    && error.code === "resource_missing";
}

async function cancelAndConfirmStripeSubscription(
  stripe: Stripe,
  subscriptionId: string,
  uid: string,
  customerId?: string,
) {
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (isMissingStripeResource(error)) return "missing" as const;
    throw error;
  }
  const subscriptionCustomerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  if (subscription.metadata.filosage_uid !== uid
    || (customerId && subscriptionCustomerId !== customerId)) {
    throw new Error(`Stripe subscription ${subscription.id} is not bound to the deleting Filosage account.`);
  }
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
    return subscription.status;
  }

  try {
    const canceled = await stripe.subscriptions.cancel(subscriptionId);
    if (canceled.status !== "canceled") {
      throw new Error(`Stripe returned subscription state ${canceled.status} after cancellation.`);
    }
    return canceled.status;
  } catch (error) {
    // A timeout can happen after Stripe commits the cancellation. Confirm the
    // remote state rather than trusting error-message text or local cache.
    let confirmed: Stripe.Subscription;
    try {
      confirmed = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (confirmationError) {
      if (isMissingStripeResource(confirmationError)) return "missing" as const;
      throw new Error("Stripe cancellation failed and its remote state could not be confirmed.", {
        cause: confirmationError,
      });
    }
    const confirmedCustomerId = typeof confirmed.customer === "string"
      ? confirmed.customer
      : confirmed.customer.id;
    if (confirmed.metadata.filosage_uid !== uid
      || (customerId && confirmedCustomerId !== customerId)) {
      throw new Error(`Stripe subscription ${confirmed.id} is not bound to the deleting Filosage account.`, {
        cause: error,
      });
    }
    if (confirmed.status === "canceled" || confirmed.status === "incomplete_expired") {
      return confirmed.status;
    }
    throw error;
  }
}

export async function cancelStripeBillingForAccountDeletion(input: {
  uid: string;
  customerId?: string;
  subscriptionId?: string;
  jobId?: string;
}) {
  const stripe = stripeClient();
  const subscriptionIds = new Set<string>();
  if (input.customerId?.startsWith("cus_")) {
    const customer = await stripe.customers.retrieve(input.customerId);
    if (!stripeCustomerBindingMatches(customer, input.uid)) {
      throw new Error("The Stripe customer is not bound to the deleting Filosage account.");
    }
    const openSessions = await stripe.checkout.sessions.list({
      customer: customer.id,
      status: "open",
      limit: 100,
    });
    if (openSessions.has_more) {
      throw new Error("The Stripe customer has too many open Checkout Sessions to verify before account deletion.");
    }
    for (const session of openSessions.data) {
      const sessionCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const sessionUid = session.metadata?.filosage_uid || session.client_reference_id;
      if (session.mode !== "subscription" || sessionCustomerId !== customer.id || sessionUid !== input.uid) {
        throw new Error(`Stripe Checkout Session ${session.id} is not bound to the deleting Filosage account.`);
      }
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expirationError) {
        const current = await stripe.checkout.sessions.retrieve(session.id);
        const completedSubscriptionId = typeof current.subscription === "string"
          ? current.subscription
          : current.subscription?.id;
        if (completedSubscriptionId) subscriptionIds.add(completedSubscriptionId);
        else if (current.status !== "expired") {
          throw new Error(`Stripe Checkout Session ${session.id} could not be expired before account deletion.`, {
            cause: expirationError,
          });
        }
      }
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
    });
    if (subscriptions.has_more) {
      throw new Error("The Stripe customer has too many subscriptions to verify before account deletion.");
    }
    for (const subscription of subscriptions.data) subscriptionIds.add(subscription.id);
  }
  if (input.subscriptionId?.startsWith("sub_")) subscriptionIds.add(input.subscriptionId);

  for (const subscriptionId of subscriptionIds) {
    await cancelAndConfirmStripeSubscription(stripe, subscriptionId, input.uid, input.customerId);
  }
  if (input.customerId?.startsWith("cus_")) {
    // A cancellation response alone cannot settle an uncertain Checkout race.
    const subscriptions = await stripe.subscriptions.list({ customer: input.customerId, status: "all", limit: 100 });
    const sessions = await stripe.checkout.sessions.list({ customer: input.customerId, status: "open", limit: 100 });
    if (subscriptions.has_more || sessions.has_more || sessions.data.length
      || subscriptions.data.some((subscription) => subscription.metadata.filosage_uid !== input.uid
        || !stripeSubscriptionCustomerMatches(subscription.customer, input.customerId!)
        || subscriptionBlocksCheckout(subscription.status))) {
      throw new Error("Stripe billing containment is not confirmed; retain the deletion job and retry.");
    }
  }
  return { confirmed: true as const, ...(input.jobId ? { jobId: input.jobId } : {}) };
}

/** Late signed events can contain provider billing after user data is erased. */
export async function containStripeSubscriptionForDeletedAccount(subscription: Stripe.Subscription) {
  const uid = subscription.metadata.filosage_uid;
  if (!uid) return false;
  const lifecycle = await getStoredDocument(`accountLifecycles/${uid}`);
  if (!lifecycle || (lifecycle.state !== "deleting" && lifecycle.state !== "deleted")) return false;
  if (typeof lifecycle.jobId !== "string") throw new Error("The deleting account has no durable deletion job.");
  const job = await getStoredDocument(`accountDeletionJobs/${lifecycle.jobId}`);
  if (!job || job.uid !== uid || job.generation !== lifecycle.generation || job.jobId !== lifecycle.jobId) {
    throw new Error("The deletion job does not match the account lifecycle.");
  }
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (typeof job.billingCustomerId === "string" && job.billingCustomerId !== customerId) {
    throw new Error("A late billing event cannot rebind the deleting account's customer.");
  }
  await cancelStripeBillingForAccountDeletion({ uid, customerId, subscriptionId: subscription.id, jobId: lifecycle.jobId });
  return true;
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
  if (matches.length !== 1 || subscription.items.has_more || subscription.items.data.length !== 1
    || matches[0].item.quantity !== 1) {
    throw new Error(`Stripe subscription ${subscription.id} must resolve to exactly one recognized membership Price; access was left unchanged.`);
  }
  const resolved = matches[0];
  if (!resolved.mapping.legacy && !priceMatchesOffer(resolved.mapping.planId, resolved.mapping.interval, {
    active: resolved.item.price.active,
    currency: resolved.item.price.currency,
    unitAmount: resolved.item.price.unit_amount,
    type: resolved.item.price.type,
    recurringInterval: resolved.item.price.recurring?.interval,
    recurringIntervalCount: resolved.item.price.recurring?.interval_count,
  })) throw new Error("The subscription Price does not match the configured offer.");
  return resolved;
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

export interface BillingPaymentSnapshot {
  state: BillingPaymentState;
  invoiceId: string;
  attemptCount: number;
  paidAt?: number;
  chargeId?: string;
  disputeId?: string;
}

export async function syncStripeSubscription(
  observedSubscription: Stripe.Subscription,
  context: {
    event: Pick<Stripe.Event, "id" | "created" | "type">;
    fallbackUid?: string;
    payment?: BillingPaymentSnapshot;
  },
) {
  const uid = observedSubscription.metadata.filosage_uid || context.fallbackUid;
  if (!uid) return false;
  if (await containStripeSubscriptionForDeletedAccount(observedSubscription)) return true;
  return withBillingAccountGeneration(uid, () => syncStripeSubscriptionInGeneration(observedSubscription, context));
}

async function syncStripeSubscriptionInGeneration(
  observedSubscription: Stripe.Subscription,
  context: { event: Pick<Stripe.Event, "id" | "created" | "type">; fallbackUid?: string; payment?: BillingPaymentSnapshot },
) {
  const uid = observedSubscription.metadata.filosage_uid || context.fallbackUid;
  if (!uid) return false;
  const path = `users/${uid}`;
  const leasePath = `users/${uid}/billingReconciliation/current`;
  const lifecyclePath = `accountLifecycles/${uid}`;
  const token = crypto.randomUUID();
  const lease = await runStoredDocumentTransaction([path, leasePath, lifecyclePath], (documents) => {
    assertBillingGeneration(documents[lifecyclePath], uid);
    const account = documents[path];
    if (!account || account.accountDeletionInProgress === true) return { writes: [], result: false };
    const existing = documents[leasePath];
    if (typeof existing?.expiresAt === "number" && existing.expiresAt > Date.now()) {
      throw new Error("Subscription reconciliation is already running; retry this event.");
    }
    return { writes: [{ path: leasePath, data: { token, expiresAt: Date.now() + RECONCILIATION_LEASE_MS } }], result: true };
  });
  if (!lease) return false;
  try {
    // Fetch under the durable lease. Event timestamps are delivery hints, not
    // versions of provider state; Stripe timestamps have only second precision.
    const stripe = stripeClient();
    const subscription = await stripe.subscriptions.retrieve(observedSubscription.id);
    if (subscription.metadata.filosage_uid !== uid) throw new Error("Subscription ownership changed during reconciliation.");
    if (subscription.metadata.filosage_account_generation
      && subscription.metadata.filosage_account_generation !== currentAccountGeneration()?.generation) throw new AccountLifecycleError();
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const customer = await stripe.customers.retrieve(customerId);
    if (!stripeCustomerBindingMatches(customer, uid)) throw new Error("Subscription customer is not bound to this account.");
    const resolved = resolvedSubscriptionOffer(subscription);
    const invoiceId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id;
    const invoice = invoiceId ? await stripe.invoices.retrieve(invoiceId) : null;
    if (invoice && (stripeInvoiceSubscriptionId(invoice) !== subscription.id
      || (typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id) !== customerId)) {
      throw new Error("The current invoice does not belong to this subscription and customer.");
    }
    // Ordinary invoice hints were read before this lease and may already be
    // stale. Derive their state solely from the invoice fetched above. Only
    // charge/dispute evidence reverified under this lease can override it.
    let override: BillingPaymentState | undefined;
    let verifiedSameInvoiceRecovery = false;
    if (invoice && context.payment?.invoiceId === invoice.id && (context.payment.chargeId || context.payment.disputeId)) {
      const dispute = context.payment.disputeId ? await stripe.disputes.retrieve(context.payment.disputeId) : undefined;
      const chargeId = dispute
        ? typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id
        : context.payment.chargeId!;
      const charge = await stripe.charges.retrieve(chargeId);
      const recovered = dispute && ["won", "prevented", "warning_closed"].includes(dispute.status);
      override = chargeLifecyclePaymentState(dispute ? recovered ? "paid" : "disputed" : "refund", {
        amount: charge.amount, amountRefunded: charge.amount_refunded, refunded: charge.refunded,
      });
      // A dispute event for an older invoice can refresh this subscription too.
      // Its event type alone cannot release a hold on the current invoice.
      verifiedSameInvoiceRecovery = Boolean(recovered && override === "paid");
    }
    const payment = invoice ? stripeInvoicePaymentSnapshot(invoice, override) : undefined;
    // A paid source invoice cannot purchase a changed target offer. This also
    // excludes unfinished async payments, unknown invoice lines and partial pages.
    const targetPaid = Boolean(invoice?.status === "paid" && !invoice.lines.has_more && invoice.lines.data.some((line) => {
      const price = line.pricing?.price_details?.price;
      const priceId = typeof price === "string" ? price : price?.id;
      const detail = line.parent?.subscription_item_details;
      return priceId === resolved.priceId && line.amount >= 0
        && detail?.subscription === subscription.id
        && line.period.end >= resolved.item.current_period_end;
    }));
    if (payment?.state === "paid" && !targetPaid) payment.state = "unknown";
    return await applyVerifiedStripeSubscription(subscription, { ...context, payment, targetPaid, verifiedSameInvoiceRecovery, leasePath, token });
  } finally {
    await runStoredDocumentTransaction([leasePath], (documents) => ({
      writes: documents[leasePath]?.token === token ? [{ path: leasePath, data: { token, expiresAt: 0 } }] : [],
      result: undefined,
    }));
  }
}

async function applyVerifiedStripeSubscription(
  subscription: Stripe.Subscription,
  context: {
    event: Pick<Stripe.Event, "id" | "created" | "type">;
    fallbackUid?: string;
    payment?: BillingPaymentSnapshot;
    targetPaid: boolean;
    verifiedSameInvoiceRecovery: boolean;
    leasePath: string;
    token: string;
  },
) {
  const uid = subscription.metadata.filosage_uid || context.fallbackUid;
  if (!uid) return false;
  const resolved = resolvedSubscriptionOffer(subscription);
  const periodEnd = subscription.items.data.reduce(
    (latest, item) => Math.max(latest, item.current_period_end),
    0,
  );
  const currentPeriodEnd = periodEnd > 0 ? new Date(periodEnd * 1_000).toISOString() : null;
  const path = `users/${uid}`;
  const courseCreditLedgerPath = `users/${uid}/courseCredits/current`;
  const subscriptionCustomerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;

  const transitionPath = `users/${uid}/billingTransitions/${context.event.id}`;
  const lifecyclePath = `accountLifecycles/${uid}`;
  return runStoredDocumentTransaction([path, courseCreditLedgerPath, context.leasePath, transitionPath, lifecyclePath], (documents) => {
    assertBillingGeneration(documents[lifecyclePath], uid);
    const current = documents[path];
    if (!current || current.accountDeletionInProgress === true) return { writes: [], result: false };
    const lease = documents[context.leasePath];
    if (lease?.token !== context.token || typeof lease.expiresAt !== "number" || lease.expiresAt <= Date.now()) {
      throw new Error("Subscription reconciliation lease expired; retry with current provider state.");
    }
    if (current.billingCustomerId && current.billingCustomerId !== subscriptionCustomerId) {
      throw new Error("The subscription cannot rebind this account to another customer.");
    }
    if (current.billingSubscriptionId && current.billingSubscriptionId !== subscription.id
      && subscriptionBlocksCheckout(String(current.billingRawStatus ?? current.subscriptionStatus ?? "none"))) {
      throw new Error("The event cannot replace an existing nonterminal subscription.");
    }

    const sameSubscription = current.billingSubscriptionId === subscription.id;
    const storedInvoiceId = sameSubscription && typeof current.billingInvoiceId === "string"
      ? current.billingInvoiceId
      : undefined;
    const sameInvoice = Boolean(context.payment?.invoiceId && storedInvoiceId === context.payment.invoiceId);
    const paymentState = resolvedBillingPaymentState(
      typeof current.billingPaymentState === "string" ? current.billingPaymentState : undefined,
      sameSubscription,
      context.payment?.state ?? "unknown",
      {
        sameInvoice,
        allowSameInvoiceRecovery: context.verifiedSameInvoiceRecovery,
      },
    );
    const subscriptionStatus = entitlementSubscriptionStatus(subscription.status, paymentState);
    const invoiceId = context.payment?.invoiceId
      ?? storedInvoiceId;
    const invoiceAttemptCount = context.payment?.attemptCount
      ?? (sameSubscription && typeof current.billingInvoiceAttemptCount === "number" ? current.billingInvoiceAttemptCount : undefined);
    const invoicePaidAt = context.payment?.paidAt
      ?? (sameInvoice && typeof current.billingInvoicePaidAt === "number" ? current.billingInvoicePaidAt : undefined);
    const originalConsent = durableBillingConsentMatches(current, subscription.id, subscriptionCustomerId);
    const originalOffer = durableBillingConsentMatches(current, subscription.id, subscriptionCustomerId, {
      priceId: resolved.priceId, planId: resolved.planId, interval: resolved.billingInterval,
    });
    const existingManagement = originalConsent && sameSubscription
      && current.billingCustomerId === subscriptionCustomerId
      && resolved.priceId === priceForPlanInterval(resolved.planId, resolved.billingInterval);
    if ((subscriptionStatus === "active" || subscriptionStatus === "trialing")
      && (!context.targetPaid || (!originalOffer && !existingManagement))) {
      throw new BillingConsentRequiredError("This subscription has no verified original consent or authorized existing-subscription transition.");
    }
    const transition = existingManagement
      && (current.billingAuthorizedPriceId ?? current.billingConsentPriceId) !== resolved.priceId
      && context.targetPaid && paymentState === "paid";
    // This records the approved management authorization for an existing
    // subscription. Stripe does not attest that a particular Portal session
    // caused the event, so the audit never invents session or purchase consent.
    const transitionWrite = transition && !documents[transitionPath] ? [{
      path: transitionPath,
      data: {
        uid, customerId: subscriptionCustomerId, subscriptionId: subscription.id,
        policyVersion: BILLING_MANAGEMENT_POLICY,
        authorizationBasis: "verified_existing_subscription_management",
        originalCheckoutSessionId: current.billingConsentCheckoutSessionId,
        fromPriceId: current.billingAuthorizedPriceId ?? current.billingConsentPriceId,
        toPriceId: resolved.priceId, toPlanId: resolved.planId, toInterval: resolved.billingInterval,
        invoiceId: invoiceId ?? null, invoicePaidAt: invoicePaidAt ?? null,
        eventId: context.event.id, eventCreated: context.event.created,
        verifiedAt: new Date().toISOString(),
      },
    }] : [];
    const now = new Date();
    const manualPlan = isPaidLearnerPlan(current.manualPlan) ? current.manualPlan : undefined;
    const manualPlanUntil = typeof current.manualPlanUntil === "string" ? current.manualPlanUntil : undefined;
    const manualPlanActive = manualPlanUntil === "permanent"
      || (Boolean(manualPlanUntil) && Date.parse(manualPlanUntil!) > now.getTime());
    const creditPlan = subscriptionStatus === "active" || subscriptionStatus === "trialing"
      ? resolved.planId
      : manualPlanActive && manualPlan
        ? manualPlan
        : "free";
    const courseCreditLedger = reconcileCourseCreditLedger(
      documents[courseCreditLedgerPath],
      {
        uid,
        plan: creditPlan,
        accountStatus: current.accountStatus === "suspended" ? "suspended" : "active",
      },
      now,
    );
    return {
      writes: [
        {
          path,
          data: {
            ...current,
            billingCustomerId: subscriptionCustomerId,
            billingSubscriptionId: subscription.id,
            billingRawStatus: subscription.status,
            billingCancelAtPeriodEnd: subscription.cancel_at_period_end,
            billingCanceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1_000).toISOString() : null,
            billingTrialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1_000).toISOString() : null,
            subscriptionStatus,
            billingPlan: resolved.planId,
            billingInterval: resolved.billingInterval,
            currentPeriodEnd,
            billingPriceId: resolved.priceId,
            billingPaymentState: paymentState,
            billingInvoiceId: invoiceId ?? null,
            billingInvoiceAttemptCount: invoiceAttemptCount ?? null,
            billingInvoicePaidAt: invoicePaidAt ?? null,
            billingAuthorizedPriceId: context.targetPaid && paymentState === "paid"
              ? resolved.priceId : current.billingAuthorizedPriceId ?? null,
            billingManagementPolicy: existingManagement ? BILLING_MANAGEMENT_POLICY : current.billingManagementPolicy ?? null,
            billingEventCreated: Math.max(context.event.created, typeof current.billingEventCreated === "number" ? current.billingEventCreated : 0),
            billingEventId: context.event.id,
            updatedAt: now.toISOString(),
          },
        },
        { path: courseCreditLedgerPath, data: courseCreditLedger },
        ...transitionWrite,
      ],
      result: true,
    };
  });
}

export function stripeInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

export function stripeInvoicePaymentSnapshot(
  invoice: Stripe.Invoice,
  override?: BillingPaymentState,
): BillingPaymentSnapshot {
  const paid = invoice.status === "paid";
  const state = override === "failed"
    ? paid ? "paid" : "failed"
    : override ?? (paid ? "paid" : "unknown");
  return {
    state,
    invoiceId: invoice.id,
    attemptCount: invoice.attempt_count,
    ...(invoice.status_transitions.paid_at ? { paidAt: invoice.status_transitions.paid_at } : {}),
  };
}

export async function verifyCheckoutFulfillment(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription,
) {
  const sessionSubscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;
  const sessionCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionCustomerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const sessionUid = session.metadata?.filosage_uid || session.client_reference_id;
  const subscriptionUid = subscription.metadata.filosage_uid;
  const latestInvoice = subscription.latest_invoice;
  const invoice = typeof latestInvoice === "string"
    ? await stripe.invoices.retrieve(latestInvoice)
    : latestInvoice;
  if (!checkoutFulfillmentIsPaid({
    mode: session.mode,
    checkoutStatus: session.status,
    paymentStatus: session.payment_status,
    invoicePaid: invoice?.status === "paid",
    invoiceStatus: invoice?.status,
  })
    || sessionSubscriptionId !== subscription.id
    || !sessionCustomerId
    || sessionCustomerId !== subscriptionCustomerId
    || !sessionUid
    || !subscriptionUid
    || sessionUid !== subscriptionUid) {
    throw new Error("Stripe Checkout has not completed a verified subscription payment.");
  }

  if (!invoice || stripeInvoiceSubscriptionId(invoice) !== subscription.id) {
    throw new Error("The subscription's initial Stripe invoice is not paid.");
  }
  const invoiceCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (invoiceCustomerId !== subscriptionCustomerId) {
    throw new Error("The paid Stripe invoice does not belong to the Checkout customer.");
  }
  return stripeInvoicePaymentSnapshot(invoice);
}

export async function hasRecordedBillingConsent(subscription: Stripe.Subscription) {
  const uid = subscription.metadata.filosage_uid;
  if (!uid) return false;
  const account = await getStoredDocument(`users/${uid}`);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  return Boolean(account && durableBillingConsentMatches(account, subscription.id, customerId));
}

export async function recordSubscriptionConsentFromCheckout(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  event: Pick<Stripe.Event, "id" | "created">,
) {
  const uid = subscription.metadata.filosage_uid;
  if (!uid) throw new Error("The subscription has no account identity for consent verification.");
  return withBillingAccountGeneration(uid, () => recordSubscriptionConsentFromCheckoutInGeneration(stripe, subscription, event));
}

async function recordSubscriptionConsentFromCheckoutInGeneration(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  event: Pick<Stripe.Event, "id" | "created">,
) {
  const sessions = await stripe.checkout.sessions.list({
    subscription: subscription.id,
    status: "complete",
    limit: 100,
  });
  if (sessions.has_more) {
    throw new Error(`Stripe subscription ${subscription.id} has too many Checkout Sessions to verify automatically.`);
  }
  const session = sessions.data.find((candidate) => {
    const candidateSubscriptionId = typeof candidate.subscription === "string"
      ? candidate.subscription
      : candidate.subscription?.id;
    return candidateSubscriptionId === subscription.id
      && candidate.consent?.terms_of_service === "accepted";
  });
  if (!session) throw new Error(`Stripe subscription ${subscription.id} has no completed Filosage Checkout Session.`);
  const payment = await verifyCheckoutFulfillment(stripe, session, subscription);
  const consentRecorded = await recordBillingConsent(session, subscription, event);
  return { consentRecorded, payment };
}

export async function recordBillingConsent(
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription,
  event: Pick<Stripe.Event, "id" | "created">,
) {
  const uid = session.metadata?.filosage_uid || session.client_reference_id;
  if (!uid) throw new Error("Checkout consent is missing its account identity.");
  return withBillingAccountGeneration(uid, () => recordBillingConsentInGeneration(session, subscription, event));
}

async function recordBillingConsentInGeneration(
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
  if ((session.metadata?.filosage_account_generation
    && session.metadata.filosage_account_generation !== currentAccountGeneration()?.generation)
    || (subscription.metadata.filosage_account_generation
      && subscription.metadata.filosage_account_generation !== currentAccountGeneration()?.generation)) throw new AccountLifecycleError();
  const subscriptionCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const customer = await stripeClient().customers.retrieve(subscriptionCustomerId);
  if (subscription.metadata.filosage_uid !== uid || !stripeCustomerBindingMatches(customer, uid)) {
    throw new Error("Checkout consent requires a verified account/customer/subscription binding.");
  }
  const plan = paidPlanFor(planId);
  const offer = offerFor(planId, interval);
  if (!checkoutConsentMetadataIsCurrent(session.metadata, {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    offerVersion: plan.offerVersion,
    currency: plan.currency,
    amountMinor: offer.amountMinor,
    minimumPurchaserAge: PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge,
    launchMarketCode: PAID_SUBSCRIPTION_POLICY.launchMarketCode,
    refundWindowDays: PAID_SUBSCRIPTION_POLICY.refundWindowDays,
  })) {
    throw new Error("Stripe Checkout consent references an outdated or incomplete Filosage offer.");
  }
  if (session.currency?.toLowerCase() !== plan.currency || typeof session.amount_total !== "number") {
    throw new Error("Stripe Checkout did not return a complete USD amount snapshot.");
  }
  const resolved = supportedSubscriptionPrice(subscription);
  const price = resolved.item.price;
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
    eligibilityVersion: CHECKOUT_ELIGIBILITY_VERSION,
    age18OrOlderConfirmed: true,
    usResidentConfirmed: true,
    automaticRenewalAcknowledged: true,
    onlineCancellationAvailable: true,
    purchaserMinimumAge: PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge,
    launchMarket: PAID_SUBSCRIPTION_POLICY.launchMarketCode,
    refundWindowDays: PAID_SUBSCRIPTION_POLICY.refundWindowDays,
    termsAccepted: true,
    termsVersion: session.metadata?.terms_version ?? null,
    privacyVersion: session.metadata?.privacy_version ?? null,
    offerVersion: session.metadata?.offer_version ?? null,
    stripeEventId: event.id,
    acceptedAt: new Date(event.created * 1_000).toISOString(),
  };

  const checkoutPath = `users/${uid}/billingCheckout/current`;
  const accountPath = `users/${uid}`;
  const lifecyclePath = `accountLifecycles/${uid}`;
  return runStoredDocumentTransaction([accountPath, path, checkoutPath, lifecyclePath], (documents) => {
    assertBillingGeneration(documents[lifecyclePath], uid);
    const account = documents[accountPath];
    if (!account) return { writes: [], result: null };
    if (account.accountDeletionInProgress === true) return { writes: [], result: null };
    if (account.billingCustomerId && account.billingCustomerId !== snapshot.stripeCustomerId) {
      throw new Error("Checkout consent cannot rebind an existing Stripe customer.");
    }
    if (durableBillingConsentMatches(account, subscription.id, snapshot.stripeCustomerId)
      && account.billingConsentCheckoutSessionId !== session.id) {
      throw new Error("Original Checkout consent for this subscription is immutable.");
    }
    const existing = documents[path];
    const currentCheckout = documents[checkoutPath];
    const accountWrite = {
      path: accountPath,
      data: {
        ...account,
        billingConsentSubscriptionId: subscription.id,
        billingConsentCustomerId: snapshot.stripeCustomerId,
        billingConsentPriceId: price.id,
        billingConsentPlanId: planId,
        billingConsentInterval: interval,
        billingConsentEligibilityVersion: snapshot.eligibilityVersion,
        billingConsentAge18OrOlderConfirmed: true,
        billingConsentUsResidentConfirmed: true,
        billingConsentAutomaticRenewalAcknowledged: true,
        billingConsentCheckoutSessionId: session.id,
        billingConsentRecordedAt: typeof existing?.acceptedAt === "string" ? existing.acceptedAt : snapshot.acceptedAt,
        updatedAt: new Date().toISOString(),
      },
    };
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
      return { writes: [accountWrite, ...checkoutWrite], result: false };
    }
    return { writes: [accountWrite, { path, data: snapshot }, ...checkoutWrite], result: true };
  });
}
