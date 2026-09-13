"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ArrowLeftRight,
  Bell,
  Check,
  CheckCircle2,
  CircleX,
  CreditCard,
  Crown,
  Gauge,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import AccountEntryButton from "@/components/AccountEntryButton";
import { useAuth } from "@/components/AuthProvider";
import {
  CHECKOUT_ELIGIBILITY_VERSION,
  subscriptionBlocksCheckout,
} from "@/lib/billing-lock";
import { PAID_SUBSCRIPTION_POLICY, SUPPORT_CONTACT } from "@/lib/legal";
import {
  ACTIVE_MEMBERSHIP_PLANS,
  annualMonthlyEquivalentMinor,
  annualSavingsMinor,
  formatUsd,
  type BillingInterval,
  type PaidLearnerPlan,
} from "@/lib/membership-plans";
import { parsePricingContext } from "@/lib/pricing-context";
import type { BillingPortalAction } from "@/lib/billing-portal";

const planIcons = { free: Gauge, plus: Layers3, pro: Crown } as const;

function subscribeLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function locationSearch() {
  return window.location.search;
}

function renewalLabel(value: string | undefined, status: string | undefined, cancelAtPeriodEnd?: boolean) {
  if (!value) return null;
  const formatted = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
  if (status === "canceled") return "Subscription canceled; paid access has ended";
  if (Date.parse(value) <= Date.now()) return `Paid access ended ${formatted}`;
  return cancelAtPeriodEnd ? `Cancels ${formatted}; paid access continues until then` : `Renews ${formatted}`;
}

export default function PricingPage() {
  const { user, account, loading: authLoading, sessionResolved, acceptLegalTerms, refreshAccount } = useAuth();
  const courseCredits = account?.courseCredits;
  const subscriptionRequiresManagement = subscriptionBlocksCheckout(account?.subscriptionStatus);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const search = useSyncExternalStore(subscribeLocation, locationSearch, () => "");
  const pricingContext = parsePricingContext(search);
  const [selectedPlanOverride, setSelectedPlanOverride] = useState<PaidLearnerPlan | null>(null);
  const selectedPlan = selectedPlanOverride ?? pricingContext.plan;
  const [billingReady, setBillingReady] = useState(false);
  const [billingStatusResolved, setBillingStatusResolved] = useState(false);
  const [billingManagementReady, setBillingManagementReady] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingPendingAction, setBillingPendingAction] = useState<"checkout" | BillingPortalAction | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<"success" | "canceled" | null>(null);
  const [checkoutReconciliation, setCheckoutReconciliation] = useState<"idle" | "checking" | "confirmed" | "timed-out">("idle");
  const [age18OrOlder, setAge18OrOlder] = useState(false);
  const [usResident, setUsResident] = useState(false);
  const [automaticRenewalAccepted, setAutomaticRenewalAccepted] = useState(false);
  const [intentReadiness, setIntentReadiness] = useState<"ready_now" | "within_30_days" | "researching">("within_30_days");
  const [launchEmailConsent, setLaunchEmailConsent] = useState(false);
  const [intentSaving, setIntentSaving] = useState(false);
  const [intentSaved, setIntentSaved] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = user ? await user.getIdToken() : null;
        const response = await fetch("/api/billing/status", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        const status = await response.json() as { ready?: boolean; managementReady?: boolean };
        if (!active) return;
        setBillingReady(status.ready === true);
        setBillingManagementReady(status.managementReady === true);
        setBillingStatusResolved(true);
      } catch {
        if (!active) return;
        setBillingReady(false);
        setBillingManagementReady(false);
        setBillingStatusResolved(true);
      }
    })();
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    // Canonical account restoration remounts this page. Keep the return marker
    // until that boundary has settled so the new account sees the confirmation.
    if (authLoading || !sessionResolved) return;
    const url = new URL(window.location.href);
    const checkout = url.searchParams.get("checkout");
    if (checkout !== "success" && checkout !== "canceled") return;
    const update = window.setTimeout(() => {
      setCheckoutReturn(checkout);
      url.searchParams.delete("checkout");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }, 0);
    return () => window.clearTimeout(update);
  }, [authLoading, sessionResolved]);

  useEffect(() => {
    let active = true;
    let expired = false;
    let timer: number | undefined;
    let deadlineTimer: number | undefined;
    void (async () => {
      // Let React finish the current commit before updating reconciliation
      // state, and preserve a cancelable boundary for sign-out/navigation.
      await Promise.resolve();
      if (!active) return;
      if (checkoutReturn !== "success" || !user) {
        setCheckoutReconciliation("idle");
        return;
      }
      if (account?.plan && account.plan !== "free") {
        setCheckoutReconciliation("confirmed");
        return;
      }

      const delays = [0, 1_500, 3_000, 5_000, 8_000, 12_000];
      setCheckoutReconciliation("checking");
      deadlineTimer = window.setTimeout(() => {
        if (!active) return;
        expired = true;
        setCheckoutReconciliation("timed-out");
      }, 30_000);
      for (const delay of delays) {
        if (delay > 0) {
          await new Promise<void>((resolve) => {
            timer = window.setTimeout(resolve, delay);
          });
        }
        if (!active || expired) return;
        await refreshAccount().catch(() => undefined);
        if (!active || expired) return;
      }
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
      setCheckoutReconciliation("timed-out");
    })();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
    };
  }, [account?.plan, checkoutReturn, refreshAccount, user]);

  useEffect(() => {
    if (!user || account?.plan !== "free" || subscriptionRequiresManagement || account.legalAcceptanceRequired) return;
    let active = true;
    void user.getIdToken()
      .then((token) => fetch("/api/pricing-intent", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error()))
      .then((body: { intent?: { planId?: PaidLearnerPlan; interval?: BillingInterval; readiness?: "ready_now" | "within_30_days" | "researching"; launchEmailConsent?: boolean } | null }) => {
        if (!active || !body.intent) return;
        if (body.intent.planId && parsePricingContext(window.location.search).from === "direct") setSelectedPlanOverride(body.intent.planId);
        if (body.intent.interval) setInterval(body.intent.interval);
        if (body.intent.readiness) setIntentReadiness(body.intent.readiness);
        setLaunchEmailConsent(body.intent.launchEmailConsent === true);
        setIntentSaved(true);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [account?.legalAcceptanceRequired, account?.plan, subscriptionRequiresManagement, user]);

  const openBilling = async (
    kind: "checkout" | "portal",
    planId: PaidLearnerPlan = selectedPlan,
    portalAction: BillingPortalAction = "manage",
  ) => {
    setBillingBusy(true);
    setBillingPendingAction(kind === "checkout" ? "checkout" : portalAction);
    setBillingError(null);
    try {
      const activeUser = user;
      if (!activeUser) throw new Error("Choose a sign-in method before opening billing.");
      if (kind === "checkout" && (!age18OrOlder || !usResident || !automaticRenewalAccepted)) {
        throw new Error("Confirm all paid-plan eligibility and renewal terms before continuing to Stripe Checkout.");
      }
      if (kind === "checkout" && account?.legalAcceptanceRequired) await acceptLegalTerms("subscription", activeUser);
      const token = await activeUser.getIdToken();
      const response = await fetch(`/api/billing/${kind}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: kind === "checkout" ? JSON.stringify({
          planId,
          interval,
          eligibility: {
            version: CHECKOUT_ELIGIBILITY_VERSION,
            age18OrOlder,
            usResident,
            automaticRenewalAccepted,
          },
        }) : JSON.stringify({ action: portalAction }),
      });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? "Billing could not be opened.");
      window.location.assign(body.url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Billing could not be opened.");
      setBillingBusy(false);
      setBillingPendingAction(null);
    }
  };

  const checkoutEligibilityReady = age18OrOlder && usResident && automaticRenewalAccepted;

  const joinWaitlist = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoining(true);
    setJoinError(null);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || user?.email || "", marketingConsent: consent }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The launch list could not be updated.");
      setJoined(true);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "The launch list could not be updated.");
    } finally {
      setJoining(false);
    }
  };

  const savePricingIntent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setIntentSaving(true);
    setIntentError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/pricing-intent", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan, interval, readiness: intentReadiness, launchEmailConsent }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Your launch preference could not be saved.");
      setIntentSaved(true);
    } catch (error) {
      setIntentError(error instanceof Error ? error.message : "Your launch preference could not be saved.");
    } finally {
      setIntentSaving(false);
    }
  };

  return (
    <AppShell publicWhileLoading>
      <div className="pricing-page">
        <header className="pricing-header">
          <h1>Choose your plan.</h1>
          <p>Free connects published learning and practice. Plus adds private course creation. Pro adds advanced capstone analysis, portable evidence reports, revocable sharing, and publishing tools.</p>
        </header>

        {billingStatusResolved && !billingReady && (
          <section className="pricing-availability-note" role="status" aria-live="polite" aria-labelledby="pricing-availability-title">
            <div>
              <p className="overline">Paid memberships</p>
              <h2 id="pricing-availability-title">Paid memberships are not open yet.</h2>
              <p>Join the launch list below—no payment or subscription is created today.</p>
            </div>
          </section>
        )}

        {pricingContext.from !== "direct" && (
          <section className="pricing-context-note" aria-label="Plan comparison context">
            <div>
              <p className="overline">{pricingContext.from === "evidence-portable" ? "Portable evidence context" : "Course creation context"}</p>
              <h2>{pricingContext.from === "evidence-portable" ? "Pro is selected for export and revocable sharing." : "Plus is selected for private course creation."}</h2>
              <p>{pricingContext.from === "evidence-portable"
                ? "Your on-screen learning evidence remains available without Pro. Compare the added portable-report capabilities below."
                : "Published learning remains available on Free. Compare the private course credits and creation capabilities below."}</p>
            </div>
          </section>
        )}

        {checkoutReturn && (
          <section className={`billing-return-status is-${checkoutReturn}`} role="status" aria-live="polite" aria-labelledby="billing-return-title">
            {checkoutReturn === "success" ? <CheckCircle2 size={21} aria-hidden="true" /> : <X size={21} aria-hidden="true" />}
            <div>
              <h2 id="billing-return-title">{checkoutReturn === "success" ? "Confirming your membership" : "Checkout did not return success"}</h2>
              <p>{checkoutReturn === "success"
                ? checkoutReconciliation === "confirmed"
                  ? "Stripe's verified payment event has been applied and your membership is active."
                  : checkoutReconciliation === "timed-out"
                    ? "Stripe has not confirmed the subscription within 30 seconds. Your access has not changed. Refresh your membership or open Stripe billing before trying checkout again."
                    : "You returned from secure checkout. Access activates only after Filosage processes Stripe's verified payment event, which can take a moment. This page will check for confirmation for up to 30 seconds."
                : "This return link reports that Checkout was canceled. A redirect cannot confirm payment or subscription state and does not change your access. Review your current membership and Manage billing below before starting another checkout; contact support if anything looks unexpected."}</p>
              {checkoutReturn === "success" && checkoutReconciliation === "timed-out" && (
                <button className="button button-quiet" type="button" onClick={() => void refreshAccount()}>Refresh membership</button>
              )}
              <Link href="/support/articles/plans-and-billing">See billing and cancellation help</Link>
            </div>
          </section>
        )}

        <div className="billing-interval pricing-interval" role="group" aria-label="Billing interval">
          <button type="button" className={interval === "monthly" ? "is-selected" : ""} aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
          <button type="button" className={interval === "annual" ? "is-selected" : ""} aria-pressed={interval === "annual"} onClick={() => setInterval("annual")}>Annual <span>Save 33%</span></button>
        </div>

        {billingReady && user && account?.plan === "free" && !subscriptionRequiresManagement && (
          <fieldset className="pricing-checkout-eligibility">
            <legend>Confirm before continuing to Stripe Checkout</legend>
            <p>These confirmations are recorded with the selected offer before Stripe opens its hosted checkout page.</p>
            <label><input type="checkbox" checked={age18OrOlder} onChange={(event) => setAge18OrOlder(event.target.checked)} /><span>I am at least {PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge} years old.</span></label>
            <label><input type="checkbox" checked={usResident} onChange={(event) => setUsResident(event.target.checked)} /><span>I am a resident of the {PAID_SUBSCRIPTION_POLICY.launchMarketLabel}.</span></label>
            <label><input type="checkbox" checked={automaticRenewalAccepted} onChange={(event) => setAutomaticRenewalAccepted(event.target.checked)} /><span>I understand this subscription renews automatically until I cancel it through Stripe.</span></label>
          </fieldset>
        )}

        <div className="plan-comparison">
          {ACTIVE_MEMBERSHIP_PLANS.map((plan) => {
            const Icon = planIcons[plan.id];
            const isCurrent = account?.plan === plan.id;
            const isPaidPlan = plan.id === "plus" || plan.id === "pro";
            const paidPlanId = isPaidPlan ? plan.id : null;
            const primaryAmount = paidPlanId
              ? interval === "monthly" ? plan.prices!.monthly.amountMinor : annualMonthlyEquivalentMinor(paidPlanId)
              : 0;
            const renewal = isCurrent ? renewalLabel(account?.currentPeriodEnd, account?.subscriptionStatus, account?.billingCancelAtPeriodEnd) : null;
            return (
              <section className={`plan-column plan-${plan.id}${selectedPlan === plan.id ? " is-selected" : ""}`} aria-labelledby={`${plan.id}-plan-title`} key={plan.id}>
                <div className="plan-heading"><span><Icon size={19} /></span><div><h2 id={`${plan.id}-plan-title`}>{plan.name}</h2><p>{plan.description}</p></div></div>
                {paidPlanId ? (
                  <p className="plan-price">
                    <strong>{formatUsd(primaryAmount)}</strong><span>per month</span>
                    <small>{interval === "annual" ? `${formatUsd(plan.prices!.annual.amountMinor)} billed yearly · save ${formatUsd(annualSavingsMinor(paidPlanId))}` : "Billed monthly"}</small>
                  </p>
                ) : <p className="plan-price"><strong>$0</strong><span>no subscription</span><small>Published learning stays available.</small></p>}
                <ul>{[...plan.includedFeatures, `${plan.limits.flashcardDeckGenerationsPerMonth} flashcard deck generations each month`].map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
                {plan.restrictedFeatures.length > 0 && <ul className="plan-restrictions" aria-label={`${plan.name} exclusions`}>{plan.restrictedFeatures.map((feature) => <li key={feature}><X size={16} /> {feature}</li>)}</ul>}

                {isCurrent ? (
                  <div className="plan-status"><Sparkles size={17} /><span><strong>{account?.subscriptionStatus === "past_due" ? "Payment needs attention" : `${plan.shortName} is active`}</strong><small>{account?.subscriptionStatus === "past_due" ? "Update your payment method to restore paid access." : renewal ?? (courseCredits?.balance === null ? "Unlimited owner course creation" : account?.plan === "free" && courseCredits?.frozenUntil ? `${courseCredits.balance} course credits preserved until ${new Date(courseCredits.frozenUntil).toLocaleDateString()}` : courseCredits ? `${courseCredits.balance} rollover course credits available` : "Your current membership")}</small></span></div>
                ) : !user && plan.id === "free" ? (
                  <AccountEntryButton className="button button-secondary" />
                ) : paidPlanId && !user && billingReady ? (
                  <AccountEntryButton
                    createLabel={`Create an account to choose ${plan.shortName}`}
                    signInLabel={`Sign in to choose ${plan.shortName}`}
                    icon={CreditCard}
                  />
                ) : paidPlanId && !user ? (
                  <button className={selectedPlan === paidPlanId ? "button button-secondary" : "button button-quiet"} type="button" onClick={() => setSelectedPlanOverride(paidPlanId)}>{selectedPlan === paidPlanId ? `${plan.shortName} selected` : `Notify me about ${plan.shortName}`}</button>
                ) : paidPlanId && billingReady && account?.plan === "free" && !subscriptionRequiresManagement ? (
                  <button className="button button-primary" type="button" disabled={billingBusy || !checkoutEligibilityReady} onClick={() => void openBilling("checkout", paidPlanId)}>
                    {billingBusy ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />}{billingBusy ? "Opening Stripe Checkout…" : checkoutEligibilityReady ? `Continue to Stripe Checkout — ${plan.shortName} ${interval === "annual" ? "annual" : "monthly"}` : "Confirm eligibility to continue"}
                  </button>
                ) : paidPlanId && !billingReady && account?.plan === "free" && !subscriptionRequiresManagement ? (
                  <button className={selectedPlan === paidPlanId ? "button button-secondary" : "button button-quiet"} type="button" onClick={() => setSelectedPlanOverride(paidPlanId)}>{selectedPlan === paidPlanId ? `${plan.shortName} selected` : `Notify me about ${plan.shortName}`}</button>
                ) : null}
              </section>
            );
          })}
        </div>

        <section className="pricing-credit-guide" aria-labelledby="course-credit-title">
          <div><p className="overline">Course credits, in context</p><h2 id="course-credit-title">One credit builds the course the goal requires.</h2><p>An approved outline redeems one credit. Every lesson planned in that outline is included, so a longer course is not penalized with a separate lesson quota.</p></div>
          <dl>
            <div><dt>Plus</dt><dd><strong>2 monthly</strong><span>Unused credits roll over, up to 24.</span></dd></div>
            <div><dt>Pro</dt><dd><strong>5 monthly</strong><span>Unused credits roll over, up to 60.</span></dd></div>
          </dl>
          <p>Annual memberships receive credits monthly, not all at once. Paid accounts can keep every course they create. If paid access ends, unused credits are preserved for twelve months and become usable again when paid access resumes.</p>
        </section>

        {subscriptionRequiresManagement && (
          <section className="pricing-account-action" aria-labelledby="manage-membership-title">
            <div>
              <p className="overline">Your subscription</p>
              <h2 id="manage-membership-title">Manage your membership in Stripe</h2>
              {(account?.subscriptionStatus === "active" || account?.subscriptionStatus === "trialing")
                && !account?.legalAcceptanceRequired && account?.accountStatus !== "suspended" ? (
                <p>Change plan or billing interval in Stripe; the change takes effect immediately and Stripe calculates the prorated invoice; cancellation takes effect at the end of the current paid period.</p>
              ) : (
                <p>Update your payment method or cancel at the end of the paid period in Stripe. These recovery actions do not require accepting new Terms. Plan changes require an active account, a current payment, and current Terms acceptance.</p>
              )}
            </div>
            <div className="pricing-account-actions" aria-label="Stripe subscription actions">
              {(account?.subscriptionStatus === "active" || account?.subscriptionStatus === "trialing") && (
                <button aria-label="Change plan in Stripe" className="button button-secondary" type="button" disabled={billingBusy || !billingManagementReady || account?.legalAcceptanceRequired || account?.accountStatus === "suspended"} onClick={() => void openBilling("portal", selectedPlan, "change_plan")}>
                  {billingPendingAction === "change_plan" ? <LoaderCircle className="spin" size={16} /> : <ArrowLeftRight size={16} />} {billingPendingAction === "change_plan" ? "Opening Stripe…" : "Change plan in Stripe"}
                </button>
              )}
              <button aria-label="Manage billing in Stripe" className="button button-quiet" type="button" disabled={billingBusy || !billingManagementReady} onClick={() => void openBilling("portal", selectedPlan, "manage")}>
                {billingPendingAction === "manage" ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />} {billingPendingAction === "manage" ? "Opening Stripe…" : "Manage billing in Stripe"}
              </button>
              <button aria-label="Cancel membership in Stripe" className="button button-quiet" type="button" disabled={billingBusy || !billingManagementReady} onClick={() => void openBilling("portal", selectedPlan, "cancel")}>
                {billingPendingAction === "cancel" ? <LoaderCircle className="spin" size={16} /> : <CircleX size={16} />} {billingPendingAction === "cancel" ? "Opening Stripe…" : "Cancel membership in Stripe"}
              </button>
            </div>
          </section>
        )}

        {!billingReady && account?.plan === "free" && user && (
          <form className="pricing-intent-form pricing-launch-action" onSubmit={savePricingIntent}>
            <div><h2>Tell us which membership fits</h2><p>{selectedPlan === "plus" ? "Filosage Plus" : "Filosage Pro"} with {interval === "annual" ? "annual" : "monthly"} billing is selected. No subscription will be created while checkout is closed.</p></div>
            <fieldset>
              <legend>When would you consider subscribing?</legend>
              <label aria-label="I would consider subscribing when memberships open"><input type="radio" name="readiness" checked={intentReadiness === "ready_now"} onChange={() => setIntentReadiness("ready_now")} /><span><strong>When it opens</strong><small>I would seriously consider subscribing.</small></span></label>
              <label aria-label="I would consider subscribing within 30 days"><input type="radio" name="readiness" checked={intentReadiness === "within_30_days"} onChange={() => setIntentReadiness("within_30_days")} /><span><strong>Within 30 days</strong><small>I need a little time or more proof.</small></span></label>
              <label aria-label="I am only researching memberships"><input type="radio" name="readiness" checked={intentReadiness === "researching"} onChange={() => setIntentReadiness("researching")} /><span><strong>Just researching</strong><small>I am comparing the memberships for now.</small></span></label>
            </fieldset>
            <label className="waitlist-consent"><input type="checkbox" checked={launchEmailConsent} onChange={(event) => setLaunchEmailConsent(event.target.checked)} /><span>Also email me when paid memberships open. I can unsubscribe at any time.</span></label>
            <button className="button button-primary" type="submit" disabled={intentSaving}>{intentSaving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} {intentSaving ? "Saving…" : intentSaved ? "Update my preference" : "Save my preference"}</button>
            {intentSaved && !intentError && <p className="pricing-intent-success" role="status">Preference saved. {launchEmailConsent ? "Launch email consent is active" : "Launch email consent is withdrawn"}; no subscription was created.</p>}
            {intentError && <p className="waitlist-error" role="alert">{intentError}</p>}
          </form>
        )}

        {!billingReady && !user && (joined ? (
          <div className="waitlist-success pricing-launch-action" role="status"><Check size={17} /><span><strong>You are on the launch list.</strong><small>We will email you when paid memberships are ready.</small></span></div>
        ) : (
          <form className="waitlist-form pricing-launch-action" onSubmit={joinWaitlist}>
            <div><h2>Membership launch updates</h2><p>Join the list for a single launch notice. No subscription will be created.</p></div>
            <label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" /></label>
            <label className="waitlist-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>Email me when paid memberships open. I can unsubscribe at any time.</span></label>
            <button className="button button-primary" type="submit" disabled={joining || !consent}><Bell size={16} /> {joining ? "Joining…" : "Join the launch list"}</button>
            {joinError && <p className="waitlist-error" role="alert">{joinError}</p>}
          </form>
        ))}

        {billingError && <p className="waitlist-error" role="alert">{billingError}</p>}
        <p className="pricing-note">Tutor-question allowances renew monthly. Course credits carry forward to the stated balance ceiling. A downgrade never deletes a course, assessment history, evidence snapshot, or published work; it changes which new actions are available.</p>
        <section className="billing-readiness-note" aria-labelledby="billing-readiness-title">
          <LockKeyhole size={18} />
          <div><h2 id="billing-readiness-title">Clear terms before any charge</h2><p>{billingReady ? `Secure checkout shows the selected membership, exact price, currency, billing interval, automatic renewal, included limits, online cancellation, and ${PAID_SUBSCRIPTION_POLICY.refundWindowDays}-day initial-charge and annual-renewal refund window before consent. Paid plans are for ${PAID_SUBSCRIPTION_POLICY.launchMarketLabel} residents age ${PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge} or older.` : `Paid checkout remains closed. Before launch, secure checkout will show the selected membership, exact price, currency, billing interval, automatic renewal, included limits, online cancellation, and ${PAID_SUBSCRIPTION_POLICY.refundWindowDays}-day initial-charge and annual-renewal refund window before consent. Paid plans will initially be limited to ${PAID_SUBSCRIPTION_POLICY.launchMarketLabel} residents age ${PAID_SUBSCRIPTION_POLICY.minimumPurchaserAge} or older.`}</p><p><Link href="/terms">Terms of Service</Link> · <Link href="/privacy">Privacy Notice</Link> · <a href={`mailto:${SUPPORT_CONTACT}`}>Contact support</a></p></div>
        </section>
      </div>
    </AppShell>
  );
}
