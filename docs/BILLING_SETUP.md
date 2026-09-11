# Billing activation contract

GoDaddy can provide the domain and hosting layer. It is not the recurring subscription ledger for Filosage. The application therefore keeps billing provider-neutral at the entitlement boundary and uses Stripe-compatible environment names for the eventual payment provider.

## Current state

- `BILLING_PROVIDER=none` keeps paid checkout disabled.
- `BILLING_ENABLED=false` is an independent activation lock and must remain false until the operational and legal launch gates are complete.
- `/api/billing/status` exposes only non-secret readiness information and is always private and non-cacheable because canary readiness is account-specific.
- New `/api/billing/checkout` acquisition remains closed until separate paid activation. Stripe API readiness, signed-webhook readiness, and Portal readiness are independent; missing Portal configuration blocks Portal sessions while signed webhooks and direct account-deletion cancellation continue with their own credentials.
- `/api/billing/webhook` verifies Stripe signatures, claims events transactionally, and refreshes current provider state under a durable subscription lease. Duplicate or stale deliveries cannot grant credits twice. A recognized offer transition requires the bound existing account/customer/subscription, immutable original Checkout consent, and a current paid invoice line for the target Price. Transition audits describe existing-subscription management authorization; Stripe events do not prove which Portal session caused a change. This code is not authorized for activation.
- New Checkout sessions explicitly permit only `card`; Dashboard-enabled delayed methods are outside the verified release scope.
- Verified suspended or stale-Terms subscribers may update payment methods through a restricted Portal flow or cancel. They do not need to accept new Terms for those recovery actions. Plan changes require an active account, current legal acceptance, and an active/trialing subscription.
- The candidate credit policy and outstanding owner decision are recorded in `docs/releases/R22-R23-report.md`.
- Stripe-hosted Checkout collects payment details; Filosage retains the reviewed card-only acquisition scope. Entitlement changes only after a verified, paid Stripe lifecycle event.
- Stripe-hosted Customer Portal remains available to existing subscribers whenever the management credential and reviewed `STRIPE_PORTAL_CONFIGURATION_ID` are configured, including when new checkout is locked for rollback or preparation.
- The application opens explicit hosted Portal flows for plan changes and period-end cancellation. It never updates entitlement from a Portal redirect; signed subscription and invoice webhooks remain authoritative.
- Paid access requires an active/trialing subscription and a valid, future verified period end. An expired, missing, or invalid boundary grants Free access until paid renewal is verified; provider status remains available for recovery and cancellation. Independent owner/manual entitlements still apply. A trial or scheduled cancellation can shorten this boundary. No additional webhook-outage grace period is assumed.
- Cancellation requires the account/customer/subscription ownership binding, but does not require its Price to remain in the current sales catalog. A recognized archived Price can continue to renew and reconcile cancellation; new purchases and plan changes still require active current Prices.
- The account response carries a non-secret `billingCancelAtPeriodEnd` flag. Pricing distinguishes scheduled cancellation from renewal, including Stripe flexible-mode `cancel_at` dates.

## Activation checklist

1. Preserve the owner-approved U.S.-only, age-18-plus, seven-day initial-charge and annual-renewal refund policy; confirm final prices, currency, taxes, and independent legal review before activation.
2. Start at `BILLING_PROVIDER=none`, `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, and `STRIPE_TAX_READY=false`. An ordinary code release must stay `closed`, or use `configured` only after the complete Live provider configuration exists.
3. Create matching Stripe products and recurring prices and configure `STRIPE_PLUS_MONTHLY_PRICE_ID`, `STRIPE_PLUS_ANNUAL_PRICE_ID`, `STRIPE_PRO_MONTHLY_PRICE_ID`, and `STRIPE_PRO_ANNUAL_PRICE_ID`. Give all four Prices the same explicit reviewed tax behavior. Enable only reviewed payment methods in Stripe's Dashboard.
4. Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the non-secret reviewed `STRIPE_PORTAL_CONFIGURATION_ID`, the Live webhook endpoint, and the public legal/support values. Keep `BILLING_ENABLED=false`.
5. Restrict that Portal configuration to the four current Filosage Prices. Enable price-only subscription updates with immediate `always_invoice` proration and an unchanged billing-cycle anchor. Keep ordinary cancellation at period end with reason capture, invoices, and payment-method updates enabled. Exclude legacy sandbox Products and Prices.
6. Verify Stripe Tax registrations, product tax codes, explicit Price tax behavior, customer address collection, and the resulting Checkout and prorated-invoice tax calculation. Only then set `STRIPE_TAX_READY=true`; this flag records completed verification and does not configure Stripe Tax.
7. Move to `BILLING_ROLLOUT_MODE=configured` while `BILLING_ENABLED=false`. Run the ordinary release check and confirm new Checkout remains locked while an existing subscriber can still open Stripe's portal.
8. Test successful and canceled hosted Checkout returns, all four immediate plan/interval changes and their prorated invoices, duplicate and out-of-order webhooks, renewal, failed payment and recovery, cancellation at period end, immediate account-deletion cancellation, refund, dispute, and hosted portal access. A return redirect never grants access.
9. Confirm every Checkout requires the current versioned age-18-or-older, U.S.-residency, and automatic-renewal acknowledgements and that the exact offer and legal versions are stored before redirecting to Stripe.
10. Publish the operator identity, business address, governing jurisdiction, consumer notices, and support process. Configure uptime and webhook-failure alerts, incident ownership, and a rollback procedure.
11. After a separate owner approval, configure one to 100 account UIDs in the server-only `BILLING_CANARY_UIDS`, set `BILLING_ROLLOUT_MODE=canary` and `BILLING_ENABLED=true`, then run `node scripts/check-release-env.mjs --billing-activation`. Do not expose the allowlist through public or client environment variables.
12. Retain canary lifecycle evidence. After a second explicit owner decision, change only `BILLING_ROLLOUT_MODE=open`; rerun the billing-activation check and exact-release verification before broader traffic.
13. To stop new sales, set `BILLING_ENABLED=false` and return to `configured` (or `closed` if readiness is no longer claimed). Keep Stripe webhooks and Customer Portal operational for existing subscribers.

The authoritative gate details and evidence matrix are in `docs/COMMERCIAL_LAUNCH_RUNBOOK.md`. Tax information may be owner-confirmed in Stripe, but activation remains blocked until it is independently verified and recorded with the other Live configuration evidence.
