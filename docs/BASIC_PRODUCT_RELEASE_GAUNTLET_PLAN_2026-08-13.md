# Filosage basic product release Gauntlet plan

**Status:** Proposed for owner approval
**Planning date:** August 13, 2026
**Target:** Subscription-ready by August 31, 2026
**Authorization boundary:** This document authorizes no product, provider, deployment, catalog, or billing changes. `BILLING_ENABLED=false` remains mandatory until a separate final approval.

## Release outcome

Ship one narrow, trustworthy product:

> A visitor tries one useful exercise, signs up only if they want to continue, learns through a small source-backed course catalog, and can purchase one simple subscription.

The launch includes:

1. One useful guest exercise before signup.
2. One public subscription.
3. One excellent source-backed flagship course and no more than three related courses.
4. Completed legal, lifecycle email, monitoring, Stripe, backup, and support gates.
5. A small, budget-limited advertising campaign after activation, followed by continuous improvement from real registrations, subscriptions, support requests, and learner feedback.

Pre-launch interviews and retention windows are not release blockers for this launch. That is an explicit owner risk decision, not proof of demand. Safety, content integrity, legal, payment, support, data-protection, and operational gates remain blockers.

## Proposed product decisions

Approval of this plan approves these as the implementation targets, but still does not authorize implementation:

| Decision | Proposed target |
|---|---|
| Launch promise | “Learn a practical skill, apply it, and keep evidence of your progress.” |
| Guest value moment | A short evidence-versus-inference decision exercise with immediate feedback; no AI generation and no account required. |
| Signup boundary | Signup is required only to save the exercise, continue the sprint, use the tutor, or produce the final evidence report. |
| Subscription | **Filosage Plus**, $9.99 USD monthly: one active private outcome/course at a time, with no public publishing. |
| Public pricing | Free plus one monthly Plus choice. Hide annual and Pro acquisition paths and reject them server-side; retain their historical backend mappings for safe lifecycle handling. |
| Flagship | **Make a Defensible Product Decision in 14 Days**. |
| Related courses | **Systems Thinking for Product Decisions**, **Reading Metrics Without Fooling Yourself**, and **Designing Trustworthy Experiments**. Launch with fewer if review quality is not excellent. |
| Source scope | Owner-curated public HTTPS references and owner-written evidence notes only. No arbitrary crawling, uploads, paywalled copying, or automated “fair use” decisions in the launch version. |
| Source-backed claim | A course may use this label only after every cited source and factual lesson has a named human reviewer and review date. |
| Initial market | U.S.-only, purchasers age 18+, subject to independent Florida counsel approving the exact release documents and practices. |

Items such as the final offer name or price can be changed during approval, before implementation begins.

## Source-backed course creation contract

The existing course builder already accepts source labels, URLs, notes, and lesson-level source IDs, but it does not retrieve sources or prove claim-level support. The launch implementation will close the practical trust gap without introducing a crawler.

### Source record

Each source card will contain:

- stable source ID;
- title, publisher/author, canonical public HTTPS URL;
- publication date when known and access date;
- source kind: primary, official, or secondary;
- rights basis: public domain, open license, permission, link-and-paraphrase, or needs review;
- the author's original evidence note in their own words;
- review state, named reviewer, review date, and optional review note.

The system will not store full third-party works, images, or copied articles. Verbatim excerpts are out of scope by default. Course prose must be original, sources must be attributed and linked, and legal counsel must review the source policy. Fair use is case-specific; it will not be represented as an automatic word-count allowance.

### Generation behavior

1. Course structure creates a source coverage plan that maps source IDs to objectives and lessons.
2. Lesson generation receives only the source cards assigned to that lesson.
3. Generated lessons return structured citations containing only existing source IDs and the lesson statement they support.
4. The validator blocks invented, missing, unsafe, or mismatched source IDs.
5. Factual lessons cannot receive “source-backed” status without at least one applicable citation and human verification.
6. The learner sees source title, publisher, URL, and whether it was author-provided or human-reviewed. Filosage never implies that merely adding a URL verifies its contents.
7. Publication snapshots include source, citation, and review fingerprints so changing a source makes the review stale and blocks publication until reviewed again.

### Launch safety boundary

- Author evidence notes remain untrusted prompt input and stay isolated from system instructions.
- Only safe public HTTPS destinations are accepted.
- No server-side fetching, redirects, file ingestion, or paywall bypass is added before launch.
- Medical, legal, financial, safety-critical, disputed, or rights-uncertain material requires manual review and may be rejected.
- General crawling and uploaded-document grounding become a later project with separate SSRF, malware, licensing, privacy, storage, deletion, and prompt-injection controls.

## The Gauntlet Loop

Every implementation pass must use the same loop:

1. Inspect the current source, data contracts, provider documentation, and evidence.
2. Define one bounded change, threats, affected data, tests, non-goals, and rollback.
3. Implement only the approved pass while preserving safety and billing locks.
4. Exercise deterministic happy paths.
5. Attack forgery, replay, duplicate requests, reordering, timeouts, retries, oversized input, malicious source notes, stale state, secret leakage, and permission failures as applicable.
6. Run six independent critic reviews: architecture/data integrity; security/privacy; email/delivery abuse; operations/monitoring; product safety/human approval; QA/accessibility/release.
7. Fix every P0/P1 and contract-breaking P2.
8. Rerun the affected set until two consecutive critic rounds find no new release blocker.
9. Save a dated evidence record with commands, results, reviewer decisions, and remaining risks.
10. Pause at the pass gate. Local completion never authorizes provider changes, deployment, catalog publication, advertising, or billing activation.

## Implementation passes

### Pass 0 — Freeze contracts and baseline

**Work**

- Record the current exact SHA, working-tree state, tests, production health, billing lock, live catalog, current sources, and open launch-register items.
- Approve the product decisions above and define the advertising budget cap and stop-loss rules.
- Turn each requirement in this plan into a traceable acceptance-test ID.

**Gate**

- Owner approves the offer, guest exercise, catalog, source policy, pass order, and explicit external-change boundaries.

**Rollback**

- None; this pass changes documentation and test definitions only.

### Pass 1 — Source and citation data contract

**Work**

- Extend course, lesson, DTO, validation, review, and publication snapshot contracts for source metadata, source coverage, citations, and reviewer evidence.
- Add a backward-compatible adapter: existing courses remain readable but cannot claim source-backed status.
- Add stable quality rules for absent citations, invented references, stale source review, and incomplete rights/review metadata.

**Tests and attacks**

- Legacy course loading, schema migration, malformed URLs, duplicate IDs, nonexistent citations, citation removal, source mutation after review, oversized notes, malicious instructions in notes, and private-note exposure.

**Gate**

- Two clean critic rounds; no existing published course is falsely upgraded or broken.

**Rollback**

- Disable the new authoring UI and continue reading the backward-compatible fields; do not delete stored source data.

### Pass 2 — Source-aware course and lesson generation

**Work**

- Update course generation to output a source-to-objective and source-to-lesson coverage plan.
- Update lesson generation to receive only relevant source cards and return structured citations.
- Add clear author review screens for sources, generated claims, and citations before publication.
- Keep semantic factual review manual until a calibrated critic has separate evidence.

**Tests and attacks**

- No-source courses, insufficient source coverage, prompt injection, fake source IDs, unrelated citations, regeneration failure, stale review, source removal, concurrent edits, and non-English source metadata.

**Gate**

- A production-like private fixture course structures and generates all required lesson modes with correct citations; publication blocks any unresolved source defect.

**Rollback**

- Turn off source-backed authoring with a feature flag; keep the previous generation contract and saved courses intact.

### Pass 3 — Guest exercise before signup

**Work**

- Build one deterministic, flagship-related exercise with immediate feedback and a sample evidence artifact.
- Keep it anonymous and inexpensive: no AI call, no account write, no tutor, and no course-generation access.
- Offer signup only after feedback to save the result and continue.
- Instrument consent-aware events for start, completion, value received, signup prompt, and account continuation.
- Use a short-lived signed receipt if the guest explicitly imports the result after signup.

**Tests and attacks**

- Anonymous completion, mobile and keyboard operation, screen-reader labels, analytics consent, forged/tampered/replayed receipts, rate limits, oversized answers, lesson-content leakage, and signup cancellation.

**Gate**

- A new visitor receives a useful result without authenticating; no private or paid feature is exposed.

**Rollback**

- Disable the guest route/CTA and return the landing CTA to normal signup without affecting learner data.

### Pass 4 — One standard subscription

**Work**

- Present Free and one $9.99/month Filosage Plus offer.
- Use the existing Plus entitlements while preserving historical Plus/Pro/annual webhook interpretation.
- Enforce the one public offer at checkout on the server, not only in the UI.
- Configure a cancellation-capable Stripe customer portal and make the exact renewal, limits, cancellation, and refund terms visible before consent.
- Keep `BILLING_ENABLED=false` throughout implementation and sandbox testing.

**Tests and attacks**

- Direct API attempts for hidden plans/intervals, client price tampering, unknown prices, forged signatures, replay, duplicates, out-of-order events, delayed/failed/recovered payment, checkout abandonment, cancellation, refund, deletion with an active subscription, and master-lock behavior.

**Gate**

- Full Stripe sandbox lifecycle passes with retained redacted evidence and exactly one public purchasable offer; billing remains closed.

**Rollback**

- Set/keep `BILLING_ENABLED=false` to stop new checkout while retaining webhooks, portal access, cancellation, and entitlement synchronization for any existing subscriber.

### Pass 5 — Flagship and launch catalog

**Work**

- Create and manually review the flagship through the real authoring journey.
- Produce one tangible example decision memo/evidence report.
- Add up to three related courses only if each meets the same standard.
- Give every course a source coverage map, named reviewer, review date, rights check, and verified/qualified factual status.
- Move unrelated courses out of the launch catalog without deleting learner or author data.

**Tests and attacks**

- All six lesson modes, source display, only-used-source citations, reload/draft preservation, sequential unlocking, regeneration failure, capstone, evidence export, publish/unpublish, non-owner access, source-report submission, broken links, and stale review.

**Gate**

- Flagship passes the course quality contract and a second human factual review. Supporting courses that miss the bar do not ship.

**Rollback**

- Unpublish the affected course or restore the prior catalog selection; retain versioned content and review evidence.

### Pass 6 — Legal, email, monitoring, backup, and support

**Work**

- Obtain independent Florida counsel review of the exact hosted Terms, Privacy Notice, refund/cancellation policy, age boundary, analytics/cookie inventory, source/copyright policy, and U.S.-only scope.
- Approve retention schedules; run a backup and non-production restore; prove resumable account deletion.
- Select and configure a lifecycle-email provider after owner review. Separate transactional notices from marketing consent and suppression.
- Test receipts, renewal, failed payment, recovery, cancellation, bounce, unsubscribe, suppression, and required notices.
- Configure a signed operations alert receiver and an external `/api/health` availability monitor; test failure, deduplication, escalation, and recovery.
- Run owner acceptance for support, billing, cancellation, refund, privacy, copyright, content reports, and account deletion.

**Tests and attacks**

- Email spoofing, duplicate provider events, unsubscribed marketing, transactional/marketing mixing, bounce loops, leaked private content, alert signature forgery, alert outage, noisy recovery, unavailable datastore, least-privilege failure, incomplete deletion, and restore mismatch.

**Gate**

- Every paid-launch checkbox in the commercial launch register has dated evidence; counsel and owner approvals are recorded; no high-risk report remains open.

**Rollback**

- Pause promotional/lifecycle sends, disable new automation, keep support and legally required manual communication available, and keep billing closed.

### Pass 7 — Integrated release candidate

**Work**

- Freeze non-launch work and build the exact candidate.
- Run lint, type checks, production build, dependency audit, secret scan, full cross-browser E2E, accessibility smoke, course acceptance, Stripe lifecycle, email, support, monitoring, backup/restore, and rollback rehearsal.
- Deploy the exact approved image to isolated QA only, verify the full SHA and health, then run the full guest-to-subscription path with test payment data.

**Gate**

- Two clean full critic rounds, zero P0/P1, zero contract-breaking P2, exact-SHA evidence, and a signed go/no-go record.

**Rollback**

- Reject the candidate and keep the current production revision and billing lock unchanged.

### Pass 8 — Separate production and billing approvals

This pass contains distinct approvals and none is implied by plan approval:

1. Approve production staging of the immutable QA-proven image.
2. Approve traffic promotion after production-slot health checks.
3. Verify the live guest exercise, flagship, legal pages, support, monitors, email, Stripe Live objects, portal, and rollback target while billing is still closed.
4. Approve changing `BILLING_ENABLED=true` in a separate decision.
5. Open only the standard Plus offer and watch the first transactions manually.

**Immediate no-go/rollback triggers**

- Incorrect entitlement, charge, tax, renewal, cancellation, refund, or disclosure.
- Missing/delayed verified webhook state that cannot reconcile safely.
- Source/citation integrity failure or unsupported factual claim in the flagship.
- Support, email, alerting, health, backup, or deletion failure.
- P0/P1 security, privacy, safety, accessibility, or data-loss defect.

Rollback means close new checkout with `BILLING_ENABLED=false`, preserve existing subscriber management and cancellations, unpublish affected content, return traffic to the last known-good revision, retain evidence, and notify affected customers when required.

### Pass 9 — Initial release and feedback loop

**Work**

- Start only after Pass 8 succeeds.
- Use one audience, one promise, one landing page, and a pre-approved maximum advertising spend.
- Track landing to guest start, guest completion, signup, course start, checkout, refund, cancellation, support burden, and AI cost.
- Collect lightweight feedback after the first exercise, course milestones, cancellation, and support interactions without obstructing the learner.
- Review registrations, paid conversions, course completion, critical errors, cancellations, feature requests, support burden, and costs every week.
- Rank later improvements by repeated user pain, outcome impact, implementation effort, and operational risk. Do not expand the catalog or plans merely because an idea is available.
- Treat early results as directional learning, not proof until the sample supports the claim.

**Stop-loss rules to fill in before launch**

- Maximum total ad spend: `$________`.
- Maximum daily spend: `$________`.
- Pause immediately for any incorrect charge, critical content error, unresolved support backlog, or privacy/security incident.
- Pause acquisition if unit cost or operational burden exceeds the owner-approved threshold: `________`.

## Calendar

| Dates | Target |
|---|---|
| Aug 13–14 | Approve plan, offer, source contract, catalog, budget, and acceptance IDs. |
| Aug 15–18 | Passes 1–2: source/citation contracts and generation. |
| Aug 19–20 | Pass 3: guest exercise. |
| Aug 21–22 | Pass 4: standard Plus offer and complete sandbox lifecycle. |
| Aug 23–25 | Pass 5: flagship and up to three related courses. |
| Aug 26–27 | Pass 6: legal/provider/operations/support evidence. Start counsel/provider work earlier where lead time requires it. |
| Aug 28–29 | Pass 7: freeze and integrated release candidate. |
| Aug 30 | Pass 8: production verification and explicit activation decision. |
| Aug 31 | Pass 9: initial release and feedback collection, only if every hard gate is green. |

Provider onboarding and independent legal review are the schedule's critical path and should be booked immediately after plan approval.

## Definition of ready to open subscriptions

Subscriptions may open only when all of these are true:

- Guests complete the useful exercise without signup and cannot reach paid/private capabilities.
- One server-enforced Plus offer is the only public checkout choice.
- The flagship is source-backed under the new contract and independently reviewed; no more than three reviewed related courses are public.
- Source edits invalidate prior review; invented or unsafe citations block publication.
- Legal counsel approves the exact public text and practices.
- Lifecycle email, Stripe, portal cancellation, refunds, webhooks, backup/restore, deletion, monitoring, alerts, support, and incident rollback all pass live or sandbox acceptance as appropriate.
- The exact candidate passes two consecutive full critic rounds with no release blocker.
- Production promotion and `BILLING_ENABLED=true` receive separate owner approvals.

Real pre-launch demand data is not required. After launch, real conversion, retention, refund, churn, outcome, support, and acquisition-cost data become mandatory inputs to decisions about increasing advertising or expanding the catalog.

## External references used to set the gates

- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe webhook delivery and security](https://docs.stripe.com/webhooks)
- [Stripe customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [FTC CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [U.S. Copyright Office Fair Use Index](https://copyright.gov/fair-use/)
- [Azure Application Insights availability tests](https://learn.microsoft.com/en-us/azure/azure-monitor/app/availability)

These references inform technical acceptance only. They do not replace independent legal advice or provider-account review.
