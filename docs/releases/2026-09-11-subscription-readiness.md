# Subscription readiness, September 11, 2026

Owner: billing agent; coordinator owns integrated release evidence, repository handoff tracking, provider configuration, and deployment. Branch: `codex/visitor-billing-20260911`. This work implements item J in `docs/AGENT_PROGRESS.md` and preserves the approved immediate prorated plan-change and period-end cancellation policy.

## Findings and fixes

| Finding | Reproduction | Result |
| --- | --- | --- |
| Stored active/trialing status granted paid access indefinitely after a missed expiry webhook | Actual account resolution returned Pro with an expired paid boundary | Paid access now requires a valid future verified boundary, shortened by an earlier trial/cancellation date. Missing/invalid boundaries give Free access. Provider status stays intact for billing recovery; manual and owner grants remain independent. |
| Cancellation depended on a currently sold Price | Actual Stripe SDK call path rejected cancellation after archiving the subscriber's Price | The customer/subscription/account binding remains mandatory; catalog validation applies to plan changes, not cancellation. |
| Archiving a recognized Price broke existing renewals and cancellation webhooks | Signed subscription update returned HTTP 500 for `price.active=false` | Existing subscriptions validate the recognized immutable offer independently of its sales availability. New Checkout and plan-change flows still require active Prices. |
| Scheduled cancellation was absent from the account response and pricing page | A flexible-mode `cancel_at` event did not expose a cancellation flag | Both cancellation forms produce a bounded access end and the optional boolean `billingCancelAtPeriodEnd`. The strict client parser accepts only a boolean; pricing shows cancellation rather than renewal. |
| Invalid stored dates disabled the entire account UI | Actual account API response failed the strict client parser | Invalid dates are omitted from the response while access falls back to Free, retaining billing recovery. |

The regressions above were observed failing before their fixes. The expiry rule introduces no undocumented grace period. During a webhook outage, a renewed customer whose previous verified period has elapsed temporarily has Free access until a paid renewal event is processed. Their Stripe management path and stored subscription identity remain available. Registered Free learners retain published learning access; lesson content is not made anonymous.

## Change impact

`account-server.ts` is the authorization source for request-time plans and downstream capabilities. `billing-lock.ts` now shares the period check with credit reconciliation, preventing a stale event from accruing paid credits after expiry. Account GET, the strict client parser, and `LearnerAccount` carry one additional optional non-secret boolean. The new client opts in with `X-Filosage-Account-Fields: billing-cancellation`; requests without it retain the prior response shape because old clients reject unknown fields. New clients accept old servers that omit the optional field. Existing consent, account-generation fencing, webhook HMAC verification, customer ownership, paid invoice-line verification, and acquisition flags are unchanged.

Known/recognized archived Prices remain manageable because [Stripe retains existing subscriptions when a Price is archived](https://docs.stripe.com/products-prices/manage-prices). Flexible cancellation uses `cancel_at` as described in [Stripe's portal integration guide](https://docs.stripe.com/customer-management/integrate-customer-portal). Unknown offers still cannot grant access through subscription synchronization.

## Local verification

- Baseline `npm run test:billing`: 26 passed.
- Updated `npm run test:billing`: 32 passed using the installed Stripe SDK for request serialization and webhook HMAC verification, with only HTTP transport mocked. File-store transactions execute normally. Covers all 16 source/target offer pairs, Checkout consent and replay, unpaid targets, renewals, failures/recovery, refunds/disputes, concurrent/reverse deliveries, deletion races, paid expiry, archived prices, cancellation, and account response parsing.
- Chromium `tests/pricing-mobile.spec.ts`: 4 passed, including keyboard checkout confirmations, 320px action wrapping, and scheduled cancellation in light/dark mode. Account/billing responses are local fixtures; no remote payment occurs.
- Chromium `tests/billing-lifecycle.spec.ts`: 25 passed, including canceled/success returns, finite reconciliation timeout, explicit portal actions, payment recovery with closed Checkout, and real local Plus course-credit API use.
- Relevant contracts: 51 passed across billing offers, tier consistency, course-credit/evidence policy, and account-storage contracts.
- TypeScript and focused Oxlint/ESLint passed. A TypeScript weak-type mismatch found during implementation was corrected. Git whitespace check passed.
- Browser harness owns loopback port 3250 and records a stopped marker during teardown. No background watcher is retained.

These results do not prove PostgreSQL concurrency, a hosted Stripe purchase, live webhook delivery, or production deployment. The integrated candidate still requires its repository release checks.

## Hosted/configuration gates

Coordinator's read-only Stripe inspection on September 11 found the live default portal supports period-end cancellation, invoices, and payment-method updates, but subscription updates are disabled. A live active-registration listing returned no Stripe Tax registrations. The deployed template also has acquisition disabled and lacks portal-configuration and tax-ready entries. These are coordinator-reported observations, not provider operations performed by this billing agent.

Owner-confirmed tax information is preserved as given; it is not treated as proof that Stripe Tax is collecting. No registration, tax setting, account secret, portal setting, live customer, purchase, invoice, or subscription was created or changed here. Resolve the exact provider/runtime configuration and execute the approved hosted lifecycle before claiming paid launch readiness. The existing candidate credit/payment semantics in `R22-R23-report.md` also need a recorded owner decision before activation.

## Handoff state

Independent source review checked account expiry, recovery, manual/owner grants, archived prices, cancellation ownership, and old/new client compatibility. It identified cancellation scheduled beyond the current paid period being mislabeled as cancellation this period; a failing signed-event regression reproduced it. The flag now applies only when cancellation is within the current period, preserving intervening renewals and never extending verified paid access. No other actionable findings were reported; the reviewer did not rerun the suites.

Coordinator owns final integration and overall outcome tracking. Multica is optional and is not an integration or release prerequisite. Commit/push status will be reported with the actual checkpoint hash. Deployment: none. Production purchase/subscription verification: not performed. Remaining approvals: live configuration, billing activation, and any deployment remain with Victor and the coordinator.
