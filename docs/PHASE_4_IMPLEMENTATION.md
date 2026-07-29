# Phase 4 controlled launch and growth

Engineering status on 2026-07-28: controlled-launch foundation implemented. Billing remains independently disabled and no market gate is claimed as passed.

## Implemented

1. Account-bound referral codes are created server-side and stored separately from public URLs.
2. Evidence reports produce shareable course summaries with referral attribution while keeping private responses and the evidence ledger private.
3. First-touch analytics distinguish referral, partner, search, campaign, email, social, internal, and direct acquisition.
4. The owner dashboard measures referral links copied, referred visitors, referred course starts, referral conversion, active or trialing subscribers, past-due accounts, canceled accounts, and failed payment-webhook processing.
5. Learners receive an in-app seven-day report covering lessons studied, streak, first-try accuracy, demonstrated mastery, and corrected misconceptions. The report can be copied without exposing private answers.
6. Referral creation is authenticated, accepted-account only, same-origin protected, rate limited, collision checked, and returned with private no-store caching.

## Release boundaries

- `BILLING_ENABLED` remains `false`. This phase does not activate checkout.
- A referral link grants no entitlement and carries no trusted authorization data.
- Public analytics store the referral code and first-party actor identifier, not the referring learner's identity.
- Evidence sharing contains summary measurements and a public course link only. It does not publish learner responses, notes, private plans, or ledger records.
- Failed Stripe events remain visible for operator action and do not silently grant access.

## Evidence still required

- At least 5% activated-free-to-paid conversion after billing is separately authorized.
- Monthly voluntary churn below 7% after the first 50 paid subscribers.
- Refund and chargeback rates below 5% combined.
- Acquisition payback projected at six months or less.
- At least 30% of activated acquisition from organic, referral, or partner channels.
- Demand evidence selecting two additional flagship pathways.
- A configured transactional email provider and verified lifecycle-email consent, delivery, unsubscribe, and suppression workflows before lifecycle email is sent.

Engineering readiness does not satisfy these commercial gates. Paid acquisition must remain paused when conversion, retention, or support evidence does not meet the roadmap thresholds.
