# Filosage security and legal readiness

Updated: 2026-08-03

This document is an engineering and launch-readiness record, not legal advice.

## Controls implemented

- Firebase ID tokens are verified server-side before account access, and authorization is repeated at each protected API route.
- Browser Firestore access is denied; privileged database access remains server-side.
- Public course and lesson responses use explicit data-transfer objects. Internal user IDs, topic keys, service timestamps, and author profile URLs are not returned.
- State-changing JSON requests require an allowed origin, `application/json`, and an endpoint-specific body limit.
- Progress totals are validated so correct answers and attempts cannot exceed their logical bounds. Non-owner Plus and Pro authors must also present short-lived HMAC-signed activity receipts bound to their user, course, lesson, and quiz before a lesson can unlock the next generation step.
- AI course, lesson, and tutor inputs use moderation. Generated course and lesson content is moderated before storage. Requests include a pseudonymous OpenAI safety identifier.
- AI generation uses per-plan quotas, per-minute limits, active-request locks, idempotency keys, and a global monthly budget. Other public and authenticated mutation endpoints use Firestore-backed global and per-client or per-account limits shared across Worker instances.
- OpenAI Responses requests disable application-state storage. Direct AI interactions and AI-assisted course or lesson content are visibly identified and include machine-readable disclosure attributes.
- Mermaid output is parsed and sanitized before insertion into the document.
- Response headers include nonce-based CSP, HSTS on pages, APIs, and hosted assets, clickjacking protection, MIME sniffing protection, a restrictive permissions policy, and cross-origin isolation controls compatible with Google sign-in.
- `/api/health` performs a live Firestore probe. Critical datastore and verified billing-event failures can be sent to an operator webhook with sanitized metadata and an optional HMAC signature.
- Managed Firestore export and guarded import scripts support backups and recovery drills. Restore is dry-run by default and requires both `--apply` and the exact project ID.
- The production and full installed dependency graphs reported zero known npm audit vulnerabilities on the date above.
- Signup and future terms updates use an affirmative, versioned acceptance record for the registrant's stated age eligibility and, where applicable, stated guardian review. This is not independent age assurance or verified guardian consent. Guests can inspect published topics and course outlines; lesson bodies require an accepted free account.
- Signed-in non-owner users can export their account data and permanently delete their active account data after recent Google reauthentication. The deletion route independently enforces a five-minute Firebase `auth_time` window on the server; the client reauthentication prompt is not the security boundary. Owner deletion requires a manual course-control transfer or shutdown process.
- A published Copyright Policy defines notice, counter-notice, review, removal, and an adopted repeat-infringer termination procedure. Content reports and owner enforcement actions preserve the operational record used to apply it. The app does not claim DMCA safe-harbor registration that has not been completed.
- Optional first-party product analytics are off until the visitor makes a choice. Refusal and later withdrawal remove Filosage's optional browser identifiers; the choice remains available in the Privacy Center.
- Browser telemetry accepts only coarse anonymous discovery events. Signed-in learning events are rebound to the verified Firebase UID, while signup, waitlist, moderation, checkout, and subscription events are recorded only by the server route that performs the underlying action.
- Multiple independent serious content reports escalate to owner review and operational alerting; learner reports alone cannot automatically unpublish a course.

## Automated account export and deletion boundary

- The JSON export includes the account profile, preferences, notes, lesson activity, course progress, learning outcomes, mastery evidence, versioned legal acceptances, billing-consent snapshots and current checkout intent, authored courses and lessons, AI usage/request/budget records, engagement summary, pricing intent, account-linked product events, referral-code ownership, safety summary/events, content reports, and owner enforcement actions targeting the account.
- Automated deletion removes active learning and authoring data, lesson-activity records, the current checkout intent, engagement summaries, pricing intent, referral-code ownership, account-linked product events, AI usage/request/budget records, the waitlist entry for the account email, and the active account document.
- Versioned legal-acceptance and completed billing-consent records are retained only as reasonably needed to document consent or authorization, resolve disputes, and meet legal obligations. Safety cooldowns/events, content reports, and owner enforcement records are retained only as reasonably needed to prevent abuse, preserve report integrity, enforce the service rules, and resolve legal claims. These retained categories remain visible in the user's pre-deletion export.
- Stripe or another disclosed payment processor may retain customer, subscription, invoice, refund, dispute, and transaction records for applicable tax, accounting, fraud-prevention, and consumer-protection periods after Filosage cancels the active subscription. Billing consent remains associated with the internal account identifier for that limited purpose; it is not active profile or marketing data. The automated deletion response identifies this retention boundary.
- The automated export refuses to return a silently truncated result. If a bounded collection exceeds the supported automated export size, the request fails and must be completed through the verified manual privacy-request process.

## Before enabling Stripe or another paid checkout

1. Have a licensed attorney review the Terms, Privacy Notice, and Acceptable Use Policy for the operator's actual entity, state/country, target markets, tax posture, and dispute strategy.
2. Replace the generic operator wording with the formal legal entity or individual operator name, business address, and governing jurisdiction. Decide with counsel whether arbitration or a class-action waiver is appropriate; none is included now.
3. If seeking US DMCA safe-harbor protection, designate and register a copyright agent with the US Copyright Office and publish the agent's full required contact information. The in-app policy and mailbox alone do not complete registration.
4. Monitor `legal@erudoza.com` for legal notices, copyright notices, and privacy requests, and monitor `support@erudoza.com` for account, product, moderation, and billing help. Exercise the identity-verification, deletion, export, counter-notice, and repeat-infringer workflows.
5. At checkout, capture an immutable subscription-consent record containing the displayed price, currency, interval, trial terms, renewal terms, offer version, timestamp, and user ID.
6. Verify Stripe webhook signatures, enforce event idempotency, handle failed payments, and make the Stripe customer portal or an equivalent in-app cancellation control available immediately.
7. Send purchase confirmations and any legally required trial, renewal, annual, or price-change reminders. Keep cancellation available online at will and at least as easy as signup.
8. Keep the current optional first-party analytics behind affirmative consent, recheck the cookie/storage inventory before each analytics change, and complete a jurisdiction-specific review before adding any third-party analytics or marketing technology.
9. Execute and retain data-processing agreements with vendors. Review international-transfer terms, any required EU representative, and US state privacy-law thresholds as the business and target markets grow.
10. Commission a professional accessibility audit, including keyboard, screen-reader, zoom, contrast, reduced-motion, and mobile Safari testing, against the current WCAG target.
11. Establish an incident-response process, credential rotation schedule, audit-log retention rules, dependency monitoring, and a security contact.
12. Review OpenAI data controls for Modified Abuse Monitoring or Zero Data Retention eligibility if the product later handles more sensitive learning material.

## Known residual risks

- The CSP permits inline scripts because the current statically optimized Sites build uses an inline theme bootstrap. A nonce-based CSP would require dynamic rendering and should be evaluated with the hosting architecture rather than applied piecemeal.
- AI moderation reduces abuse but cannot guarantee that every unsafe or inaccurate output is detected. Pro authors may publish only after server-verified sequential lesson completion, attestation, and a fresh automated publication review; the owner retains platform-wide quarantine, unpublish, and deletion control.
- Provider security logs, abuse-monitoring records, backups, consent records, and legally required records may outlive active account deletion under the disclosed retention rules.
- The owner account cannot be deleted automatically because doing so could orphan control of published courses. It requires a verified manual transfer or service-shutdown process.
- The formal operator identity, business address, governing jurisdiction, and registered DMCA agent are not yet available. Paid subscriptions are deliberately disabled, and the current service should not be marketed in a jurisdiction that requires undisclosed operator details before account use.
- Age eligibility and guardian review are self-attested rather than verified. The lowest-risk first commercial cohort is adults only until counsel approves the intended markets, age-assurance method, and any verifiable-parental-consent workflow.
- No commercial lifecycle-email provider or signed unsubscribe workflow has been verified. Do not send promotional or subscription lifecycle campaigns until delivery, suppression, unsubscribe, and required-notice behavior pass live acceptance tests.
- Exact retention periods, automated expiry jobs, deletion tombstones, and a resumable workflow for partially completed deletion have not been established. The current bounded export and deletion controls must be paired with an approved retention schedule before paid activation.
- Stripe lifecycle behavior has automated unit and route coverage but has not passed the complete test-mode and Live-configuration matrix in this runbook. Checkout remains closed.
- The present legal copy and engineering controls reduce exposure but do not establish compliance in every jurisdiction or replace advice from licensed counsel.

## Operational checks per release

- Run lint, production build, Sites build, end-to-end flows, npm audit, and a tracked-file secret scan.
- Test Google sign-in on desktop Chrome and mobile Safari, including return-to-app persistence.
- Verify public endpoints do not return `authorId`, email, service credentials, billing identifiers, or moderation details.
- Test cross-origin, wrong-content-type, oversized-body, malformed JSON, forged-progress, and quota-exhaustion responses.
- Verify the current Terms and Privacy versions shown in the UI match the versions stored by the acceptance endpoint.
