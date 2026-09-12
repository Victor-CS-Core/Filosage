# Filosage Product and Business Roadmap

Status: proposed implementation blueprint  
Date: July 28, 2026  
Planning horizon: 12 months, released through evidence-gated phases

> **Audience revision (2026-08-16):** The owner approved a broader product contract after a full capability audit. Filosage serves eligible independent students, self-directed learners, career changers, working professionals, and individual course creators. Knowledge workers remain one initial campaign cohort, not the product boundary. The interface is English today; eligible course creation supports a requested language or bilingual pairing. Market demand remains unvalidated until the gates below are met.

## Executive decision

Filosage should not launch with a vague "learn anything with AI" promise. Its category is a self-directed learning and course-creation workspace, and its promise is a focused course, deliberate practice, useful review, and inspectable evidence for one meaningful goal.

Filosage's launch position will be:

> Filosage helps an eligible independent learner turn a meaningful goal into a focused course, practice it deliberately, return before it fades, and inspect what the evidence supports.

The promise is not access to generated content or guaranteed mastery. It is a bounded learning route with practice and honest evidence.

The product contract is broad enough for four learning situations while acquisition experiments remain deliberately bounded:

- Product audience: eligible independent students aged 13+, self-directed learners, career changers, working professionals, and individual course creators.
- Learning situations: coursework or exam, personal project, career or portfolio goal, and current work decision or project.
- Initial campaign cohort: product, data, analytics, engineering, and adjacent knowledge workers may remain the first measured cohort.
- Desired outcome: a learner can explain the concept, apply it to a new situation, and produce an inspectable artifact appropriate to the learner-supplied context.
- Interface and language boundary: the interface is English; eligible course creation accepts a requested language or bilingual pairing.
- Current exclusions: under-13 users, school or team administration, accredited credentials, a social creator marketplace, enterprise LMS replacement, and autonomous high-stakes advice.

No audience or campaign may be described as validated until Filosage demonstrates qualified activation, retention, learning improvement, and demand in that cohort.

## Business truth and investment policy

No implementation plan can guarantee that Filosage will compete successfully or return a profit. The plan therefore treats additional investment as conditional. Each phase has a measurable gate; a failed gate requires correction, repositioning, or stopping before the next major spend.

The operating principles are:

1. Validate demand before building breadth.
2. Sell outcomes, not token quotas.
3. Measure learning improvement, not only clicks and completions.
4. Keep AI costs bounded per account and visible to the owner.
5. Do not activate billing until the product, legal, support, and subscription lifecycle gates pass.
6. Keep public courses public and private drafts server-authorized.
7. Prefer a small trusted catalog over a large unreviewed catalog.
8. Do not build enterprise, native mobile, or marketplace complexity before consumer retention is proven.

## Product strategy

### Core job to be done

When I need to learn a difficult concept for a meaningful goal, help me understand my starting point, follow a credible focused path, practice the skill, retain it, and inspect evidence of what I can use.

### Product promise

Every Filosage learning path should provide:

- A specific target outcome.
- A starting diagnostic.
- A plan adapted to existing knowledge and available time.
- Lessons that correct named misconceptions.
- Guided and independent practice.
- Retrieval and spaced review.
- Source provenance and visible content confidence.
- A capstone or applied work product assessed against a rubric.
- An evidence report showing what the learner demonstrated.

### North-star metric

**Weekly demonstrated outcomes:** the number of learners who pass at least one new applied criterion during a seven-day period.

This is preferable to page views, time spent, or AI request volume because it represents delivered value.

### Supporting metrics

Acquisition:

- Qualified landing-page visitors.
- Visitor-to-course-start conversion.
- Visitor-to-account conversion after receiving value.
- Organic and referral share of new activated learners.

Activation:

- Learner defines a real outcome.
- Learner completes the diagnostic.
- Learner receives a plan.
- Learner completes the first practice task within 24 hours.
- Time from arrival to first learning value.

Learning:

- Pre-test to post-test improvement.
- Delayed-recall improvement after 7 and 28 days.
- Transfer-task success.
- Capstone criteria passed.
- Confidence calibration: confidence compared with actual performance.
- Courses and lessons rejected by the quality gate.

Retention:

- Day 1, Day 7, Day 28, and Day 56 learner retention.
- Percentage of due reviews completed.
- Weekly learning mission completion.
- Learners starting a second outcome after finishing the first.

Revenue:

- Waitlist-to-trial and trial-to-paid conversion.
- Monthly and annual paid conversion.
- Monthly voluntary and involuntary churn.
- Average revenue per paying account.
- Contribution margin per account.
- Customer acquisition cost and payback period.
- Refund and chargeback rate.

Trust:

- Factual-error reports per 1,000 lessons.
- Median time to resolve a content report.
- Public lessons with complete source provenance.
- Learner-reported usefulness after applied tasks.

## Business model

Reconciled with the source contract on 2026-09-06. The original July 28 proposal used anonymous local progress and one monthly Plus outline/ten lessons; those assumptions are superseded below. This is source documentation, not hosted acceptance. `config/release-capabilities.json` records the optional release selection; paid availability still requires the separate commercial gates.


### Free

Free exists to deliver genuine learning value and create qualified demand:

- Discover published course outcomes and structure without an account.
- Open published lesson bodies, quizzes, retrieval, and scheduled reviews with a verified Free account.
- Save and sync learner work under that verified account.
- Complete one guided outcome plan from the public catalog.
- Receive a small grounded-tutor allowance.
- View a basic evidence-of-learning summary.

### Plus

Plus is the focused private-authoring step for one current outcome:

- Receive two monthly course credits, with unused credits rolling over up to 24.
- Redeem a credit for a private outline and its planned lessons, plus forty monthly tutor questions.
- Complete lesson activities sequentially before generating the next lesson.
- Keep the course private; public publishing remains a Pro capability.

The current $9.99 monthly and $79.92 annual prices remain hypotheses until real demand and retention evidence support activation.

### Pro

Pro receives five monthly course credits with rollover up to 60; a redeemed outline grants its planned lessons. Publishing requires completion, attestation, and the applicable publication-proof contract.

Pro must be positioned around personal outcomes, not raw generations:

- Create private outcome plans.
- Receive a starting diagnostic and adaptive path.
- Build source-grounded courses from approved links and documents.
- Use expanded tutor, simulation, and feedback allowances.
- Receive deeper capstone assessment and revision guidance.
- Maintain a longitudinal mastery and misconception profile.
- Export evidence reports and work artifacts.
- Re-plan a course when performance, time, or goals change.

The current $14.99 monthly and $119.88 annual Pro prices are hypotheses, not facts. Keep both Plus and Pro offers during initial validation for continuity, but validate willingness to pay before activation. Test the value proposition before testing discounts.

### Later expansion

Only after consumer product-market evidence:

- Expert plan: authoring, review workflow, branded collections, and performance insights.
- Team plan: private learning spaces, role-based paths, assignment, and aggregate reporting.
- Assessment product: paid skill evidence or portfolio review.

Do not claim accreditation or employer recognition without real partners and an appropriate verification process.

## Unit economics policy

The offer model now covers Plus and Pro across monthly and annual billing. Catalog-price MRR is a nominal run rate, not collected revenue; annual contracts are divided by 12 once. Contribution modeling remains incomplete until actual payment fees, AI use, infrastructure, support, refunds, taxes, failed payments, content review, acquisition, and founder labor are measured by plan.

Before paid launch, calculate contribution using:

`revenue - payment fees - AI - infrastructure - support - refunds - variable content review`

Required operating thresholds:

- Target variable gross margin: at least 75%.
- Hard paid-account AI ceiling: no more than 30% of net subscription revenue.
- Target steady-state customer acquisition payback: six months or less.
- No paid acquisition scale-up until retention produces a credible lifetime-value estimate.
- No unlimited AI language in marketing.
- Every expensive AI action must have quota, reservation, idempotency, and cost attribution.
- Recalculate model rates and quotas monthly and whenever providers or prompts change.

The owner dashboard should replace hard-coded modeled cost with observed cost distributions: median, 75th percentile, 95th percentile, and maximum cost by plan and feature.

## Defensible product moat

The moat will be the **Filosage Mastery Graph**, not course generation.

For each learner and objective, it records:

- Prerequisite concepts.
- Diagnosed starting knowledge.
- Named misconceptions.
- Retrieval performance over time.
- Confidence calibration.
- Guided and independent practice performance.
- Transfer-task evidence.
- Capstone rubric criteria.
- Source and content version used during learning.
- Evidence decay and next review.

This data should power:

- Adaptive lesson order.
- Review timing.
- Tutor context.
- Re-teaching decisions.
- Evidence reports.
- Better quality-gate evaluation.
- Aggregated insight into which explanations and tasks produce durable learning.

The data must not be used for high-stakes employment or education decisions without explicit consent, appropriate validity evidence, and legal review.

## Required product workstreams

### 1. Outcome onboarding and diagnostic

Build:

- A five-minute outcome brief: target, context, deadline, current experience, weekly time, and desired artifact.
- A short adaptive diagnostic before course generation.
- An initial knowledge and misconception profile.
- A plan preview that explains why lessons were included or skipped.
- A 24-hour first win: one useful practice task immediately after onboarding.

Acceptance:

- A new learner reaches a relevant practice task in under ten minutes.
- A returning learner can revise the goal without losing prior evidence.
- The plan does not claim to diagnose competence from self-report alone.
- Analytics distinguish arrival, outcome definition, diagnostic completion, plan creation, and first practice.

Likely implementation areas:

- `src/app/create/page.tsx`
- New onboarding and diagnostic routes
- `src/lib/course-types.ts`
- `src/lib/learning-types.ts`
- Course-generation validation and prompts
- Progress and learner-state APIs

### 2. Adaptive mastery engine

Build:

- Objective, prerequisite, and rubric-criterion entities.
- Performance-based lesson recommendations.
- Separate recognition, recall, transfer, and capstone evidence.
- Confidence calibration.
- Re-teach, retry, and skip decisions.
- A versioned review scheduler that can be evaluated against outcomes.

Acceptance:

- Adaptation is explainable to the learner.
- One incorrect multiple-choice answer does not become a permanent skill judgment.
- Mastery requires transfer evidence, not lesson attendance.
- Scheduling logic has deterministic unit tests.
- Historical evidence remains interpretable after algorithm changes.

Likely implementation areas:

- `src/lib/learning-types.ts`
- `src/lib/course-progress.ts`
- `src/lib/learning-progress.ts`
- `/api/progress`
- Lesson and progress pages
- New mastery-policy module and tests

### 3. Source-grounded content and trust

Build:

- Course-level source packs: approved URLs, uploaded files, or owner-curated references.
- Per-claim or per-section source references where appropriate.
- Source snapshots, access dates, and content versions.
- Clear labels for AI-assisted, expert-reviewed, owner-curated, and learner-created material.
- "Report a problem" on every public lesson.
- Owner review queue with severity and unpublish controls.
- Course quality score based on schema, source coverage, learner reports, and outcome data.
- Content versioning so progress points to what was actually studied.

Acceptance:

- Every new public course has review status and source provenance.
- A critical content report can remove a lesson from public discovery without deleting evidence.
- Generated citations are validated against the supplied source set.
- The app never presents an invented citation as proof.
- High-stakes topics receive stronger warnings or are excluded from public generation.

Likely implementation areas:

- Course and lesson schemas
- Generation APIs and prompts
- New source-ingestion and report APIs
- Owner admin review surfaces
- Azure PostgreSQL authorization and Blob storage policies
- Legal and privacy documentation

### 4. Curated launch catalog

Build:

- Twelve flagship courses selected for explicit campaign cohorts and learning situations without redefining the product audience.
- A shared curriculum map so courses connect instead of duplicating concepts.
- Expert review checklist.
- One free flagship pathway that demonstrates the complete Filosage loop.
- Category landing pages with real search intent and structured metadata.
- Editorial ownership, review date, source list, prerequisites, and expected work artifact.

Suggested first catalog:

1. Systems Thinking for Product Decisions
2. Practical Statistics for Product Teams
3. Designing Trustworthy Experiments
4. Reading Metrics Without Fooling Yourself
5. Causal Reasoning for Product Decisions
6. Product Strategy From First Principles
7. Writing Testable Product Hypotheses
8. Data Storytelling for Decisions
9. AI Literacy for Product and Data Professionals
10. Evaluating AI Features and Models
11. Decision-Making Under Uncertainty
12. Capstone: Diagnose a Real Product Decision

Acceptance:

- Every course passes the published teaching standard.
- Every course has a real applied artifact and rubric.
- At least three qualified reviewers evaluate each flagship pathway before broad promotion.
- Catalog pages have unique, useful content rather than programmatic SEO filler.

### 5. Daily and weekly retention loop

Build:

- A daily mission combining due review and one forward-learning action.
- A weekly outcome milestone.
- Calendar and email reminders controlled by the user.
- Missed-session recovery without punishment.
- A concise weekly evidence report.
- Second-outcome recommendation after capstone completion.

Acceptance:

- Reminders are opt-in, frequency-controlled, and one-click unsubscribable.
- Streaks never hide actual learning performance.
- The system prioritizes overdue fragile concepts over arbitrary activity.
- A learner can pause or reschedule an outcome.
- Retention events are measurable without collecting unnecessary personal data.

### 6. Evidence of learning

Build:

- Baseline and final assessment using parallel, not identical, tasks.
- Delayed check at 7 and 28 days.
- Capstone rubric feedback with revision history.
- Evidence report showing demonstrated criteria, attempts, sources, and limitations.
- Private-by-default share link with explicit learner control.
- Exportable work artifact and evidence summary.

Acceptance:

- Reports distinguish completed, attempted, and demonstrated.
- AI feedback is labeled and can be challenged or reported.
- Share links are revocable and reveal no private notes by default.
- The product never calls an internal badge a credential.
- Learning claims are based on recorded evidence.

### 7. Conversion and subscription experience

Build only after the evidence gate:

- Outcome-focused pricing page.
- Monthly and annual checkout.
- Optional trial or first-outcome guarantee only after abuse and cost analysis.
- Customer portal, cancellation, payment recovery, and entitlement synchronization.
- Upgrade prompts at moments of proven value, not before the learner experiences the loop.
- Clear usage meters and cost-safe overage behavior.
- Billing support workflow and audit trail.

Acceptance:

- Webhook handling is verified, idempotent, and authoritative.
- Successful checkout, duplicate delivery, renewal, failed payment, cancellation, refund, and deletion are tested.
- Price, currency, tax handling, renewal, limits, refund terms, operator identity, and support contact are disclosed.
- Billing remains fail-closed.
- `BILLING_ENABLED=false` remains in place until a separate owner-approved activation.

Likely implementation areas:

- Billing APIs and entitlement synchronization
- Account and pricing pages
- Release environment checker
- Billing integration tests
- Terms, privacy, refund, and support surfaces

### 8. Distribution engine

Build:

- Search-indexable public course, concept, and teaching-standard pages.
- Shareable course maps and evidence artifacts.
- A weekly practitioner newsletter based on flagship material.
- Course-request capture with topic and real-world outcome.
- Referral attribution.
- Expert co-author landing pages.
- Product-led invitations to review or discuss a learner-created artifact.

Initial channels:

1. Search: high-intent questions tied to a specific study, project, career, or work goal.
2. LinkedIn: applied lesson excerpts and work artifacts.
3. Expert partners: co-created flagship courses.
4. Product, data, and analytics communities.
5. Learner referrals after an evidence milestone.

Acceptance:

- Every channel has source attribution through activation and paid conversion.
- Public content is useful without registration.
- No paid channel scales before organic activation and retention are credible.
- Acquisition reporting excludes bots and owner traffic where practical.

### 9. Expert and team expansion

Do not begin until the consumer retention and monetization gates pass.

Expert plan:

- Structured authoring and source packs.
- Review and approval workflow.
- Course analytics tied to learning evidence.
- Expert profile and co-branding.
- Revenue sharing only after demand exists.

Team plan:

- Private workspace.
- Team-created role paths.
- Invitation and seat management.
- Aggregate progress with learner privacy.
- Manager-defined outcomes.
- No exposure of private notes or tutor conversations.

Acceptance:

- At least three design partners commit to a paid pilot before general team development.
- Authorization is organization- and role-aware on the server.
- Team reporting uses appropriate aggregate thresholds.
- Team pricing covers support and implementation costs.

### 10. Product operations and support

Build:

- In-product feedback with context and consent.
- Content-report queue and response targets.
- Billing-support workflow.
- Status and incident communication.
- Data export and deletion verification.
- Backup, restore, and recovery procedures.
- Feature flags and rollback paths for AI changes.
- Prompt, model, schema, and quality-gate versioning.
- Experiment registry with owner, hypothesis, metric, and decision date.

Acceptance:

- Every production incident has an owner and audit trail.
- AI model or prompt changes can be compared with the prior version.
- Critical paths have synthetic monitoring.
- Support contact and expected response time are visible.
- No admin action relies on UI-only authorization.

## Analytics implementation

The current admin dashboard tracks traffic, generation, saved learning activity, safety, and modeled costs. Extend it with a versioned event taxonomy.

Minimum events:

- `landing_viewed`
- `course_discovered`
- `course_started`
- `outcome_defined`
- `diagnostic_started`
- `diagnostic_completed`
- `plan_created`
- `first_practice_completed`
- `lesson_started`
- `retrieval_attempted`
- `transfer_attempted`
- `criterion_demonstrated`
- `review_due`
- `review_completed`
- `capstone_submitted`
- `capstone_criterion_passed`
- `evidence_report_viewed`
- `evidence_report_shared`
- `pricing_viewed`
- `waitlist_joined`
- `checkout_started`
- `subscription_started`
- `subscription_canceled`
- `content_reported`

Each event should include only the necessary fields:

- Anonymous or authenticated actor ID.
- Session ID.
- Event and schema version.
- Timestamp.
- Course, lesson, objective, and experiment identifiers where relevant.
- Acquisition source.
- Plan and access level.
- Content, prompt, and model version where relevant.
- No raw tutor prompts, private notes, or sensitive free text in analytics.

Core funnels:

1. Qualified visitor → course start → first practice → account.
2. Outcome defined → diagnostic → plan → first practice within 24 hours.
3. First practice → Day 7 active → Day 28 active → demonstrated outcome.
4. Demonstrated free value → pricing → checkout → retained paid account.
5. Public lesson → share/referral → new qualified learner.

## Quality and experimentation program

### Learning-quality evaluation

Create a fixed evaluation set for each initial domain:

- Factual accuracy.
- Source faithfulness.
- Objective alignment.
- Misconception quality.
- Worked-reasoning completeness.
- Distractor quality.
- Transfer distance.
- Rubric reliability.
- Accessibility.
- Safety.

Every prompt, model, or schema change must run against the evaluation set. Production rollout requires no critical regression and a documented decision.

### Product experiments

Run one primary experiment at a time for a given funnel. Early experiments:

1. Professional-outcome positioning versus general "learn anything."
2. Course-first versus outcome-diagnostic onboarding.
3. Immediate practice task versus plan preview first.
4. Weekly evidence report versus conventional progress summary.
5. Outcome-based pricing copy versus AI-credit pricing copy.

Do not use pricing experiments to obscure the actual renewal price or limits.

## Phased delivery roadmap

Timelines are estimates for a small focused team and should be recalibrated after technical design.

### Phase 0 — Demand and measurement foundation

Target: Weeks 1–2

Deliver:

- Interview script and 15–20 interviews with a declared first campaign cohort; the initial knowledge-worker cohort remains acceptable.
- Positioning landing-page variant and outcome-based waitlist questions.
- Event taxonomy, north-star dashboard specification, and experiment registry.
- Current baseline for activation, retention, learning, and AI cost.
- Twelve-course launch curriculum and expert-review rubric.
- Data model technical design for the Mastery Graph and source packs.

Go gate:

- At least ten qualified interviewees describe the target problem without prompting.
- At least five agree to complete a structured learning outcome in the current product.
- The team can name one repeatable acquisition channel to test.
- Baseline instrumentation can answer the core funnels.

If the gate fails:

- Narrow the occupation, trigger, or subject.
- Do not build team features or activate billing.

### Phase 1 — Outcome validation

Target: Weeks 3–8

Deliver:

- Outcome onboarding.
- Diagnostic and plan explanation.
- Mastery Graph v1.
- One complete flagship pathway and three supporting courses.
- Source provenance and lesson reporting.
- Baseline/final transfer assessment.
- Evidence report v1.
- Instrumented public outcome experience used by 25–50 qualified learners.

Go gate:

- At least 50% of qualified starters complete diagnostic and first practice.
- Median time to first practice is under ten minutes.
- At least 60% of learners who reach the capstone improve from baseline.
- At least 70% rate the pathway as useful for their stated work outcome.
- Critical factual-error rate is below the agreed launch threshold.

If the gate fails:

- Fix onboarding, course quality, or target market before expanding the catalog.

### Phase 2 — Retention and adaptive learning

Target: Weeks 9–14

Engineering status on 2026-07-28: release candidate complete. The adaptive loop, delayed checks, reminder preferences, pause/reschedule controls, quality regressions, and retention measurement are implemented. The catalog-review work and all live Day 7, Day 28, qualitative, and commercial evidence gates remain open; implementation is not evidence that the gate passed.

Deliver:

- Daily mission and weekly milestone.
- Performance-based adaptation.
- Confidence calibration.
- 7-day and 28-day delayed checks.
- Reminder preferences and pause/reschedule.
- Remaining flagship catalog, subject to review capacity.
- Learning-quality regression suite.

Go gate:

- Day 7 retained learner rate of at least 35% among activated learners.
- Day 28 retained learner rate of at least 20%.
- At least 35% of due review sessions are completed.
- At least 25% of activated learners demonstrate one applied criterion.
- Qualitative interviews confirm that return behavior is driven by the outcome, not only reminders.

If the gate fails:

- Improve the learning loop and outcome relevance before monetization.

### Phase 3 — Paid launch readiness

Target: Weeks 15–18

Deliver:

- Outcome-based Pro packaging.
- Observed cost distributions and margin dashboard.
- Complete Stripe subscription lifecycle and billing tests.
- Support and refund workflow.
- Final operator, tax, legal, privacy, and cancellation review.
- Pricing-intent test with activated learners.

Go gate:

- At least 15% of activated learners express credible purchase intent at the tested price, or at least five commit to the paid plan.
- Observed variable gross margin is projected at 75% or better.
- 95th-percentile paid-account AI cost stays below the hard cost policy.
- Subscription lifecycle, support, legal, and release checks pass.
- The owner separately authorizes changing `BILLING_ENABLED` to `true`.

If the gate fails:

- Change packaging, value, limits, or price; do not compensate with hidden restrictions.

### Phase 4 — Controlled paid launch and growth

Target: Months 5–8

Deliver:

- Controlled Pro release.
- Search and expert-partner content engine.
- Referral attribution and shareable evidence.
- Lifecycle email and weekly report.
- Churn, failed-payment, and cancellation analysis.
- Two additional flagship pathways chosen from demand.

Go gate:

- Trial-to-paid or activated-free-to-paid conversion reaches at least 5%.
- Monthly voluntary churn trends below 7% after the first 50 paid subscribers.
- Refund and chargeback rates remain below 5% combined.
- Customer acquisition payback is projected at six months or less.
- At least 30% of activated acquisition is organic, referral, or partner-led.

If the gate fails:

- Stop paid acquisition and fix retention, positioning, or onboarding.

### Phase 5 — Expansion

Target: Months 9–12

Deliver only the path supported by demand:

- Limited expert authoring access, or
- Team learning pilot, or
- A second learning-situation or campaign cohort supported by evidence.

Go gate for teams:

- Three organizations commit to paid design-partner pilots.
- The same core learning loop works for at least ten learners inside a team.
- Pricing covers onboarding and support.

Go gate for experts:

- Five credible experts commit to publish and review.
- Expert-led acquisition converts better than the owner-only catalog.
- Review quality and rights management are operationally sustainable.

## First six-week implementation backlog

### Week 1

- Approve or revise the initial customer and positioning.
- Add product event names, schemas, and privacy rules.
- Add owner-traffic exclusion and acquisition attribution.
- Create experiment registry and baseline dashboard.
- Draft the interview script and keyed learning-situation positioning experiment.

### Week 2

- Complete interviews and record structured findings.
- Define Mastery Graph and source-pack data models.
- Define the first flagship course and review rubric.
- Create pre-test, transfer task, capstone, and delayed-check specifications.
- Make the Phase 1 go/no-go decision.

### Week 3

- Build outcome onboarding and diagnostic shell.
- Implement objective, prerequisite, misconception, and criterion entities.
- Add event instrumentation through first practice.
- Begin source provenance and content versioning.

### Week 4

- Connect diagnostic results to plan generation.
- Build plan explanation and lesson skip/include reasoning.
- Add baseline assessment and first-practice flow.
- Add lesson-level content reporting.

### Week 5

- Build evidence report v1.
- Add owner content-review queue.
- Complete the first flagship pathway.
- Add quality-evaluation fixtures and deterministic tests.

### Week 6

- Run accessibility, security, cost, and end-to-end gates.
- Open the public outcome experience to 25–50 qualified learners.
- Review activation and error data daily.
- Do not start Phase 2 until Phase 1 evidence is available.

## Definition of a full commercial product

Filosage is ready for a controlled paid launch only when all of the following are true:

- A named customer and job to be done are reflected throughout the product.
- The full arrival-to-demonstrated-outcome funnel is measured.
- The product has credible evidence of learning improvement.
- Day 7 and Day 28 retention meet the phase gates.
- Public content has provenance, review status, and reporting.
- Private content and owner operations are server-authorized.
- AI actions have cost controls, attribution, and quality regression tests.
- Subscription creation, renewal, failure, cancellation, refund, and deletion work.
- Legal operator and consumer disclosures are complete.
- Support and incident processes exist.
- Variable gross margin is observed, not merely modeled.
- The catalog is small enough to review and large enough to deliver the initial promise.
- Acquisition has at least one repeatable, measurable channel.
- The owner explicitly approves billing activation and production deployment.

## Work intentionally deferred

Until the relevant evidence gates pass, do not prioritize:

- Native iOS or Android apps.
- A general social feed.
- An open course marketplace.
- Accredited credentials.
- Instructor-led group infrastructure.
- School district features.
- Broad enterprise LMS integrations.
- Large-scale paid advertising.
- Unlimited AI plans.
- More visual polish without a measured funnel problem.

## Decision cadence

Every two weeks:

- Review learner interviews, activation, learning evidence, retention, reports, AI cost, and incidents.
- Decide: continue, change, pause, or stop the current experiment.

Every month:

- Recalculate unit economics.
- Review model and prompt quality.
- Review content-report trends.
- Choose one primary product bottleneck.

Every phase:

- Record the gate evidence.
- Approve the next investment explicitly.
- Preserve `BILLING_ENABLED=false` and keep deployment separate unless activation or deployment is specifically authorized.

## Market reference points

The plan responds to a market where large incumbents already compete through scale, content, credentials, tutoring, and habit:

- Duolingo FY2025 results: https://www.sec.gov/Archives/edgar/data/1562088/000162828026012246/q4fy25duolingo12-31x25shar.htm
- Khanmigo learner positioning and pricing: https://www.khanmigo.ai/learners
- Coursera Q4/FY2025 product and scale report: https://s27.q4cdn.com/928340662/files/doc_financials/2025/q4/COUR_Shareholder-Letter_Q4-2025.pdf

Filosage should not attempt to beat these companies at their existing scale advantages. It should win a narrower job through a more coherent outcome loop, stronger evidence, and trustworthy source-grounded personalization.
