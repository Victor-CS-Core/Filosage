# Filosage Pro evidence and rollover course-credit Gauntlet plan

**Status:** Approved by the owner and implemented for commit-and-push publication.
**Planning date:** August 16, 2026
**Repository baseline:** `0ab5b3de30143b02f5519d10b6a0979c0b593918` with an existing mixed worktree
**Release posture:** Commit and push the exact tested SHA only. Keep `BILLING_ENABLED=false`; deployment to isolated QA is authorized, while production deployment, Stripe changes, and billing activation require separate authorization.

## Outcome

Replace course-ownership and fixed lesson-count positioning with a durable credit model and meaningful Pro-only capabilities:

1. Plus receives two complete AI course credits per membership month.
2. Pro receives five complete AI course credits per membership month.
3. Unused credits roll forward under an explicit, bounded policy.
4. One redeemed credit covers the approved course outline and every lesson planned by that outline, even when lesson generation continues across membership periods.
5. Paid accounts have no persistent owned-course cap.
6. Banner regeneration is removed; existing banners remain, and a new course receives only its initial banner or deterministic fallback.
7. Pro adds advanced capstone history and criterion-level progression analysis.
8. Pro adds exportable evidence reports and expiring, revocable share links.
9. Pricing leads with learning value and feature access. Credit limits remain visible but secondary.

The current Plus and Pro prices remain unchanged:

- Plus: `$9.99` monthly or `$79.92` annually.
- Pro: `$14.99` monthly or `$119.88` annually.

## Decisions fixed by the owner

- Plus accrues two course credits per membership month.
- Pro accrues five course credits per membership month.
- Annual subscribers accrue monthly rather than receiving the full year of credits upfront.
- Unused credits carry over.
- The active balance ceiling is twelve months of accrual: 24 credits for Plus and 60 credits for Pro.
- Plus and Pro may retain all courses they create; course ownership is not the tier differentiator.
- A credit buys one complete outline-bound generation grant, not a fixed number of lessons.
- The pedagogically appropriate outline determines lesson count. The subscription tier must not inflate or truncate the same learning goal.
- Banner regeneration and its customer-facing quota are removed.
- Pro receives exportable/shareable evidence reports and advanced capstone assessment history with criterion-level analysis.
- Prices, billing intervals, and the billing-activation lock remain unchanged.

## Product contract

### Free

Free remains the published-course learning tier. It includes published lessons, saved progress, scheduled review, standard practice, and the existing basic tutor allowance. It does not accrue course credits or create private AI courses.

### Filosage Plus — learn with a plan

Plus is the complete private learning workspace for a professional pursuing a current goal:

- everything in Free;
- two complete AI course credits added each membership month;
- unused credits carried forward up to 24;
- private outcome planning and generated learning paths;
- every lesson in the redeemed course's approved outline;
- adaptive review, tutor support, standard capstone assessment, and private evidence;
- no persistent course-ownership cap.

### Filosage Pro — prove and share expertise

Pro extends Plus with professional proof and publishing capabilities:

- everything in Plus;
- five complete AI course credits added each membership month;
- unused credits carried forward up to 60;
- full capstone revision history;
- criterion-level progression and cross-attempt analysis;
- exportable, printable evidence reports;
- expiring, revocable evidence-share links;
- existing publication-readiness and public course-publishing access.

## Course-credit ledger contract

### Accrual

- Credits accrue on a membership-month boundary anchored to the paid entitlement, including annual subscriptions.
- A monthly renewal adds two Plus or five Pro credits.
- An annual subscription adds the same amount monthly, not 24 or 60 credits upfront.
- Accrual is transactionally reconciled on verified billing lifecycle events and lazily on authenticated account or generation access. Reconciliation must be idempotent and must not require a scheduled job to prevent lost credits.
- The first v2 entitlement reconciliation grants one current-month allocation. It does not invent retroactive credits for periods before the v2 offer becomes effective.
- A Plus-to-Pro upgrade within a membership month grants only the three-credit difference for that month. It does not add a second complete monthly allocation.
- A Pro-to-Plus downgrade takes effect under the existing Stripe lifecycle rules. The next boundary accrues at the Plus rate.

### Rollover, cancellation, and downgrade

- Active Plus balances accrue up to 24; active Pro balances accrue up to 60.
- A downgrade preserves an existing balance above the Plus ceiling. No credits are deleted, but new accrual pauses until the balance falls below 24.
- Ordinary cancellation stops new accrual at the paid-through boundary.
- Unused credits freeze for twelve months after paid access ends. Reactivation during that window restores the balance.
- Expired unused credits do not delete a course, generated lesson, assessment, or evidence record.
- Refund or payment-dispute handling may reverse unused credits from the affected allocation without producing a negative balance. Existing stored course content is never deleted. Existing account/payment holds continue to block new paid mutations while unresolved.
- Suspended accounts cannot redeem credits or continue generation until restored.

### Redemption and course generation

- One credit is reserved before generation and consumed only when a valid course outline is successfully persisted.
- Failed validation, moderation rejection, timeout before persistence, and safe retry release or reuse the same reservation; they do not consume another credit.
- Idempotency binds a request to one reservation, one course, and one generation grant.
- The stored grant contains the approved outline fingerprint and planned lesson identities.
- Every lesson in that approved outline remains eligible for generation even after a renewal, ordinary cancellation, downgrade, or credit-balance change. A paid course must never be stranded at a membership boundary.
- Lesson generation retries and deterministic repairs do not consume another course credit.
- Regenerating or repairing the same approved outline must not mint a second grant.
- A material outline expansion is not silently included. Any future outline-expansion workflow must show the consequence and obtain explicit confirmation before consuming another credit.
- Deleting a course does not refund its redeemed credit.
- Existing generated courses are grandfathered with compatible grants so the migration cannot strand their planned lessons.

### Storage and transaction shape

The implementation should use versioned, retry-safe records equivalent to:

- `users/{uid}/courseCredits/current` for balance, ceiling, plan, accrual anchor, credited-through boundary, frozen/expiry state, and schema version;
- `users/{uid}/courseCreditClaims/{claimId}` for reserved, completed, or released idempotency claims;
- an outline-bound generation grant on the course or a course-scoped private record containing the claim ID, outline fingerprint, planned lesson IDs, redemption time, and status.

Legacy course-capacity records remain readable during migration but are not destructively deleted. The new ledger is the only source of truth after its migration gate passes.

## Banner-regeneration retirement

- Remove the course-level banner replacement action and associated loading/error states.
- Remove the banner-regeneration API route as a callable product capability.
- Remove `generate_course_banner` from customer-facing plan capabilities.
- Remove banner regeneration from course DTOs, account capabilities, quota summaries, pricing, support, legal allowance copy, and tests.
- Remove the separate Plus/Pro banner allowance.
- Preserve every existing stored and displayed banner.
- A new course still receives one initial generated banner when available or the deterministic fallback. This is part of course creation and does not consume a second credit.
- Preserve internal cost and failure telemetry for initial banner generation; removing a customer feature must not blind operations.
- No banner asset is deleted by this change.

## Pro advanced capstone contract

### Standard assessment retained

- Free and Plus retain the latest capstone verdict, criterion feedback, revision submission, and evidence generated from the latest valid assessment.
- Every plan may continue storing bounded assessment history. This preserves learning records and makes a later Pro upgrade useful.
- Standard capstone assessment continues to use the existing tutor/assessment allowance where applicable.

### Pro-only analysis

Pro receives a server-authorized advanced analysis surface containing:

- an ordered attempt timeline;
- side-by-side attempt comparison;
- per-criterion met/not-met trajectory;
- criteria improved since the prior attempt;
- criteria still unresolved;
- criteria added, removed, or materially renamed between snapshots;
- a deterministic next-revision priority derived from the latest unresolved criteria;
- assessment timestamps and evidence-authority language.

The analysis is deterministic over stored verdicts and consumes no additional AI allowance. Exact normalized criterion matches may be compared across attempts. Changed criteria must be shown as changed rather than falsely presented as improvement or regression.

### Access and lifecycle

- The latest assessment remains available below Pro.
- Full history and cross-attempt analysis require a server-verified Pro capability or owner authority; hiding controls in the client is insufficient.
- Upgrading reveals preserved historical attempts.
- Downgrading hides advanced analysis without deleting history or the latest assessment.
- Legacy assessment records without history render a truthful single-attempt state.
- A malformed or partially stored attempt is skipped or isolated without corrupting the latest valid verdict.

## Pro evidence-report contract

### Private export

Pro can download a standalone semantic HTML evidence report and use the browser's print flow to save an accessible PDF. The report includes only the authenticated learner's server-derived projection:

- course and desired outcome;
- clear separation of self-reported baseline, observed practice, and assessed evidence;
- objective-level evidence states;
- latest capstone result;
- Pro criterion trajectory when more than one valid attempt exists;
- generated-at timestamp, report version, and methodology limitations.

The report is not a certificate or credential and must not imply independent identity verification, employment qualification, or institutional accreditation.

### Share links

- Pro can create a snapshot link only after the report contains meaningful observed or assessed evidence.
- The default expiry is thirty days.
- The learner can list and revoke active links.
- Raw tokens are shown only at creation and are never stored. Only a cryptographic digest identifies the stored snapshot.
- Public lookup is constant-shape for missing, expired, and revoked tokens and cannot expose whether a course or account exists.
- A snapshot is immutable. Later progress does not silently alter previously shared claims.
- Shared pages are `noindex`, do not expose analytics identifiers, and use restrictive cache and referrer behavior.
- The snapshot excludes UID, email, private notes, raw lesson responses, tutor conversations, unpublished course details, billing state, and referral attribution.
- Course deletion, account deletion, or moderation invalidation revokes associated share records.
- Downgraded users cannot create new reports or links but can list and revoke their existing links.
- Existing valid links remain available until expiry or revocation after an ordinary downgrade. Suspension, account deletion, or a relevant safety action may invalidate them immediately.

The existing plain-text “Copy share summary” can remain available as a lightweight learner action. It must not be represented as the Pro professional report.

## Pricing and presentation contract

The Plans page remains a Persuade surface in Filosage's existing calm editorial system.

### Hierarchy

1. Lead with the job each membership performs.
2. State the meaningful feature-access difference.
3. Show the unchanged price and billing interval.
4. Present course credits as a clear allowance, not the product's primary value.
5. Put rollover, ceilings, tutor usage, renewal, and downgrade behavior in an explicit usage/details section.

### Core language

- Plus: **Learn with a plan.** “Build private learning paths for the study, personal, career, or work goals in front of you.”
- Pro: **Inspect and share your work.** “Add advanced capstone analysis, portable evidence reports, revocable sharing, and publishing tools.”
- Plus credit line: “2 complete AI course credits added monthly. Unused credits roll over, up to 24.”
- Pro credit line: “5 complete AI course credits added monthly. Unused credits roll over, up to 60.”
- Course-credit explanation: “One credit includes the approved outline and every lesson planned for that course.”
- Annual explanation: “Annual billing changes the price, not the credit cadence; credits are added monthly.”

### Required surface updates

- shared membership catalog and public billing payload;
- pricing page and metadata;
- create-course empty, blocked, and balance states;
- account and course-switcher membership summaries;
- support article and owner documentation;
- Terms language describing credits, rollover, expiry, refunds, downgrade, and non-deletion;
- pricing-intent and offer-version snapshots;
- admin reporting that distinguishes operational AI requests from customer credits;
- automated consistency tests.

Because the entitlement contract materially changes, the offer version must advance. Existing Stripe prices may remain only if exact price validation and the new offer/consent metadata remain unambiguous. `BILLING_ENABLED=false` stays in force throughout implementation and local verification.

## Acceptance register

| ID | Acceptance requirement |
| --- | --- |
| CRED-001 | Plus accrues exactly two and Pro exactly five credits per membership month, including annual subscriptions. |
| CRED-002 | Repeated reconciliation, webhook replay, concurrency, and retries never double-accrue credits. |
| CRED-003 | Plus balances cap at 24 and Pro balances cap at 60 without deleting a preserved over-cap downgrade balance. |
| CRED-004 | One successful outline persistence consumes exactly one credit. Failed or duplicate attempts do not. |
| CRED-005 | A redeemed grant covers every lesson in its approved outline across renewals, ordinary cancellation, and downgrade. |
| CRED-006 | Existing paid courses receive compatible grants and are not stranded. |
| CRED-007 | Free and suspended accounts cannot redeem credits through UI or direct API calls. |
| CRED-008 | Plus-to-Pro mid-period adjustment grants only the three-credit difference. |
| CRED-009 | Cancellation freeze, twelve-month expiry, reactivation, refund, and payment-hold behavior are deterministic and tested. |
| CRED-010 | Paid users can retain unlimited owned courses; no legacy capacity check blocks a valid credit redemption. |
| BAN-001 | No banner-regeneration action, customer capability, separate allowance, or callable mutation remains. |
| BAN-002 | Existing banners render unchanged and new courses still receive an initial banner or deterministic fallback. |
| CAP-001 | Free and Plus retain the latest valid capstone result and revision submission. |
| CAP-002 | Pro and owner accounts receive server-authorized history and criterion trajectory; direct lower-tier API calls fail closed. |
| CAP-003 | Upgrade reveals preserved history and downgrade preserves it without exposing the advanced surface. |
| CAP-004 | Reordered, renamed, added, removed, legacy, and malformed criteria never produce false trend claims. |
| EVD-001 | Pro can download a complete, accessible, versioned evidence report derived from authoritative data. |
| EVD-002 | Free and Plus direct export/share API calls fail without leaking report existence. |
| EVD-003 | Share tokens are unguessable, digest-stored, expiring, revocable, and safe under replay and concurrency. |
| EVD-004 | Shared snapshots contain no account identifiers, private responses, notes, billing state, or unpublished content. |
| EVD-005 | Course/account deletion and safety invalidation revoke applicable shares. |
| EVD-006 | Downgraded users can revoke old links but cannot create new ones. |
| PRICE-001 | Prices and billing intervals remain unchanged and are mathematically consistent everywhere. |
| PRICE-002 | Pricing leads with Plus learning value and Pro evidence value; course credits are visible but secondary. |
| PRICE-003 | Every pricing, account, create, support, legal, and checkout surface uses the same credit terminology and rollover rules. |
| BILL-001 | Price-to-plan mapping, verified webhooks, consent, portal, cancellation, refund, dispute, and deletion remain fail-closed. |
| BILL-002 | `BILLING_ENABLED=false` remains unchanged; this plan never authorizes paid activation. |
| UX-001 | Pricing, evidence, sharing, management, empty, loading, error, expiry, and downgrade states pass keyboard, screen-reader, reduced-motion, mobile, dark/light, and 200% zoom checks. |
| REL-001 | TypeScript, strict lint, focused tests, full regression, production build, Sites build, and diff hygiene pass. |
| REL-002 | The implementation preserves the pre-existing mixed worktree and reports its release boundary explicitly. |

## Threat model and failure attacks

The Gauntlet must attack:

- concurrent credit reservations and duplicated generation requests;
- webhook replay, event reordering, stale plan state, clock boundaries, leap days, and annual/monthly transitions;
- upgrade and cancellation immediately before or after an accrual boundary;
- forged plan fields, direct lower-tier API calls, manual grants, owner overrides, suspension, refunds, and disputes;
- outline mutation after redemption, lesson ID substitution, repair retries, partial persistence, and legacy course migration;
- share-token guessing, timing differences, replay, expiry races, revocation races, referer leakage, indexing, caching, XSS, and malicious course text;
- PII or private-response leakage in downloads, public snapshots, logs, errors, analytics, and deleted-account remnants;
- changed capstone criteria, incomplete history, concurrent assessment writes, stale progress, and downgrade during analysis;
- removal regressions that hide existing banners, break new-course fallback art, or remove operational cost visibility;
- responsive overflow, inaccessible comparison semantics, misleading disabled actions, print clipping, and unclear credit exhaustion recovery.

## The bounded Gauntlet loop

Every pass follows the same sequence:

1. Inspect the exact current source, working-tree diff, relevant installed Next.js guide, stored-data contract, and existing tests.
2. Define the pass's change, affected data, threat cases, tests, rollback, and acceptance IDs.
3. Implement with targeted patches that preserve unrelated and pre-existing work.
4. Run deterministic happy paths.
5. Attack authorization, concurrency, lifecycle, malformed-data, privacy, accessibility, and responsive failure paths relevant to that pass.
6. Review architecture/data integrity, security/privacy, billing/lifecycle, UX/accessibility, and regression provenance.
7. Fix every P0/P1 and contract-breaking P2.
8. Rerun the affected gates until two bounded review rounds find no new release blocker.
9. Record exact commands, results, limitations, SHA, worktree state, and rollback evidence.
10. Stop at the pass gate. Local completion never implies commit, push, deployment, Stripe mutation, or billing activation.

## Implementation passes

### Pass 0 — approve and freeze the integration boundary

**Work**

- Approve this contract and capture a fresh baseline SHA and working-tree inventory.
- Identify every overlap with the existing learning-engine changes before editing.
- Read the installed Next.js documentation for touched route handlers, server/client boundaries, caching, metadata/robots, and error handling.
- Map every acceptance ID to an automated or manual verification step.

**Gate:** Owner approval and a recorded mixed-worktree integration map.
**Rollback:** Documentation only; no application state changed.

### Pass 1 — plan catalog, offer version, and credit ledger

**Work**

- Replace active owned-course and generated-lesson allowances with course-credit terms.
- Add the versioned credit ledger, accrual reconciliation, claims, and outline-bound grants.
- Preserve tutor allowance separately.
- Migrate existing courses non-destructively and retire capacity enforcement.
- Extend account payloads and server capabilities without trusting the client.
- Advance the offer version while preserving exact prices and fail-closed Stripe mappings.

**Attacks:** `CRED-001` through `CRED-010`, billing replay/order, direct API bypass, annual accrual, upgrades, downgrades, cancellations, and legacy records.
**Gate:** Credit, account, offer, and billing-focused tests pass twice without a new blocker.
**Rollback:** Disable new redemption, retain readable ledger/grant data, and restore the previous generation gate without deleting courses.

### Pass 2 — banner-regeneration retirement

**Work**

- Remove the regeneration UI, route, entitlement, DTO fields, quota copy, and focused tests.
- Keep initial banner generation/fallback and internal usage telemetry.
- Prove existing course banners and new fallback behavior remain intact.

**Attacks:** stale client calls, missing banners, failed initial generation, legacy DTOs, and operational-reporting regressions.
**Gate:** `BAN-001` and `BAN-002` plus course-generation regressions pass.
**Rollback:** Restore the route and UI only if required; never remove or rewrite banner assets.

### Pass 3 — Pro capstone progression

**Work**

- Normalize bounded legacy and current assessment history.
- Add deterministic criterion comparison and next-revision prioritization.
- Add a Pro-authorized route/projection and evidence/course presentation.
- Preserve latest-result and revision submission behavior for lower tiers.

**Attacks:** `CAP-001` through `CAP-004`, malformed history, criteria drift, unauthorized access, concurrent assessment, upgrade, downgrade, and suspension.
**Gate:** Capstone contract, route authorization, and desktop/mobile interaction tests pass twice.
**Rollback:** Hide the advanced projection while preserving stored assessment history and the latest result.

### Pass 4 — Pro export and evidence sharing

**Work**

- Build one server-derived evidence-report projection reused by private export and public snapshots.
- Add accessible standalone HTML download and print styling.
- Add create, list, fetch, revoke, expiry, deletion, and safety-invalidation behavior for share snapshots.
- Add a public noindex report surface with explicit evidence limitations.

**Attacks:** `EVD-001` through `EVD-006`, token/security/privacy threats, malicious content, caching, deletion, downgrade, and concurrent revoke/fetch.
**Gate:** Security/privacy tests, authorization tests, print inspection, and desktop/mobile accessibility checks pass twice.
**Rollback:** Stop new share creation and public fetches while retaining authenticated revocation access and private evidence.

### Pass 5 — pricing and membership presentation

**Work**

- Reshape pricing around Plus learning value and Pro professional proof.
- Move credits, rollover, ceilings, and tutor usage into a clear secondary details section.
- Update every named membership surface and legal/support explanation from the shared contract.
- Show the current credit balance, next accrual, ceiling, frozen/expiry state, and recovery path truthfully.

**Attacks:** `PRICE-001` through `PRICE-003`, misleading annual copy, stale limits, narrow mobile widths, long currency strings, keyboard order, screen readers, dark/light themes, and 200% zoom.
**Gate:** Contract tests and one bounded desktop/mobile visual review pass; one repair batch and one confirmation review maximum.
**Rollback:** Revert presentation only; server entitlements remain authoritative and billing remains closed.

### Pass 6 — full verification and local evidence

**Work**

- Run targeted credit, billing, capstone, evidence, course-generation, account, legal-copy, and pricing suites.
- Run TypeScript, strict lint, full Playwright regression, Next production build, Sites build, and `git diff --check`.
- Inspect the actual rendered Plus, Pro, credit-exhausted, advanced-capstone, export, share, expiry, revoke, downgrade, mobile, and print flows.
- Record the exact SHA and distinguish new work from the pre-existing mixed worktree.

**Gate:** `BILL-001`, `BILL-002`, `UX-001`, `REL-001`, and `REL-002` pass with no P0/P1 or contract-breaking P2.
**Rollback:** Return the new capabilities to closed state, preserve learner data, and retain the prior tested application behavior.

## Validation commands and evidence

Exact test selection may expand as implementation reveals affected contracts, but the final local evidence must include:

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- focused Playwright tests for membership offers, billing lifecycle, course generation, capstone, evidence export/sharing, and pricing
- the full Playwright suite with a sufficient completion timeout
- `npm.cmd run build`
- `npm.cmd run build:sites`
- `git diff --check`
- a tracked-file secret scan
- desktop and mobile Chromium/WebKit checks for the affected user journeys
- print-preview or rendered-export inspection for the evidence report

A local missing-hosted-secret result is configuration evidence, not production proof. No production health claim may be made without a later separately authorized exact-SHA release and live verification.

## Non-goals and approval boundaries

This plan does not authorize:

- enabling `BILLING_ENABLED=true`;
- creating or modifying Stripe products, prices, coupons, portal settings, or webhooks;
- committing, pushing, merging, or deploying;
- changing the current Plus or Pro price;
- deleting existing courses, lessons, banners, evidence, capstone history, credit records, or subscriptions;
- retroactively granting invented credits before the v2 effective date;
- public identity verification, credentials, certificates, accreditation, or employer-facing claims;
- adding collaboration, teams, marketplace sales, or creator payouts;
- using course length as a reason to upsell Pro.

The owner explicitly approved this Gauntlet before application-code implementation began and later authorized commit, push, and isolated QA deployment of the validated change set.
