# Hosted Stripe Subscription Management Specification

**Approved:** 2026-08-25 by Victor

**Policy choice:** Upgrades, downgrades, and billing-interval changes apply immediately with Stripe-managed proration.

**Release boundary:** Keep `BILLING_ENABLED=false`. Do not deploy, activate production billing, create a Live charge, or change secrets.

## Customer flows

1. New paid memberships continue through Filosage's authenticated Checkout route into branded Stripe-hosted Checkout.
2. Existing subscribers receive three explicit Stripe-hosted actions on `/pricing`:
   - `manage`: open the Customer Portal home for invoices and payment methods.
   - `change_plan`: open the Portal's `subscription_update` flow for the account's current subscription.
   - `cancel`: open the Portal's `subscription_cancel` flow for the account's current subscription.
3. Active and trialing subscribers may see all three actions. Payment-recovery subscribers retain the generic management and cancellation paths; Filosage does not promise plan switching while payment is delinquent.
4. Cancellation remains at the end of the current paid period and captures a Stripe cancellation reason.
5. A return from Checkout or the Portal never changes access. Signed Stripe webhooks remain authoritative for plan, interval, status, period end, cancellation, payment state, and course-credit reconciliation.

## Server contract

- The Portal route accepts exactly `{ "action": "manage" | "change_plan" | "cancel" }`; missing, additional, or unknown input receives `400`.
- All Portal actions require the existing accepted-account authentication, trusted-mutation, rate-limit, and no-store response contracts.
- Every Portal session uses the environment's explicit `STRIPE_PORTAL_CONFIGURATION_ID` and returns to `/pricing`.
- Deep-linked actions require the stored `billingSubscriptionId`. Before creating a session, Filosage retrieves that subscription and proves its Stripe customer matches the account's verified, metadata-bound customer.
- The selected subscription must resolve to exactly one currently supported Filosage Price. Legacy or foreign subscriptions cannot enter a deep-linked change or cancellation flow through Filosage.
- `change_plan` uses `flow_data.type=subscription_update`; `cancel` uses `flow_data.type=subscription_cancel`. Both redirect to `/pricing` after completion.

## Stripe-hosted configuration

- Test and Live each use an explicit active Customer Portal configuration with Filosage headline, default return URL, invoice history, payment-method updates, cancellation reasons, and at-period-end cancellation.
- Subscription updates allow only `price`, restrict the catalog to the intended Filosage Plus and Pro monthly and annual Prices, set `proration_behavior=always_invoice`, and keep `billing_cycle_anchor=unchanged`.
- Legacy sandbox products and prices are excluded from the Portal catalog.
- The four intended Prices use a consistent explicit `tax_behavior=exclusive`, matching the published USD amounts plus applicable tax. Once set, Stripe does not allow changing a Price between inclusive and exclusive behavior.
- `STRIPE_TAX_READY` remains false until active registrations, product tax classification, address inputs, and calculated results have been independently verified. Configuring Price tax behavior does not establish tax readiness.

## Verification and safety

- Repository behavior is implemented test-first and validated with focused contract/browser tests, TypeScript, lint, build, and diff checks.
- Test-mode hosted configuration may be mutated and inspected. Live hosted configuration may be prepared because Checkout remains locked and the account currently has no Live subscriptions; no Live customer, subscription, invoice, PaymentIntent, or charge may be created.
- A full app-to-Stripe sandbox lifecycle requires a signed test webhook delivered to a matching local or QA runtime. The existing stale sandbox endpoint is not evidence. If no approved reachable runtime exists, report that lifecycle proof as blocked instead of treating unit tests or Stripe-only objects as end-to-end proof.
