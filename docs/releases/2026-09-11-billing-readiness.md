# Billing readiness audit — September 11, 2026

> Historical September 11 recovery record, preserved during September 12 branch consolidation. Later evidence and instructions in [AGENT_PROGRESS.md](../AGENT_PROGRESS.md) supersede pending states and older tracker requirements here. This record grants no new operational authorization.

Status: local billing and targeted release contracts pass; public release and paid activation remain gated. No hosted readiness claim is made.

Owner: Codex billing/release audit worker. Candidate baseline: `d7f6a70504fd1665a925fcfe211ae09ba4f92dbe`, branch `feat/public-release-readiness`. Scope is the [September release contract](2026-09-release-contract.md) and [commercial launch runbook](../COMMERCIAL_LAUNCH_RUNBOOK.md). The parent readiness checklist remains open.

## Changes and findings

- Corrected the commercial runbook's stale claim that Checkout already uses dynamic payment methods. The current source explicitly permits cards, and the four-offer transport regression enforces it. Historical sandbox evidence also states cards only. No payment-method behavior or SDK version was changed.
- Fixed the publication-proof contract wrapper to request `--test-reporter=tap` explicitly. Under Node 26.8.1, its child process otherwise prints the default spec format while the wrapper requires `# fail 0`. The failing full run had 453 passing contracts and this one wrapper failure despite all 39 inner checks passing; after the one-argument fix, all 454 contracts pass.
- Reviewed checkout authorization, current offer validation, customer binding, original consent, webhook signature verification, duplicate/reordered delivery, refund/dispute containment, recovery, cancellation, and deletion races. Existing regression coverage did not demonstrate a new billing defect requiring a source change.
- The checkout lock is independent of existing subscriber obligations. Signed lifecycle handling and restricted recovery must remain available even while acquisition is closed. The later read-only test inventory below does not establish outstanding Live subscriber obligations; those remain unknown.

## Verification

| Check | Result | Evidence and limits |
| --- | --- | --- |
| `npm run test:billing` | **26 passed, 0 failed, 0 skipped** | Actual tests ran outside the subprocess-restricted sandbox. Installed Stripe SDK transport is mocked; document transactions use local fixture storage. No Stripe-hosted transactions or PostgreSQL integration were exercised. Log: `/tmp/filosage-billing-readiness-tests.log`. |
| Targeted contract command below | **69 passed, 0 failed** | Local pricing, tier, release safety, environment, capability, and release-hardening checks. Loopback responses are fixtures, not production. Log: `/tmp/filosage-release-targeted-tests.log`. |
| `AZURE_CONFIG_DIR=/tmp/filosage-readiness-azure npm run test:contracts` | **454 passed, 0 failed** | Full contract suite, including local Bicep compilation, executed outside the subprocess-restricted sandbox. Installed Bicep v0.46.1 in isolated temporary tooling storage to match CI. Log: `/tmp/filosage-contract-readiness-tests.log`. |
| `npm run check:release` | **Failed closed, exit 1** | Current shell lacks required release environment values; no production environment or secrets were loaded. This validates no release configuration. |

Targeted command:

```sh
npx playwright test --config=playwright.contracts.config.ts \
  tests/release-scripts.spec.ts tests/release-hardening.spec.ts \
  tests/release-capabilities.spec.ts tests/billing-offer.spec.ts \
  tests/tier-consistency-contracts.spec.ts
```

The initial sandbox billing report showed only two passing file wrappers. A direct reproduction showed `spawnSync` returning `EPERM`, empty output, and misleading status zero. That report is superseded by the actual 26-test execution. The initial targeted contract result of 41 passed/28 failed was likewise superseded after allowing local child processes. These were execution-environment restrictions, not application fixes. Temporary logs are local session evidence, not durable hosted artifacts.

The initial full-suite collection was blocked by Azure CLI home logging and missing Bicep. Isolating its configuration and installing the repository-pinned compiler resolved those tooling blockers. A presence-only scan found no non-template `.env*` files at the root of either this worktree or the original Filosage checkout. Required shell variables were absent; no secret values were displayed or changed.

## Remaining production inputs and gates

1. Supply and review the intended production environment through the deployment secret/configuration store: canonical origin, database, Azure identity/storage/resource settings, OpenAI credential, owner identity and migrated UID, activity and identity-link secrets, explicit authentication/capability flags, independently monitored operations alert destination/signing secret, and exact candidate SHA/digest expectations. The ordinary release check requires checkout closed. This session did not inspect secret values.
2. Before paid activation, verify `BILLING_PROVIDER`, a least-privilege Live Stripe credential, endpoint signing secret, explicit Portal configuration, all four unique current Price IDs, and any legacy mappings. Verify product amounts/intervals, restricted Portal destinations, immediate `always_invoice` changes with unchanged anchor, and period-end cancellation in Stripe. Store credentials in the platform secret store; never paste them into this report.
3. Verify Stripe Tax registration and actual calculation behavior before asserting `STRIPE_TAX_READY=true`. A configuration flag alone is not evidence of active registration or tax collection. No tax setting was changed.
4. Review the exact hosted operator name, business address, governing jurisdiction, support address, Terms, Privacy Notice, age/residency acknowledgements, renewal and refund disclosures. Existing runbook legal-review gates remain open.
5. Execute the current candidate's complete Stripe test-mode lifecycle matrix, including four offers, all plan/interval transitions, failure and recovery, refunds/disputes, replay/reordering, and real signed-in account deletion. Retain redacted event IDs, account outcomes, timestamps, and reviewer. August 11 evidence is historical and explicitly left lifecycle-email delivery, complete app deletion, and four-offer coverage open.
6. Prove receipt, renewal, failure, refund, and cancellation message delivery; current monitored support/privacy inboxes; suppression/unsubscribe behavior; and support escalation ownership. This session sent no messages.
7. Complete the broader base-release gates: exact-artifact hosted health/authentication, real non-owner learner journey and reviewed flagship, PostgreSQL restore rehearsal, monitored alerts, remaining repository/CI checks, and unresolved high-risk report disposition. Parent work coordinates application verification.
8. Obtain the separate owner decision for deployment and billing activation. Only then use the runbook's activation validation and approved canary cohort before broad opening. No activation command with live configuration was run.

## Read-only hosted follow-up (September 11, approximately 06:14–06:18 UTC)

Authenticated Azure and Stripe access became available after the local audit. Missing local configuration is **not** evidence that hosted settings are absent. The following findings come from filtered current provider reads, with no secret values displayed or exported.

| Surface | Current observation |
| --- | --- |
| Staging application | `filosagestg-app` in `filosage-staging-central-rg`; host `filosagestg-app.salmontree-eb10220f.centralus.azurecontainerapps.io`; canonical site `https://filosage.com`. Healthy green revision `filosagestg-app--green-93f60f24-1` receives 100% traffic; healthy blue predecessor receives 0%. |
| Staging artifact | `SITE_VERSION=93f60f24afe59b19b6a592f455a09e8e813f1f84`; image digest `sha256:0c006852322a91d5e2540cfd27ab58e47dad33a3a1f793fd6afc1e2240bbadf2`. This is different from the local candidate baseline. |
| QA application | `filosageqa-app`, same resource group; healthy revision `filosageqa-app--qa-93f60f24-1`, 100% traffic; same site version, image tag `93f60f24afe59b19b6a592f455a09e8e813f1f84`. A single bounded public billing-status GET timed out; Azure configuration retrieval succeeded. |
| Billing flags | Both traffic-serving revisions explicitly set `BILLING_PROVIDER=stripe` and `BILLING_ENABLED=false`. Neither contains `BILLING_ROLLOUT_MODE`, `STRIPE_TAX_READY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `STRIPE_PORTAL_CONFIGURATION_ID`. |
| Existing hosted configuration | Database, OpenAI, activity-receipt and identity-link secrets have secret references. Staging has four Price IDs and nonempty legal disclosure/support fields. QA has support configured but lacks all four Price IDs and the three legal disclosure fields. Presence does not verify values or delivery. Neither active target contains operations-alert URL/signing-secret variables. |
| Authentication flags | Both explicitly enable Easy Auth, Direct Google, External ID, and External ID new accounts. These reads do not prove hosted login acceptance. |
| Staging public billing status | GET returned HTTP 200 with `provider=stripe`, `enabled=false`, `ready=false`, `checkoutReady=false`, `managementReady=false`. Thus existing subscription management is not ready on this host. |
| Stripe account, current test CLI context | `acct_1TtgXPRANh4Mnfma` reports charges/payouts enabled and details submitted; no currently due, past-due, or pending-verification requirements; `company.vat_id` appears eventually due. This does not validate Live catalog, tax registration, or app integration. |
| Test inventory | Complete first pages (`has_more=false`): three Products, six Prices, one Portal configuration, one webhook endpoint. All returned inventory objects report `livemode=false`. No Live-mode request was made. |
| Test Portal | `bpc_1U3IeTRANh4MnfmaLznIDMaq` active/default, payment-method updates enabled, cancellation at period end. Subscription updates are disabled, allowed update list empty, proration `none`; it cannot satisfy the approved immediate plan/interval-change policy. |
| Test webhook | `we_1TwvPERANh4MnfmaMqTXoDI5`, enabled, API version `2026-06-24.dahlia`, still targets `https://previous product.com/api/billing/webhook`. Subscribes only to Checkout completion and subscription create/update/delete. Invoice, refund, dispute, pause, and resume events required by current source are absent. |

The extra active `previous product Pro` Product (`prod_Uwozz62sD5OYR3`) contains two older Prices. The runbook explicitly excludes legacy sandbox Products from plan-change destinations; the August 11 evidence documents historical sandbox lifecycle work. No exact Product-ID ownership record was found in those documents, so its legacy role is an inference from its name/catalog position, not a new ownership claim. It was not renamed, disabled, deleted, or selected for the proposed Portal catalog.

## Reviewable next stage — TEST integration only, not executed

Recommended next decision: authorize the specific Stripe **test-mode** and isolated QA integration work below while keeping new checkout closed. This is a separate provider/secret/deployed-configuration action under `AGENTS.md`; this audit did not perform it. The staging app's canonical site is public `https://filosage.com`: leave it unchanged. Target only `filosageqa-app.salmontree-eb10220f.centralus.azurecontainerapps.io`, with its canonical/expected origins configured coherently for the isolated rehearsal. The QA billing-status GET timed out, so QA reachability and exact-candidate health must be verified before any provider delivery or lifecycle test.

1. **Prepare a separate Filosage TEST webhook endpoint** at `https://filosageqa-app.salmontree-eb10220f.centralus.azurecontainerapps.io/api/billing/webhook`, the proposed isolated QA canonical origin plus the implemented route. Leave the legacy `previous product.com` endpoint unchanged until its obligations are understood. Use the event schema/version matching the reviewed deployed candidate/SDK, verify it in test delivery, and bind only the new endpoint's signing secret to QA. The exact source-handled event set is:

   ```text
   checkout.session.completed
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   customer.subscription.paused
   customer.subscription.resumed
   invoice.paid
   invoice.payment_failed
   invoice.finalization_failed
   invoice.payment_action_required
   invoice.marked_uncollectible
   invoice.voided
   charge.refunded
   charge.dispute.created
   charge.dispute.closed
   ```

2. **Prepare a new dedicated Filosage QA TEST Portal configuration** using the existing current four-offer sandbox Prices below. Set subscription updates enabled, `default_allowed_updates=[price]`, `proration_behavior=always_invoice`, `billing_cycle_anchor=unchanged`, and immediate plan/interval transitions. Set cancellation enabled, `mode=at_period_end`, reason collection enabled; preserve payment-method updates and invoice access. Set the return URL to `https://filosageqa-app.salmontree-eb10220f.centralus.azurecontainerapps.io/pricing`, matching the source. Leave the existing default Portal configuration unchanged. Do not include the historical `previous product Pro` Product. The policy is specified in the [approved hosted-management spec](../superpowers/specs/2026-08-25-hosted-stripe-subscription-management.md); the source opens this explicit Portal configuration and requires signed paid reconciliation before changing access.

   | Offer | Published price | Proposed existing TEST Price | TEST Product | Current staging Price (absent from complete TEST inventory) |
   | --- | --- | --- | --- | --- |
   | Plus monthly | USD 9.99/month | `price_1U3IHgRANh4Mnfma7uZ4ZK48` | `prod_V3P5lUmdV84hAD` | `price_1U2w6mRANh4MnfmaGEAWN8ot` |
   | Plus annual | USD 79.92/year | `price_1U3IHgRANh4MnfmaokQtt2UU` | `prod_V3P5lUmdV84hAD` | `price_1U2w6tRANh4MnfmaAPBkbZbc` |
   | Pro monthly | USD 14.99/month | `price_1U3ISmRANh4MnfmaXB43bIPd` | `prod_V3PHOuGhxqbr7z` | `price_1TwwCbRANh4MnfmaUIzqyAgu` |
   | Pro annual | USD 119.88/year | `price_1U3ISnRANh4Mnfma2NQiLega` | `prod_V3PHOuGhxqbr7z` | `price_1TwwDYRANh4MnfmaSObWCWRD` |

   These test Prices are active, USD, recurring with interval count one, and match current source amounts. Before selecting them for the dedicated QA Portal, verify the approved `tax_behavior=exclusive` and product tax classifications; those fields were not included in this read-only inventory. If immutable tax behavior differs, the proposed QA setup must create dedicated test Prices instead of changing historical Prices. Their Product labels are `Filosage Sandbox Lifecycle Evidence` and `Filosage Pro Sandbox Lifecycle Evidence`; they are appropriate for a clearly labelled test rehearsal, not customer-facing Live branding. Current staging Price IDs cannot be assumed Live merely because test inventory does not contain them.

3. **Bind isolated QA TEST integration inputs** through secret references: `STRIPE_SECRET_KEY` (least-privilege test credential), `STRIPE_WEBHOOK_SECRET` (new test endpoint). Set nonsecret `STRIPE_PORTAL_CONFIGURATION_ID` to the new test Portal configuration and populate QA's four `STRIPE_*_PRICE_ID` mappings with the approved test IDs above. Explicitly keep `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, `STRIPE_TAX_READY=false`, and `BILLING_PROVIDER=stripe`. Do not use `configured` rollout for test credentials: the release checker intentionally requires Live credentials for that state. Set QA `NEXT_PUBLIC_SITE_URL` and deployment validation `EXPECTED_SITE_ORIGIN` to `https://filosageqa-app.salmontree-eb10220f.centralus.azurecontainerapps.io`; ensure reviewed authentication callbacks, candidate origin, and return URLs match this isolated target. Supply QA's missing `LEGAL_OPERATOR_NAME`, `LEGAL_BUSINESS_ADDRESS`, and `GOVERNING_JURISDICTION` from already approved public disclosures; verify existing QA `SUPPORT_EMAIL`. Do not alter public staging values. Operations-alert URL/signing-secret bindings remain an additional readiness task requiring an approved monitored destination.

4. **Verify the approved exact candidate and test integration** after an explicitly approved QA deployment/configuration change: QA health is reachable and matches the approved artifact; QA billing status remains checkout-closed; authenticated recovery/Portal binding works; signed test webhooks reach the correct revision and reconcile fixture accounts; every transition, failed payment, refund/dispute, and deletion scenario has retained redacted evidence. Creating test customers, events, or sessions for this rehearsal requires the next-stage authorization. No unrestricted acquisition or paid activation is included. A full new-purchase UI rehearsal requires an approved isolated test harness; keeping the checkout lock closed does not prove that journey.

Minimal remaining sequence: approve and configure the scoped test integration; run exact-candidate hosted lifecycle, email, and learner acceptance; close legal/tax/operations gates; separately review Live configuration and canary activation. Neither local tests nor this account inventory closes those gates.

## Current official guidance reviewed

Stripe's [webhook guidance](https://docs.stripe.com/webhooks) requires raw-body signature verification and describes retry handling; the local lifecycle tests exercise signature rejection and replay. The [go-live checklist](https://docs.stripe.com/get-started/checklist/go-live) distinguishes production configuration from test-mode validation. These documents were retrieved on September 11, 2026.

Stripe recommends [dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods), which requires removing explicit method selection. This is a future configuration/fulfillment change for this candidate, not a reason to silently broaden its tested card-only scope. See [recurring-payment tax guidance](https://docs.stripe.com/billing/taxes/collect-taxes) for the separate tax setup. The Stripe documentation CLI was attempted first but could not initialize because it tried to chmod its read-only home configuration; official web documentation was used as fallback.

## Operational handoff

Multica item: unavailable; use parent recovery sync key `filosage-public-release-2026-09-11`. No item ID, queued event, or delivery is fabricated. Owner: Codex for local audit, Victor for hosted changes and launch decisions. Local and read-only hosted audit documentation is ready for parent review; full release status remains blocked on the gates above. Parent owns the recovery ledger. Commit: none. Push: none. Deployment or configuration mutation: none. Billing activation: none. Hosted verification: filtered Azure/Stripe test inventory and staging billing-status reads only; no full production acceptance.
