# Hybrid Semi-Autonomous Agent Center Implementation Plan

Status: **FUTURE IMPLEMENTATION — NOT AUTHORIZED TO BUILD, CONFIGURE, OR DEPLOY**

Recorded: 2026-08-12

This document is the canonical future plan for adding email intake, Discord notifications, and bounded semi-autonomous processing to the Filosage Agent Command Center. The current production system must remain unchanged until the owner starts this plan explicitly.

## Plain-language objective

Filosage should be able to notice new operational work, organize it, prepare a useful draft, and notify the owner without waiting for manual polling. It must still wait for the owner before it contacts a person or changes money, privacy, accounts, content, policy, or a legal position.

The intended flow is:

```text
In-app ticket, content report, system event, billing event, or forwarded email
                              ↓
                 Verify and remove duplicates
                              ↓
                  Create or update a ticket
                              ↓
             Apply a conservative risk classification
                              ↓
          Optionally prepare an internal summary or draft
                              ↓
              Send a privacy-safe Discord notification
                              ↓
                 Owner reviews in Command Center
                              ↓
            Owner explicitly performs any real-world action
```

Discord is an alert surface, not the system of record. The Command Center remains the private system of record and the only approval surface.

## Current-state lock

Until implementation is explicitly approved:

- Do not change iCloud Mail rules or domain mail records.
- Do not create or connect a Resend, Postmark, Discord, or other provider account.
- Do not create Discord webhooks or a Discord bot.
- Do not add hosted secrets or environment variables.
- Do not add an inbound-email route or start polling iCloud Mail.
- Do not enable any external-action executor.
- Keep the existing Command Center and draft controls as they are.
- Keep `BILLING_ENABLED=false` unless billing is separately approved through its own launch gate.
- Do not deploy any part of this plan without a separate owner decision after the local gauntlet passes.

## Proposed boundaries

### May become automatic

- Create a ticket from an authenticated in-app request, a verified content report, a verified system event, or a verified forwarded email.
- Detect and ignore duplicate deliveries.
- Identify whether an email reached Support or Legal.
- Assign a conservative initial category, risk, due time, and owner queue.
- Record a bounded audit event.
- Prepare an internal summary or response draft from approved knowledge.
- Send a sanitized Discord notification.
- Retry failed notifications without creating duplicate Discord messages.
- Escalate overdue or high-risk work to the owner.
- Create a daily owner queue summary.

### Must remain owner-controlled

- Send an email or other message to a requester.
- Publish an agent-written legal, privacy, copyright, or billing response.
- Decide whether a legal or copyright claim is valid.
- Refund, charge, cancel, or change a subscription.
- Export or delete personal data.
- Restrict an account or change account access.
- Remove, quarantine, publish, or unpublish content, except for an already-approved emergency control operated by the owner.
- Change policy, public statements, runtime flags, secrets, or provider configuration.
- Approve work from a Discord button, reaction, or message.

## Proposed architecture

### 1. Existing event sources

Keep the current in-app support, content-report, health, and verified Stripe-event paths. Add durable notification requests only after their source transaction succeeds.

Important rule: a failed Discord delivery must never make a successful ticket submission appear to fail to the learner.

### 2. Durable notification outbox

Add a server-owned notification outbox instead of sending Discord messages directly from ticket routes.

Each outbox record should contain only:

- event ID and idempotency key;
- event type, severity, and creation time;
- ticket number or safe system reference;
- intended channel role, such as support, legal, or operations;
- delivery state, attempts, next attempt time, and last safe error code;
- sanitized message fields;
- deployed source version and correlation ID.

It must not contain unrestricted email bodies, legal allegations, attachments, payment details, authentication data, secrets, or full personal identifiers.

The delivery worker must use bounded retries, exponential backoff, a maximum attempt count, duplicate protection, and a dead-letter state visible to the owner. The existing in-memory five-minute alert suppression is not sufficient for ticket notifications because it could hide separate tickets received close together.

### 3. Discord notification adapter

Use one-way Discord incoming webhooks for the first version. A Discord bot is out of scope unless the owner later requests two-way commands.

Plan for separate private channel roles:

- Support notifications
- Legal/privacy/copyright notifications
- Operations, health, serious content, and verified billing-failure notifications

Exact server, channel names, channel IDs, webhook URLs, and member access must be owner-supplied later. Do not invent them.

Discord messages may show:

- Filosage event type;
- ticket number;
- general category and risk level;
- source, such as in-app support or legal email;
- received time and review status;
- a link to the authenticated Command Center.

Discord messages must not show:

- full email bodies or attachments;
- full sender email addresses;
- private learner text;
- account, Azure, Stripe, or internal record IDs;
- legal allegations or sensitive privacy-request details;
- payment amounts or payment credentials;
- secrets, tokens, prompts, or model inputs.

Discord webhook URLs are secrets and must be stored only in the hosted secret store. Logs and audit records may identify a channel role but must never record the webhook URL.

### 4. iCloud email bridge

Keep `support@filosage.com` and `legal@filosage.com` hosted by iCloud. Do not replace the domain's mail hosting for the initial version.

The recommended bridge is:

1. The owner creates two iCloud Mail forwarding rules.
2. Support mail is copied to a private provider-managed support ingestion address.
3. Legal mail is copied to a separate private legal ingestion address.
4. The provider sends a signed inbound-email event to Filosage.
5. Filosage verifies the signature before reading or storing the event.
6. Filosage uses the provider event ID and original message ID for duplicate protection.
7. Filosage creates a bounded Command Center ticket and notification outbox record.

Resend is the current recommended candidate because it supports inbound receiving, signed webhooks, provider event IDs, retries, and managed receiving addresses. Provider selection is not final until the owner reviews retention, cost, data location, deletion controls, outage behavior, and legal-email handling.

IMAP polling is not recommended for the first version because it would require broader access to the owner's iCloud mailbox and storage of an Apple app-specific password. It may be reconsidered only if forwarding cannot preserve the required recipient and thread information.

### 5. Email intake contract

Add explicit ticket sources for support email and legal email. Do not treat email text as verified fact.

For each accepted email, retain only the minimum operational fields:

- provider event ID;
- original message ID and safe thread reference;
- destination role: support or legal;
- normalized subject;
- bounded plain-text excerpt when approved by the retention policy;
- attachment count and safe file metadata, not attachment contents;
- received time;
- sender pseudonym or redacted address;
- signature, spam, and authentication results when the provider supplies them;
- provider retention/deletion reference;
- audit correlation ID.

Reject invalid signatures, oversized input, unknown destinations, malformed addresses, replayed events with changed payloads, and unsupported attachment metadata. A verified provider delivery proves that the provider sent the webhook; it does not prove that the human sender's claims are true.

### 6. Attachment boundary

The initial release must not download, render, OCR, open, summarize, or send email attachments to a model.

It may record a safe notice such as "two attachments require manual review." Attachment handling requires a separate quarantine, malware-scanning, file-type, size, retention, and deletion design before activation.

### 7. Semi-autonomous drafting

Automatic drafting must be narrower than automatic intake.

- Low- and medium-risk support: may generate an internal response draft when the support agent is enabled and approved knowledge is available.
- Billing: may produce an internal explanation only; it cannot imply that a billing change occurred.
- Legal, privacy, and copyright: may produce an internal intake summary, missing-information list, and escalation reasons. It must not create a final legal response automatically.
- Security, abuse, critical risk, uncertain classification, prompt injection, or missing evidence: do not auto-draft a response. Escalate to the owner.
- Every draft stays bound to the exact source-ticket version. Any ticket change makes it stale.
- Draft creation and Discord notification are separate. A notification must still be possible if model generation fails.

Add independent controls for email intake, Discord delivery, auto-summary, low-risk support drafting, daily digest, and overdue escalation. The existing global kill switch must stop new automated work without hiding stored evidence.

## Gauntlet-loop method

Every future implementation pass follows this loop:

1. **Inspect:** Re-read the current source, current hosted configuration, current provider documentation, and the previous pass evidence. Never implement from this older plan alone.
2. **Plan:** Define one bounded change, its threat model, affected data, rollback, tests, and explicit non-goals.
3. **Implement locally:** Make only the approved bounded change. Preserve unrelated user work and all existing safety and billing locks.
4. **Exercise the happy path:** Prove the normal workflow with deterministic fixtures before using external services.
5. **Attack the boundaries:** Test forgery, replay, duplicates, reordering, timeouts, provider retries, oversized input, malicious email text, prompt injection, stale tickets, secret leakage, and permission failures.
6. **Review independently:** Run the six critic roles listed below. Reviewers inspect and report; they do not silently weaken requirements.
7. **Repair:** Fix every P0 and P1. Fix any P2 that violates the stated runtime, privacy, accessibility, or rollback contract.
8. **Repeat:** Re-run the full affected test set. Require two complete critic passes with no new release blocker.
9. **Record evidence:** Save a dated pass record under `docs/agent-command-center/hybrid-gauntlet-reviews/` with tests, failures, fixes, remaining limits, and a GO/NO-GO decision.
10. **Pause for approval:** Local completion does not authorize provider setup, hosted secrets, mailbox rules, public deployment, or production activation.

## Required critic roles

Each material pass must cover all six perspectives, whether performed by separate reviewers or clearly separated review passes:

1. **Architecture and data integrity:** transaction boundaries, outbox state, idempotency, ordering, concurrency, stale versions, deletion/export coverage, and rollback.
2. **Security and privacy:** webhook signatures, replay protection, secret storage, PII minimization, Discord redaction, legal-channel isolation, prompt injection, and log safety.
3. **Email delivery and abuse:** forwarding behavior, provider retries, sender authentication signals, spam, loops, auto-replies, bounce behavior, thread identity, oversized messages, and attachment quarantine.
4. **Discord and operations:** channel routing, rate limits, retry behavior, duplicate messages, dead letters, recovery notifications, monitoring, and webhook rotation.
5. **Agent safety and human approval:** allowed draft types, evidence grounding, confidence, stale invalidation, legal/billing/privacy boundaries, kill switches, and proof that no external action executed.
6. **QA, accessibility, and release:** owner UI states, keyboard and mobile behavior, error recovery, feature flags, test isolation, production packaging, exact source version, canary, and rollback evidence.

## Implementation passes and gates

### Pass 0 — Reconfirm scope and evidence

Work:

- Re-audit the current Command Center, alert sender, runtime configuration, Azure PostgreSQL document helpers, support intake, content reports, Stripe webhook, and Azure Container Apps runtime.
- Re-check current Apple, Discord, and candidate inbound-provider documentation.
- Record the owner-approved provider, retention policy, channel map, notification fields, response times, and automatic-draft eligibility.
- Create fixtures for support email, legal email, duplicate delivery, spoofed webhook, prompt injection, attachments, and Discord failure.

Gate:

- No placeholder product decision remains.
- No secret has been collected in source or documentation.
- Current production behavior is unchanged.

### Pass 1 — Contracts, flags, and threat model

Work:

- Add typed event, email source, notification, delivery-state, and control contracts.
- Define environment gates and disabled-by-default runtime controls.
- Define data retention, export, deletion, and audit behavior.
- Define exact Discord redaction and routing rules.

Gate:

- Pure contract and policy tests pass.
- Every automatic and prohibited action is machine-testable.
- Default configuration produces no new external traffic.

### Pass 2 — Durable notification outbox

Work:

- Store an outbox request with the source transaction.
- Add transactional claims, payload fingerprints, retry scheduling, bounded attempts, dead letters, and recovery state.
- Ensure source requests succeed independently of notification delivery.

Gate:

- Duplicate, concurrent, interrupted, reordered, and replayed attempts do not create duplicate notification records.
- No sensitive content is stored in outbox or delivery errors.
- Existing ticket and billing behavior remains unchanged.

### Pass 3 — Discord delivery for existing events

Work:

- Add a provider adapter that formats safe Discord messages.
- Route support, legal-like, and operations events by channel role.
- Add test mode or a local capture receiver before any real webhook is used.
- Surface delivery, retry, and dead-letter state to the owner.

Gate:

- Snapshot tests prove the Discord payload contains only allowed fields.
- Timeouts, 4xx, 429, 5xx, malformed responses, and webhook rotation are handled safely.
- A real private-channel test is a separate owner-approved action.

### Pass 4 — Signed support-email intake

Work:

- Add a bounded inbound-email endpoint with raw-body signature verification.
- Implement event and message idempotency, destination allowlisting, size limits, safe parsing, and support-ticket creation.
- Do not retrieve attachments.
- Link intake to the notification outbox.

Gate:

- Forged, expired, replayed, changed-payload, oversized, misrouted, and malformed events fail safely.
- Provider retry produces one ticket and one notification request.
- Support-email text remains labeled untrusted.
- No legal email is accepted through the support-only canary.

### Pass 5 — Legal-email isolation

Work:

- Add a separate legal destination, channel role, retention rule, and conservative risk behavior.
- Generate only an internal intake summary and missing-information list when enabled.
- Ensure legal tickets cannot be displayed in ordinary support notifications.

Gate:

- Legal details never appear in the support or operations channel.
- Legal content never produces an automatic external response.
- Access, retention, export, deletion, and audit tests pass.
- The owner explicitly approves the legal-provider data path before any real message is forwarded.

### Pass 6 — Bounded semi-autonomous drafts and digests

Work:

- Add optional auto-summary and low-risk support-draft orchestration after ticket creation.
- Add daily digest and overdue escalation through the same durable outbox.
- Preserve ticket-version binding, evaluated prompts, cost budgets, and kill switches.

Gate:

- Model failure cannot lose a ticket or notification.
- High-risk, legal, privacy, copyright, billing-action, security, abuse, or uncertain cases fail closed to owner review.
- Live-model evaluation passes the exact prompt/model release candidate before activation.
- Every accepted draft still reports no send and no execution.

### Pass 7 — Owner controls and operational evidence

Work:

- Add owner-visible states for provider health, last successful intake, notification backlog, dead letters, paused automation, and recovery.
- Add safe test-event controls that cannot contact learners or change records outside the test fixture.
- Update incident, rotation, retention, and rollback instructions.

Gate:

- All controls are owner-authorized server-side.
- Mobile, desktop, light, dark, keyboard, screen-reader, loading, empty, error, paused, and degraded states pass.
- Recovery from a disabled or rotated webhook is documented and exercised.

### Pass 8 — Final adversarial gauntlet

Run:

- lint, standalone type checking, production build, Sites build, dependency audit, tracked-file secret scan, and `git diff --check`;
- deterministic policy, webhook, redaction, outbox, email, Discord, agent, export/deletion, and rollback tests;
- focused Command Center E2E across desktop Chromium, mobile Chromium, and mobile WebKit;
- full application E2E if shared persistence, authentication, support, billing, or shell code changed;
- a current live-model evaluation for every automatically invoked agent profile;
- two complete six-role critic passes without a new P0/P1 blocker.

Gate:

- A dated final evidence record gives a GO or NO-GO for an owner-only canary.
- A GO does not authorize deployment or activation.

### Pass 9 — Separately authorized canary and release

This pass begins only after the owner explicitly authorizes each external configuration and production action.

Suggested activation order:

1. Deploy code with every new integration disabled.
2. Verify the exact hosted source version and existing production health.
3. Configure a private Discord test webhook and send one synthetic sanitized event.
4. Enable Discord notifications for existing non-sensitive operational events.
5. Enable in-app support-ticket notifications.
6. Configure the provider's support receiving address and iCloud support-forwarding rule.
7. Run one uniquely identified support email through iCloud, provider, ticket, Discord, and owner review.
8. Observe duplicates, latency, provider logs, outbox state, and rollback for an agreed canary window.
9. Approve legal-email forwarding separately after support intake is stable.
10. Enable automatic low-risk support drafts separately after real intake reliability is proven.

Rollback must be able to disable Discord delivery, email intake, and automatic drafting independently. Turning off an integration must preserve tickets, audit records, and dead-letter evidence.

## Required test cases

At minimum, future tests must prove:

- authenticated in-app support creates one ticket and one notification request;
- repeated support submission recovers the same ticket without duplicate notification;
- separate tickets received within five minutes both notify;
- forged email webhook is rejected before persistence;
- valid email webhook replay creates no duplicate ticket;
- the same idempotency key with changed content is rejected;
- Support and Legal route to different private channel roles;
- legal content is absent from support and operations payloads;
- Discord payloads omit bodies, attachments, full email addresses, user IDs, payment details, and secrets;
- Discord 429 and 5xx responses retry without duplicating a successful message;
- permanent failure becomes an owner-visible dead letter;
- ticket creation remains successful when Discord is unavailable;
- prompt-injection text remains untrusted and cannot change agent or tool instructions;
- attachment metadata creates a manual-review notice without downloading the file;
- a ticket change invalidates a generated draft;
- model failure cannot lose the ticket or original notification;
- critical and protected categories do not generate an automatic external response;
- all new records participate in account export/deletion or have a documented lawful retention exception;
- disabling each feature flag stops only its own new work;
- the global kill switch stops new automated work while evidence stays reviewable;
- billing remains closed and no test activates checkout.

## Decisions required before implementation

The future implementation must pause if any of these remain unresolved:

- inbound provider and approved plan;
- provider retention and deletion policy, especially for legal mail;
- whether a provider-managed receiving address is acceptable;
- Discord server ownership and private channel membership;
- exact channel-role mapping;
- allowed fields in each Discord message;
- notification urgency, quiet hours, and escalation timing;
- whether Discord user or role mentions are permitted;
- email excerpt retention length or metadata-only intake;
- attachment policy and whether attachments remain permanently manual;
- which low-risk support categories may auto-draft;
- digest schedule and timezone;
- canary duration and measurable success/failure thresholds;
- incident owner and backup notification destination.

Do not silently invent any of these values.

## Expected implementation surfaces

The exact file list must be re-audited later, but the likely surfaces are:

- Command Center types, policy, server persistence, controls, UI, and tests;
- operational alert sender and runtime configuration;
- support and content-report intake routes;
- verified Stripe-event alert mapping without changing billing authorization;
- a new signed inbound-email endpoint;
- notification outbox persistence and delivery worker;
- account export/deletion coverage;
- Command Center operations, security, incident, email, and testing documentation;
- Azure hosted environment values and exact-SHA release evidence only after approval.

## Reusable future execution prompt

Use the following prompt when the owner is ready to start implementation:

> Implement `docs/agent-command-center/HYBRID_SEMI_AUTONOMOUS_IMPLEMENTATION_PLAN.md` using the gauntlet loop. Start with Pass 0 only: re-audit the current repository and current provider documentation, identify every unresolved owner decision, and present the bounded Pass 1 plan for approval before editing product code. Preserve the current Command Center, keep `BILLING_ENABLED=false`, do not create provider accounts, mailbox rules, Discord webhooks, hosted secrets, commits, deployments, or production changes without explicit authorization. For each approved pass, run deterministic happy-path and adversarial tests, use the six critic roles, fix every P0/P1 and contract-breaking P2, repeat until two full critic passes produce no new release blocker, and save dated evidence under `docs/agent-command-center/hybrid-gauntlet-reviews/`. Treat local implementation, Git publication, Sites deployment, provider configuration, and feature activation as separate approvals. Never place sensitive email content or secrets in Discord, logs, tests, documentation, commits, or model prompts.

## Completion definition

This future project is complete only when:

- the support canary and separately approved legal canary pass end to end;
- duplicate, retry, outage, redaction, signature, prompt-injection, and rollback evidence is retained;
- the owner can see and control each automated stage independently;
- no consequential action can occur without an authenticated owner decision;
- two complete final critic passes reveal no new P0/P1 blocker;
- the exact tested source is deployed and verified only after approval;
- documentation truthfully records enabled features, disabled features, provider limits, retention, and remaining risks.

Until then, this file is a future plan, not evidence that the hybrid system exists.
