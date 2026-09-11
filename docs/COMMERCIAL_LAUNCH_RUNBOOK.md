# Commercial launch runbook

This runbook prepares Filosage for paid plans without opening subscriptions. The default and expected preparation state is `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, and `STRIPE_TAX_READY=false`.

## Closed-launch boundary

- Pricing preferences and launch-list consent are research signals. They do not create a Stripe customer, Checkout Session, subscription, invoice, or entitlement.
- The pricing-intent API is account-bound, server-authorized, rate-limited, body-limited, same-origin protected, and deduplicated by user ID.
- Checkout must remain unavailable until the payment provider is complete and the separate billing lock is enabled. The billing portal remains available to existing subscribers whenever Stripe account-management credentials are configured, even while new checkout is closed.
- The billing lock controls new checkout only. After any subscription exists, turning the lock off must leave signed webhooks, the explicitly configured customer portal, payment-state synchronization, plan changes, and cancellation available for existing subscribers.
- Filosage uses Stripe-hosted Checkout to acquire subscriptions and Stripe's hosted Customer Portal to manage payment methods, invoices, immediate plan/interval changes, renewal, and period-end cancellation. Do not add an in-app payment-method form or custom subscription-management UI.
- Pro access during preparation may remain owner-granted or allowlisted. Plus or Pro stored billing state is not proof of payment without a verified Stripe lifecycle record.

Use the rollout states in order:

1. `closed`: no paid readiness claim and no new Checkout Sessions. `BILLING_ENABLED` must be `false`.
2. `configured`: Live Stripe catalog, webhook, legal, support, and tax readiness are locally complete, but new Checkout Sessions remain locked. `BILLING_ENABLED` must be `false`.
3. `canary`: new Checkout Sessions are available only to the explicitly approved account UIDs in the server-only `BILLING_CANARY_UIDS` allowlist. `BILLING_ENABLED` and `STRIPE_TAX_READY` must both be `true`.
4. `open`: new Checkout Sessions are available to all otherwise eligible signed-in accounts. `BILLING_ENABLED` and `STRIPE_TAX_READY` must both be `true`.

Every new paid Checkout requires the versioned age, U.S.-residency, and automatic-renewal acknowledgements. The server records those acknowledgements with the exact offer and legal-document versions before it creates or reuses a Stripe Checkout Session.

## Owner launch gate

Do not enable billing until all of the following are true:

1. Production health checks pass against the intended release version.
2. Managed Azure PostgreSQL backups are configured and a restore rehearsal has been completed in a non-production target.
3. Critical operational alerts reach an independently monitored destination.
4. Stripe Live products, monthly and annual prices, webhook endpoint, explicit customer-portal configuration ID and four-Price catalog, tax behavior, and statement descriptor have been reviewed.
5. The full lifecycle test matrix below passes with Stripe test objects.
6. The published billing-support address and `legal@filosage.com` privacy-request address are monitored, and the owner can access account, webhook, content-report, and audit evidence.
7. Required receipts, renewal notices, failed-payment messages, cancellation confirmations, unsubscribe handling, and suppression handling have a configured delivery provider.
8. Open high-risk content or safety reports are resolved.
9. Pricing-intent evidence is reviewed as directional research, not presented as conversion or revenue.
10. The owner makes a separate, explicit decision to change `BILLING_ENABLED` from `false` to `true`.

Paid activation also requires four public, owner-approved disclosure values in the release environment: `LEGAL_OPERATOR_NAME`, `LEGAL_BUSINESS_ADDRESS`, `GOVERNING_JURISDICTION`, and `SUPPORT_EMAIL`. The Terms and Privacy Notice render these values without committing a private address to source control. Missing values must leave the public documents in a paid-launch-pending state and must fail the billing-activation release check. The owner must review the exact rendered production text before activation; private Stripe identity verification is not a substitute for public customer-facing disclosure.

For an ordinary release, set `SITE_VERSION` and `EXPECTED_SITE_VERSION` to the approved full Git commit SHA, provide the reviewed manifest/auth/origin values described in `docs/RELEASE_CAPABILITIES.md`, and run `npm.cmd run check:release`; this check requires `BILLING_ENABLED=false` and permits only `closed` or fully ready `configured` rollout mode. After deployment, verify the QA candidate artifact and follow `docs/RELEASE_CAPABILITIES.md`: health checks require the full SHA, approved image digest, exact canonical origin, reviewed auth mode, and the capability manifest. Only after separate billing authorization, run `node scripts/check-release-env.mjs --billing-activation`; that mode requires the Stripe product, webhook, management, legal, tax, and checkout configuration plus `BILLING_ENABLED=true` and either `canary` or `open` rollout mode.

## Product release readiness register

Updated: 2026-08-25

This register is the consolidated source for unresolved release dependencies. The September 6 source reconciliation does not add CI or hosted acceptance. Historical checkmarks below retain their stated date; candidate-specific disclosures, inboxes, backups, health, and capabilities require fresh evidence. A routine closed-billing code release may continue while the broader operational and commercial items remain open, provided the exact release passes its technical checks and `BILLING_ENABLED=false`. Do not describe Filosage as operationally or commercially ready until the applicable gates below are complete.

### Current release-readiness execution checklist

This is the persistent outcome checklist for the August 25 release-readiness execution tracked in Multica as `FILOSAGE-35`. The detailed gates later in this runbook remain authoritative; an item below is complete only when its corresponding detailed gates have current evidence.

- [ ] Reconcile the exact release candidate across local `HEAD`, `origin/main`, CI, deployment source, hosted `SITE_VERSION`, and `/api/health`, then pass the full repository validation and security suite.
- [ ] Complete a non-production Azure PostgreSQL restore rehearsal and retain representative account, course, lesson, progress, publication, command-center, and entitlement evidence.
- [ ] Prove independently monitored operational alert delivery, signature verification, deduplication, escalation ownership, recovery notification, and external uptime monitoring.
- [ ] Pass signed-in Google, email, and linked-identity acceptance on an isolated runtime using the reviewed authentication mode.
- [ ] Prove monitored support/privacy inboxes, owner support and audit workflows, lifecycle-email delivery, bounce, unsubscribe, suppression, renewal, failed-payment, cancellation, and recovery behavior.
- [ ] Verify Stripe Live catalog, restricted branded Customer Portal, tax posture, webhook configuration, and the complete signed sandbox subscription lifecycle without creating any Live transactional object.
- [ ] Resolve open high-risk safety/privacy/content reports and collect owner or qualified-adviser approval for the exact legal, tax, retention, recovery, and public-disclosure decisions that cannot be inferred from code.
- [ ] Re-read every detailed gate below, retain a redacted release evidence packet, and obtain separate owner decisions for commit/push/merge/deploy and for any later change to `BILLING_ENABLED`.

### Current observed evidence — 2026-08-25

- Source provenance: local `HEAD` and GitHub `origin/main` both identify `859782450d8f7c2991f9eb1e45ebb82d1855afed`. The release-hardening candidate is still an uncommitted working-tree change set, so no candidate commit, push, merge, or deployment is implied.
- Hosted provenance: production and QA health checks pass while both report `SITE_VERSION=93f60f24afe59b19b6a592f455a09e8e813f1f84`. Both hosts are therefore behind the source baseline and this candidate. Their deployed billing-status response confirms `enabled=false`, `checkoutReady=false`, and `ready=false`, but predates the required `rolloutMode` field, so the strengthened release-safety check correctly fails until the exact candidate is deployed.
- Local candidate verification: contracts, API coverage, browser smoke coverage, Chromium, mobile Chromium, and the complete 35-test mobile WebKit project pass after correcting the WebKit rounding floor for 44-pixel lesson-section targets. Lint, TypeScript, production build, dependency audit, tracked-secret scan, and support-wiki validation also pass. Re-run the complete final command set after any later change.
- Azure data protection: Flexible Server `filosagestg-p4ujucgnxq3gs-pg` is Ready on PostgreSQL 16 with seven-day backup retention, earliest observed restore time `2026-08-19T23:49:00.309738+00:00`, geo-redundant backup disabled, high availability disabled, and public network access disabled. This observation was collected manually at `2026-08-25T21:43:12-04:00`; no current-schema recovery server or successful restore rehearsal exists.
- Azure monitoring: `filosage-console-fatal-errors` and `filosage-platform-failures` are enabled severity-1 scheduled-query rules targeting the Essential action group. This does not prove independent delivery, signed receiver behavior, deduplication, escalation, recovery notification, or external uptime monitoring.
- Delivery controls: current-head GitHub Actions are prevented from starting because of the GitHub account billing or spending-limit state, and `main` has neither branch protection nor a repository ruleset. Do not configure required checks until the account can execute the exact workflows to be required.
- Stripe boundary: intended Test and Live prices use exclusive tax behavior and Live has no subscriptions. Both Portal configurations still have plan changes disabled, the Test webhook still targets a retired product domain, and no Test or Live tax registration exists. Keep `STRIPE_TAX_READY=false` and do not create Live transactions.

### Required for every production code release

- [ ] Deploy the exact intended Git commit and confirm that `HEAD`, `origin/main`, the deployment source version, hosted `SITE_VERSION`, and `/api/health` all identify the same full SHA. On 2026-08-25, production and QA reported `93f60f24afe59b19b6a592f455a09e8e813f1f84` while local `HEAD` and `origin/main` reported `859782450d8f7c2991f9eb1e45ebb82d1855afed`, before the uncommitted candidate changes.
- [ ] Pass the release checks appropriate to the change: release environment, lint, production build, Sites build, proportionate end-to-end coverage, dependency audit, and tracked-file secret scan.
- [ ] Verify production health and complete focused smoke tests for every affected public, learner, owner, privacy, support, and billing-lock surface.
- [ ] Keep `BILLING_ENABLED=false` unless the owner separately approves billing activation after every paid-launch gate passes.

### Required before relying on production for valuable learner data

- [x] Confirm Azure PostgreSQL automated backups and seven-day point-in-time restore are configured for the production Flexible Server. Manual Azure read-back on 2026-08-25 found the server Ready with seven-day retention and earliest restore time `2026-08-19T23:49:00.309738+00:00`.
- [ ] Retain a current recovery-window observation with the server, earliest restore time, retention period, timestamp, workflow run, and operator. This metadata does not prove that a restore succeeds.
- [ ] Restore the latest Azure PostgreSQL backup into a separate non-production recovery server and verify representative account, course, lesson, progress, publication, command-center, and entitlement records. Never rehearse restoration against production.
- [ ] Approve a retention schedule covering backup retention, application records, audit evidence, consent records, support cases, deletion tombstones, and legally required holds.
- [ ] Establish a resumable process for partially completed account deletion and a verified manual owner-account transfer or service-shutdown procedure.
- [ ] Until these controls pass, treat production data as operationally under-protected and avoid collecting data whose loss cannot be accepted.

### Required before unattended or broader real-user operation

- [ ] Configure `OPERATIONS_ALERT_WEBHOOK_URL` to an independently monitored receiver that accepts Filosage's JSON alert envelope.
- [ ] Configure a cryptographically random `OPERATIONS_ALERT_WEBHOOK_SECRET`; the receiver must verify the hexadecimal HMAC-SHA256 value in `X-Filosage-Signature` before accepting an alert.
- [ ] Send and acknowledge a signed test alert, then verify deduplication, failure logging, escalation ownership, and recovery notification behavior.
  - Implementation evidence: `npm.cmd run test:operations-alert` sends the versioned HMAC envelope, requires a 2xx receiver acknowledgment, and records `operationalEvidence/alert-test-latest`. Configuration alone does not complete this checkbox.
- [ ] Configure an external monitor for `/api/health` at a one-to-five-minute interval, alerting after two consecutive failures and again on recovery.
- [ ] Confirm the support address is actively monitored and run a signed-in owner acceptance test for support intake, owner documentation, the content-report queue, command-center review-only drafts, and audit evidence on the exact hosted release.
- [ ] Configure a transactional email provider and live-test consent, required notices, delivery, bounce handling, unsubscribe, suppression, cancellation confirmation, renewal, and failed-payment messaging before sending lifecycle email.
- [ ] Verify backup and alert service-account permissions use the minimum required roles and that secrets are stored only in the hosted secret store.
  - Automation evidence: `.github/workflows/azure-backup-evidence.yml` is concurrency-locked, records only Azure's current managed-backup recovery window, and retains that observation for 90 days. It does not perform or prove a restore, and a current live run plus a separate non-production recovery rehearsal are still required before checking this gate.

### Required before paid activation

- [ ] Complete the entire payment lifecycle test matrix in this runbook with Stripe test objects and retain a redacted evidence record. The August 11, 2026 run is retained in `docs/STRIPE_SANDBOX_EVIDENCE_2026-08-11.md`: core Stripe lifecycle and support/legal inbox delivery passed, while lifecycle-email delivery and a real signed-in Filosage deletion remain open.
- [ ] Review Stripe Live products, monthly and annual prices, webhook endpoint, webhook signing secret, explicit customer-portal configuration ID and restricted four-Price catalog, immediate proration behavior, period-end cancellation, tax behavior, refund handling, statement descriptor, and historical-price lifecycle support.
- [ ] Establish the formal operator identity, business address, governing jurisdiction, required tax treatment, registered DMCA process or agent where applicable, and jurisdiction-specific legal review.
- [ ] Reverify current-candidate public disclosures. Historical August 11 completion: populate `LEGAL_OPERATOR_NAME`, `LEGAL_BUSINESS_ADDRESS`, `GOVERNING_JURISDICTION`, and `SUPPORT_EMAIL` with owner-approved public values and verify the exact hosted Terms and Privacy disclosure.
- [ ] Reverify current monitored inbox delivery. Historical August 11 completion: send and receive test messages through both the published `SUPPORT_EMAIL` billing-support inbox and the published `legal@filosage.com` privacy-request inbox. Owner-confirmed receiving-side screenshots were reviewed on August 11, 2026.
- [x] Record owner approval of the August 11, 2026 U.S.-only paid-plan policy: paid purchasers must be 18 or older; initial charges and annual renewals have a seven-calendar-day refund window; verified duplicate, unauthorized, or incorrect charges are corrected or refunded; other monthly renewals and partially used periods are non-refundable except as law or a written offer requires; ordinary cancellation is effective at period end; account deletion ends paid access immediately without automatically creating or waiving refund eligibility.
- [ ] Obtain independent Florida counsel review of the exact hosted Terms, Privacy Notice, refund/cancellation policy, age boundary, analytics/cookie inventory, and intended U.S. launch coverage. Owner approval and AI-assisted drafting do not satisfy this gate.
- [ ] Resolve all open high-risk safety, privacy, copyright, account-access, and content reports.
- [ ] Confirm that support can handle billing, cancellation, refund, privacy, copyright, and account-deletion cases with owner-visible evidence and escalation paths.
- [ ] Run `node scripts/check-release-env.mjs --billing-activation`, then require a separate explicit owner decision before changing `BILLING_ENABLED=true`.

### Evidence required before broad promotion or growth spending

- [ ] Complete 15-20 qualified customer interviews and satisfy the Phase 0 demand and acquisition thresholds.
- [ ] Produce the flagship pathway and three supporting courses with authoritative source packs, named review owners, review dates, and qualified expert review.
- [ ] Collect live usefulness and critical-error evidence, then observe full Day 7 and Day 28 retention windows with retained and churned learner interviews.
- [ ] Validate willingness to pay, activated-free-to-paid conversion, voluntary churn, refund and chargeback rates, support burden, contribution margin, acquisition payback, and organic or referral share with real cohorts.
- [ ] Keep paid acquisition and catalog expansion constrained until these evidence gates support the next investment.

## Course-generation release acceptance

Before deploying a course-schema or generation-prompt change, use production-like Azure and OpenAI credentials to create one private flagship course through the user interface. Record the course ID, release SHA, models, reviewer, and test time without copying secrets or private learner text. The acceptance record must confirm:

1. The outline passes the current course quality gate and visibly advances one artifact through distinct milestones.
2. At least one generated lesson for each of the six teaching modes opens, reloads, preserves its draft, and stores meaningful active-lesson evidence at completion.
3. Author-provided references are labeled as provided, only references used by a lesson appear in its content record, and source-report submission reaches the owner queue.
4. Sequential authoring unlocks correctly, a private lesson can be regenerated without losing the current lesson on failure, and the final course can pass publication review.
5. The published course can be opened by a non-owner learner, completed through capstone evidence, unpublished, and returned to private authoring without exposing private source notes.

Fixture-backed Playwright coverage is necessary but does not satisfy this live acceptance gate.

## Payment lifecycle test matrix

Run these scenarios in Stripe test mode before any Live activation:

- Confirm hosted Checkout presents only the currently supported card payment methods. The release candidate explicitly restricts Checkout to cards, and the billing transport tests verify that restriction for all four offers. Moving to Stripe's recommended dynamic payment methods requires reviewed provider configuration and separately tested asynchronous fulfillment before activation; Dashboard settings alone do not remove the current application restriction.
- Confirm automatic tax is enabled on every Checkout Session only after Stripe Tax registration and calculation settings are verified, and retain redacted evidence of the Live review.
- Confirm every new Checkout records the current eligibility version plus explicit age, U.S.-residency, and automatic-renewal acknowledgements with the selected offer snapshot.

- Successful monthly and annual checkout for Plus and Pro grant exactly the selected plan and record the subscription event once.
- Plus monthly, Plus annual, Pro monthly, and Pro annual are the only Portal plan-change destinations; legacy sandbox Products never appear.
- Every upgrade, downgrade, and monthly/annual interval change applies immediately, keeps the existing billing-cycle anchor, and produces the expected Stripe-managed prorated invoice before webhook reconciliation changes Filosage state.
- Every current or historical Stripe Price resolves to one plan, interval, and offer version; unknown or ambiguous prices leave access unchanged.
- Plus enforces one active owned course through direct API requests as well as the user interface.
- Pro-to-Plus and paid-to-Free downgrades preserve courses and existing publication state, block only newly restricted mutations, and expose the over-limit recovery path.
- Duplicate and out-of-order webhook delivery remains idempotent.
- Invalid webhook signatures are rejected without changing account access.
- Failed or delayed payment moves the account to the expected recovery state without deleting learning data.
- Payment recovery restores access from a later valid webhook.
- Customer-portal cancellation captures a reason, stops future renewal at period end, and retains access through the paid period when appropriate.
- Successful and canceled Checkout returns explain the outcome without granting entitlement from a redirect; paid access changes only after a verified Stripe event.
- Initial-charge and annual-renewal refunds within seven calendar days, non-refundable monthly renewals outside the stated exceptions, immediate account-deletion cancellation, and ordinary period-end cancellation all match the displayed terms and preserve an auditable Stripe/account record.
- A deleted account with an active subscription is blocked until the subscription is canceled or otherwise safely resolved.
- The billing master lock disables new checkout even when all Stripe secrets are present.

Record the test time, test customer, event IDs, observed account state, and reviewer. Do not store card data or secret values in the record.

## Support workflow

1. Classify the request as account access, learning state, content accuracy, safety, privacy, copyright, billing, cancellation, or refund.
2. Verify the requester using the minimum information needed. Never request passwords, one-time codes, full card numbers, or unnecessary identity documents.
3. Preserve relevant identifiers and timestamps in the private case record. Do not copy generated lesson text unless needed to investigate the issue.
4. Contain urgent harm first: pause access, unpublish content, or disable the affected capability when justified.
5. Resolve the underlying account, content, or payment state and record the owner action in the audit trail.
6. Reply with the outcome, any remaining learner action, and the next review point.

## Cancellation and refund handling after launch

- Direct users to the online billing portal for ordinary cancellation.
- Ordinary portal cancellation is effective at period end and preserves paid access through that period. Account deletion is a separately disclosed immediate cancellation that ends paid access.
- Approve a full refund for an initial paid charge requested within seven calendar days and for an annual renewal requested within seven calendar days. Correct or refund verified duplicate, unauthorized, or incorrect charges as required by law and payment-network rules.
- Treat other monthly renewals, partially used periods, unused time, and unused credits as non-refundable unless applicable law or a specific written offer requires otherwise.
- Record the decision, amount, payment reference, reason category, and reviewer without storing sensitive payment credentials.
- Escalate chargebacks, duplicate charges, unauthorized payment claims, and repeated billing failures for owner review.

## Incident containment

For a material payment, data, or account-access incident:

1. Keep or return `BILLING_ENABLED=false` to stop new purchases.
   Existing subscriber lifecycle processing and cancellation must remain online while new checkout is closed.
2. Preserve logs, event IDs, deployment version, and timestamps.
3. Confirm whether the incident affects checkout, entitlement, learning data, or all three.
4. Restore service from a known-good release or backup only after validating the target and recovery point.
5. Notify affected users and authorities when required, using verified scope and plain language.
6. Document cause, containment, correction, and prevention before reopening commerce.

## Evidence after launch

The first paid cohort must be treated as a controlled measurement period. Track real checkout conversion, voluntary churn, failed-payment recovery, refunds, chargebacks, support burden, contribution margin, referral acquisition, and learning outcomes. Do not replace measured outcomes with waitlist size or stated pricing intent.
