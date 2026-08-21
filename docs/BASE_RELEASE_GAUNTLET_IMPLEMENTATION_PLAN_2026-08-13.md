# Filosage base-release Gauntlet implementation plan

**Status:** Approved by the owner and implemented locally; final evidence is recorded in `BASE_RELEASE_IMPLEMENTATION_EVIDENCE_2026-08-13.md`
**Planning date:** August 13, 2026
**Target:** Release-ready base by August 31, 2026
**Release posture:** Preserve the current Free, Plus, and Pro subscription contracts. Keep `BILLING_ENABLED=false` until every paid-activation gate passes and the owner separately authorizes activation.

## Release outcome

Ship a focused, trustworthy base application that:

1. gives a signed-in learner one clear next action instead of a wall of metrics;
2. preserves the current Free, Plus, and Pro offers, entitlements, monthly and annual prices, portal, and lifecycle behavior;
3. lets authors attach professional sources to a course, map them to lessons and claims, and lets learners follow safe deep links to those sources;
4. distinguishes an author-provided link, a generated citation, and a completed human factual review;
5. passes the code, accessibility, security, content, billing, operational, and exact-release gates appropriate to an end-of-month base release.

This plan does not authorize deployment, Stripe Live changes, advertising, catalog publication, or `BILLING_ENABLED=true`. Those remain separate approval boundaries.

## Decisions fixed by the owner

- Keep the existing membership model: Free, Filosage Plus, and Filosage Pro, including the current monthly and annual offers and historical-price lifecycle handling.
- Treat the Graphify branch as brainstorming only. Do not merge its generated files or commits.
- Cite and deep-link to sources; do not copy or ingest third-party works.
- Preserve the calm Filosage identity while making the learner home more visual, simpler, and easier to organize.
- Preserve an always-visible Continue learning / Today's focus surface.
- Allow personalization only through a Filosage-owned component registry and validated preferences. Do not allow arbitrary code, arbitrary data queries, or user-supplied widgets.
- Show this plan and obtain approval before application-code changes.

## Evidence baseline

### Repository and Graphify

- Baseline SHA: `aad1116dd1a73c923d7bc3128cfb7cb7eefb7ce1`; local `main` equals `origin/main`.
- A fresh local Graphify `--code-only` extraction analyzed 335 code files and produced 2,138 nodes, 6,391 edges, and 112 communities.
- Graph diagnostics found no missing endpoints, dangling endpoints, self-loops, duplicate edges, or collapsed edges.
- The graph was generated outside the repository. No Graphify cache, developer path, hook, or generated artifact is intended for Git.
- Graphify identified the three relevant architectural paths:
  - course generation -> source pack -> lesson generation -> DTO -> publication review -> learner integrity panel;
  - pricing -> checkout -> verified webhook -> subscription reconciliation -> entitlement -> portal/cancellation;
  - home route -> learning summary -> daily mission -> dashboard preferences -> AppShell.

### Existing source support

The application already has a useful foundation:

- authors can add up to five named sources with safe HTTPS URLs or original evidence notes;
- source input is isolated as untrusted prompt data;
- a URL alone is explicitly not treated as proof that the generator read the page;
- lessons may return source IDs from the course source pack, and invented IDs are rejected;
- source changes contribute to publication fingerprint invalidation;
- learners see lesson-level source links in the integrity panel;
- links are rendered with defensive external-link attributes;
- publication review currently remains factually `unverified`.

The gap is provenance depth and review evidence, not the absence of all source functionality.

### Existing billing support

- 27 focused Chromium billing and offer tests pass on the baseline SHA.
- Covered behavior includes fail-closed checkout, exact plan/interval mapping, verified paid fulfillment, stale-consent rejection, webhook replay and ordering safety, refund/dispute holds, cancellation management, account-deletion reconciliation, and Plus owned-course enforcement.
- `npm audit --omit=dev` currently reports one high-severity transitive `nanoid <3.3.18` advisory with a fix available.
- The local closed-release check correctly reports missing deployment variables. This is an unconfigured local release environment, not proof that hosted configuration is absent or present.
- Provider configuration, Stripe Live objects, lifecycle email, backup/restore, monitored alerts, legal review, and owner activation require retained external evidence before paid activation.

## Product and design brief: learner home

### Job and audience

The signed-in learner arrives between work obligations and needs to understand, within seconds, what to do next and why it matters. This is an Operate surface. Task clarity outranks dashboard density.

### Proposed direction: Guided Day Canvas

The home becomes a visual learning itinerary, not an analytics dashboard:

1. **Today's focus:** one dominant, always-visible action with the current course, next lesson or review, estimated time, and artifact contribution.
2. **Learning trail:** a compact branded path visualization showing recent evidence, the current step, and the next milestone. It uses existing Filosage path/node language, not decorative charts.
3. **Up next:** no more than three useful items, ranked by review urgency and active-course continuity.
4. **Supporting cards:** progress, achievements, quick actions, and learning insight move below the primary journey and are optional.
5. **Details on demand:** secondary metrics remain available through an expandable snapshot or Progress, not permanently scattered across the first viewport.

The first viewport should answer: “What should I do now?”, “How long will it take?”, and “What will this produce?”

### Personalization model

- Reuse the existing authenticated, server-validated `DashboardPreferences` contract.
- Keep Focused, Progress, Discover, and Default presets.
- Add optional drag handles for reordering registered supporting cards on desktop.
- Retain Move up / Move down controls as the keyboard, touch, screen-reader, and reduced-dexterity alternative.
- Announce reorder results through an `aria-live` status.
- Use a single-column order on mobile; never require dragging to complete customization.
- Keep Today's focus platform-owned and non-hideable.
- Provide preview, Save, Undo/Reset, and a standard fallback when preferences are malformed or unavailable.

This follows the useful parts of common dashboard models without copying their visual identity: Linear prioritizes a curated “what matters now” view and persistent personal display options; Jira demonstrates reorderable registered gadgets; WCAG 2.2 requires a non-dragging alternative for functionality that uses dragging.

## Professional source and citation contract

### Source record v2

Every source record will support:

- stable `sourceId`;
- title;
- author or publisher;
- canonical public HTTPS URL;
- publication date when known;
- access date;
- source kind: primary, official, secondary, or author-provided;
- rights basis: public domain, open license, permission, link-and-paraphrase, author-owned, or needs review;
- the author's original evidence note describing the idea the source supports;
- review state, reviewer identity, review date, and optional review note;
- a fingerprint used to invalidate stale course and lesson review.

Legacy source records remain readable. Existing `licensed` and `link-only` values receive an explicit compatibility mapping; migration must not silently upgrade their review status.

### Citation record v1

A lesson citation will be structured data, not a copied bibliography string:

- `citationId`;
- existing `sourceId`;
- the lesson objective, section, or concise original statement it supports;
- optional locator supplied by the author, such as a section heading, DOI, report chapter, or page number;
- generated-at and reviewed-at metadata;
- review state.

The record must never contain a full article, paywalled body, or substantial verbatim excerpt.

### Generation behavior

1. Course generation produces a source coverage plan mapping source IDs to course objectives and planned lessons.
2. Lesson generation receives only the source cards assigned to that lesson.
3. The model returns only structured citations using existing source IDs.
4. Deterministic validation rejects invented IDs, missing mappings, unsafe URLs, unsupported claim text, oversized notes, and malformed metadata.
5. A source URL is displayed as author-provided until a human review is recorded.
6. “Source-backed” is reserved for a reviewed snapshot whose cited claims, source metadata, and reviewer evidence are complete.
7. Editing a source, citation, lesson claim, or coverage map invalidates the relevant review and blocks the source-backed label until re-review.

### Learner presentation

- Add a concise Sources section to the lesson integrity surface.
- Show source title, author/publisher, source kind, publication date when known, review state, and a descriptive “Open source” link with its destination hostname.
- Show which lesson statement or objective each source supports.
- Clearly label author-provided, AI-associated, and human-reviewed states.
- Open external links safely and never imply Filosage controls the destination.
- Keep the course-level source summary available from the course map.
- Add a report action for broken, misleading, unsafe, or rights-disputed links.

### Legal and security boundary

- No crawler, server-side source fetch, redirect following, document upload, scraping, paywall bypass, or mirrored third-party content in this release.
- Do not make an automatic fair-use determination. Fair use is fact-specific and has no universal word-count or percentage safe harbor.
- Prefer links plus original paraphrase and attribution. Verbatim excerpts are out of scope by default.
- Reject credentials, local addresses, IP literals, non-HTTPS destinations, and private/internal hosts.
- Treat every label, URL, locator, and evidence note as untrusted prompt input.
- Preserve content-report and copyright-intake workflows.
- Independent counsel must review the exact source/copyright policy and product claims before paid activation. This implementation reduces risk; it is not legal advice or a guarantee of non-infringement.

## Acceptance register

| ID | Acceptance requirement |
| --- | --- |
| SRC-001 | Legacy courses and lessons load unchanged and are never silently labeled reviewed or source-backed. |
| SRC-002 | Every new citation resolves to a source ID in the same course snapshot. |
| SRC-003 | Unsafe URLs, invented IDs, prompt instructions in source fields, and oversized data fail closed. |
| SRC-004 | Only sources assigned to a lesson enter that lesson's generation prompt. |
| SRC-005 | Source, citation, or supported-claim changes invalidate prior review. |
| SRC-006 | Learners can follow descriptive deep links and understand provenance/review state. |
| SRC-007 | Publication blocks a source-backed claim until required human review evidence exists. |
| DASH-001 | The first viewport has one unambiguous primary learning action. |
| DASH-002 | Default home shows no more than three secondary actions and three summary metrics above the fold. |
| DASH-003 | Today's focus remains visible and cannot be removed by preferences. |
| DASH-004 | Registered supporting cards can be hidden and reordered with drag, keyboard, touch, and buttons. |
| DASH-005 | Preferences sync through the authenticated validated API and recover safely from stale/malformed data. |
| DASH-006 | Desktop/mobile, light/dark, 200% zoom, reduced-motion, keyboard, and screen-reader paths pass. |
| BILL-001 | Current Free/Plus/Pro entitlements and monthly/annual price contracts remain unchanged. |
| BILL-002 | Every configured Stripe Price resolves to exactly one plan and interval; unknown/ambiguous prices fail closed. |
| BILL-003 | Checkout, webhooks, portal, cancellation, renewal, failure/recovery, refund, dispute, and deletion pass the sandbox evidence matrix. |
| BILL-004 | Existing subscribers retain portal and webhook lifecycle handling while new checkout is closed. |
| BILL-005 | `BILLING_ENABLED=false` remains the default through code release and live verification. |
| BILL-006 | Paid activation requires complete provider, legal, email, alert, backup/restore, support, and owner evidence. |
| REL-001 | The dependency audit has no unresolved production high/critical advisory. |
| REL-002 | Lint, type/build, focused and full E2E, accessibility, secret scan, and exact-SHA checks pass. |
| REL-003 | `HEAD`, `origin/main`, hosted `SITE_VERSION`, and production health identify the same full SHA before release is called complete. |

## The Gauntlet loop

Every implementation pass uses the same bounded loop:

1. Inspect the current source, data contract, runtime behavior, provider documentation, and retained evidence.
2. Define the pass's exact change, threat model, affected data, tests, non-goals, rollback, and acceptance IDs.
3. Implement only that pass, preserving backward compatibility, valid author edits, the billing lock, and unrelated work.
4. Exercise deterministic happy paths.
5. Attack relevant failure modes: forgery, replay, reordering, concurrent edits, stale snapshots, malicious source notes, invented citations, unsafe URLs, permission failures, retries, timeouts, oversized input, privacy leakage, keyboard/touch failure, and responsive overflow.
6. Run independent reviews for architecture/data integrity, security/privacy, content/legal safety, billing/operations, UX/accessibility, and regression/release provenance.
7. Fix every P0/P1 and every contract-breaking P2.
8. Rerun the affected gates until two consecutive review rounds find no new release blocker.
9. Save dated evidence: SHA, commands, results, reviewer decisions, known limitations, and rollback target.
10. Stop at the pass gate. Local completion never implies deployment, provider mutation, publication, or billing activation.

## Implementation passes

### Pass 0 — freeze baseline and approve the plan

**Work**

- Record the exact SHA, clean-tree state, Graphify output, focused billing tests, dependency audit, and release-check configuration gap.
- Approve the learner-home direction, source/citation contract, current membership preservation, pass order, and approval boundaries.
- Convert every acceptance requirement above into traceable tests or manual evidence steps.

**Gate:** Owner approves this document or supplies corrections.
**Rollback:** None; documentation and read-only analysis only.

### Pass 1 — release and dependency foundation

**Work**

- Read the installed Next.js 16.2.12 guides relevant to every touched API, route, data boundary, and client/server component before editing.
- Resolve the transitive `nanoid` advisory with the smallest supported dependency/override change and verify lockfile integrity.
- Reconfirm lint, TypeScript/build, production dependency audit, tracked-file secret scan, and the existing billing suite.
- Freeze non-release feature work for the integration branch.

**Gate:** `REL-001` and baseline gates pass with no behavior change.
**Rollback:** Revert only the bounded dependency/lockfile change.

### Pass 2 — source record v2 and compatibility

**Work**

- Extend types, schemas, DTOs, storage adapters, source safety, fingerprints, and authoring UI for Source record v2.
- Preserve legacy reads and ensure private evidence notes never enter public DTOs.
- Add deterministic URL, metadata, size, duplicate-ID, and stale-review validation.

**Attacks:** malformed URLs, private hosts, credentials, duplicate IDs, malicious notes, oversized values, legacy records, and unauthorized metadata exposure.
**Gate:** `SRC-001`, `SRC-003`, and the compatibility suite pass.
**Rollback:** Disable v2 authoring while continuing to read stored v2 fields; never delete source data.

### Pass 3 — course coverage and structured lesson citations

**Work**

- Add a course source-coverage plan tied to objectives and lesson identities.
- Update course generation and validation to produce/verify the plan.
- Update lesson generation so it receives only assigned sources and returns structured citations.
- Preserve the existing no-source behavior without inventing references.

**Attacks:** invented IDs, unrelated sources, missing coverage, prompt injection, concurrent source edits, regeneration, stale course snapshots, and non-English metadata.
**Gate:** `SRC-002`, `SRC-004`, and `SRC-005` pass on legacy and v2 fixtures.
**Rollback:** Feature-flag v2 generation off while retaining compatible stored fields.

### Pass 4 — review workflow and learner deep links

**Work**

- Add author/owner review controls for source metadata, supported statements, and citations.
- Add explicit author-provided, AI-associated, human-reviewed, stale, and needs-review states.
- Block the source-backed label and publication state when required review is absent or stale.
- Upgrade lesson and course source presentation with safe descriptive deep links and content-report routing.

**Attacks:** stale review replay, source substitution, broken/unsafe destinations, misleading labels, hidden notes, non-owner review attempts, keyboard access, and screen-reader context.
**Gate:** `SRC-005` through `SRC-007` pass, including an owner-reviewed production-like fixture.
**Rollback:** Hide source-backed claims and revert to the existing author-provided reference panel without removing stored citations.

### Pass 5 — Guided Day Canvas dashboard

**Work**

- Produce and approve desktop/mobile visual compositions inside the existing Filosage visual system before implementation.
- Refactor the home hierarchy around Today's focus, the learning trail, Up next, and optional supporting cards.
- Reduce default metric density and move exhaustive analytics to Progress or details-on-demand.
- Enhance the existing customizer with registered-card reorder, drag as progressive enhancement, accessible move controls, live announcements, preview, save, and reset.
- Cover new, returning, caught-up, review-due, active-course, completed-course, loading, save-error, and malformed-preference states.

**Attacks:** 320px width, 200% zoom, long titles, no courses, many courses, reduced motion, keyboard-only reorder, touch without dragging, save conflict, offline/local fallback, and theme contrast.
**Gate:** `DASH-001` through `DASH-006` pass in code, browser, and visual review.
**Rollback:** Restore the current component composition while keeping backward-compatible preferences.

### Pass 6 — billing readiness evidence

**Work**

- Preserve the existing membership and price contracts.
- Run the full deterministic billing suite and Stripe sandbox lifecycle matrix.
- Use Stripe test clocks/simulations for renewal, failed payment, recovery, cancellation, and relevant plan changes.
- Verify portal self-service, invoice access, cancellation, webhook signatures, idempotency, retries, duplicate/out-of-order delivery, refunds, disputes, and account deletion.
- Reconcile the runbook with current provider objects and retain redacted evidence.

**Gate:** `BILL-001` through `BILL-004` pass; `BILL-005` remains closed. External Stripe/email/alert/backup changes require the relevant owner approval.
**Rollback:** Keep/return `BILLING_ENABLED=false`; keep portal and existing-subscriber webhooks available.

### Pass 7 — integrated release candidate

**Work**

- Freeze the exact candidate and run lint, type/build, production dependency audit, secret scan, Graphify update, full cross-browser E2E, accessibility smoke, source/citation acceptance, billing lifecycle, dashboard visual checks, and rollback rehearsal.
- Validate a private source-backed flagship fixture through the real authoring and lesson journey.
- Deploy the immutable candidate to isolated QA only when separately authorized; verify full SHA and health.

**Gate:** Two clean full review rounds, zero P0/P1, zero contract-breaking P2, `REL-001`/`REL-002`, and a signed go/no-go record.
**Rollback:** Reject the candidate; production and billing remain unchanged.

### Pass 8 — operational and paid-activation gates

These are separate decisions, not implied by code completion:

1. Complete production backup and non-production restore evidence.
2. Configure and acknowledge signed operational alerts and an external health monitor.
3. Complete transactional/lifecycle email delivery, bounce, unsubscribe/suppression, renewal, failure, and cancellation evidence.
4. Complete support, privacy, copyright, refund, cancellation, and deletion acceptance.
5. Obtain independent Florida counsel review of the exact hosted legal, source/copyright, refund, age, and analytics practices.
6. Review Stripe Live products, prices, webhook, portal, tax behavior, statement descriptor, refund handling, and historical prices.
7. Promote the exact approved SHA only after a separate production authorization and verify `REL-003` while billing remains closed.
8. Change `BILLING_ENABLED=true` only after another explicit owner authorization and `BILL-006` evidence is complete.

**Immediate no-go:** incorrect charge/entitlement, unverifiable source-backed claim, stale review accepted, source/privacy leakage, failed cancellation, failed lifecycle synchronization, missing backup/alert/support evidence, P0/P1 defect, or SHA mismatch.

## Proposed calendar

| Dates | Target |
| --- | --- |
| Aug 13–14 | Approve plan; complete Passes 0–1. |
| Aug 15–18 | Passes 2–3: source v2, coverage plan, structured citations. |
| Aug 19–21 | Pass 4: review workflow and learner deep links. |
| Aug 22–25 | Pass 5: approved dashboard composition and implementation. |
| Aug 26–27 | Pass 6: billing sandbox and provider-readiness evidence. |
| Aug 28–29 | Pass 7: integrated candidate and isolated QA. |
| Aug 30 | Pass 8 operational/live verification with billing closed. |
| Aug 31 | Owner go/no-go for the base release; billing activation remains a distinct decision. |

Provider onboarding, lifecycle email, backup/restore, monitored alerts, and independent legal review are the schedule's external critical path. They should begin as soon as the plan is approved, but their configuration or activation still requires the applicable owner approval.

## External standards and references

- [U.S. Copyright Office Fair Use Index](https://copyright.gov/fair-use/)
- [FTC advertising substantiation policy](https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation)
- [Stripe subscriptions](https://docs.stripe.com/subscriptions)
- [Stripe customer portal](https://docs.stripe.com/customer-management)
- [Stripe Billing simulations and test clocks](https://docs.stripe.com/billing/testing/test-clocks)
- [WCAG 2.2 Understanding 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements)
- [Linear My Issues](https://linear.app/docs/my-issues)
- [Linear display options](https://linear.app/docs/display-options)
- [Jira dashboard gadgets](https://support.atlassian.com/jira-software-cloud/docs/add-and-customize-gadgets/)

## Pre-approval baseline refresh — August 13, 2026

The owner approval boundary remained closed while this evidence was collected. No application source, dependency manifest, lockfile, provider, deployment, or production setting was changed.

| Check | Current evidence |
| --- | --- |
| Git provenance | `HEAD` and `origin/main` both resolve to `aad1116dd1a73c923d7bc3128cfb7cb7eefb7ce1`; the only worktree item is this untracked plan. |
| Lint | `npm.cmd run lint` passed with Oxlint warnings denied and ESLint clean. |
| Production build | `npm.cmd run build` passed on Next.js 16.2.12, including TypeScript and 73 generated route entries. |
| Course/release regression | `npx.cmd playwright test tests/course-pipeline-v2-regressions.spec.ts tests/release-scripts.spec.ts --project=chromium` passed 43/43. |
| Billing regression | The focused billing offer/lifecycle baseline passed 27/27 before this refresh. |
| Production dependency audit | One high advisory remains: transitive `nanoid@3.3.17` through `next -> postcss`; fixed threshold is `3.3.18`. No other production vulnerability was reported. |
| Billing posture | The source and release contracts continue to require `BILLING_ENABLED=false`; no activation is authorized. |

The first approved patch is therefore intentionally narrow:

1. Refresh only the vulnerable transitive `nanoid` lock resolution to a non-vulnerable compatible version, without changing the subscription contract or application behavior.
2. Re-run `npm.cmd audit --omit=dev`, lint, build, the 43 course/release regressions, and the 27 focused billing regressions.
3. Reject the patch if the manifest changes unexpectedly, a subscription price/entitlement changes, or any baseline gate regresses.
4. Record the exact dependency diff and command evidence before starting source-record work.

The installed Next.js 16.2.12 guidance for Server/Client Components and data security was reviewed during preflight. Interactive dashboard behavior will remain in a narrow Client Component boundary; source and review records will continue through authenticated, validated server APIs and minimal learner DTOs.

## Approval checkpoint

Application-code changes begin only after the owner approves this plan or provides corrections. Approval authorizes Pass 1 and the local implementation passes, but it does not authorize provider mutations, deployment, publication, advertising, or billing activation.
