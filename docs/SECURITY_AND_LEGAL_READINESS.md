# Erudoza security and legal readiness

Updated: 2026-07-17

This document is an engineering and launch-readiness record, not legal advice.

## Controls implemented

- Firebase ID tokens are verified server-side before account access, and authorization is repeated at each protected API route.
- Browser Firestore access is denied; privileged database access remains server-side.
- Public course and lesson responses use explicit data-transfer objects. Internal user IDs, topic keys, service timestamps, and author profile URLs are not returned.
- State-changing JSON requests require an allowed origin, `application/json`, and an endpoint-specific body limit.
- Progress totals are validated so correct answers and attempts cannot exceed their logical bounds.
- AI course, lesson, and tutor inputs use moderation. Generated course and lesson content is moderated before storage. Requests include a pseudonymous OpenAI safety identifier.
- AI generation uses per-plan quotas, per-minute limits, active-request locks, idempotency keys, and a global monthly budget.
- Mermaid output is parsed and sanitized before insertion into the document.
- Response headers include CSP, HSTS, clickjacking protection, MIME sniffing protection, a restrictive permissions policy, and cross-origin isolation controls compatible with Google sign-in.
- Production dependencies have no known npm audit vulnerabilities as of the date above.
- Account creation and future terms updates use affirmative, versioned acceptance records. Public reading does not require acceptance.

## Before enabling Stripe or another paid checkout

1. Have a licensed attorney review the Terms, Privacy Notice, and Acceptable Use Policy for the operator's actual entity, state/country, target markets, tax posture, and dispute strategy.
2. Replace the generic operator wording and governing-law placeholder with the formal legal entity, business address, and jurisdiction. Decide with counsel whether arbitration or a class-action waiver is appropriate; none is included now.
3. Monitor `legal@erudoza.com` for legal notices and privacy requests, and monitor `support@erudoza.com` for account, product, moderation, and billing help. Define a verified privacy-request workflow, and document identity verification and deletion procedures.
4. At checkout, capture an immutable subscription-consent record containing the displayed price, currency, interval, trial terms, renewal terms, offer version, timestamp, and user ID.
5. Verify Stripe webhook signatures, enforce event idempotency, handle failed payments, and make the Stripe customer portal or an equivalent in-app cancellation control available immediately.
6. Send purchase confirmations and any legally required trial, renewal, annual, or price-change reminders. Keep cancellation available online at will and at least as easy as signup.
7. Complete a cookie/analytics inventory before adding analytics. Add consent controls before any non-essential tracking where required.
8. Execute and retain data-processing agreements with vendors. Review international-transfer terms and US state privacy-law thresholds as the business grows.
9. Establish an incident-response process, credential rotation schedule, audit-log retention rules, dependency monitoring, and a security contact.
10. Review OpenAI data controls for Modified Abuse Monitoring or Zero Data Retention eligibility if the product later handles more sensitive learning material.

## Known residual risks

- The CSP permits inline scripts because the current statically optimized Sites build uses an inline theme bootstrap. A nonce-based CSP would require dynamic rendering and should be evaluated with the hosting architecture rather than applied piecemeal.
- AI moderation reduces abuse but cannot guarantee that every unsafe or inaccurate output is detected. Publication remains owner-controlled.
- Self-service account deletion and data export are not yet complete product flows. Privacy requests are handled through `legal@erudoza.com` until those controls are built.
- Paid subscriptions are deliberately disabled. The present legal copy describes the required future flow but does not substitute for checkout implementation, consumer notices, or counsel review.

## Operational checks per release

- Run lint, production build, Sites build, end-to-end flows, npm audit, and a tracked-file secret scan.
- Test Google sign-in on desktop Chrome and mobile Safari, including return-to-app persistence.
- Verify public endpoints do not return `authorId`, email, service credentials, billing identifiers, or moderation details.
- Test cross-origin, wrong-content-type, oversized-body, malformed JSON, forged-progress, and quota-exhaustion responses.
- Verify the current Terms and Privacy versions shown in the UI match the versions stored by the acceptance endpoint.
