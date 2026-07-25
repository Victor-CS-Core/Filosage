"use client";

import { useState } from "react";
import { Bell, Check, Crown, Gauge, LockKeyhole, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { SUPPORT_CONTACT } from "@/lib/legal";

const freeFeatures = [
  "Read every published course",
  "Complete lessons and retrieval practice",
  "Cloud progress and review scheduling",
  "Five tutor questions each month",
];

const proFeatures = [
  "Everything in Free",
  "Three private course outlines each month",
  "Thirty generated lessons each month",
  "One hundred tutor questions each month",
  "Review scheduling and detailed progress",
];

export default function PricingPage() {
  const { user, account, isPro, signInWithGoogle } = useAuth();
  const outlineQuota = account?.quotas.find((quota) => quota.feature === "course_outline");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

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

  return (
    <AppShell>
      <div className="pricing-page">
        <header className="pricing-header">
          <p className="overline">Erudoza Pro</p>
          <h1>Learn for free. Create with Pro.</h1>
          <p>Every published course stays free. Pro adds private course creation and more tutor questions.</p>
        </header>

        <div className="plan-comparison">
          <section className="plan-column" aria-labelledby="free-plan-title">
            <div className="plan-heading"><span><Gauge size={19} /></span><div><h2 id="free-plan-title">Free learner</h2><p>Read, practice, and keep momentum.</p></div></div>
            <ul>{freeFeatures.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
            {!user && <button className="button button-secondary" onClick={() => void signInWithGoogle()}>Create a free account</button>}
            {user && !isPro && <span className="current-plan-label">Your current plan</span>}
          </section>

          <section className="plan-column plan-pro" aria-labelledby="pro-plan-title">
            <div className="plan-heading"><span><Crown size={19} /></span><div><h2 id="pro-plan-title">Erudoza Pro</h2><p>Create private courses for your own goals.</p></div></div>
            <p className="plan-price"><strong>$14.99</strong><span>per month</span><small>or $9.99/month, billed annually ($119.88/year)</small></p>
            <ul>{proFeatures.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
            {isPro ? (
              <div className="plan-status"><Sparkles size={17} /><span><strong>Pro is active</strong><small>{outlineQuota?.remaining ?? "Unlimited"} course outline credits remaining</small></span></div>
            ) : joined ? (
              <div className="waitlist-success" role="status"><Check size={17} /><span><strong>You are on the launch list.</strong><small>We will email you when Pro checkout is ready.</small></span></div>
            ) : (
              <form className="waitlist-form" onSubmit={joinWaitlist}>
                <label>
                  <span>Email address</span>
                  <input type="email" autoComplete="email" value={email || user?.email || ""} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" />
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
          </section>
        </div>

        <p className="pricing-note">Generation credits reset each month and do not roll over. Monthly limits help keep course creation reliable and available.</p>
        <section className="billing-readiness-note" aria-labelledby="billing-readiness-title">
          <LockKeyhole size={18} />
          <div><h2 id="billing-readiness-title">Clear terms before any charge</h2><p>Paid checkout is not active. Before it launches, the checkout screen will show the exact price, currency, billing interval, renewal terms, included limits, trial conversion if applicable, and a simple online cancellation method before you consent.</p><p><a href="/terms">Terms of Service</a> · <a href="/privacy">Privacy Notice</a> · <a href={`mailto:${SUPPORT_CONTACT}`}>Contact support</a></p></div>
        </section>
      </div>
    </AppShell>
  );
}
