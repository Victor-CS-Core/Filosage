"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Bell,
  Check,
  CheckCircle2,
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
import { useAuth } from "@/components/AuthProvider";
import { subscriptionBlocksCheckout } from "@/lib/billing-lock";
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

const planIcons = { free: Gauge, plus: Layers3, pro: Crown } as const;

function subscribeLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function locationSearch() {
  return window.location.search;
}

function renewalLabel(value: string | undefined, status: string | undefined) {
  if (!value) return null;
  const formatted = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
  return status === "canceled" ? `Access ends ${formatted}` : `Next billing boundary ${formatted}`;
}

export default function PricingPage() {
  const { user, account, signIn, acceptLegalTerms, refreshAccount } = useAuth();
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
  const [billingManagementReady, setBillingManagementReady] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<"success" | "canceled" | null>(null);
  const [intentReadiness, setIntentReadiness] = useState<"ready_now" | "within_30_days" | "researching">("within_30_days");
  const [launchEmailConsent, setLaunchEmailConsent] = useState(false);
  const [intentSaving, setIntentSaving] = useState(false);
  const [intentSaved, setIntentSaved] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/billing/status")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error()))
      .then((status: { ready?: boolean; managementReady?: boolean }) => {
        setBillingReady(status.ready === true);
        setBillingManagementReady(status.managementReady === true);
      })
      .catch(() => {
        setBillingReady(false);
        setBillingManagementReady(false);
      });
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const checkout = url.searchParams.get("checkout");
    if (checkout !== "success" && checkout !== "canceled") return;
    const update = window.setTimeout(() => setCheckoutReturn(checkout), 0);
    url.searchParams.delete("checkout");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return () => window.clearTimeout(update);
  }, []);

  useEffect(() => {
    if (checkoutReturn !== "success" || !user) return;
    void refreshAccount();
    const retry = window.setTimeout(() => void refreshAccount(), 2_500);
    return () => window.clearTimeout(retry);
  }, [checkoutReturn, refreshAccount, user]);

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

  const openBilling = async (kind: "checkout" | "portal", planId: PaidLearnerPlan = selectedPlan) => {
    setBillingBusy(true);
    setBillingError(null);
    try {
      let activeUser = user;
      if (!activeUser) activeUser = await signIn();
      if (account?.legalAcceptanceRequired) await acceptLegalTerms("subscription", activeUser);
      const token = await activeUser.getIdToken();
      const response = await fetch(`/api/billing/${kind}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: kind === "checkout" ? JSON.stringify({ planId, interval }) : undefined,
      });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? "Billing could not be opened.");
      window.location.assign(body.url);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Billing could not be opened.");
      setBillingBusy(false);
    }
  };

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
    <AppShell>
      <div className="pricing-page">
        <header className="pricing-header">
          <h1>Choose how far Filosage carries your goal.</h1>
          <p>Free connects published learning and practice. Plus adds private course creation. Pro adds advanced capstone analysis, portable evidence reports, revocable sharing, and publishing tools.</p>
        </header>

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
                ? "You returned from secure checkout. Access activates only after Filosage processes Stripe's verified payment event, which can take a moment. If your membership does not update, check Manage billing below or contact support before trying again."
                : "This return link reports that Checkout was canceled. A redirect cannot confirm payment or subscription state and does not change your access. Review your current membership and Manage billing below before starting another checkout; contact support if anything looks unexpected."}</p>
              <Link href="/support/articles/plans-and-billing">See billing and cancellation help</Link>
            </div>
          </section>
        )}

        <div className="billing-interval pricing-interval" role="group" aria-label="Billing interval">
          <button type="button" className={interval === "monthly" ? "is-selected" : ""} aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
          <button type="button" className={interval === "annual" ? "is-selected" : ""} aria-pressed={interval === "annual"} onClick={() => setInterval("annual")}>Annual <span>Save 33%</span></button>
        </div>

        <div className="plan-comparison">
          {ACTIVE_MEMBERSHIP_PLANS.map((plan) => {
            const Icon = planIcons[plan.id];
            const isCurrent = account?.plan === plan.id;
            const isPaidPlan = plan.id === "plus" || plan.id === "pro";
            const paidPlanId = isPaidPlan ? plan.id : null;
            const primaryAmount = paidPlanId
              ? interval === "monthly" ? plan.prices!.monthly.amountMinor : annualMonthlyEquivalentMinor(paidPlanId)
              : 0;
            const renewal = isCurrent ? renewalLabel(account?.currentPeriodEnd, account?.subscriptionStatus) : null;
            return (
              <section className={`plan-column plan-${plan.id}${selectedPlan === plan.id ? " is-selected" : ""}`} aria-labelledby={`${plan.id}-plan-title`} key={plan.id}>
                <div className="plan-heading"><span><Icon size={19} /></span><div><h2 id={`${plan.id}-plan-title`}>{plan.name}</h2><p>{plan.description}</p></div></div>
                {paidPlanId ? (
                  <p className="plan-price">
                    <strong>{formatUsd(primaryAmount)}</strong><span>per month</span>
                    <small>{interval === "annual" ? `${formatUsd(plan.prices!.annual.amountMinor)} billed yearly · save ${formatUsd(annualSavingsMinor(paidPlanId))}` : "Billed monthly"}</small>
                  </p>
                ) : <p className="plan-price"><strong>$0</strong><span>no subscription</span><small>Published learning stays available.</small></p>}
                <ul>{plan.includedFeatures.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
                {plan.restrictedFeatures.length > 0 && <ul className="plan-restrictions" aria-label={`${plan.name} exclusions`}>{plan.restrictedFeatures.map((feature) => <li key={feature}><X size={16} /> {feature}</li>)}</ul>}

                {isCurrent ? (
                  <div className="plan-status"><Sparkles size={17} /><span><strong>{account?.subscriptionStatus === "past_due" ? "Payment needs attention" : `${plan.shortName} is active`}</strong><small>{account?.subscriptionStatus === "past_due" ? "Update your payment method to restore paid access." : renewal ?? (courseCredits?.balance === null ? "Unlimited owner course creation" : account?.plan === "free" && courseCredits?.frozenUntil ? `${courseCredits.balance} course credits preserved until ${new Date(courseCredits.frozenUntil).toLocaleDateString()}` : courseCredits ? `${courseCredits.balance} rollover course credits available` : "Your current membership")}</small></span></div>
                ) : !user && plan.id === "free" ? (
                  <button className="button button-secondary" onClick={() => void signIn()}>Create a free account</button>
                ) : paidPlanId && !user && billingReady ? (
                  <button className="button button-primary" type="button" disabled={billingBusy} onClick={() => void openBilling("checkout", paidPlanId)}>
                    {billingBusy ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />}{billingBusy ? "Opening secure checkout…" : `Choose ${plan.shortName} ${interval === "annual" ? "annual" : "monthly"}`}
                  </button>
                ) : paidPlanId && !user ? (
                  <button className={selectedPlan === paidPlanId ? "button button-secondary" : "button button-quiet"} type="button" onClick={() => setSelectedPlanOverride(paidPlanId)}>{selectedPlan === paidPlanId ? `${plan.shortName} selected` : `Choose ${plan.shortName}`}</button>
                ) : paidPlanId && billingReady && account?.plan === "free" && !subscriptionRequiresManagement ? (
                  <button className="button button-primary" type="button" disabled={billingBusy} onClick={() => void openBilling("checkout", paidPlanId)}>
                    {billingBusy ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />}{billingBusy ? "Opening secure checkout…" : `Choose ${plan.shortName} ${interval === "annual" ? "annual" : "monthly"}`}
                  </button>
                ) : paidPlanId && !billingReady && account?.plan === "free" && !subscriptionRequiresManagement ? (
                  <button className={selectedPlan === paidPlanId ? "button button-secondary" : "button button-quiet"} type="button" onClick={() => setSelectedPlanOverride(paidPlanId)}>{selectedPlan === paidPlanId ? `${plan.shortName} selected` : `Choose ${plan.shortName}`}</button>
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
            <div><h2 id="manage-membership-title">Manage your membership</h2><p>Review renewal, update your payment method, view invoices, or cancel at the end of the paid period through the secure billing portal.</p></div>
            <button className="button button-secondary" type="button" disabled={billingBusy || !billingManagementReady} onClick={() => void openBilling("portal")}>
              {billingBusy ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />} Manage billing
            </button>
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
