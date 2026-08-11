# Billing activation contract

GoDaddy can provide the domain and hosting layer. It is not the recurring subscription ledger for Filosage. The application therefore keeps billing provider-neutral at the entitlement boundary and uses Stripe-compatible environment names for the eventual payment provider.

## Current state

- `BILLING_PROVIDER=none` keeps paid checkout disabled.
- `BILLING_ENABLED=false` is an independent activation lock and must remain false until the operational and legal launch gates are complete.
- `/api/billing/status` exposes only non-secret readiness information.
- `/api/billing/checkout` and `/api/billing/portal` fail closed until the provider integration is enabled.
- `/api/billing/webhook` verifies Stripe signatures, claims events transactionally, ignores duplicate and stale events, and resolves Plus or Pro only from one recognized plan/interval Price mapping. This code is not authorized for activation.
- Closed-launch Checkout explicitly accepts cards only. Do not enable Dashboard-managed asynchronous payment methods until their Checkout async-success and async-failure events have dedicated entitlement tests and handlers.

## Activation checklist

1. Preserve the owner-approved U.S.-only, age-18-plus, seven-day initial-charge and annual-renewal refund policy; confirm final prices, currency, taxes, and independent legal review before activation.
2. Create matching Stripe products and prices and configure `STRIPE_PLUS_MONTHLY_PRICE_ID`, `STRIPE_PLUS_ANNUAL_PRICE_ID`, `STRIPE_PRO_MONTHLY_PRICE_ID`, and `STRIPE_PRO_ANNUAL_PRICE_ID`.
3. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then keep `BILLING_ENABLED=false` while completing test-mode exercises.
4. Test successful checkout, duplicate and out-of-order webhooks, renewal, failed payment, cancellation at period end, immediate cancellation, refund, account deletion, and portal access.
5. Publish the operator identity, business address, governing jurisdiction, required consumer notices, and support response process.
6. Configure uptime and webhook-failure alerts, incident ownership, and a rollback procedure.
7. Activate with a separate explicit change to `BILLING_PROVIDER=stripe` and `BILLING_ENABLED=true`.
