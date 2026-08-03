# Commercial launch runbook

This runbook prepares Erudoza for paid plans without opening subscriptions. The default and expected preparation state is `BILLING_ENABLED=false`.

## Closed-launch boundary

- Pricing preferences and launch-list consent are research signals. They do not create a Stripe customer, Checkout Session, subscription, invoice, or entitlement.
- The pricing-intent API is account-bound, server-authorized, rate-limited, body-limited, same-origin protected, and deduplicated by user ID.
- Checkout must remain unavailable until the payment provider is complete and the separate billing lock is enabled. The billing portal remains available to existing subscribers whenever Stripe account-management credentials are configured, even while new checkout is closed.
- The billing lock controls new checkout only. After any subscription exists, turning the lock off must leave signed webhooks, the customer portal, payment-state synchronization, and cancellation available for existing subscribers.
- Pro access during preparation remains owner-granted or allowlisted. It is not proof of a paid subscription.

## Owner launch gate

Do not enable billing until all of the following are true:

1. Production health checks pass against the intended release version.
2. Managed Firestore backups are configured and a restore rehearsal has been completed in a non-production target.
3. Critical operational alerts reach an independently monitored destination.
4. Stripe Live products, monthly and annual prices, webhook endpoint, customer portal, tax behavior, and statement descriptor have been reviewed.
5. The full lifecycle test matrix below passes with Stripe test objects.
6. The support address is monitored and the owner can access account, webhook, content-report, and audit evidence.
7. Required receipts, renewal notices, failed-payment messages, cancellation confirmations, unsubscribe handling, and suppression handling have a configured delivery provider.
8. Open high-risk content or safety reports are resolved.
9. Pricing-intent evidence is reviewed as directional research, not presented as conversion or revenue.
10. The owner makes a separate, explicit decision to change `BILLING_ENABLED` from `false` to `true`.

For an ordinary closed-billing release, set `SITE_VERSION` to the exact Git commit SHA and run `npm.cmd run check:release`; this check requires `BILLING_ENABLED=false`. After deployment, run `npm.cmd run check:production -- https://your-domain.example <exact-sha>` so a healthy datastore cannot mask a stale or unidentified build. Only after separate billing authorization, run `node scripts/check-release-env.mjs --billing-activation`; that mode requires the Stripe product, webhook, management, and checkout configuration plus `BILLING_ENABLED=true`.

## Course-generation release acceptance

Before deploying a course-schema or generation-prompt change, use production-like Firebase and OpenAI credentials to create one private flagship course through the user interface. Record the course ID, release SHA, models, reviewer, and test time without copying secrets or private learner text. The acceptance record must confirm:

1. The outline passes the current course quality gate and visibly advances one artifact through distinct milestones.
2. At least one generated lesson for each of the six teaching modes opens, reloads, preserves its draft, and stores meaningful active-lesson evidence at completion.
3. Author-provided references are labeled as provided, only references used by a lesson appear in its content record, and source-report submission reaches the owner queue.
4. Sequential authoring unlocks correctly, a private lesson can be regenerated without losing the current lesson on failure, and the final course can pass publication review.
5. The published course can be opened by a non-owner learner, completed through capstone evidence, unpublished, and returned to private authoring without exposing private source notes.

Fixture-backed Playwright coverage is necessary but does not satisfy this live acceptance gate.

## Payment lifecycle test matrix

Run these scenarios in Stripe test mode before any Live activation:

- Successful monthly checkout grants Pro once and records the subscription event once.
- Successful annual checkout maps to the annual price and correct renewal date.
- Duplicate and out-of-order webhook delivery remains idempotent.
- Invalid webhook signatures are rejected without changing account access.
- Failed or delayed payment moves the account to the expected recovery state without deleting learning data.
- Payment recovery restores access from a later valid webhook.
- Customer-portal cancellation stops future renewal and retains access through the paid period when appropriate.
- Immediate cancellation or refund behavior matches the displayed terms and applicable law.
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
- Confirm whether cancellation is immediate or effective at period end and whether access continues.
- Review refund requests against the displayed offer, Terms of Service, transaction history, product failure evidence, and applicable law.
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
