# Phase 3 security and commerce release contract

## Access matrix

| Capability | Guest | Free account | Plus | Pro | Owner |
| --- | --- | --- | --- | --- | --- |
| Browse published topics | Yes | Yes | Yes | Yes | Yes |
| Inspect outcomes, modules, lesson titles, and capstone criteria | Yes | Yes | Yes | Yes | Yes |
| Receive lesson bodies | No | Yes | Yes | Yes | Yes |
| Save progress, notes, reviews, and evidence | No | Yes | Yes | Yes | Yes |
| Use tutor support within the plan allowance | No | Yes | Yes | Yes | Yes |
| Generate private courses and lessons | No | No | One active course | No owned-course cap | Yes |
| Publish courses they created after completion and review | No | No | No | Yes | Yes |
| Unpublish or delete any published course | No | No | No | No | Yes |

The lesson API is the authoritative boundary. Client-side locks explain the rule but are not relied on for authorization. Every lesson response is identity-bound and uses `private, no-store`.

## Threat model and controls

### Identity and authorization

- Azure Container Apps Easy Auth verifies Google sign-in before requests reach the app, and protected routes require the injected verified identity.
- Suspended accounts fail closed. Current Terms and Privacy acceptance is required for learning, generation, and billing actions.
- Course ownership and owner privileges are checked at the data-access route, not inferred from UI state.
- Plus and Pro authors generate lessons in order. The server requires saved completion evidence for every earlier lesson before it will generate the next; the owner is exempt from this authoring gate.
- Browser clients cannot read or write the document store. Server routes use the PostgreSQL application role and return explicit DTOs.

### Generated-content integrity

- Learner input is labeled as untrusted topic data in generation prompts.
- Course and lesson output is checked for model-role syntax, tool-call fragments, spam phrases, malformed characters, and scripts unrelated to the requested topic.
- One clean regeneration is attempted. A second failure is rejected and never stored.
- Language courses remain supported through topic-aware script allowances. For example, Han is allowed for a Chinese course but rejected from an unrelated Spanish course.
- Legacy output is sanitized at the DTO boundary so obvious trailing contamination is not rendered while the source record remains available for owner review.
- Pro publication requires every lesson to exist, every lesson to be completed by the author, an explicit author attestation, and a fresh course-wide safety, language, structure, and teaching-quality review. The owner can quarantine, unpublish, or delete published material.

### Request and browser security

- Mutations enforce same-origin browser metadata, strict JSON content types, and bounded request bodies.
- Billing actions require accepted accounts and rate limits. Checkout and portal URLs are created server-side.
- CSP, frame denial, HSTS on secure requests, MIME sniffing protection, restrictive permissions, and referrer controls are applied globally.
- Public health responses do not reveal missing secret names.

### Billing integrity

- `BILLING_ENABLED=false` remains the independent release lock. Stripe credentials alone cannot activate checkout.
- Checkout uses server-selected price IDs, fixed quantity, subscription mode, Terms consent, and versioned legal metadata.
- Signed webhooks are claimed transactionally, tolerate duplicates, ignore stale subscription events, and preserve failed events for retry.
- Entitlement comes from supported Stripe price IDs and active or trialing subscription state, never from client input or a checkout redirect.
- The customer portal is the online cancellation and payment-management path.

### Availability and abuse

- AI operations reserve quota before generation and finalize observed cost after success or failure.
- Idempotency keys prevent duplicate billable generation work.
- Failed quality gates and billing webhooks fail closed and retain retry evidence.
- Request rate limits reduce opportunistic abuse. They are not a substitute for upstream edge protection and monitoring.

## Operational requirements before billing activation

1. Keep `BILLING_ENABLED=false` through this release.
2. Complete a Stripe test-mode purchase, renewal, failed-payment, cancellation, refund, and duplicate/out-of-order webhook exercise.
3. Confirm the final operator legal name, business address, tax treatment, and support response process.
4. Configure uptime and webhook-failure alerts plus a documented incident owner.
5. Run an independent penetration test and remediate material findings.
6. Activate billing only in a separate, explicit release after the above evidence is recorded.

No software can be guaranteed unhackable or interruption-free. This design uses defense in depth, least privilege, fail-closed authorization, and recoverable operations to reduce risk and contain failures.
