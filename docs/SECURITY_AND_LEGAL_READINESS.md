# Erudoza security and legal readiness

Updated: 2026-07-29

This document is an engineering and launch-readiness record, not legal advice.

## Controls implemented

- Firebase ID tokens are verified server-side before account access, and authorization is repeated at each protected API route.
- Browser Firestore access is denied; privileged database access remains server-side.
- Public course and lesson responses use explicit data-transfer objects. Internal user IDs, topic keys, service timestamps, and author profile URLs are not returned.
- State-changing JSON requests require an allowed origin, `application/json`, and an endpoint-specific body limit.
- Progress totals are validated so correct answers and attempts cannot exceed their logical bounds. Non-owner Pro authors must also present short-lived HMAC-signed activity receipts bound to their user, course, lesson, and quiz before a lesson can unlock the next generation step.
- AI course, lesson, and tutor inputs use moderation. Generated course and lesson content is moderated before storage. Requests include a pseudonymous OpenAI safety identifier.
- AI generation uses per-plan quotas, per-minute limits, active-request locks, idempotency keys, and a global monthly budget.
- OpenAI Responses requests disable application-state storage. Direct AI interactions and AI-assisted course or lesson content are visibly identified and include machine-readable disclosure attributes.
- Mermaid output is parsed and sanitized before insertion into the document.
- Response headers include CSP, HSTS, clickjacking protection, MIME sniffing protection, a restrictive permissions policy, and cross-origin isolation controls compatible with Google sign-in.
- `/api/health` performs a live Firestore probe. Critical datastore and verified billing-event failures can be sent to an operator webhook with sanitized metadata and an optional HMAC signature.
- Managed Firestore export and guarded import scripts support backups and recovery drills. Restore is dry-run by default and requires both `--apply` and the exact project ID.
- Production dependencies have no known npm audit vulnerabilities as of the date above.
- Account creation and future terms updates use affirmative, versioned acceptance records, including age eligibility and guardian agreement where the registrant is a minor. Guests can inspect published topics and course outlines; lesson bodies require an accepted free account.
- Signed-in non-owner users can export their account data and permanently delete their active account data after recent Google reauthentication. Owner deletion requires a manual course-control transfer or shutdown process.
- A published Copyright Policy defines notice, counter-notice, review, removal, and repeat-infringer procedures. The app does not claim DMCA safe-harbor registration that has not been completed.

## Before enabling Stripe or another paid checkout

1. Have a licensed attorney review the Terms, Privacy Notice, and Acceptable Use Policy for the operator's actual entity, state/country, target markets, tax posture, and dispute strategy.
2. Replace the generic operator wording with the formal legal entity or individual operator name, business address, and governing jurisdiction. Decide with counsel whether arbitration or a class-action waiver is appropriate; none is included now.
3. If seeking US DMCA safe-harbor protection, designate and register a copyright agent with the US Copyright Office and publish the agent’s full required contact information. The in-app policy and mailbox alone do not complete registration.
4. Monitor `legal@erudoza.com` for legal notices, copyright notices, and privacy requests, and monitor `support@erudoza.com` for account, product, moderation, and billing help. Exercise the identity-verification, deletion, export, counter-notice, and repeat-infringer workflows.
5. At checkout, capture an immutable subscription-consent record containing the displayed price, currency, interval, trial terms, renewal terms, offer version, timestamp, and user ID.
6. Verify Stripe webhook signatures, enforce event idempotency, handle failed payments, and make the Stripe customer portal or an equivalent in-app cancellation control available immediately.
7. Send purchase confirmations and any legally required trial, renewal, annual, or price-change reminders. Keep cancellation available online at will and at least as easy as signup.
8. Complete a cookie/analytics inventory before adding analytics. Add consent controls before any non-essential tracking where required.
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
- The present legal copy and engineering controls reduce exposure but do not establish compliance in every jurisdiction or replace advice from licensed counsel.

## Operational checks per release

- Run lint, production build, Sites build, end-to-end flows, npm audit, and a tracked-file secret scan.
- Test Google sign-in on desktop Chrome and mobile Safari, including return-to-app persistence.
- Verify public endpoints do not return `authorId`, email, service credentials, billing identifiers, or moderation details.
- Test cross-origin, wrong-content-type, oversized-body, malformed JSON, forged-progress, and quota-exhaustion responses.
- Verify the current Terms and Privacy versions shown in the UI match the versions stored by the acceptance endpoint.
