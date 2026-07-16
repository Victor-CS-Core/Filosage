"use client";

import { Check, Crown, Gauge, LockKeyhole, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";

const freeFeatures = [
  "Read every published course",
  "Complete lessons and retrieval practice",
  "Cloud progress and review scheduling",
  "Three lesson-tutor prompts per day",
];

const proFeatures = [
  "Everything in Free",
  "Three private course outlines each month",
  "Thirty generated lessons each month",
  "One hundred lesson-tutor prompts each month",
  "Adaptive review and deeper progress insight",
];

export default function PricingPage() {
  const { user, account, isPro, signInWithGoogle } = useAuth();
  const outlineQuota = account?.quotas.find((quota) => quota.feature === "course_outline");

  return (
    <AppShell>
      <div className="pricing-page">
        <header className="pricing-header">
          <p className="overline">Erudoza Pro</p>
          <h1>Pay for focus and intelligence—not access to knowledge.</h1>
          <p>Published courses stay free. Pro funds private course creation, lesson-grounded tutoring, and the systems that help learning last.</p>
        </header>

        <div className="plan-comparison">
          <section className="plan-column" aria-labelledby="free-plan-title">
            <div className="plan-heading"><span><Gauge size={19} /></span><div><h2 id="free-plan-title">Free learner</h2><p>Read, practice, and keep momentum.</p></div></div>
            <ul>{freeFeatures.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
            {!user && <button className="button button-secondary" onClick={() => void signInWithGoogle()}>Create a free account</button>}
            {user && !isPro && <span className="current-plan-label">Your current plan</span>}
          </section>

          <section className="plan-column plan-pro" aria-labelledby="pro-plan-title">
            <div className="plan-heading"><span><Crown size={19} /></span><div><h2 id="pro-plan-title">Erudoza Pro</h2><p>Build a private path around what matters to you.</p></div></div>
            <ul>{proFeatures.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
            {isPro ? (
              <div className="plan-status"><Sparkles size={17} /><span><strong>Pro is active</strong><small>{outlineQuota?.remaining ?? "Unlimited"} course outline credits remaining</small></span></div>
            ) : (
              <button className="button button-primary" disabled title="Billing provider and prices are being configured">
                <LockKeyhole size={16} /> Checkout coming next
              </button>
            )}
          </section>
        </div>

        <p className="pricing-note">Generation credits reset each billing period and do not roll over. Erudoza never advertises unlimited AI usage.</p>
      </div>
    </AppShell>
  );
}
