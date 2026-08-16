# Filosage marketing improvement Gauntlet design

**Date:** 2026-08-16
**Branch:** `codex/marketing-gauntlet`
**Base SHA:** `242c479ec4707dceb79cc48c2082b71694ae2eaa`
**Release posture:** Local implementation and validation only. Do not push, deploy, change Stripe, enable billing, or publish unrelated work without separate authorization.

## Purpose

Implement the approved marketing improvements as product behavior rather than a copy-only refresh. The Gauntlet establishes a canonical product-marketing contract, makes acquisition and activation measurement honest, improves course discovery and proof, presents Plus and Pro at contextually relevant moments, strengthens the return path without unverified outbound delivery, and ends with a fresh marketing-council acceptance review.

The work must preserve Filosage's learning contract while correcting audience and language positioning that is narrower than the implemented product:

- Filosage serves students, self-directed learners, career changers, and working professionals who want to understand, practice, apply, and demonstrate a meaningful skill for a concrete goal.
- Product, data, analytics, engineering, and adjacent knowledge workers remain an initial validation cohort, not an eligibility boundary or the only audience.
- The application interface is currently English. Course creation defaults to English but supports an editable instruction language or bilingual pairing, and the course pipeline validates generated outlines and lessons against that requested language.
- Guests may inspect public course outcomes, modules, lesson titles, assessment structure, and source status.
- Lesson bodies, saved progress, learning tools, notes, and personal evidence remain account-bound.
- Self-report, observed practice, and assessed evidence remain distinct.
- Plus is the private learning workspace for a current goal. Pro adds portable evidence, advanced evidence analysis, share/export, and publishing.
- `BILLING_ENABLED=false` remains unchanged.

## Outcomes

The implementation is successful when all of the following are true:

1. A canonical product-marketing context exists and matches current product and membership contracts.
2. Acquisition, activation, and retention metrics use cohorts the stored identity model can actually support.
3. The public landing experience uses an explicitly configured flagship course when available and a deterministic safe fallback otherwise.
4. The library offers job-to-be-done starting points without claiming unsupported personalization or market validation.
5. A public evidence demonstration shows the report structure and its limitations without impersonating a real learner, testimonial, credential, or outcome claim.
6. Plus appears after a learner expresses an unmet custom-learning need; Pro appears when portable evidence export/share is relevant.
7. The return loop uses current in-app review and calendar capabilities and does not imply that email delivery exists.
8. Focused automated tests, type checks, lint, production build, desktop/mobile runtime checks, analytics contract checks, and worktree/release-boundary checks pass.
9. A fresh marketing-council review inspects the implemented runtime and returns `ship`. A `revise` result reopens implementation and verification. A `block` result stops release recommendation.

## Non-goals

- Activating billing, creating or modifying Stripe objects, or changing prices.
- Sending email, push, SMS, or calendar invitations to another person.
- Claiming customer demand, learning efficacy, employment outcomes, or professional recognition without evidence.
- Creating testimonials, review scores, customer logos, or synthetic social proof.
- Replacing the course engine, account model, evidence model, or membership entitlement model.
- Launching paid acquisition or broad promotion.
- Claiming that the complete application interface is localized; this Gauntlet markets multilingual course-content creation accurately but does not add interface localization.
- Publishing, deploying, merging, or modifying the original dirty checkout.
- Adding an autonomous recommender or inferring sensitive personal circumstances.

## Isolation and release boundary

All changes occur in the external worktree:

`C:\Users\vitic\Documents\Codex\worktrees\Teach-marketing-gauntlet`

The worktree is on `codex/marketing-gauntlet` at the clean base SHA above. The named checkout at `C:\Users\vitic\OneDrive\Documentos\Teach` contains unrelated CourseDeck and review-artifact changes and must not be modified, staged, committed, or bundled into this Gauntlet.

Each pass ends with its own test and review gate. Local completion never implies permission to push, deploy, or activate billing.

## Architecture

The Gauntlet consists of four passes with explicit interfaces.

### Pass 1: Canonical context and trustworthy measurement

Produces:

- `.agents/product-marketing.md`, the canonical positioning and claims contract.
- `docs/research/MARKETING_HYPOTHESIS_REGISTER.md`, the research status and evidence register.
- Correct acquisition, activation, and retention definitions in the admin overview.
- An allowlisted marketing-surface context for coarse product events.

Depends on:

- `PRODUCT.md`
- `DESIGN.md`
- `docs/PRODUCT_AND_BUSINESS_ROADMAP.md`
- `docs/research/INTERVIEW_GUIDE.md`
- `src/lib/product-events.ts`
- `src/lib/product-analytics.ts`
- `src/app/api/telemetry/route.ts`
- `src/app/api/admin/overview/route.ts`

### Pass 2: Discovery, merchandising, and transparent proof

Produces:

- A small shared merchandising module with job-to-be-done presets and flagship selection.
- A landing-page flagship that follows explicit configuration and fails safely.
- Outcome-oriented library starting points and URL state.
- A public, clearly labeled evidence demonstration independent of private learner data.

Depends on Pass 1's positioning, claim, and event contracts.

### Pass 3: Contextual conversion and safe return behavior

Produces:

- A Plus prompt shown only after an intentional library search or filter has no result.
- A Pro prompt on the evidence surface when export/share would be useful but unavailable.
- Safe plan and source query parameters on the pricing page.
- Current-language return cues and measurement aligned with the existing review/calendar system.

Depends on Pass 1's event-surface allowlist and Pass 2's discovery state.

### Pass 4: Acceptance and marketing verification

Produces:

- Fresh automated and runtime evidence.
- Desktop and mobile captures for the changed public and authenticated surfaces.
- A requirement-by-requirement completion matrix.
- `docs/MARKETING_COUNCIL_VERIFICATION_2026-08-16.md` with a final `ship`, `revise`, or `block` disposition.

Depends on all implementation passes.

## Canonical product-marketing context

Create `.agents/product-marketing.md` with these authoritative sections:

1. **Audience and initial validation cohorts** — students, self-directed learners, career changers, and working professionals as the product audience; knowledge workers as one initial measurable cohort rather than the product boundary.
2. **Primary job** — turn a concrete learning goal into a focused course, applied practice, durable recall, and inspectable evidence.
3. **Competitive alternatives** — generic chat, disconnected tutorials/videos, broad course marketplaces, self-made notes, and doing nothing.
4. **Unique attributes** — outcome definition, public course inspection, Capability Cycle, source-status honesty, private practice, adaptive return, and evidence-state separation.
5. **Value themes** — understand the idea, practice the actual capability, use it in a meaningful context, return before it fades, and show what the record supports.
6. **Category** — self-directed learning and course-creation workspace. Do not create an unfamiliar category or lead with “AI platform.”
7. **Message hierarchy** — concrete learning outcome first; practice and evidence second; source trust, privacy, and requested course language third; AI and usage allowances as implementation details.
8. **Plan triggers** — Free for published learning, Plus for a custom private goal, Pro for portable evidence and publishing.
9. **Claims register** — each claim marked as implemented fact, measured result, hypothesis, or prohibited unsupported claim.
10. **Measurement contract** — acquisition, activation, retention, evidence, referral, and paid-interest definitions.
11. **Research status** — repository-supported versus market-validated, with the latter requiring qualified participant evidence.

This file is documentation for product and marketing decisions. Runtime code must not parse it. Shared runtime constants belong in typed modules and must be tested against the documented contract.

## Customer and job-to-be-done hypothesis validation

No completed participant logs exist in `docs/research`; only the interview guide and template exist. The implementation must not convert those planned interviews into a demand claim.

Create `docs/research/MARKETING_HYPOTHESIS_REGISTER.md` with one row for each proposed starting point:

- School, coursework, or exam
- Personal or self-directed project
- Career change, interview, or portfolio
- Current work decision, project, or promotion

Each row records:

- the declared product basis;
- the exact user-facing language;
- the search terms or discovery behavior it controls;
- the available catalog evidence;
- repository status: `supported` or `unsupported`;
- market status: `unvalidated`, `directional`, or `validated`;
- the interview and behavioral evidence required to advance market status;
- the decision owner and next review condition.

All four starting points become repository-supported through the user-approved audience contract in `PRODUCT.md` and `.agents/product-marketing.md`. The existing roadmap already supports career and work triggers; school and personal-project triggers are an explicit expansion approved in this design review. All remain market-unvalidated until qualified participant evidence exists. UI copy presents them as ways to begin browsing, never as “recommended for people like you” or “proven demand.”

The register also separates interface language from course-content language. It records that the current interface is English while the course studio accepts a specific requested language or bilingual pairing and the pipeline enforces language conformance. Marketing must not describe Filosage as limited to English learners or as a fully localized application.

Before broad promotion, the existing Phase 0 gate still requires 15–20 qualified interviews, at least ten unprompted descriptions of the target problem, five structured-learning commitments, and one repeatable acquisition channel. This Gauntlet does not fabricate or waive that gate.

## Measurement design

### Identity boundary

The stored analytics model intentionally treats anonymous discovery and verified learning differently:

- Anonymous events use a consent-gated first-party actor/session identifier.
- Learning events are rebound by the server to the verified account UID.
- Durable account and billing events are recorded only by the server route performing the action.

Because the anonymous identifier and account UID are not a single durable person identifier, the admin overview must not present one actor-level funnel across that boundary.

### Acquisition funnel

The acquisition funnel uses anonymous, consent-gated session actors and remains coarse:

1. `landing_viewed`
2. `course_discovered`
3. `signup_started`

It reports events, unique actors, and ordered conversion within the measured session population. It does not claim completed-account conversion.

### Activation funnel

The activation funnel uses verified account UIDs:

1. `signup_completed`
2. `course_started`
3. `first_practice_completed`
4. `criterion_demonstrated`
5. `evidence_report_viewed`

Existing accounts that did not sign up inside the reporting window remain visible in a separate course-start-to-practice cohort; they must not be silently discarded or counted as failed signups.

### Retention cohorts

Retention is anchored at the first verified `first_practice_completed` event, not the first anonymous or administrative event.

A meaningful return is a verified learning action after activation from this allowlist:

- `lesson_started`
- `review_completed`
- `retrieval_attempted`
- `transfer_attempted`
- `criterion_demonstrated`
- `evidence_report_viewed`

Day 7 return is any meaningful return in the interval from activation + 6 days through activation + 8 days. Day 28 uses activation + 27 days through activation + 29 days. The owner account is excluded. Eligibility requires the full observation window to have elapsed.

`review_due → review_completed` remains a separate intent-to-action measure and must preserve event ordering.

### Legacy event treatment

`daily_mission_viewed`, `daily_mission_started`, and `weekly_milestone_completed` remain accepted for historical compatibility. The current admin scorecard stops treating daily-mission metrics as a live product contract unless a current UI emitter exists. No historical records are deleted or rewritten.

### Marketing surface context

Add a narrow, allowlisted `surface` field to product-event options and telemetry validation:

- `landing_flagship`
- `library_job_start`
- `library_no_match`
- `evidence_portable`
- `home_review`
- `pricing_direct`

Unknown values are rejected or omitted by the server. The field never contains free text, course responses, search text, email, topic names, or private learning content.

Add coarse events:

- `job_start_selected`
- `upgrade_prompt_viewed`
- `upgrade_prompt_selected`
- `return_recommendation_viewed`
- `return_recommendation_started`

The first three may be anonymous because they describe only public navigation and use an allowlisted surface. Return-recommendation events require a verified account. All analytics remain consent-gated and best effort; telemetry failure never blocks navigation or learning.

Increment `PRODUCT_EVENT_SCHEMA_VERSION` so session-level deduplication does not mix old and corrected semantics.

## Merchandising design

Create `src/lib/marketing-merchandising.ts` with focused responsibilities:

```ts
export type MarketingJobId =
  | "study_goal"
  | "personal_project"
  | "career_goal"
  | "work_goal";

export interface MarketingJobPreset {
  id: MarketingJobId;
  label: string;
  description: string;
  query: string;
}

export function marketingJobPreset(value: string | null): MarketingJobPreset | null;

export function selectFlagshipCourse(
  courses: readonly Course[],
  preferredCourseId?: string,
): Course | null;
```

The module contains no React, fetching, storage, or analytics.

### Job starting points

Each preset supplies a transparent search starting point. Selecting one updates `job=<id>` and `q=<preset query>` in the library URL, then uses the existing search behavior. It does not infer the visitor's role or claim that matching courses are personalized.

The UI labels the controls “What brings you here?” and explains that they start a search the visitor can edit. Direct query, level, and commitment filters continue to work. Invalid job values are discarded without changing other valid filters.

### Flagship selection

Add `NEXT_PUBLIC_MARKETING_FLAGSHIP_COURSE_ID` to `.env.example` as an optional public course identifier.

Selection order is deterministic:

1. The configured course when it exists in the public response and has a non-empty outcome.
2. The lexicographically first public course, by stable course ID then topic, that has an outcome and an artifact, capstone deliverable, or milestone deliverable.
3. The lexicographically first public course with a non-empty outcome.
4. `null`.

The landing page shows the selected course as “Featured course outcome.” When selection returns `null`, it shows the existing honest empty state and links to the teaching standard. Missing or stale configuration never crashes the landing page or silently displays a private course.

Rendering the flagship does not emit `course_discovered`. The existing `landing_viewed` event covers the landing impression, and `course_discovered` remains reserved for opening the actual course page. This preserves the acquisition funnel's meaning instead of counting a hero card as course discovery.

## Transparent evidence demonstration

Create a public route at `/evidence-example`, outside the authenticated `/evidence/[courseId]` route and outside private evidence APIs.

The route renders fixed demonstration data in a dedicated component. It must include:

- a prominent “Demonstration data — not a learner result” label;
- a fictional, role-neutral course topic and concrete learning outcome;
- a pending self-reported starting estimate;
- observed practice records;
- assessed criteria with both met and unresolved examples;
- an explicit statement that the report is not a credential;
- the evidence method and limitations;
- a link to inspect a real public course structure;
- no person name, employer, avatar, quote, testimonial, salary, promotion, or employment claim.

The route does not call progress, account, evidence-share, or AI APIs. It cannot export, create a share token, or be mistaken for an authenticated report. Metadata describes it as an evidence-report example. The landing Evidence section links to it with “Inspect an example evidence report.”

## Contextual conversion design

### Plus after an unmet learning need

The library shows the Plus prompt only when all conditions are true:

- loading has completed without error;
- the visitor has entered a query, selected a job starting point, or changed a filter;
- no public course matches;
- the current account cannot create a private course.

The prompt says that Plus can build a private course around the exact goal and links to `/pricing?plan=plus&from=library-no-match`. It does not say that purchasing guarantees a particular result or that no public course will ever be added.

Visitors who can already create courses see a direct “Create a private course” action instead. The generic no-results recovery and clear-filters action remain available.

The prompt records `upgrade_prompt_viewed` once per session and `upgrade_prompt_selected` on activation with `surface: "library_no_match"`.

### Pro when evidence is ready to leave the app

The authenticated evidence report retains the current on-screen evidence for every eligible learner. When export/share is unavailable, its portable-evidence section explains that Pro adds printable reports, revocable snapshot links, and cross-attempt analysis, then links to `/pricing?plan=pro&from=evidence-portable`.

The prompt records the same upgrade events with `surface: "evidence_portable"`. It never hides current evidence, capstone results, or downgrade-preserved records.

### Pricing query behavior

The pricing page accepts only:

- `plan=plus|pro`
- `from=library-no-match|evidence-portable|direct`

Invalid values fall back to Plus and direct entry. Query parameters select presentation state only; they do not create pricing intent, accept terms, open checkout, or change entitlements. Existing authenticated pricing-intent behavior remains explicit and server-recorded.

Plan descriptions continue to lead with capability differences. Course credits and tutor allowances remain precise secondary usage details.

## Safe return-loop design

The current product already provides review scheduling, a home review signal, weekly progress, in-app schedule preferences, and a device-generated calendar file. This Gauntlet strengthens and measures those capabilities without adding an unverified delivery channel.

Changes:

- Replace “daily mission” wording in learning schedule settings with “recommended next step.”
- Keep the no-penalty and no-backlog promise.
- Track a visible due-review recommendation on the signed-in home with `return_recommendation_viewed` and the review link activation with `return_recommendation_started`, both using `surface: "home_review"`.
- Keep calendar generation on-device.
- Keep the explicit statement that email delivery is off until a transactional provider is configured and verified.
- Do not add streak-loss warnings, artificial urgency, browser notifications, or automatic calendar writes.

If analytics consent is declined or telemetry fails, the return UI behaves identically.

## UI and accessibility behavior

- Preserve the calm, paper-like, quietly premium Filosage system.
- Reuse existing typography, spacing, buttons, cards, focus treatment, and Lucide icons.
- Job starting points use native buttons or links with visible selected state and keyboard support.
- URL-backed discovery state survives reload and back/forward navigation.
- No-results and evidence-example content remain readable at 320 px, 390 px, desktop, dark mode, and reduced motion.
- Dynamic status uses appropriate `role="status"` without repeatedly announcing the entire catalog.
- No animation is required for these features. Existing motion preferences remain respected.

## Error handling and resilience

- Marketing configuration is optional and stale configuration falls back deterministically.
- The evidence example is static and remains available when public-course APIs fail; its real-course link can fall back to `/library`.
- Analytics is fire-and-forget and never delays navigation.
- Invalid URL enums are ignored and removed when the user next changes valid state.
- A public-course request failure keeps the current retry and library actions.
- An empty catalog never creates fabricated course proof.
- Pricing selection never implies checkout readiness.
- No change deletes or migrates product-event documents, courses, progress, evidence, reminders, or membership records.

## Privacy, security, and claims controls

- Anonymous event additions remain coarse and consent-gated.
- Verified learning events continue to be rebound to the authenticated UID by the server.
- `surface` is an enum, not free text.
- Search terms and private learning content are not sent as event metadata.
- The public evidence example contains fixed fictional data only.
- Evidence limitations remain visible wherever evidence is marketed.
- No new external script, tracker, cookie, SaaS integration, or data processor is added.
- `BILLING_ENABLED=false` is verified before release recommendation.

## Testing strategy

Implementation follows test-driven development within each pass.

### Contract and unit coverage

- Product event names, anonymous allowlist, surface enum validation, and schema version.
- Separate acquisition and activation funnels.
- Activation-anchored Day 7/28 retention windows and meaningful-return allowlist.
- Existing-account course-start-to-practice cohort.
- Historical daily-mission compatibility without live scorecard claims.
- Marketing job enum parsing, query mapping, and invalid-value behavior.
- Deterministic configured/fallback flagship selection and private-course exclusion.
- Pricing query parsing.

### Browser coverage

- Landing renders the configured flagship and fallback states.
- Job starting points update URL/search state and remain editable.
- No-match Plus prompt appears only after intentional discovery input.
- Existing course creators receive the create action instead of an upgrade prompt.
- Evidence example exposes all disclosure and limitation language.
- Non-Pro evidence shows the Pro prompt without hiding current evidence.
- Pricing preselects only valid plans and performs no billing mutation.
- Home return recommendation records view/start events without blocking navigation.
- Anonymous decline-consent behavior sends no marketing events.
- Mobile, keyboard, dark mode, and reduced-motion behavior remain usable.

### Regression roots

At minimum rerun:

- `tests/landing-funnel-contract.spec.ts`
- `tests/analytics-consent.spec.ts`
- `tests/membership-analytics.spec.ts`
- `tests/pro-evidence-course-credits.spec.ts`
- `tests/shared-evidence-ui.spec.ts`
- relevant roots in `tests/example.spec.ts`
- affected roots in `tests/app-shell.spec.ts` only from the isolated base; do not absorb the dirty checkout's CourseDeck edits.

### Static and build gates

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`
- secret-pattern scan over changed files
- exact check that `BILLING_ENABLED` was not enabled or weakened

### Runtime acceptance

Run an isolated production-mode server on a verified free port. Do not reuse an ambiguous pre-existing server. Capture and inspect:

- landing flagship, desktop/mobile/light/dark;
- library job starting points and no-match state;
- public evidence example;
- Free evidence Pro prompt;
- signed-in home return recommendation;
- pricing Plus and Pro contextual entries.

Runtime acceptance must confirm the current source build, not a stale `.next` directory. Record port, command, SHA, browser, viewport, and artifact paths.

## Acceptance matrix

| ID | Requirement |
|---|---|
| MKT-CTX-001 | `.agents/product-marketing.md` matches current product, tier, claims, and measurement contracts. |
| MKT-CTX-002 | Product and marketing context includes students, self-directed learners, career changers, and professionals; it distinguishes an English interface from multilingual course-content creation. |
| MKT-RSCH-001 | Four job hypotheses have repository and market status; no missing interview data is presented as validation. |
| MKT-AN-001 | Acquisition and activation funnels are separated at the anonymous/account identity boundary. |
| MKT-AN-002 | Day 7/28 retention is anchored at first practice and counts only meaningful verified return actions. |
| MKT-AN-003 | Legacy mission events remain readable but are not presented as current live behavior without emitters. |
| MKT-AN-004 | New marketing context uses an allowlisted enum and does not transmit search or learning text. |
| MKT-FLG-001 | Valid configured flagship selection wins; invalid/missing/private configuration falls back safely. |
| MKT-JOB-001 | Four editable job starting points update URL-backed discovery state without personalization claims. |
| MKT-PRF-001 | Public evidence example is visibly synthetic, privacy-safe, inspectable, and explicitly not a credential. |
| MKT-CRO-001 | Plus prompt appears only after an unmet intentional discovery action and preserves recovery choices. |
| MKT-CRO-002 | Pro prompt appears at portable evidence without hiding existing learner evidence. |
| MKT-CRO-003 | Pricing context cannot create checkout, intent, consent, or entitlement state by itself. |
| MKT-RET-001 | Return recommendation uses current review state and remains functional with analytics disabled. |
| MKT-RET-002 | Calendar remains device-generated and email delivery remains explicitly off. |
| MKT-A11Y-001 | Changed surfaces pass keyboard, mobile, dark-mode, reduced-motion, and automated accessibility checks. |
| MKT-REL-001 | Original dirty checkout remains untouched and the implementation contains only Gauntlet files. |
| MKT-REL-002 | `BILLING_ENABLED=false` and all payment/release approval boundaries remain unchanged. |
| MKT-VRF-001 | Focused tests, type check, lint, build, diff, secret, and runtime gates have fresh evidence. |
| MKT-CNL-001 | Final marketing-council review returns `ship`; `revise` and `block` cannot be reported as completion. |

## Gauntlet loop

For each pass:

1. Reconfirm exact files and clean isolated worktree state.
2. Write the smallest failing tests that prove the pass acceptance IDs.
3. Run them and capture the expected failure.
4. Implement the bounded change.
5. Run focused tests until green.
6. Run affected regressions.
7. Inspect diff, privacy, claims, billing, and unrelated-file boundaries.
8. Perform a fresh review against the pass acceptance IDs.
9. Fix every in-scope blocker and repeat focused verification.
10. Commit only the pass files with an intentional message.

The final pass then runs static, build, runtime, and council gates across the integrated branch.

## Rollback

No pass performs destructive data migration, so rollback is code/config only:

- Context and research documents can be reverted independently.
- Admin metrics can revert to the previous calculation without rewriting event history.
- New event names can remain accepted even if UI emitters are disabled.
- Removing the optional flagship environment value restores deterministic fallback.
- Job starting points, evidence example links, and contextual prompts can be removed without affecting learning data.
- Return analytics can be disabled without changing review schedules or calendar preferences.
- `BILLING_ENABLED=false` stops paid checkout regardless of contextual pricing links.

Before any future release, record the exact commit that reverts each pass and verify the resulting build.

## Final marketing-council gate

After implementation and runtime verification, rerun the `marketing-council` skill against the actual branch and captures. Seat at least:

- April Dunford for positioning and alternatives;
- Seth Godin for audience, trust, and product remarkability;
- Alex Hormozi for offer certainty and time-to-value;
- Byron Sharp as the reach/distinctiveness dissenter;
- Claude Hopkins for measurable response and experiment discipline.

The council must explicitly recheck the original findings:

1. scorecard integrity;
2. job-based merchandising;
3. flagship control;
4. transparent evidence proof;
5. contextual Plus and Pro triggers;
6. safe return behavior;
7. category accessibility and distinctive assets;
8. audience breadth and accurate multilingual course-content positioning;
9. unsupported claims, privacy, and billing boundaries.

Disposition rules:

- `ship`: no unresolved release blocker; remaining market-validation work is clearly labeled and broad promotion remains gated.
- `revise`: a correctable implementation, measurement, copy, accessibility, or trust issue remains. Return to the relevant pass.
- `block`: the implementation would mislead users, weaken privacy or billing controls, corrupt measurement, expose private data, or cannot be verified against the current source.

Only `ship` permits a local completion recommendation. Push, deployment, production verification, paid activation, and broad promotion remain separate owner decisions.
