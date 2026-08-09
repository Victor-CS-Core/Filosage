"use client";

import { useEffect, useState } from "react";
import { Bell, Check, CreditCard, Crown, Gauge, LoaderCircle, LockKeyhole, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { subscriptionBlocksCheckout } from "@/lib/billing-lock";
import { SUPPORT_CONTACT } from "@/lib/legal";

const freeFeatures = [
  "Open every published lesson with a free account",
  "Complete lessons and retrieval practice",
  "Cloud progress and review scheduling",
  "Five tutor questions each month",
];

const proFeatures = [
  "Everything in Free",
  "Three private course outlines each month",
  "Thirty generated lessons each month",
  "Publish courses after completing and reviewing them",
  "One hundred tutor questions each month",
  "Review scheduling and detailed progress",
];

export default function PricingPage() {
  const { user, account, isPro, signInWithGoogle, acceptLegalTerms } = useAuth();
  const outlineQuota = account?.quotas.find((quota) => quota.feature === "course_outline");
  const subscriptionRequiresManagement = subscriptionBlocksCheckout(account?.subscriptionStatus);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [billingReady, setBillingReady] = useState(false);
  const [billingManagementReady, setBillingManagementReady] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
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
    if (!user || isPro || subscriptionRequiresManagement || account?.legalAcceptanceRequired) return;
    let active = true;
    void user.getIdToken()
      .then((token) => fetch("/api/pricing-intent", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error()))
      .then((body: { intent?: { interval?: "monthly" | "annual"; readiness?: "ready_now" | "within_30_days" | "researching"; launchEmailConsent?: boolean } | null }) => {
        if (!active || !body.intent) return;
        if (body.intent.interval) setInterval(body.intent.interval);
        if (body.intent.readiness) setIntentReadiness(body.intent.readiness);
        setLaunchEmailConsent(body.intent.launchEmailConsent === true);
        setIntentSaved(true);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [account?.legalAcceptanceRequired, isPro, subscriptionRequiresManagement, user]);

  const openBilling = async (kind: "checkout" | "portal") => {
    setBillingBusy(true);
    setBillingError(null);
    try {
      let activeUser = user;
      if (!activeUser) activeUser = await signInWithGoogle();
      if (account?.legalAcceptanceRequired) await acceptLegalTerms("subscription", activeUser);
      const token = await activeUser.getIdToken();
      const response = await fetch(`/api/billing/${kind}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: kind === "checkout" ? JSON.stringify({ interval }) : undefined,
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
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ interval, readiness: intentReadiness, launchEmailConsent }),
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
          <p className="overline">Filosage Pro</p>
          <h1>Learn for free. Create with Pro.</h1>
          <p>Browse public outlines before signing up. A free account opens published lessons; Pro adds course creation, staged generation, and publishing.</p>
        </header>

        <div className="plan-comparison">
          <section className="plan-column" aria-labelledby="free-plan-title">
            <div className="plan-heading"><span><Gauge size={19} /></span><div><h2 id="free-plan-title">Free learner</h2><p>Read, practice, and keep momentum.</p></div></div>
            <ul>{freeFeatures.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
            {!user && <button className="button button-secondary" onClick={() => void signInWithGoogle()}>Create a free account</button>}
            {user && !isPro && <span className="current-plan-label">Your current plan</span>}
          </section>

          <section className="plan-column plan-pro" aria-labelledby="pro-plan-title">
            <div className="plan-heading"><span><Crown size={19} /></span><div><h2 id="pro-plan-title">Filosage Pro</h2><p>Create a course privately, then publish it when it is ready.</p></div></div>
            <p className="plan-price"><strong>$14.99</strong><span>per month</span><small>or $9.99/month, billed annually ($119.88/year)</small></p>
            <div className="billing-interval" role="group" aria-label="Billing interval">
              <button type="button" className={interval === "monthly" ? "is-selected" : ""} aria-pressed={interval === "monthly"} onClick={() => setInterval("monthly")}>Monthly</button>
              <button type="button" className={interval === "annual" ? "is-selected" : ""} aria-pressed={interval === "annual"} onClick={() => setInterval("annual")}>Annual <span>Save 33%</span></button>
            </div>
            <ul>{proFeatures.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
            {subscriptionRequiresManagement ? (
              <>
                <div className="plan-status"><Sparkles size={17} /><span><strong>{account?.subscriptionStatus === "past_due" ? "Payment needs attention" : "Pro is active"}</strong><small>{account?.subscriptionStatus === "past_due" ? "Update your payment method to restore Pro access." : `${outlineQuota?.remaining ?? "Unlimited"} course outline credits remaining`}</small></span></div>
                <button className="button button-secondary" type="button" disabled={billingBusy || !billingManagementReady} onClick={() => void openBilling("portal")}>
                  {billingBusy ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />} Manage billing
                </button>
              </>
            ) : isPro ? (
              <div className="plan-status"><Sparkles size={17} /><span><strong>Pro is active</strong><small>{outlineQuota?.remaining ?? "Unlimited"} course outline credits remaining</small></span></div>
            ) : billingReady ? (
              <button className="button button-primary" type="button" disabled={billingBusy} onClick={() => void openBilling("checkout")}>
                {billingBusy ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />}
                {billingBusy ? "Opening secure checkout…" : `Choose Pro ${interval === "annual" ? "annual" : "monthly"}`}
              </button>
            ) : user ? (
              <form className="pricing-intent-form" onSubmit={savePricingIntent}>
                <fieldset>
                  <legend>When would you consider Pro?</legend>
                  <label aria-label="I would consider Pro when it opens"><input type="radio" name="readiness" value="ready_now" checked={intentReadiness === "ready_now"} onChange={() => setIntentReadiness("ready_now")} /><span><strong>When it opens</strong><small>I would seriously consider subscribing.</small></span></label>
                  <label aria-label="I would consider Pro within 30 days"><input type="radio" name="readiness" value="within_30_days" checked={intentReadiness === "within_30_days"} onChange={() => setIntentReadiness("within_30_days")} /><span><strong>Within 30 days</strong><small>I need a little time or more proof.</small></span></label>
                  <label aria-label="I am just researching Pro"><input type="radio" name="readiness" value="researching" checked={intentReadiness === "researching"} onChange={() => setIntentReadiness("researching")} /><span><strong>Just researching</strong><small>I am comparing the offer for now.</small></span></label>
                </fieldset>
                <label className="waitlist-consent">
                  <input type="checkbox" checked={launchEmailConsent} onChange={(event) => setLaunchEmailConsent(event.target.checked)} />
                  <span>Also email me when Pro opens. I can unsubscribe at any time.</span>
                </label>
                <button className="button button-primary" type="submit" disabled={intentSaving}>
                  {intentSaving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} {intentSaving ? "Saving..." : intentSaved ? "Update my preference" : "Save my preference"}
                </button>
                {intentSaved && !intentError && (
                  <p className="pricing-intent-success" role="status">
                    {launchEmailConsent
                      ? "Preference saved. Launch email consent is active; no subscription was created."
                      : "Preference saved. Launch email consent is withdrawn; no subscription was created."}
                  </p>
                )}
                {intentError && <p className="waitlist-error" role="alert">{intentError}</p>}
              </form>
            ) : joined ? (
              <div className="waitlist-success" role="status"><Check size={17} /><span><strong>You are on the launch list.</strong><small>We will email you when Pro checkout is ready.</small></span></div>
            ) : (
              <form className="waitlist-form" onSubmit={joinWaitlist}>
                <label>
                  <span>Email address</span>
                  <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" />
                </label>
                <label className="waitlist-consent">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
                  <span>Email me about the Pro launch. I can unsubscribe at any time.</span>
                </label>
                <button className="button button-primary" type="submit" disabled={joining || !consent}>
                  <Bell size={16} /> {joining ? "Joining…" : "Join the Pro launch list"}
                </button>
                {joinError && <p className="waitlist-error" role="alert">{joinError}</p>}
              </form>
            )}
            {billingError && <p className="waitlist-error" role="alert">{billingError}</p>}
          </section>
        </div>

        <p className="pricing-note">Generation credits reset each month and do not roll over. Pro authors generate lessons in sequence: complete the current lesson activities before generating the next. The platform owner can unpublish or remove material that fails the publication standard.</p>
        <section className="billing-readiness-note" aria-labelledby="billing-readiness-title">
          <LockKeyhole size={18} />
          <div><h2 id="billing-readiness-title">Clear terms before any charge</h2><p>{billingReady ? "Secure checkout shows the exact price, currency, billing interval, automatic renewal, and included limits before you consent. You can cancel online from Manage billing." : "Paid checkout is not active. Before it launches, secure checkout will show the exact price, currency, billing interval, automatic renewal, included limits, and a simple online cancellation method before you consent."}</p><p><a href="/terms">Terms of Service</a> · <a href="/privacy">Privacy Notice</a> · <a href={`mailto:${SUPPORT_CONTACT}`}>Contact support</a></p></div>
        </section>
      </div>
    </AppShell>
  );
}
