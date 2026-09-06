# Filosage product capability and marketing audit

> Historical record retained with its original date. Reconciliation on 2026-09-06: new candidates use `config/release-capabilities.json` and `docs/RELEASE_CAPABILITIES.md`. Earlier all-on activation or publication-review statements do not establish current hosted availability or completion of the unified publication-proof gate. No historical run is reclassified as a current pass.


**Status:** Owner-approved implementation basis
**Audit date:** 2026-08-16
**Base SHA:** `242c479ec4707dceb79cc48c2082b71694ae2eaa`
**Review boundary:** Repository and local-runtime evidence only. No market demand, learning efficacy, revenue, production configuration, or customer outcome is inferred from implementation.

## Decision

The earlier marketing review was not complete enough to authorize app-wide implementation. It inspected important marketing surfaces, but it inherited a narrow professional and English-speaking audience definition from product documents that do not fully describe the implemented product.

This audit replaces that assumption with a capability-first contract:

- Filosage is a general-audience, individual learning and course-creation product for people aged 13 or older.
- Independent students, self-directed learners, career changers, working professionals, and individual course creators can all be valid users.
- Product, data, analytics, engineering, and adjacent knowledge workers may remain an initial acquisition or validation cohort. They are not the product eligibility boundary.
- The current application interface is English.
- Paid course creation defaults to English but accepts a requested course language or bilingual pairing. The generation and quality pipelines carry that request through and validate language conformance.
- Multilingual course content is not the same claim as a localized interface or a dedicated language-learning pedagogy.
- Filosage is not a school-controlled service, classroom or teacher platform, accredited program, credential issuer, employer decision system, or replacement for qualified high-stakes advice.
- Paid checkout remains closed and `BILLING_ENABLED=false` remains mandatory.

The current marketing Gauntlet stays under review until the owner accepts the capability map, audience boundaries, and revised recommendation set below.

## Audit method and coverage

The review used a source-precedence rule so stale positioning documents could not override current behavior:

1. Server authorization, schemas, entitlement policy, feature flags, and mutation routes.
2. Focused automated tests and recorded implementation evidence.
3. Current page and component behavior.
4. Public copy, metadata, support articles, and legal disclosures.
5. Product and roadmap documents when they do not conflict with implemented behavior.

Repository inventory at the audited SHA:

| Surface | Count | Review method |
|---|---:|---|
| App pages | 23 | Every page route inventoried; primary learner and owner surfaces inspected directly. |
| API routes | 60 | Every route inventoried by method and access boundary; capability-bearing routes inspected through source and system maps. |
| App and API routes combined | 83 | All assigned to the capability groups below. |
| React and TypeScript components | 55 | All inventoried; every learner-facing feature component inspected directly or through its owning page. |
| Library modules | 132 | Capability, policy, analytics, language, learning, evidence, entitlement, safety, and persistence modules inspected selectively by responsibility. |
| Playwright specification files | 45 | Test inventory reviewed; focused runtime suites are a required follow-up gate. |

This is a complete product-capability review, not a claim that every line of implementation received a security or code-quality review. Admin internals are mapped for product and trust implications but are not proposed as customer-facing marketing features.

## Route and capability map

### 1. Public discovery and trust

**Routes and owners**

- `/` through `LandingPage` and the marketing component set
- `/library` through `CourseLibrary`
- `/course/[topic]` through the public course overview and `CourseJourneyMap`
- `/standard`
- `/support` and `/support/articles/[slug]`
- `/pricing`
- `/terms`, `/privacy`, `/acceptable-use`, and `/copyright`
- dynamic sitemap and robots policies

**Implemented capability**

- Guests can inspect a published course's outcome, modules, lesson titles, approximate time, level, artifact or capstone shape, and source status.
- Public course pages disclose source-backed, hybrid, model-knowledge, legacy, publication-review, and AI-assisted states without treating a reference as proof of a claim.
- Search accepts topic, outcome, category, prerequisite, artifact, capstone, module, lesson, concept, and objective text. Filters currently cover level and time commitment.
- Support articles, a searchable support center, legal policies, plan availability, optional analytics consent, and content/source reporting create meaningful trust infrastructure.

**Marketing limits**

- Lesson bodies and saved learner work are account-bound even though some stale documentation says anonymous lessons are available.
- Search does not currently expose job, audience, course language, or bilingual filters.
- The landing page and global metadata still frame the product around professional skills and outcomes.
- Public course metadata is derived primarily from the topic slug and does not currently express the stored course language, artifact, outcome, or evidence state.
- No customer testimonial, employment outcome, efficacy result, accredited credential, or market-demand result is implemented or verified.

### 2. Identity, eligibility, and learner control

**Routes and owners**

- `AuthProvider`, `AuthModal`, Azure Easy Auth session handling, and legal acceptance
- `/profile`
- `/privacy-center`
- `/api/account`, `/api/account/data`, `/api/account/identity`, and `/api/legal/acceptance`

**Implemented capability**

- Verified accounts open published lessons and sync progress, notes, preferences, evidence, and review state.
- Learners can download account data, control optional first-party analytics, submit privacy requests, and request irreversible account deletion with reauthentication.
- Accounts can be suspended without silently deleting learner content.
- Free accounts are available to people aged 13 or older, subject to guardian agreement where required.

**Marketing limits**

- Filosage is a general-audience service, not a school-controlled education service.
- Paid plans are currently defined for individual United States residents aged 18 or older, and paid checkout is closed.
- The app has no classroom roster, teacher dashboard, assignments, grading workflow, school administration, team workspace, or organization billing.
- Marketing to “students” must mean eligible independent learners, not imply institutional or under-13 use.

### 3. Outcome planning and adaptive route

**Routes and owners**

- `/course/[topic]`
- `OutcomePlanner`
- `/api/mastery`, `/api/assess-baseline`, and `/api/outcome-feedback`

**Implemented capability**

- A learner can define an observable outcome, application context, proof artifact, weekly time, optional target date, and a self-reported diagnostic for each module.
- The app recommends a starting lesson, explains the route, supports pause, resume, and reschedule, and preserves schedule history.
- An optional signed-in baseline can assess the same capstone criteria used later, keeping self-report separate from assessed work.
- Completed pathways can collect a usefulness rating and optional qualitative note.

**Marketing limits**

- The route is deterministic and evidence-aware, not a clinically, academically, or psychometrically validated personalization system.
- A usefulness rating is feedback, not proof of learning efficacy.
- Current prompts and examples overuse workplace language even though the fields support school, personal, creative, civic, hobby, career, and professional contexts.

### 4. Lesson learning and practice

**Routes and owners**

- `/course/[topic]/lesson/[lessonId]`
- `LessonExperience`, `InteractiveLessonBlock`, `LessonStudyTools`, `LessonVisual`, `LessonIntegrityPanel`, `LessonSectionNavigator`, and `SpeakButton`
- `/api/progress`, `/api/lesson-activity`, `/api/lesson-interaction`, and `/api/chat`

**Implemented capability**

- Lessons can contain concise Markdown explanations, structured tables and lists, accessible generated learning visuals, key takeaways, and speech playback.
- Active lesson modes include concept prediction, worked example, comparison, case study, practice lab, and synthesis.
- Practice can include recognition, classification, sequence, scenario, guided practice, transfer, retrieval checks, first-attempt tracking, confidence calibration, and retry feedback.
- Completion requires the relevant practice, interaction, transfer, and retrieval evidence instead of treating page exposure as mastery.
- Notes, bookmarks, device drafts, tutor prompts, and lesson-grounded study tools are available within the learning flow.
- The tutor offers hints, teach-back, fresh examples, and one-question-at-a-time quizzing within plan limits.

**Marketing limits**

- AI-assisted content can be wrong or incomplete and is not professional advice.
- Lesson visuals, V2 labs, and other advanced pipeline capabilities are feature-flagged and cannot be promised as universally active without environment evidence.
- “Demonstrated” has a bounded internal evidence meaning; it is not a credential, grade, license, or guarantee of real-world performance.

### 5. Retention, review, and personal knowledge tools

**Routes and owners**

- signed-in home at `/`
- `/review` and feature-gated `/review/flashcards`
- `/progress` and `/profile`
- `CourseDeck`, `MasteryPath`, `EvidencePortfolio`, `LearningScheduleSettings`, `DashboardCustomizer`, and achievement badges

**Implemented capability**

- The home deck resumes active courses and surfaces weekly progress, due review, and learning rhythm.
- Review uses due time, prerequisite readiness, evidence fragility, delayed checks, and a finite session cap.
- Progress separates activity, concept state, confidence calibration, practice evidence, capstone status, course completion, and review schedule.
- Learners can configure a weekly goal, dashboard presentation, in-app reminder preference, and an on-device recurring calendar file.
- Flashcards are generated only when the learner asks. They can be grounded at lesson, module, or course scope; generated cards can be edited, reviewed, scheduled, and removed.
- Plus and Pro can create fully custom decks; Free can generate and edit course-grounded decks when the feature is enabled.

**Marketing limits**

- Flashcard decks and AI generation default to disabled in `.env.example`; marketing them as live requires current hosted configuration and runtime acceptance.
- Calendar reminders are downloaded on the learner's device. Email and push delivery are not implemented.
- Streaks, badges, and weekly goals are supporting signals, not evidence of learning by themselves.

### 6. Course creation and multilingual content

**Routes and owners**

- `/create`
- `/api/generate-course`, `/api/generate-lesson`, and course CRUD routes
- course pipeline schemas, language policy, quality rules, validation, repair, manual review, publication, and release records

**Implemented capability**

- Paid or owner-authorized learners can create a private course from any allowed subject or skill, an observable goal, optional application context, background, constraints, exclusions, artifact preference, scenario, starting level, time budget, teaching emphasis, and course language.
- Course language defaults to English but is editable. The interface explicitly accepts a specific language or bilingual pairing such as Spanish or Greek and English.
- The language request is sent into outline and lesson generation. The quality contract includes a blocking language-conformance rule, and regression coverage includes bilingual and non-Latin examples.
- Course creation can research appropriate source metadata, retain exact evidence provenance when available, fall back honestly to disclosed model knowledge, and reject invented citation status.
- Course and lesson generation are idempotent, quota-bound, moderated, schema-validated, and designed around the Capability Cycle.
- Lesson generation, course validation, targeted repair, stale-safe undo, exact-snapshot review, publication, unpublication, and permanent cascade deletion have distinct controls.

**Marketing limits and current contradiction**

- The complete application interface remains English: the root document declares `lang="en"`, navigation and forms are English, and several date/number formatters explicitly use English locales.
- Multilingual course generation does not prove that every language has equal model quality, source availability, evaluation coverage, or culturally appropriate pedagogy.
- The roadmap excludes dedicated language learning as an initial vertical. “Create a course in the language you request” is supported; “Filosage is a language-learning app” is not established.
- The course-generation prompt still asks for “one concrete professional artifact.” This contradicts the general subject and goal inputs and can bias output away from school, personal, creative, and self-directed goals.
- Course Studio examples, optional-context labels, empty-state guidance, and Plus descriptions are also workplace-biased.
- V2 validation, labs, visuals, publication, and repair features default to disabled or owner-only in the example environment. Their runtime status must be proven before promotion.

### 7. Evidence, capstone, sharing, and referral

**Routes and owners**

- `/evidence/[courseId]` and `/evidence/shared/[token]`
- `/api/assess-capstone`, `/api/capstone-analysis`, evidence export/share routes, and referrals

**Implemented capability**

- Evidence reports separate the starting self-report, observed objective evidence, comparable baseline/final assessment, criterion results, and verified-improvement calculation.
- Capstones can be assessed against visible criteria, revised, and resubmitted.
- Pro can compare stable criteria across attempts, export an accessible HTML report, and create revocable 30-day privacy-preserving share links.
- Shared snapshots omit identity, private notes, and raw responses and are marked as learning evidence rather than an accredited credential.
- A learner can copy a limited summary or referral-bearing course link.

**Marketing limits and opportunity**

- “Professional evidence” is a current feature label, but the underlying capability is portable evidence useful to students, self-directed learners, career changers, creators, and professionals.
- Verified improvement appears only when comparable assessed criteria exist before and after study.
- The report does not prove accredited mastery, employer recognition, grades, admission, promotion, or employment outcomes.
- There is no public static demonstration route that lets a prospective learner understand the complete evidence model without a real course and learner state.

### 8. Membership and commercial lifecycle

**Routes and owners**

- `/pricing`
- membership plan catalog and access policy
- `/api/pricing-intent`, `/api/waitlist`, and `/api/billing/*`

**Implemented capability contract**

| Plan | Current application capabilities |
|---|---|
| Free | Published lessons, progress and review sync, five tutor questions monthly, five course-grounded flashcard generations monthly when flashcards are enabled. |
| Plus | Everything in Free, two monthly rollover course credits up to 24, private course and lesson generation, 40 tutor questions, 40 flashcard generations, and custom flashcard decks. |
| Pro | Everything in Plus, five monthly rollover course credits up to 60, advanced capstone analysis, evidence export/share, and publication after completion and review. |

**Marketing limits**

- Paid checkout is closed; waitlist and stated pricing intent are directional research, not subscription demand or revenue.
- Paid eligibility currently limits the initial launch to individual United States residents aged 18 or older.
- Plus copy currently says “professional goals,” and Pro proof is labeled “professional evidence,” creating unnecessary audience exclusion.
- Feature accessibility and outcomes should lead tier explanations. Usage limits and fair-use mechanics should remain accurate secondary detail.

### 9. Safety, privacy, support, moderation, and operations

**Routes and owners**

- support center, support ticket routes, content reports, source reports, privacy center, legal pages
- `/admin`, `/admin/command-center`, and protected owner APIs
- health, alerting, backup, release, and operational runbooks

**Implemented capability**

- Learners can search reviewed help, open private support tickets, read owner replies, report content or sources, export data, and delete an account.
- The owner can review users, usage, content reports, publication state, billing readiness, product events, pricing interest, and support work.
- Command Center drafts and approvals are bounded, audited, and explicitly separate review from execution.

**Marketing limits**

- Owner and operational tooling builds trust but is not a learner-facing feature bundle.
- Draft-only or feature-flagged agent behavior must not be marketed as autonomous support or operations.
- Security controls reduce risk but do not justify “fully secure,” “error-free,” or “human-reviewed” claims.

## Audience fit map

| Audience | Fit | Supported jobs | Boundaries |
|---|---|---|---|
| Independent students aged 13+ | Strong for individual study | Turn coursework or an exam topic into a focused route; understand concepts; practice retrieval and transfer; build a project or portfolio artifact. | Not school-controlled; no teacher, roster, assignment, grade, proctoring, or accreditation features. Paid plans require age 18+ and initial US eligibility. |
| Self-directed and hobby learners aged 13+ | Strong | Create or choose a focused course; learn at a chosen pace; take notes; practice; review; retain; inspect evidence. | Avoid “learn absolutely anything” and high-stakes claims. Source and model quality vary by topic and language. |
| Career changers and interview or portfolio learners | Strong | Build a demonstrable capability; produce an artifact; compare assessed attempts; share a privacy-safe evidence snapshot. | No employment, interview, promotion, or recognition guarantee. |
| Working professionals | Strong | Learn for a current project or decision; create a private path; practice applied reasoning; export evidence. | Remains a useful acquisition cohort, not the only audience. |
| Individual course creators and subject experts | Conditional secondary fit | Create, inspect, repair, and publish a course; disclose source and AI status. | No creator marketplace, cohort analytics, classroom management, revenue sharing, or multi-author workflow. |
| Learners who want course content in another language | Conditional strong fit | Request a course in a specific language or bilingual pairing and receive language-conformance checks. | Interface and metadata are primarily English; no complete localization or equal-quality promise across languages. |
| Schools, teachers, teams, and enterprise LMS buyers | Not a current target | Individual use may still be possible. | Missing institutional identity, rosters, assignments, grading, collaboration, administration, procurement, and organizational privacy controls. |
| Children under 13 or people seeking autonomous high-stakes advice | Not eligible or not suitable | None. | Explicit legal, safety, and product boundaries apply. |

## Claim register

### Supported now

- Turn a concrete learning goal into a structured course and practice sequence.
- Inspect a published course's outcome and full structure before creating an account.
- Use retrieval, application, feedback, transfer, review scheduling, notes, and progress as connected parts of a learning workflow.
- Keep self-report, observed practice, and assessed evidence distinct.
- Create course content in a requested language or bilingual pairing when course creation access is available.
- See whether a lesson is source-backed, hybrid, model-knowledge, legacy, or AI-assisted without invented citation status.
- Keep private learner work account-bound and use explicit privacy controls.

### Supported only with a visible condition

- AI-assisted private course creation: Plus, Pro, or owner access, available course credit, provider availability, and safety/quality acceptance.
- Grounded or source-backed lessons: only where appropriate evidence was actually retained; otherwise use the disclosed model-knowledge state.
- Flashcard generation and review: only when the deployed flashcard flags are enabled.
- Accessible learning visuals and advanced V2 labs: only when the relevant runtime flags and artifact contracts are active.
- Evidence export, share links, advanced capstone analysis, and public course publishing: Pro or owner capability and the relevant completion/review conditions.
- Paid memberships: only when the Plans page and billing status explicitly say checkout is open.

### Prohibited or unsupported

- Fully localized application or support in every language.
- Dedicated language-learning pedagogy, translation accuracy, or native-speaker quality.
- Accredited credential, certification, verified identity credential, grade, admission, employment, interview, promotion, or salary outcome.
- Proven learning efficacy, guaranteed mastery, or a validated psychometric assessment.
- Every course or claim is human-reviewed, authoritative, current, or source-backed.
- Personalized “best course for you” recommendations without a validated recommendation system.
- Email or push reminders.
- Classroom, teacher, school, team, enterprise LMS, or collaborative course-authoring functionality.
- Unlimited AI usage, open paid checkout, customer demand, revenue, testimonials, or social proof without current evidence.

## Material findings

### Blockers before app-wide marketing implementation

1. **Canonical audience drift** — `PRODUCT.md`, the roadmap, global metadata, landing copy, Course Studio examples, Plus descriptions, support copy, and generation instructions encode a professional-only frame that the product contract does not require.
2. **Language contract omission** — implemented multilingual and bilingual course creation is absent from positioning, while the current English interface is not clearly distinguished from course-content language.
3. **Source-of-truth conflict** — `README.md`, `PRODUCT.md`, the roadmap, tier history, public copy, and current entitlement code disagree about guest lesson access, Plus course limits, audience, and current feature availability.
4. **Prompt-level audience bias** — the generation prompt can turn a broad student or personal goal into a “professional artifact,” so a copy-only correction would leave the product behavior inconsistent.
5. **Flag-state ambiguity** — flashcards, V2 course pipeline capabilities, labs, visuals, validation, repair, publication, Command Center, and billing have environment gates. Public claims need a verified hosted-capability snapshot.

### High-value product and marketing opportunities

1. **Broaden the core job without making the message vague** — lead with a concrete goal, a course built or chosen for it, deliberate practice, durable return, and inspectable evidence. Use segmented examples for study, personal projects, career goals, and work goals.
2. **Treat professional users as a beachhead campaign, not the universal product definition** — campaigns and flagship courses can target one audience at a time while the product and primary navigation remain inclusive.
3. **Make language visible where it affects choice** — show course language on cards and course proof, add language-aware discovery, and explain “English interface; course content in your requested language or bilingual pairing” accurately.
4. **Remove professional-only bias from course creation** — use role-neutral examples and prompt language, then let the learner's application context decide whether the artifact is academic, personal, creative, civic, career, or professional.
5. **Merchandise by learning situation** — offer non-personalized starting points for coursework or exam, personal project, career or portfolio goal, and current work goal. Label them as browsing shortcuts, not validated recommendations.
6. **Show the complete learning system, not only the funnel** — the current public story underrepresents flashcards, notes, adaptive review, course-language control, capstone revision, privacy, and portable evidence.
7. **Reframe Pro evidence as portable evidence** — keep professional usage as an example while making the capability legible for portfolios, applications, personal projects, and formal study. Preserve the non-credential disclaimer.
8. **Create transparent public proof** — use a static, explicitly fictional evidence demonstration and a controlled flagship course. Never fabricate a learner result, review, credential, or testimonial.
9. **Repair discovery and SEO contracts** — add outcome, job, and language context to public discovery and metadata while keeping private learner routes out of indexing.
10. **Measure the broad product with segmented cohorts** — retain honest acquisition and activation identity boundaries, then record coarse job starting point and course-language choice without inferring demographics or sensitive attributes.

## Local verification evidence

- `npm.cmd run build` passed on Next.js 16.2.12, including TypeScript checking and generation of all 78 static pages.
- The broad Chromium audit run covered 96 tests across the landing funnel, membership analytics, course learning, flashcards, Pro evidence and credits, privacy, support, navigation integrity, and course-pipeline V2 regressions. Ninety-five passed on the first run.
- The remaining course-learning test timed out while Playwright waited through repeated same-URL development-server reloads before a mocked source-report request completed. The application did not produce a reproducible source-report failure.
- The complete published-course-to-evidence path then passed once on a fresh isolated server and passed two more times with `--repeat-each=2`. Treat the original timeout as a development-server/Fast Refresh test-infrastructure warning, not as product evidence and not as a reason to weaken the acceptance gate.
- This is local branch evidence only. It does not prove current hosted feature flags, production availability, customer demand, learning efficacy, or commercial readiness.

## Revised implementation sequence

### Gate 0: owner acceptance

- Review and correct this capability map.
- Decide whether the primary category should be “self-directed learning workspace,” “personal learning and course-creation workspace,” or another familiar market category.
- Confirm independent students aged 13+ and self-directed learners as product audiences while preserving the no-school-service and paid-eligibility boundaries.
- Confirm the exact public language statement: English interface today; requested multilingual or bilingual course content.

### Pass 1: canonical truth

- Rewrite `PRODUCT.md` and the relevant roadmap sections around the approved broad audience and conditional initial cohorts.
- Create `.agents/product-marketing.md` with versioning and a claim register.
- Add a capability availability register that distinguishes implemented, flag-gated, locally verified, and production-verified states.
- Reconcile or clearly mark stale `README.md`, support, tier, and access statements.

### Pass 2: product behavior and inclusive defaults

- Remove professional-only prompt requirements and Course Studio examples that bias general goals.
- Preserve an optional work-context path while adding school, personal-project, career, creative, and other context examples.
- Preserve the editable course language and bilingual contract and expose it in saved-course discovery.
- Add tests proving student, self-directed, professional, non-English, and bilingual briefs preserve their requested context without forced workplace framing.

### Pass 3: discovery, proof, and plans

- Update landing, global metadata, library metadata, Course Studio metadata, plans, support copy, and relevant empty states.
- Add non-personalized learning-situation starting points and language-aware course discovery.
- Add controlled flagship selection and an explicitly fictional public evidence example.
- Explain Plus as private custom learning and Pro as advanced portable evidence and publishing, with professional use as one example rather than the audience boundary.

### Pass 4: measurement and return

- Separate anonymous acquisition from verified activation at the identity boundary.
- Anchor retention at first completed practice and count meaningful return actions only.
- Add allowlisted `surface`, `job_start`, and coarse `course_language_mode` fields without raw goal text or inferred identity.
- Instrument flagship exposure, intentional no-result paths, contextual plan interest, evidence proof, and return recommendations.
- Keep email delivery claims off and use only current in-app and on-device calendar capabilities.

### Pass 5: verification and council

- Run TypeScript, lint, production build, focused capability suites, and representative desktop/mobile runtime acceptance.
- Test at least one student brief, one personal project, one career goal, one work goal, one non-English course, and one bilingual course.
- Verify anonymous, Free, Plus, Pro, owner, feature-disabled, and billing-closed states.
- Rerun the marketing council against the capability map, current branch, and runtime captures.
- Require a `ship`, `revise`, or `block` disposition. Only `ship` permits a local completion recommendation.

## Required owner corrections before implementation

1. Is “independent students aged 13+” the intended student boundary, or should the marketed student audience be narrowed further, for example to secondary, college, graduate, certification, or adult continuing-education learners?
2. Should individual course creators remain a secondary audience, or should marketing focus only on people creating courses for their own learning?
3. Which familiar category best matches the intended shelf: self-directed learning workspace, personal learning and course-creation workspace, or another phrase?
4. Should “portable evidence” replace “professional evidence” across the product while professional reports remain a supported use case?
