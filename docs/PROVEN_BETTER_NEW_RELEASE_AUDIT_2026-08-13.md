# Proven–Better–New release audit

Date: August 13, 2026
Target: subscriptions available by August 31, 2026
Decision: **No-go for a broad paid launch today. Conditional go for a small founding cohort by month-end.**

## Executive finding

Filosage has more product and engineering depth than most pre-launch learning products. The application already contains outcome planning, diagnostics, structured lessons, active practice, adaptive review, capstone assessment, evidence reports, metered AI use, billing lifecycle code, support tooling, privacy controls, and a mature Azure release path.

The primary risk is not missing software. It is that the product currently asks the market to understand and trust too many unproven ideas at once. The public promise is broad, the paid tiers emphasize course-generation and publishing limits, the first lesson is behind account creation, and the live catalog does not yet substantiate the source-grounded trust claim. All eight public courses inspected on August 13 report zero source-pack entries and `factualReviewStatus: unverified`.

The shortest credible path to subscriptions is to narrow the product to one familiar professional-learning workflow, create one immediately felt improvement, and expose only one distinctive experiment.

Recommended launch wedge:

> **Make a defensible product decision in 14 days.** Diagnose a real decision, practice with realistic evidence, finish a decision memo, and leave with an evidence report showing what you demonstrated.

This is narrower than the long-term platform and better aligned with the existing flagship course, target customer, analytics, and evidence system.

## The framework used

Mark Pincus's Proven–Better–New framework separates a product into:

- **Proven:** the familiar behavior and best-of-breed mechanics that already work for the same audience and platform.
- **Better:** one obvious improvement that users of the proven alternative would consistently prefer.
- **New:** one distinctive, risky bet that creates trial or advantage and is tested in isolation.

The framework is not a feature-count rubric. A product can be highly complete and still fail it if the proven base is obscured, the better claim is not demonstrated, or several new behaviors are bundled together.

## Scorecard

| Dimension | Score | Finding |
| --- | ---: | --- |
| Proven | 6/10 | The course, lesson, assessment, progress, tutor, review, and subscription mechanics are familiar and well implemented. The product has not documented a best-of-breed workflow benchmark, and the account wall appears before the first full lesson experience. |
| Better | 4/10 | "Outcome to applied evidence" is a credible improvement over completion-focused courses, but the landing page does not make the gain concrete and no live activation, learning, retention, or willingness-to-pay evidence proves that users prefer it. |
| New | 8/10 | The evidence-first mastery loop, source status, adaptive mission, assessed capstone, and AI-authored private learning path are distinctive. Too many of these are presented as simultaneous bets rather than one isolated experiment. |
| Commercial readiness | 3/10 | Checkout and entitlement code exist, but the repository's paid-launch gates still require legal disclosures/review, lifecycle email, monitored operations, Stripe Live review, retention policy, open-report resolution, and explicit activation. |
| Technical readiness | 8/10 | Strict lint, TypeScript, and the 73-route production build pass on the current commit. Production health reports the same commit and healthy configuration/datastore. One high-severity transitive `nanoid` advisory remains. |

**Verdict:** the product does not currently pass Proven–Better–New strongly enough for a broad subscription launch.

## What is proven

The dependable base is substantial:

- A browsable course library with familiar course outcomes, modules, lesson titles, progress, quizzes, practice, and capstones.
- Free account, paid membership, checkout, webhook, portal, cancellation, downgrade, quota, and entitlement patterns.
- A conventional web experience with responsive navigation, accessibility tests, support, privacy, legal, and account controls.
- A release process with isolated QA, immutable images, blue/green promotion, health checks, and rollback.

What weakens this layer:

1. The repository has no explicit, current benchmark of the exact best-in-class arrival-to-first-practice workflow being copied.
2. Guests can inspect structure but cannot experience a complete lesson or practice before creating an account. The user must trust the claim before feeling the product's value.
3. Product documentation disagrees about anonymous lesson access. `README.md` and the Phase 0 baseline describe it as available; the current product contract and UI require a verified account.
4. The live catalog mixes professional decision-making with storytelling, astronomy, memory, algebra, analytical writing, and general AI literacy. It communicates a broad AI course generator instead of a sharp professional outcome product.

## What could be better

The strongest candidate is not "more AI" or "more courses." It is:

> **Reach a credible, useful work artifact faster than a conventional self-paced course.**

For the launch wedge, the artifact is a defensible decision memo. The measurable improvement should be:

- median time from arrival to first relevant practice under 10 minutes;
- a completed, reviewable work artifact within 14 days;
- evidence showing which criteria were actually demonstrated rather than a completion percentage;
- less irrelevant content because diagnosis can skip or emphasize material.

This is only a hypothesis today. The baseline explicitly records zero interviews, zero structured learning commitments, zero credible purchase commitments, and no measurable Day 7 or Day 28 retention. The product must call this a launch hypothesis until users demonstrate otherwise.

## What should remain new

Use **the evidence report** as the single visible New bet for the founding cohort.

It is the best candidate because it is already implemented, connected to baseline/practice/capstone signals, aligned with the product's north-star metric, and easy for a learner to show or discuss. It also gives Filosage a better story than generic personalization.

Treat these as supporting mechanics, not simultaneous headline innovations:

- AI course authoring;
- adaptive daily missions;
- the Mastery Graph;
- source-pack status;
- multiple teaching modes;
- creator publishing;
- agent-driven operations.

The public message should explain one familiar product, one improvement, and one new payoff.

## Release blockers

### Product and evidence

- No completed 15–20 qualified interviews or corresponding demand gate.
- No live first-practice, usefulness, Day 7, Day 28, or willingness-to-pay results.
- Eight live courses span several audiences; none has a source-pack entry and all report unverified factual review status.
- The first complete learning experience is gated behind account creation.
- Free, Plus, and Pro package different authoring/publishing capabilities, while the target customer is primarily a learner pursuing one outcome.

### Commercial and operational

- Final legal operator name, business address, governing jurisdiction, tax treatment, and independent legal review are not recorded as complete.
- Lifecycle email delivery, bounce/suppression handling, renewal, cancellation, and failed-payment communications are open.
- Stripe Live products, prices, webhook, portal, tax, refund, descriptor, and historical-price handling require final review.
- Retention schedule and resumable deletion process are open.
- Production alert receiver, signed alert test, external health monitor, and support acceptance evidence remain open in the launch register.
- High-risk safety/privacy/copyright/account reports must be confirmed resolved.
- `BILLING_ENABLED=true` requires a separate owner decision after every gate passes.

### Technical

- `npm audit` reports `nanoid@3.3.17`, pulled through Next.js/PostCSS, under GHSA-2v37-7h3g-55p8. Production dependency audit therefore does not currently pass cleanly.
- The fresh full cross-browser Playwright invocation exceeded the five-minute audit window and needs a bounded rerun or CI evidence before release sign-off. This is not evidence of a test failure.

## Recommended product changes

### P0 — isolate the launch product

1. **Turn the flagship into a 14-day guided decision sprint.** Use the existing "Evidence-based product decisions for small software teams" course, outcome planner, diagnostic, first practice, capstone, and evidence report. Add a visible day/step framing without inventing a new learning system.
2. **Replace generic landing copy with the concrete outcome.** Show the decision memo and evidence report, not a generic course dashboard. The primary CTA should start the diagnostic or a representative practice task.
3. **Deliver one complete value moment before signup.** Let a guest complete a short diagnostic plus one representative practice interaction. Require a free account to save the result, continue the path, use the tutor, or receive the evidence report.
4. **Expose one founding subscription.** Sell the focused private outcome experience. Keep public publishing and unlimited course creation owner/invite-only for now. Backend tier support can remain, but the launch page should not ask learners to choose between authoring limits and publishing rights.
5. **Unpublish or separate off-wedge catalog items.** The launch library should lead with the flagship and at most three reviewed supporting courses. Move other courses to a clearly labeled lab or private QA catalog.
6. **Close the content-trust gap.** Add authoritative source packs, named review ownership, review dates, and qualified factual review to the flagship and supporting courses. Do not market source grounding while every live course is source-empty and unverified.

### P1 — make the Better claim measurable

1. Add an explicit `guest_practice_completed` or equivalent event before signup.
2. Add cohort fields for launch sprint, variant, and founding offer.
3. Put the example artifact/evidence report on landing and track inspection-to-start conversion.
4. Instrument the exact funnel: qualified landing → diagnostic → first practice → account → Day 7 → capstone → evidence report → checkout.
5. Add one-question usefulness feedback immediately after first practice and after the capstone.
6. Add cancellation-reason and "what alternative would you use?" capture without obstructing cancellation.

### P2 — keep out of the launch

- Additional subject categories.
- Open creator marketplace.
- Team workspaces.
- Credential or employer-recognition claims.
- More plan tiers.
- Broad autonomous agent features.
- New lesson-mode invention unless it directly improves the flagship's activation or outcome evidence.

## Founding subscription recommendation

Use one public paid choice for the first cohort:

**Filosage Founding — one active professional outcome at a time**

- Personal diagnostic and plan.
- Full guided decision sprint.
- AI tutor and feedback within a clear fair-use quota.
- Adaptive review through the sprint.
- Capstone assessment and revision guidance.
- Exportable evidence report and decision memo.
- Founding-member feedback access.

Do not headline model names, generation counts, banners, or publishing. These are implementation details, not the purchase reason.

The existing price should remain a test. Do not claim it is validated. A small cohort can be offered the current monthly price only after the legal, support, billing, and lifecycle gates pass; collect explicit qualitative purchase reasoning alongside conversion.

## August 13–31 execution plan

### August 13–16: decide and clean the promise

- Approve the launch wedge and one paid offer.
- Rewrite landing, pricing, and onboarding around the 14-day decision sprint.
- Decide which course is the flagship and which three, if any, support it.
- Resolve the anonymous-access documentation contradiction.
- Patch the dependency advisory and rerun release gates.

Exit gate: a new visitor can explain who Filosage is for, what they will produce, how long it takes, and why it is better after seeing the first screen.

### August 17–21: create trustworthy proof

- Source and independently review the flagship course.
- Publish a real example decision memo and evidence report.
- Open guest diagnostic/first practice and place signup after value.
- Configure and test lifecycle email, support handling, alerting, external monitoring, retention/deletion procedures, and legal disclosures.
- Complete Stripe Live configuration review without enabling checkout.

Exit gate: flagship content passes the review rubric; the complete guest-to-evidence journey works; every paid-launch operational checklist item has evidence.

### August 22–26: run the founding cohort dry run

- Recruit 10–20 qualified design partners from one defined channel.
- Run at least five through the journey while observing time to first practice and comprehension.
- Complete Stripe test lifecycle, signed-in deletion, support, refund, cancellation, renewal, failure, bounce, suppression, and webhook scenarios.
- Fix only launch-blocking friction and trust defects.

Exit gate: at least five qualified users commit to the outcome, the majority reach first practice within ten minutes, and no P0/P1 operational or content issue remains.

### August 27–29: release candidate

- Freeze non-launch feature work.
- Run lint, TypeScript, production build, dependency audit, complete cross-browser E2E, exact-SHA QA, accessibility smoke, secret scan, production health, and rollback rehearsal.
- Verify legal pages, support inboxes, external monitors, operations alerts, transactional email, Stripe objects, portal, refund process, and content-report queue on the exact candidate.
- Record a signed go/no-go review against the launch register.

### August 30–31: controlled opening

- If every hard gate passes, enable subscriptions for a capped founding cohort only.
- Monitor checkout, webhooks, AI cost, support, errors, first practice, and cancellations daily.
- Keep paid acquisition off.
- If any hard gate remains open, keep billing disabled and open a reservation/deposit-free founding list instead.

## Launch decision rule

Open a capped founding subscription cohort only if all are true:

- Flagship content is source-backed and independently reviewed.
- The exact release passes all automated and manual checks.
- Legal/operator disclosures and review are complete.
- Stripe and lifecycle messaging pass the full test matrix.
- Backups, restore evidence, alerts, monitoring, support, retention, and deletion are operational.
- At least five qualified users make credible commitments to use the sprint.
- First-practice usability sessions show the promised under-ten-minute path is credible.
- The owner explicitly authorizes billing activation.

Do not require Day 28 evidence before a small controlled founding cohort; that evidence cannot exist by August 31. Do require it before broad promotion, paid acquisition, or declaring product-market fit.

## Immediate decision

The recommended next implementation is the **guest first-practice slice plus concrete flagship landing page**, because it strengthens the Proven workflow, tests the Better claim, and gives the evidence report a clean New payoff. It can reuse existing diagnostics, practice, analytics, authentication, and evidence components rather than creating a new system.
