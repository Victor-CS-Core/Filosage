# Filosage full-app audit and pricing-tier readiness report

Audit date: 2026-08-09

Scope: public, account, learning, authoring, subscription, legal, limits, responsive UI, and server authorization

Billing state during audit: closed (`BILLING_ENABLED=false` expected and preserved)

## Decision gate — resolved

The previously blocked product contract is approved as follows:

1. Stable plans are `free`, `plus`, and `pro`; the display name of the new tier is **Filosage Plus**.
2. Plus costs $9.99 monthly or $79.92 yearly, displayed as a $6.66 monthly equivalent with $39.96 exact annual savings. Pro remains $14.99 monthly or $119.88 yearly.
3. Plus supports one active owned private course, one generated outline, ten generated lessons, forty tutor questions, and ten course-banner generation requests per month; failed requests still consume an allowance.
4. Plus includes private authoring but excludes public course publishing and additional concurrently owned courses. Course duplication is not advertised or granted because the product does not implement it.
5. Pro keeps its existing three-outline, thirty-lesson, one-hundred-tutor-question, and thirty course-banner generation-request monthly allowances, has no owned-course cap, and includes publication after review; failed requests still consume an allowance.
6. Downgrades are non-destructive: existing courses and publication state remain; new course creation pauses while the account exceeds its new limit, and newly restricted mutations such as publishing are blocked. Viewing, editing, unpublishing, and deleting owned work remain available.
7. Billing stays closed with `BILLING_ENABLED=false`; this approval authorizes product implementation, not Stripe object creation or paid activation.

No Stripe objects were created, no hosted secrets were changed, and billing was not enabled.

## Implementation status

The approved application-side work is implemented in the current worktree:

- A single serializable catalog now defines `free`, `plus`, and `pro`, their prices, limits, capabilities, feature copy, and derived annual math.
- Account payloads expose the resolved plan, billing interval, renewal boundary, capabilities, AI quotas, and owned-course capacity without conflating owner authority with a paid plan.
- Checkout requires `planId + interval`; Stripe Prices resolve through an explicit Price ID to plan/interval/version map; ambiguous subscription mappings fail closed.
- Plus course capacity is enforced transactionally on the server with retry-safe claims. Existing owned courses remain readable/editable/deletable after downgrade, while disallowed creation and publishing mutations are blocked.
- Pricing, Course Studio, account navigation, usage states, Terms, support guidance, admin readiness, and pricing-intent research now cover all three memberships.
- The theme logo renders only the selected theme asset with explicit eager/high-priority loading, resolving the development LCP warning without loading both theme variants.

Still intentionally excluded or blocked:

- Course duplication remains outside the approved plan contract and is not advertised.
- The Filosage domain and contact addresses require coordinated infrastructure and delivery verification.
- Paid activation remains blocked by the legal and operational launch register. `BILLING_ENABLED=false` remains mandatory; implementation does not authorize Stripe object creation or a paid launch.

## Pre-implementation baseline (historical and superseded)

The findings in this section document the two-tier baseline that existed before the implemented Free/Plus/Pro contract described above. They are retained as audit history and are not a statement of the current application model.

- Baseline model: Free plus one generic Pro entitlement.
- Baseline paid offer: Filosage Pro at $14.99 monthly or $119.88 yearly.
- Baseline creation allowance: three AI-generated course outlines per calendar month, not a maximum course count.
- Baseline verification: lint passed, production build passed, and 432/432 Playwright tests passed.
- Rendered verification: pricing, navigation, footer, legal links, guest CTAs, desktop layout, 375px layout, and the not-found state were inspected. No document-level horizontal overflow was observed at 375px.
- Browser console: repeated Next.js LCP warnings for the theme logo.
- Historical architecture blocker: `LearnerPlan` only supported `"free" | "pro"`; the implemented model now supports stable Free, Plus, and Pro IDs.
- Commercial blocker: operator identity, address, governing jurisdiction, tax/refund treatment, lifecycle messaging, and payment-lifecycle evidence remain open launch gates.

## Audit health score

| Dimension | Score | Key finding |
| --- | ---: | --- |
| Accessibility | 3/4 | Semantic landmarks, named controls, focus patterns, and tested mobile navigation are strong; a complete assistive-technology pass is still unrecorded. |
| Performance | 3/4 | Build is healthy, but the brand logo repeatedly triggers an above-the-fold LCP loading warning. |
| Responsive design | 4/4 | Desktop and 375px pricing layouts render without document overflow; the automated suite covers major mobile shells and long content. |
| Theming | 4/4 | Tokenized light/dark themes and persistence are implemented and tested. |
| Anti-patterns | 4/4 | The UI is restrained, content-first, and consistent with Filosage's design contract. |
| **Total** | **18/20** | **Excellent baseline; subscription architecture is the release risk.** |

Anti-pattern verdict: pass. The interface does not read as generic AI SaaS. Inter is intentionally required by `DESIGN.md`, so the detector's generic “overused font” warning is not treated as a defect.

## Phase 1: pre-implementation source of truth (historical)

### Baseline plans and enforcement

| Plan | Displayed price | Actual billing configuration | Course creation | Other AI allowances | Entitlement source |
| --- | --- | --- | --- | --- | --- |
| Free learner | $0 (no explicit price shown) | No Stripe price | No course generation | 5 tutor questions/month | `LearnerPlan="free"` |
| Filosage Pro | $14.99/month; $119.88/year; $9.99 monthly equivalent; “Save 33%” | One monthly and one annual Stripe Price ID; checkout is locked | 3 generated course outlines/month; no owned-course cap | 30 generated lessons/month; 100 tutor questions/month; 30 course banners/month in backend policy | Every recognized active/trialing Stripe subscription becomes generic `pro` |

The backend's 30 monthly course-banner allowance is not shown on the pricing page or in the public billing-plan payload. It is an operational generation allowance, not necessarily a marketable entitlement, but the discrepancy should be decided deliberately.

### Plan-logic locations

| Concern | Current locations |
| --- | --- |
| Plan and access types | `src/lib/course-types.ts` |
| Account plan derivation | `src/lib/account-server.ts` |
| Premium server guard | `src/lib/auth-server.ts` |
| Client Pro detection | `src/components/AuthProvider.tsx` |
| Offer amounts and Stripe validation | `src/lib/billing-offer.ts` |
| Public billing-plan payload | `src/lib/billing.ts` and `/api/billing/status` |
| Billing readiness and locks | `src/lib/billing-lock.ts`, `src/lib/runtime-config.ts`, `.env.example` |
| Stripe price selection, checkout metadata, portal, webhook mapping | `src/lib/stripe-server.ts`, `/api/billing/*` |
| Pricing display and CTA state | `src/app/pricing/page.tsx`, `src/app/pricing/layout.tsx` |
| Pricing research snapshots | `src/app/api/pricing-intent/route.ts`, `src/app/api/admin/overview/route.ts` |
| AI quota enforcement | `src/lib/ai-usage.ts` |
| Course-generation authorization | `/api/generate-course`, `/api/generate-lesson`, `/api/courses/[courseId]/banner` |
| Course ownership and management | `/api/courses`, `/api/courses/[courseId]` |
| Course-creation usage UI | `src/app/create/page.tsx`, `src/components/AppShell.tsx`, pricing page |
| Legal subscription language | `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/content/support/articles/plans-and-billing.ts` |
| Operational launch gates | `docs/BILLING_SETUP.md`, `docs/COMMERCIAL_LAUNCH_RUNBOOK.md` |
| Tests | `tests/billing-lifecycle.spec.ts`, `tests/billing-offer.spec.ts`, `tests/example.spec.ts`, `tests/account-onboarding.spec.ts` |

### Duplicated values

- $14.99 and $119.88 appear in the offer, pricing UI, pricing-intent storage, admin overview, tests, and product documentation.
- Pro features appear as display strings, a public billing object, AI policy branches, route guards, support copy, and app-shell conditions.
- Stripe readiness assumes exactly one paid plan and exactly two current Price IDs.
- `pro` is used simultaneously as a marketing name, account plan, access level, Stripe metadata value, and boolean client capability.

## Prioritized gap report

### Critical

#### C1. The requested plan was undefined — resolved by approved contract

- Location: assignment placeholders; no repository definition.
- Reproduction: search product docs and plan configuration for a second paid tier, its name, limit, or entitlement list.
- Expected: an approved product contract.
- Actual: no approved name, limit, or feature matrix exists.
- Likely cause: requirements were intentionally left as placeholders.
- Recommended correction: approve the four decisions in the Decision gate before billing-sensitive implementation.

#### C2. Account and Stripe models cannot represent limited Pro

- Location: `src/lib/course-types.ts`, `src/lib/account-server.ts`, `src/lib/stripe-server.ts`.
- Reproduction: inspect `LearnerPlan`, account derivation, checkout metadata, and webhook synchronization.
- Expected: each paid price resolves to a stable plan ID and entitlement key.
- Historical actual: the plan union was `free | pro`; the implemented catalog and Price mapping now distinguish Plus and Pro.
- Likely cause: the application was built for one paid offer.
- Recommended correction: introduce stable plan IDs and price-to-plan resolution before adding UI or Stripe IDs.

#### C3. No server-side course-count limit exists

- Location: `src/lib/ai-usage.ts`, `/api/generate-course`, `/api/courses`.
- Reproduction: compare the displayed three-outline allowance with course persistence and ownership queries.
- Expected: the advertised course-creation rule is enforced transactionally on the server.
- Actual: only monthly AI reservations are counted; owned courses are not counted or capped.
- Likely cause: “course outlines” and “courses owned” were treated as the same user concept.
- Recommended correction: define the intended unit, then add a server transaction/claim that cannot be bypassed through direct API calls. Keep AI usage limits separate.

### High

#### H1. Plan configuration is duplicated and cannot guarantee mathematical consistency

- Location: `billing-offer.ts`, `billing.ts`, pricing page, pricing-intent API, admin overview, tests, docs.
- Reproduction: change an amount or allowance in one file and inspect the other surfaces.
- Expected: derived UI, checkout validation, research records, and tests use one plan record.
- Actual: amounts and features are copied manually.
- Likely cause: incremental commercialization work around a single offer.
- Recommended correction: create a shared, serializable membership-plan catalog; derive yearly equivalent, savings, feature copy, status payloads, and Stripe lookup from it.

#### H2. Billing routes do not accept a plan ID

- Location: pricing `openBilling`, `/api/billing/checkout`, `priceForInterval`.
- Reproduction: submit checkout; the body contains only `interval`.
- Expected: `{ planId, interval }` is validated against an active catalog entry.
- Actual: every checkout is implicitly Filosage Pro.
- Likely cause: one-plan assumption.
- Recommended correction: require an allowed plan ID, bind it to checkout claims and idempotency, and validate the retrieved Stripe Price against that plan's offer.

#### H3. Webhook synchronization cannot distinguish tiers

- Location: `configuredProPriceIds`, `supportedProPrice`, `syncStripeSubscription`.
- Reproduction: add another recognized price to the allowed set.
- Expected: its plan ID and entitlements are stored and resolved.
- Actual: it would still grant the same generic Pro access.
- Likely cause: the allowed-price set is a boolean Pro test.
- Recommended correction: replace it with an explicit Price ID -> plan ID/interval/version map and reject ambiguous subscriptions.

#### H4. Pricing comparison is incomplete for the requested contract

- Location: `src/app/pricing/page.tsx`.
- Reproduction: compare current cards with the required fields.
- Expected: every paid plan shows monthly price, annual total, exact savings, annual monthly equivalent, course limit, included/restricted Pro features, upgrade path, CTA, checkout destination, and current-plan state.
- Historical actual: only Free and Pro rendered; the implemented comparison now renders Free, Plus, and Pro from the shared catalog.
- Likely cause: the page is a closed-launch two-card offer, not a multi-tier comparison system.
- Recommended correction: render all plan cards from the shared catalog and make interval selection control the primary amount and CTA payload.

#### H5. Downgrade and over-limit behavior is unspecified and unimplemented

- Location: account derivation, course ownership routes, authoring UI, Terms/support copy.
- Reproduction: consider a Pro author with more courses or generated lessons than the lower tier permits, then cancel or downgrade.
- Expected: documented read/edit/delete/publish/generate behavior and a non-destructive resolution path.
- Actual: no lower paid tier exists; course access is ownership-based while generation is Pro-gated, and no over-limit state is surfaced.
- Likely cause: cancellation only had to resolve to Free.
- Recommended correction: preserve existing courses, block only explicitly disallowed mutations, show which courses remain editable, and provide an upgrade/archive/delete path without silently deleting content.

#### H6. Paid launch is legally and operationally blocked

- Location: Terms section 15, Privacy section 1, `BILLING_SETUP.md`, commercial launch runbook.
- Reproduction: read the activation checklist.
- Expected: operator identity/address/jurisdiction, tax/refund rules, lifecycle messages, monitored support, backups/alerts, and Stripe test-mode lifecycle evidence.
- Actual: these remain open and the legal text explicitly requires paid subscriptions to stay disabled.
- Likely cause: deliberate closed-launch safety gate.
- Recommended correction: complete and approve the launch register; keep `BILLING_ENABLED=false` until a separate owner authorization.

### Medium

#### M1. “Course creation” terminology masks different limits

- Location: pricing page, create page, AppShell, AI quota policy.
- Reproduction: compare “three private course outlines each month,” “course creation uses monthly Pro credits,” and the absence of an owned-course cap.
- Expected: UI names the metered event precisely.
- Actual: users can reasonably interpret the allowance as three courses total or per month.
- Likely cause: product copy abstracts the underlying generation request.
- Recommended correction: use distinct labels for generated outlines/month, generated lessons/month, and courses owned/active.

#### M2. Public billing-plan payload omits part of backend policy

- Location: `src/lib/billing.ts` versus `src/lib/ai-usage.ts`.
- Reproduction: compare feature objects.
- Expected: the plan payload and enforced entitlement registry agree.
- Actual: the backend enforces a course-banner allowance that the public plan object does not describe.
- Likely cause: billing payload predates banner generation.
- Recommended correction: derive both from entitlement keys; decide whether banner allowance is customer-facing or internal.

#### M3. Course duplication is not implemented

- Location: course-management UI and API.
- Reproduction: open an owned course and search its actions and routes for duplicate/clone/copy.
- Expected: either a supported, permission-checked duplication flow or clear product exclusion.
- Actual: no duplication action or endpoint exists.
- Likely cause: it is outside the current product contract.
- Recommended correction: decide whether duplication belongs in any tier before advertising it; if added, copy only authorized course data and reset learner/publication state.

#### M4. Historical pricing metadata assumed only Free and Pro

- Location: `src/app/pricing/layout.tsx`, support article, landing CTAs.
- Reproduction: inspect page description and plan/billing support copy.
- Expected: metadata and help content describe every active tier.
- Historical actual: copy compared only Free and Pro; current metadata and help content cover Plus and Pro.
- Likely cause: one paid plan.
- Recommended correction: generate metadata/help summaries from approved plan terminology or update them in the same tier change.

#### M5. Existing subscribers have no visible named billing period or renewal date on pricing

- Location: pricing current-plan state and account payload.
- Reproduction: render an active subscriber fixture.
- Expected: current plan, interval, renewal/end date, and management action are clear.
- Actual: the UI says “Pro is active” plus remaining outline credits; `currentPeriodEnd` is not displayed there and interval is not stored in the public account type.
- Likely cause: the portal is treated as the detail surface.
- Recommended correction: store/derive the subscribed plan and interval and show the next billing boundary without exposing sensitive Stripe data.

### Low

#### L1. Repeated brand-logo LCP warning

- Location: marketing/application brand logo rendering.
- Reproduction: navigate among public routes in Next development mode and inspect console warnings.
- Expected: above-the-fold logo loading intent is explicit.
- Actual: Next repeatedly recommends eager loading.
- Likely cause: theme-specific logo images are above the fold without eager loading.
- Recommended correction: follow the installed Next.js 16 image guidance and mark only the actually above-the-fold asset for eager loading/fetch priority without loading both theme variants unnecessarily.

#### L2. Domain and contact-address migration

- Location: canonical domain, footer, legal/support mailboxes.
- Reproduction: inspect footer, legal pages, metadata, and email links.
- Expected: Filosage branding with an intentional domain-transition explanation.
- Resolved August 10, 2026: `filosage.com` is the canonical website domain; public website labels, links, reminders, and generated brand assets were migrated together.
- Public contact links now use `support@filosage.com` and `legal@filosage.com`; inbox provisioning and delivery remain a separate operational verification.

## Workflow coverage and observed state

| Area | Evidence | Result / limitation |
| --- | --- | --- |
| Public landing/navigation/footer | Rendered inspection plus E2E | Pass; Filosage branding is consistent. |
| Pricing and interval controls | Rendered desktop/375px plus billing tests | Existing offer works; multi-tier requirements are absent. |
| Legal, support, not-found | Rendered inspection plus E2E | Pass for closed billing; paid launch is explicitly blocked by unresolved disclosures. |
| Signup/onboarding/legal acceptance | Playwright account-onboarding suite | Pass in isolated local fixtures; no external Google account was created during this audit. |
| Learning, notes, tutor, progress, review, evidence | Full Playwright suite | Passed against the historical Free/Pro baseline; current tier coverage is tracked by the implementation tests. |
| Course creation/generation/publishing/deletion | Full Playwright suite and route audit | Passed against the historical Pro/owner baseline; duplication is absent; no real production course was deleted. |
| Checkout/portal/webhooks | Billing lifecycle and offer tests | Closed-lock and mocked lifecycle pass; no live/test Stripe checkout was executed in this audit. |
| Direct API authorization | Route guards plus Playwright tests | Current premium/owner boundaries pass; there is no new-tier policy to test. |
| Upgrade/downgrade/reactivation/renewal | Static lifecycle audit | Generic Pro subscription states exist; plan-to-plan transitions do not. |
| Failed/expired payment | Past-due fixture and webhook model | Portal recovery path exists; detailed customer messaging and lifecycle delivery remain launch gates. |
| Responsive/theme/accessibility | Rendered 1440/375 checks plus E2E | No pricing overflow; strong semantics and theme coverage; formal AT testing remains unrecorded. |

## Required implementation contract after approval

1. Add a shared plan catalog with stable IDs, display values, entitlement keys, included/restricted features, sort order, and active state.
2. Keep currency values in integer minor units; derive yearly savings and monthly equivalent with explicit rounding tests.
3. Separate owned-course limits from AI generation quotas.
4. Change account state from a generic Pro boolean to a resolved plan plus capabilities; keep owner authority separate.
5. Accept and validate `planId + interval` at checkout.
6. Map each Stripe Price ID to exactly one plan/interval/version and persist that mapping from signed webhooks.
7. Add transactional server enforcement for any course-count rule and test direct API bypass attempts.
8. Define non-destructive downgrade behavior before enabling plan changes.
9. Render pricing, current-plan, usage, upgrade, downgrade, and legal/support copy from the approved plan model.
10. Add monthly/yearly checkout, webhook, portal, renewal, past-due, cancellation, reactivation, downgrade, and over-limit tests for every paid tier.
11. Keep billing closed through implementation and test-mode evidence; activation remains a separate explicit decision.

## Approved implementation outcome

The approval request is closed by the resolved decision gate above. Implementation must satisfy the required contract without enabling billing. Stripe products, hosted Price IDs, tax/refund decisions, operator disclosures, lifecycle messaging, and the separate `BILLING_ENABLED=true` decision remain paid-launch gates.

## Implementation verification - 2026-08-09

The approved Free, Filosage Plus, and Filosage Pro model is implemented end to end while paid checkout remains closed.

- Shared plan catalog: stable `free | plus | pro` IDs, integer-minor-unit prices, capabilities, quotas, included and restricted features, and derived annual math.
- Account and authorization: resolved membership plan, owner authority kept separate, public capabilities and capacity state, and server-side capability checks.
- Course capacity: Plus is limited to one active owned private course through a retry-safe Firestore transaction with a bounded reservation lease; direct API bypasses return `409 COURSE_CAPACITY_REACHED`.
- Generation: outline, lesson, tutor, and banner allowances resolve from the shared plan catalog. Local course and lesson fixtures satisfy the same current quality contract as production generation.
- Publishing and downgrade behavior: publishing requires Pro, unpublishing remains available, and downgrades never delete courses or remove existing publications. Over-limit accounts keep read/edit/delete access while new course creation is paused.
- Billing lifecycle: checkout accepts an explicit plan and interval, every configured Stripe Price maps to one plan/interval pair, ambiguous mappings fail closed, and webhook state persists the resolved plan and interval.
- Pricing and support surfaces: all three memberships, monthly/annual amounts, renewal context, exclusions, usage, and non-destructive downgrade behavior are visible and responsive.
- Adjacent regressions: course creation submits only from the explicit third-step action, lesson generation recovers without treating an expected initial `404` as final failure, and logout returns learners to the public landing page.
- Theme assets: light and dark Filosage marks use their corresponding supplied assets at matched dimensions, with only the active above-the-fold variant loaded eagerly.

Final gauntlet evidence:

- TypeScript: passed (`tsc --noEmit`).
- Strict lint: passed (Oxlint and ESLint with warnings denied).
- Playwright: 459 total, 436 passed, 23 intentionally skipped, 0 failed across desktop Chromium, mobile Chromium, and mobile WebKit.
- Next.js production build: passed; 73 pages/routes generated.
- Sites production build: passed.
- Sites release-critical smoke test: 1 passed, 0 failed.
- Diff hygiene: `git diff --check` passed.

Paid launch is still intentionally blocked. The four Stripe Price IDs, operator identity/address/jurisdiction, tax and refund decisions, customer lifecycle messaging, monitored support, Stripe lifecycle evidence, and a separate explicit billing-activation decision remain required. No Stripe object or hosted secret was changed by this implementation.
