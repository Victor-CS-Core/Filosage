# Hosted subscription readiness

Status: proposed configuration and outstanding proof, September 11, 2026. No Stripe or Azure settings were changed. The local and disposable PostgreSQL lifecycle tests are not a completed hosted subscription journey.

## Observed configuration

The four active Live prices match Plus $9.99/month or $79.92/year and Pro $14.99/month or $119.88/year, in USD with exclusive tax behavior. The existing webhook is enabled at `https://filosage.com/api/billing/webhook` with the expected lifecycle events. Its presence does not prove successful delivery.

The active default Portal configuration `bpc_1U2xj2RANh4Mnfmah5qcy8AY` allows period-end cancellation, invoice history and payment-method updates. Subscription changes are disabled, with no allowed update fields. Terms and privacy links are unset. The deployed app has billing disabled and lacks the reviewed Portal configuration and tax-ready flags.

Stripe Tax's active-registration query returned an empty list. Victor reports approved tax information; this observation does not establish what was approved or whether a registration is required. Obtain the applicable tax-readiness evidence before changing the application's tax gate. Do not repeat business onboarding or infer a legal tax obligation from this API response.

## Reviewable Portal change

`2026-09-11-stripe-portal-proposal.json` records the exact proposed Live update: enable price-only changes among the four current prices, request immediate prorated invoices and an unchanged billing anchor, and add the existing public legal URLs. Current cancellation, reason collection, invoices and payment-method settings remain in place. The payload was checked against installed Stripe 22.5.0 configuration types. It has not been applied or verified against a hosted Portal session.

The application uses the installed SDK's API default. New subscriptions on API versions from September 30, 2025 default to flexible billing mode. Historical classic subscriptions may reset their anchor when changing monthly/annual intervals even when an unchanged anchor is requested. The sandbox matrix must inspect the actual subscription mode, invoice, prorated amount and next renewal date; an API setting alone cannot prove what the customer sees. Do not migrate existing subscriptions or promise unchanged dates without that evidence. See Stripe's [default-mode change](https://docs.stripe.com/changelog/clover/2025-09-30/billing-mode-default-flexible) and [billing-mode comparison](https://docs.stripe.com/billing/subscriptions/billing-mode/compare).

## Remaining acceptance

Use an isolated candidate runtime and Stripe test-mode objects for the full matrix in `docs/COMMERCIAL_LAUNCH_RUNBOOK.md`. Cover all four initial purchases, immediate Plus/Pro and interval changes, failed-payment recovery, cancellation and resumption before period end, expiry, duplicate/out-of-order signed events, and preservation of course data after reduced access. Confirm the selected lesson survives signup and subscription return paths. Record redacted object/event IDs, exact app SHA, observed account access, invoice/renewal dates and reviewer; never record card data, secrets or private learner content.

Before Live activation, bind the candidate to passing CI and hosted release evidence, verify current disclosures and operational gates, resolve tax readiness, and re-read the Portal/price configuration. Victor must approve the concrete production changes. Deploying code with billing closed, approving a Portal configuration, and enabling new paid checkout are distinct actions. None has been performed in this pass.
