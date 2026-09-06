# R22/R23 — Existing-subscription lifecycle and recovery

Implementation candidate, September 6, 2026. Billing remains closed; no provider account was inspected or mutated. This report covers one bounded billing deliverable and depends on R04 account generation fencing plus R02 PostgreSQL verification.

## Outcomes

- API readiness requires Stripe provider/API configuration. Webhook readiness additionally requires the signing secret. Portal/management readiness additionally requires an explicit valid Portal configuration ID. Acquisition retains the separate closed/configured/canary/open activation gates; `BILLING_ENABLED=false` remains the release setting.
- New Checkout explicitly uses `payment_method_types=[card]`. The four Plus/Pro monthly/annual offers retain their published USD values. Dashboard-enabled delayed methods are not advertised as supported or proved.
- Verified suspended or stale-Terms accounts can use payment-method recovery and cancellation without accepting new Terms. Their management action opens the single-purpose `payment_method_update` flow with an application redirect. Change-plan sessions require current Terms, a nonsuspended account, and a current active/trialing Stripe subscription. Ordinary cancellation still uses the configured period-end Portal flow.
- Signed lifecycle processing refreshes subscription/customer/invoice state inside a durable lease, validates ownership and the exact recognized Price, and requires a paid invoice line covering the target offer before granting access. Unpaid target changes become payment recovery; a paid source invoice cannot purchase target access.
- Immutable `users/{uid}/billingTransitions/{eventId}` entries bind the original Checkout consent, account, customer, subscription, source/target Price, target plan/interval, current paid invoice, provider event, policy version, and observation time. The authorization basis is the approved management policy for a verified existing subscription. Stripe event data does not attest Portal-session provenance, so no session attribution or new purchase/Terms consent is invented. Returning to the original offer is audited too; original Checkout consent remains unchanged.
- Current provider reads, rather than event-second ordering, settle subscription state. Overlapping handlers contend on a durable lease and retry. A stale lease token or captured account generation cannot commit. Refund/dispute state is refreshed under that lease; holds persist through passive invoice events, with recovery verified against current provider state.
- The current account generation is captured before billing work and retained through provider awaits, consent writes, entitlement reconciliation, and product-event writes. New Checkout/subscription metadata carries that generation. R04's central fence remains the final write boundary.
- Account-deletion cancellation accepts a durable job ID, re-reads unknown cancellation outcomes, and verifies no owned live subscription/open Checkout remains. Late signed events use retained deletion job/tombstone ownership to contain provider billing without restoring user, credit, consent, or lease records.

The August 25 policy is preserved: immediate upgrades/downgrades/interval changes, Stripe-managed `always_invoice` proration, unchanged billing anchor, and cancellation at the end of the paid period. No Portal configuration mutation was performed or claimed.

## Explicit owner decision before paid activation

The following credit/payment semantics are candidate engineering defaults, **not a claim of prior owner approval**:

- Keep the existing monthly credit clock across interval changes; annual payment does not grant twelve allocations immediately.
- Plus allocates 2 and Pro 5 monthly; a paid upgrade only tops up the current period to 5. Downgrades apply the existing published cap of 24; Pro's cap is 60. A same-period downgrade/upgrade cannot repeat the top-up.
- An unpaid current target invoice suspends paid entitlement and freezes remaining credits. Same-period failure/recovery restores the ledger without another allocation. Later recovery supplies one current allocation and skips unpaid frozen-month backlogs; the existing twelve-month freeze expiry remains.
- Refund/dispute holds restrict paid access until verified recovery or a new paid invoice. Already redeemed course grants retain the existing application policy; no refund/deletion policy is invented here.

Victor/billing must approve or amend these remaining semantics before commercial activation. Current paid access is never inferred from a redirect or unpaid event.

## Evidence

- Read R22/R23 briefs, global release constraints, `AGENTS.md`, the installed Next route-handler guide, and the August 25 approved management specification.
- Readiness test first reproduced the missing independent API readiness (`undefined` instead of `true`). A differential replay of the original `85e9dec` subscription-sync implementation against the same signed/file fixture failed a paid Plus monthly-to-annual same-second transition (the account incorrectly remained monthly). These are regression evidence, not provider execution.
- Local Node 22 command: `node --experimental-test-module-mocks --conditions=react-server --import tsx --test tests/billing/lifecycle.test.mjs tests/billing/recovery.test.ts`. **15 tests passed locally.** The installed Stripe 22.5 SDK serializes API requests and validates HMAC-signed event fixtures; only its HTTP transport is mocked. The application document-store implementation and file transactions execute normally. Cases cover all 16 source/target offer pairs, all four Checkout offers and original consent, card restriction, payment failures/recovery, refund/dispute, cancellation, replay/stale/same-second and concurrent delivery, unknown Price/customer binding, independent readiness/signatures, restricted authenticated recovery, deletion containment and an in-flight generation fence.
- Local existing contracts: `npx playwright test --config=playwright.contracts.config.ts tests/pro-evidence-course-credits.spec.ts tests/billing-offer.spec.ts` — 16 passed.
- Local TypeScript, focused Oxlint/ESLint, and whitespace checks pass. These are local source checks; the complete integrated candidate must repeat its release gates.
- PostgreSQL mode uses R02 `createPostgresFixture()` only when `FILOSAGE_POSTGRES_TEST_URL` is explicitly supplied and validated. It requires the disposable loopback PostgreSQL 16 test role/database, applies the real schema, and uses the same signed Stripe scenarios against actual application transactions. No local PostgreSQL service is available; actual PostgreSQL execution is pending the integrated CI service lane. File-backed evidence is not PostgreSQL concurrency evidence.
- R04 `account-lifecycle.ts` is a separately owned dependency; billing imports its generation API. The root integrator retains R04's `withAccountRequest` wrappers when combining the Portal route changes. R04 also owns deletion inventory/export for the new transition and reconciliation collections.

Primary SDK documentation reviewed on September 6: [Portal deep links](https://docs.stripe.com/customer-management/portal-deep-links) (single-purpose flows hide other Portal navigation), [invoice line items](https://docs.stripe.com/api/invoice-line-item/object) (Price, subscription and covered period), and [Checkout payment methods](https://docs.stripe.com/payments/checkout/payment-methods). Stripe SDK 22.5 remains installed; no connector OAuth retry or private provider read was attempted.

## Release state

- Source/local verification: implemented and locally verified; integrated PostgreSQL and full-candidate CI remain gates.
- Hosted/signed Stripe Test-mode purchase lifecycle: **not performed**. OAuth is expired (`invalid_grant`); no approved API key, reachable candidate, or purchase budget was available. Mock transport fixtures are not live Stripe proof.
- Commit: local billing commit; root owns integration and push.
- Push/merge/deployment/production verification: not performed by this billing task.
- Topology: one Azure ContainerApp serves frontend+BFF; blue/green revisions, candidate initially at zero public traffic. No separate QA site or billing activation is introduced.
- Multica: parent release tracking remains authoritative when connected; no new Multica ID or queued event is claimed. Owner: billing lifecycle agent for this candidate, root for integration/push/CI, Victor/billing for unresolved credit/payment policy and paid activation. Status: review ready with the stated verification/commercial gates open.

## Follow-up: current invoice refresh wins over pre-lease hints

Root review identified ordinary payment snapshots crossing the reconciliation lease boundary. A new actual-SDK/file fixture reproduced a payment completing between the event's initial invoice read and the leased refresh: the prior code retained `unknown` and withheld paid access. Ordinary invoice hints are now discarded inside the lease; current invoice state is authoritative. Only a charge/refund/dispute re-read under that lease can supply an override. Durable restrictive holds remain intact. The targeted regression changed from failing (`unknown` instead of `paid`) to passing; the full billing fixture suite was rerun.

## Follow-up: a different invoice cannot release a dispute hold

Independent review reproduced a signed `charge.dispute.closed` event for old invoice A incorrectly releasing current invoice B's unresolved dispute. The permanent real-SDK/file regression first failed with `paid` instead of `disputed`. Recovery now requires evidence for the leased current invoice, a refreshed recovered dispute, and a refreshed charge with paid state. The event type supplies no recovery authority. A forged-stale `won` event payload also leaves a currently unresolved provider dispute restricted. The complete local billing suite passes **17/17**; TypeScript and focused lint pass. Actual PostgreSQL/hosted Stripe verification remains pending as described above.

## Follow-up: Checkout containment receipts survive account deletion

The integrated R04 fixture reproduced confirmed remote expiration leaving the existing Checkout claim `creating`, preventing deletion recovery. A restricted receipt now binds the original account generation, customer, deletion job, and exact existing claim. Confirmed expiration or owned subscription cancellation records `contained`; a fresh claim fenced before its first SDK creation records `not_created`. Unknown creation/expiration remains pending. A resumed stale claim is conservatively treated as potentially created, so a later pre-POST failure cannot erase an earlier unknown outcome. Missing or replaced claims are never recreated or overwritten.

Nine permanent race cases run against the real R04 lifecycle/store/deletion worker and actual Stripe SDK with mocked HTTP. They cover confirmed and uncertain expiration, completed Checkout cancellation, missing/replaced claims, fresh no-creation, unknown SDK creation, confirmed expiration after a lost response, and unknown creation followed by a fenced stale retry. In isolated `billing-containment` at root `f01cc15` plus billing source and the R04 `6d98c86` fence, the complete suite passes **26/26**. The Portal route in that verification checkout combines the billing changes with R04's `withAccountRequest` wrapper. TypeScript, focused lint, and whitespace checks pass. R04 fence commits remain separately owned; actual PostgreSQL and hosted provider execution remain pending.
