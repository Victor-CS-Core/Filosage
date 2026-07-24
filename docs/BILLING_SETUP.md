# Billing activation contract

GoDaddy can provide the domain and hosting layer. It is not the recurring subscription ledger for Erudoza. The application therefore keeps billing provider-neutral at the entitlement boundary and uses Stripe-compatible environment names for the eventual payment provider.

## Current state

- `BILLING_PROVIDER=none` keeps paid checkout disabled.
- `/api/billing/status` exposes only non-secret readiness information.
- `/api/billing/checkout` and `/api/billing/portal` fail closed until the provider integration is enabled.
- `/api/billing/webhook` is intentionally not an entitlement writer yet; do not set the provider to `stripe` until signature verification and subscription synchronization are implemented and tested.

## Activation checklist

1. Create the Pro monthly product and price in the chosen payment provider.
2. Set `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_PRO_MONTHLY_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` in the deployment secret store.
3. Implement verified webhook handling for checkout completion, renewal, payment failure, cancellation, and subscription deletion.
4. Store provider customer/subscription IDs and make webhook updates idempotent.
5. Derive `ServerAccount.plan` from the synchronized subscription status, never from a client redirect or a browser-only flag.
6. Test successful checkout, duplicate webhook delivery, failed payment, cancellation at period end, immediate cancellation, refund, and account deletion.
7. Update the public pricing, Terms, Privacy Notice, refund policy, operator identity, currency, tax treatment, and support contact before accepting payment.

No price amount is hard-coded in the repository because the owner has not selected the commercial price yet.
