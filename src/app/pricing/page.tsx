"use client";

import { Bell, Check, Crown, Gauge, LockKeyhole, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { SUPPORT_CONTACT } from "@/lib/legal";

const freeFeatures = [
  "Read every published course",
  "Complete lessons and retrieval practice",
  "Cloud progress and review scheduling",
  "Three tutor questions per day",
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
            <ul>{proFeatures.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
            {isPro ? (
              <div className="plan-status"><Sparkles size={17} /><span><strong>Pro is active</strong><small>{outlineQuota?.remaining ?? "Unlimited"} course outline credits remaining</small></span></div>
            ) : (
              <a
                className="button button-primary"
                href={`mailto:${SUPPORT_CONTACT}?subject=${encodeURIComponent("Erudoza Pro launch updates")}&body=${encodeURIComponent("Please let me know when Erudoza Pro subscriptions become available.")}`}
              >
                <Bell size={16} /> Join the Pro launch list
              </a>
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
