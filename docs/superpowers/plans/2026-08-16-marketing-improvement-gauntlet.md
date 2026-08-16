# Filosage Marketing Improvement Gauntlet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the owner-approved, capability-grounded marketing improvements without promoting unavailable, disabled, unverified, or unsupported features.

**Architecture:** Keep product truth in a versioned marketing context and research register; keep runtime enums and calculations in typed, testable modules. Layer public merchandising, transparent evidence proof, contextual plan prompts, and return measurement onto existing APIs and entitlement checks without changing billing, payment, account, course, or evidence storage contracts.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Zod, Playwright, existing Filosage CSS and Lucide icons.

## Global Constraints

- Work only in `C:\Users\vitic\Documents\Codex\worktrees\Teach-marketing-gauntlet` on `codex/marketing-gauntlet`.
- Do not push, deploy, merge, enable billing, change Stripe, publish courses, or modify the dirty named checkout.
- Keep `BILLING_ENABLED=false`; contextual plan links must not create checkout, pricing intent, consent, or entitlements.
- Product audience: eligible independent students aged 13+, self-directed learners, career changers, working professionals, and individual course creators as a secondary audience.
- Category: self-directed learning and course-creation workspace.
- Use “portable evidence,” with professional use as one example; never present Filosage evidence as a credential.
- State language capability exactly: the interface is English today; course creation accepts a requested language or bilingual pairing and the pipeline checks generated content against that request.
- Do not claim market validation, learning efficacy, guaranteed outcomes, customer proof, localization, accreditation, email delivery, unlimited AI, or hosted availability for a flag-gated feature without fresh production evidence.
- Flashcards, V2 labs, lesson visuals, Command Center, publication, AI generation, and checkout remain conditional on their existing flags, entitlements, and hosted configuration.
- Follow TDD for runtime behavior: write a behavior test, observe the expected failure, implement the minimum, rerun green, then refactor.

---

### Task 1: Canonical product truth and inclusive generation defaults

**Files:**
- Create: `.agents/product-marketing.md`
- Create: `docs/research/MARKETING_HYPOTHESIS_REGISTER.md`
- Modify: `PRODUCT.md`
- Modify: `README.md`
- Modify: `docs/PRODUCT_AND_BUSINESS_ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-08-16-marketing-improvement-gauntlet-design.md`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/library/layout.tsx`
- Modify: `src/app/pricing/page.tsx`
- Modify: `src/app/create/page.tsx`
- Modify: `src/app/api/generate-course/route.ts`
- Modify: `src/lib/membership-plans.ts`
- Modify: `src/components/marketing/MarketingHero.tsx`
- Modify: `src/components/marketing/FeatureGrid.tsx`
- Modify: `src/components/marketing/MarketingFAQ.tsx`
- Modify: `src/content/support/articles/plans-and-billing.ts`
- Test: `tests/billing-offer.spec.ts`
- Test: `tests/marketing-gauntlet.spec.ts`

**Interfaces:**
- Produces: product-marketing context v1; a capability/claims register; four market-unvalidated job hypotheses; role-neutral generation instructions; public metadata and plan language that match implemented capabilities.
- Consumes: current membership capabilities, course-language input, content-language validation, legal eligibility, and feature-flag inventory documented by the capability audit.

- [ ] **Step 1: Add the behavior-level creation and public-positioning acceptance test**

Add a Playwright test that opens Course Studio with an authenticated eligible creator, verifies study/personal/career/work examples and the editable bilingual language field, submits a personal-study brief through a mocked `/api/generate-course`, and asserts the request preserves that application and language without requiring workplace fields. Add a public-page assertion that the home page describes a goal and does not define Filosage as professional-only or English-only.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "inclusive course creation|broad product positioning"`

Expected: FAIL because the existing Course Studio labels, landing copy, and metadata still use professional/work-only framing.

- [ ] **Step 3: Write the canonical documents and minimal inclusive copy/prompt changes**

Create `.agents/product-marketing.md` at document version v1 with the approved category, audience, job, competitive alternatives, tier story, language contract, capability availability table, proof status, claim prohibitions, measurement definitions, and changelog. Create the hypothesis register with `repository-supported` and `market-unvalidated` kept separate. Reconcile stale Plus/access language in README and product/roadmap documents. Change the generation instruction from a professional artifact to a concrete inspectable artifact appropriate to the learner-supplied academic, personal, creative, civic, career, or work context.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "inclusive course creation|broad product positioning"`

Expected: PASS with the request retaining the chosen personal-study application and bilingual language.

- [ ] **Step 5: Run affected regressions and commit the pass**

Run: `npx.cmd playwright test tests/course-pipeline-v2-regressions.spec.ts tests/landing-funnel-contract.spec.ts tests/tier-consistency-contract.spec.ts --project=chromium`

Commit only Task 1 files with: `git commit -m "feat: align product marketing with learner capabilities"`

---

### Task 2: Trustworthy marketing event and scorecard contracts

**Files:**
- Create: `src/lib/product-metrics.ts`
- Modify: `src/lib/product-events.ts`
- Modify: `src/lib/product-analytics.ts`
- Modify: `src/app/api/telemetry/route.ts`
- Modify: `src/app/api/admin/overview/route.ts`
- Modify: `src/lib/admin-types.ts`
- Modify: `src/app/admin/page.tsx`
- Test: `tests/marketing-gauntlet.spec.ts`

**Interfaces:**
- Produces: `MarketingSurface`, `MarketingJobStart`, and `CourseLanguageMode` allowlists; schema version 2; separate acquisition and activation funnels; activation-anchored Day 7/28 retention; current review-intent metrics without live mission claims.
- Consumes: stored product-event records with trusted account actor IDs and anonymous session IDs.

- [ ] **Step 1: Add pure metric and telemetry contract tests**

Use literal event fixtures to assert:

```ts
expect(buildMarketingFunnels(records).acquisition.map((step) => step.event))
  .toEqual(["landing_viewed", "course_discovered", "signup_started"]);
expect(buildMarketingFunnels(records).activation.map((step) => step.event))
  .toEqual(["signup_completed", "course_started", "first_practice_completed", "criterion_demonstrated", "evidence_report_viewed"]);
expect(retentionAtDay(records, 7, now)).toEqual({ eligible: 1, returned: 1, percent: 100 });
```

Add request tests proving an allowlisted `surface`, `jobStart`, and `courseLanguageMode` are stored, while arbitrary free text is rejected and anonymous return events receive 401.

- [ ] **Step 2: Run the contract tests and verify RED**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "marketing metric|telemetry context"`

Expected: FAIL because schema v1 has no marketing context and the scorecard combines anonymous and account events.

- [ ] **Step 3: Implement typed context and pure scorecard calculations**

In `product-events.ts`, export fixed tuples and derived types for:

```ts
export const MARKETING_SURFACES = ["landing_flagship", "library_job_start", "library_no_match", "evidence_portable", "home_review", "pricing_direct"] as const;
export const MARKETING_JOB_STARTS = ["study_goal", "personal_project", "career_goal", "work_goal"] as const;
export const COURSE_LANGUAGE_MODES = ["english", "single_non_english", "bilingual"] as const;
```

Accept only those enums in telemetry and never send raw queries, topics, goals, language names, or learning responses. Move ordered-funnel and retention calculations into `product-metrics.ts`; exclude the owner; use first `first_practice_completed` as retention activation; require elapsed observation windows; count only the approved meaningful-return events. Update admin types and labels to show separate acquisition and verified activation funnels plus existing-account course-start-to-practice, and remove the live mission-start card while continuing to accept legacy events.

- [ ] **Step 4: Run the contract tests and verify GREEN**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "marketing metric|telemetry context"`

Expected: PASS with arbitrary context rejected and identity-bound funnels separated.

- [ ] **Step 5: Run affected regressions and commit the pass**

Run: `npx.cmd playwright test tests/analytics-consent.spec.ts tests/membership-analytics.spec.ts tests/tier-consistency-contract.spec.ts --project=chromium`

Commit only Task 2 files with: `git commit -m "fix: separate acquisition activation and retention metrics"`

---

### Task 3: Controlled flagship and editable learning-situation discovery

**Files:**
- Create: `src/lib/marketing-merchandising.ts`
- Modify: `.env.example`
- Modify: `src/components/marketing/PublicCourseProof.tsx`
- Modify: `src/components/CourseLibrary.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/marketing-gauntlet.spec.ts`

**Interfaces:**
- Produces: `marketingJobPreset(value)`, `selectFlagshipCourse(courses, preferredCourseId)`, four URL-backed job starts, language-visible/searchable cards, and deterministic public flagship fallback.
- Consumes: public `Course[]`, optional `NEXT_PUBLIC_MARKETING_FLAGSHIP_COURSE_ID`, current query/level/commitment filters, and existing entitlement state.

- [ ] **Step 1: Add merchandising unit and browser tests**

Assert configured public outcome-bearing course selection, stale/private/missing configured fallback, deterministic ID/topic ordering, invalid job parsing, and all four literal preset mappings. In the browser, select “Coursework or exam,” verify `job=study_goal` and editable `q`, use Back/Forward, and verify course language appears in the card. Assert the flagship is labeled “Featured course outcome” and links to the selected public course.

- [ ] **Step 2: Run the merchandising tests and verify RED**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "flagship|learning-situation discovery"`

Expected: FAIL because selection is array-order dependent and the library has no job or language state.

- [ ] **Step 3: Implement the pure module and minimal UI**

Keep `marketing-merchandising.ts` free of React, fetching, storage, and analytics. Use native buttons with `aria-pressed`; explain that each button starts an editable search, not a personalized recommendation. Preserve existing filters and popstate behavior, remove invalid job values on the next valid update, include `course.language` in search fields and card metadata, and emit only `job_start_selected` with `surface: "library_job_start"` and the allowlisted `jobStart`.

- [ ] **Step 4: Run the merchandising tests and verify GREEN**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "flagship|learning-situation discovery"`

Expected: PASS across configured, fallback, empty, invalid-URL, and editable-query states.

- [ ] **Step 5: Run affected regressions and commit the pass**

Run: `npx.cmd playwright test tests/landing-funnel-contract.spec.ts tests/example.spec.ts --project=chromium -g "landing|library|course catalog"`

Commit only Task 3 files with: `git commit -m "feat: add capability-grounded course merchandising"`

---

### Task 4: Transparent evidence proof and contextual plan entry

**Files:**
- Create: `src/app/evidence-example/page.tsx`
- Create: `src/app/evidence-example/layout.tsx`
- Create: `src/components/marketing/EvidenceExample.tsx`
- Create: `src/lib/pricing-context.ts`
- Modify: `src/components/marketing/EvidenceDossier.tsx`
- Modify: `src/components/CourseLibrary.tsx`
- Modify: `src/app/evidence/[courseId]/page.tsx`
- Modify: `src/app/pricing/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/sitemap.ts`
- Test: `tests/marketing-gauntlet.spec.ts`

**Interfaces:**
- Produces: static `/evidence-example`; `parsePricingContext`; library no-match Plus action; evidence-surface Pro action; safe plan/source presentation state.
- Consumes: current `canCreateCourses`, evidence export/share capabilities, billing status endpoint, and existing pricing intent/checkout actions.

- [ ] **Step 1: Add evidence, no-match, entitlement, and pricing tests**

Assert the example is visibly fictional, role-neutral, has self-report/observed/assessed/unresolved evidence, states it is not a credential, makes no private API requests, and has no export/share controls. Assert intentional no-result searches show Plus only for accounts that cannot create; eligible creators get `/create`. Assert non-Pro evidence keeps all on-screen evidence and links to `/pricing?plan=pro&from=evidence-portable`. Assert invalid pricing query values fall back to Plus/direct and query parsing alone performs no POST.

- [ ] **Step 2: Run the evidence/conversion tests and verify RED**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "evidence example|contextual plan|pricing context"`

Expected: FAIL because the example route and contextual gates do not exist.

- [ ] **Step 3: Implement static proof and entitlement-aware prompts**

Render fixed demonstration data only. Reuse existing evidence visual language, add a prominent “Demonstration data — not a learner result” label and limitation footer, and link to `/library`. Show the Plus prompt only after intentional input, completed loading, no error, no public match, and `canCreateCourses === false`; keep clear filters. Change evidence labeling to portable evidence, preserve current evidence, and show Pro only when export/share is unavailable. Parse only `plan=plus|pro` and `from=library-no-match|evidence-portable|direct`; use them for selection/copy only.

- [ ] **Step 4: Run the evidence/conversion tests and verify GREEN**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "evidence example|contextual plan|pricing context"`

Expected: PASS with zero private evidence/progress/share calls from the public example and zero billing mutations from query state.

- [ ] **Step 5: Run affected regressions and commit the pass**

Run: `npx.cmd playwright test tests/pro-evidence-course-credits.spec.ts tests/shared-evidence-ui.spec.ts tests/landing-funnel-contract.spec.ts --project=chromium`

Commit only Task 4 files with: `git commit -m "feat: add transparent evidence and contextual plan paths"`

---

### Task 5: Safe return measurement and integrated acceptance

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/LearningScheduleSettings.tsx`
- Modify: `src/app/course/[topic]/page.tsx`
- Modify: `src/components/marketing/LandingPage.tsx`
- Modify: `src/components/marketing/MarketingFAQ.tsx`
- Modify: `tests/marketing-gauntlet.spec.ts`
- Create: `docs/MARKETING_GAUNTLET_ACCEPTANCE_2026-08-16.md`

**Interfaces:**
- Produces: consent-gated home-review view/start events; coarse course-language mode on course start; exact claims on the integrated public surface; acceptance matrix evidence.
- Consumes: existing due-review queue, device-generated calendar, email-disabled copy, course language, analytics consent, and event enums from Task 2.

- [ ] **Step 1: Add return and conditional-capability tests**

Assert a signed-in learner with a due review sees the existing review destination, emits one `return_recommendation_viewed` and one click-driven `return_recommendation_started` with `surface: "home_review"`, and still navigates when telemetry fails or consent is declined. Assert Course Studio and course start emit only coarse language mode. Assert no public changed surface promotes flashcards, V2 labs, lesson visuals, email delivery, paid checkout, or fully localized UI as unconditionally available.

- [ ] **Step 2: Run the return tests and verify RED**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "return recommendation|conditional capability"`

Expected: FAIL because the existing review card is not instrumented and daily-mission wording remains.

- [ ] **Step 3: Implement minimal return instrumentation and final claim corrections**

Emit view only when the authenticated home has a non-empty due queue; emit start from the existing `/review` link without awaiting telemetry. Replace “daily mission” with “recommended next step” in settings while retaining no-penalty/backlog, device-calendar, and email-off statements. Add coarse `courseLanguageMode` to existing course discovery/start events. Correct remaining changed-surface copy but do not add disabled feature promises.

- [ ] **Step 4: Run the return tests and verify GREEN**

Run: `npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium -g "return recommendation|conditional capability"`

Expected: PASS with navigation unaffected by consent or telemetry failure.

- [ ] **Step 5: Run complete static and automated gates**

Run in order:

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npx.cmd playwright test tests/marketing-gauntlet.spec.ts tests/landing-funnel-contract.spec.ts tests/analytics-consent.spec.ts tests/membership-analytics.spec.ts tests/pro-evidence-course-credits.spec.ts tests/shared-evidence-ui.spec.ts tests/course-pipeline-v2-regressions.spec.ts --project=chromium
npm.cmd run build
git diff --check
```

Also scan changed files for secrets and assert `.env.example` still contains `BILLING_ENABLED=false` and no tracked runtime file enables it.

- [ ] **Step 6: Run production-mode desktop/mobile runtime acceptance**

Start the validated branch on a verified free loopback port with isolated data/build directories. Capture and inspect landing flagship, four library entry points, no-match entitlement variants, evidence example, Free evidence Pro prompt, home due-review state, and Plus/Pro pricing context at desktop, 390 px mobile, dark mode, and reduced motion. Record SHA, port, commands, browser, viewport, flags, and artifact paths in the acceptance document.

- [ ] **Step 7: Commit the integrated acceptance pass**

Commit Task 5 files and acceptance evidence with: `git commit -m "feat: complete verified marketing improvement gauntlet"`

---

### Task 6: Final simulated marketing-council ship gate

**Files:**
- Create: `docs/MARKETING_COUNCIL_VERIFICATION_2026-08-16.md`
- Modify only if council returns `revise`: the smallest files and tests associated with the cited blocker.

**Interfaces:**
- Produces: an explicitly simulated, dossier-grounded council review with a `ship`, `revise`, or `block` disposition.
- Consumes: `.agents/product-marketing.md`, capability audit, current diff/SHA, acceptance matrix, automated output, and inspected runtime captures.

- [ ] **Step 1: Rerun the council against implemented evidence**

Seat April Dunford, Seth Godin, Alex Hormozi, Byron Sharp as dissenter, and Claude Hopkins. Recheck scorecard integrity, job merchandising, flagship control, fictional proof, Plus/Pro triggers, return behavior, category accessibility, audience breadth, language accuracy, privacy, billing, and unsupported claims.

- [ ] **Step 2: Apply the disposition gate**

- `ship`: write the council verification and continue to final branch verification.
- `revise`: add a failing test for each correctable blocker, implement the minimum fix, rerun affected and integrated gates, then reconvene.
- `block`: stop and report the exact privacy, billing, claims, data, or verification blocker; do not recommend release.

- [ ] **Step 3: Run fresh final verification**

Rerun the full Task 5 static/test/build/diff/secret/billing commands after the final council-approved diff. Verify `git status --short`, inspect every changed file, and confirm the original named checkout still contains only its pre-existing unrelated changes.

- [ ] **Step 4: Finish locally without external mutation**

Report the exact tested branch SHA, commits, test counts, build result, council disposition, remaining market-validation work, and release boundary. Do not push, deploy, merge, or enable billing without a separate owner instruction.
