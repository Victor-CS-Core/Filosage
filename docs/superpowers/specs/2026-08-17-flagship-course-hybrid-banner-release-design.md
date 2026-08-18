# Filosage Hybrid Banner and Flagship Course Release Design

**Date:** 2026-08-17
**Status:** Approved design; implementation not started
**Owner:** Victor Perez
**Operational record:** Multica `t_e6428128`
**Release boundary:** Billing remains disabled. Code publication, Azure deployment, production configuration, course publication, unpublication, and permanent deletion are distinct gates and evidence sets.

## 1. Outcome

Ship a production-verified Filosage release that:

1. generates course banners that visibly relate to the course while retaining the tactile geometric Course Deck art direction;
2. creates, reviews, and publishes ten release-grade flagship courses;
3. deterministically features the strongest eligible flagship course on the public landing page;
4. preserves the seven non-target legacy courses as unpublished records;
5. permanently deletes only the explicitly approved legacy landing course after its replacement and the rest of the new catalog are live and verified; and
6. reports local code, commit, push, deployment, production configuration, catalog mutation, and live verification independently.

## 2. Verified starting state

The design is based on the following production and source evidence gathered on 2026-08-17:

- Production health reported SHA `f8837ba4303c20def1e535499d58c1e360757a9e`, matching `origin/main` at the time of inspection.
- Production contained eight published courses.
- Every published banner had a `generatedAt` timestamp on August 11 or 12.
- Course-banner style v4 was introduced by commit `55230f93fd82cedc276a8c83d9e8c274e4352e04` on August 14 and was an ancestor of the production SHA.
- The apparent old-style behavior is therefore persisted banner data, not proof that the v4 code failed to deploy.
- The live landing page featured `Evidence-based product decisions for small software teams`, course ID `06f9ad150a1cd1d7d9c311f82113f0af94141780d42a27ce24ff61679ced7c7a`.
- `PublicCourseProof` currently chooses the first eligible item from `/api/courses?scope=public`; there is no explicit flagship selection contract.
- Existing banner assets are immutable in ordinary product use. The product has no customer-facing banner-regeneration operation.

The active checkout also contains unrelated `AGENTS.md` and `.worktrees/` changes. They are outside this release and must not be altered or included in commits.

## 3. Product decisions

### 3.1 Hybrid banner style v5

Style v5 combines the subject legibility of the earlier banner system with the material and compositional identity of style v4.

The generator receives four semantic inputs:

- course topic;
- broad discipline or category;
- observable learning outcome; and
- concrete course mission or applied scenario.

It derives one **subject anchor** and one **relationship motif**:

- A subject anchor is a recognizable, text-free visual cue intrinsic to the course: a parabola, constellation pattern, branching evidence trail, speech rhythm, memory path, or another equally direct cue.
- A relationship motif expresses the course action: compare, verify, transform, sequence, balance, frame, connect, or decide.

The prompt permits one subject anchor and a small number of supporting forms. It rejects literal scene-building, clip-art collections, labeled diagrams, and decorative symbols unrelated to the learning outcome.

The v4 visual system remains mandatory:

- heavyweight uncoated paper or book-board material;
- screen-printed midnight navy, petrol teal, oatmeal, brick, coral, warm off-white, and restrained blue-gray;
- large geometric forms, arcs, partial discs, axes, and restrained dotted paths;
- no gradients, glossy rendering, neon, text, logos, screens, people, or dense object collections;
- strong thumbnail silhouette and crop safety across hero, 2:1 card, compact drawer, and partially covered deck views; and
- at most seven major shapes.

The prompt must explicitly say that thematic recognition wins over pure abstraction, but visual-system consistency wins over literal illustration.

### 3.2 Fingerprint and storage behavior

`COURSE_BANNER_STYLE_VERSION` increments from 4 to 5.

The banner fingerprint includes normalized values for:

1. style version;
2. generation variant;
3. topic;
4. category;
5. outcome; and
6. mission.

This prevents two courses with similar titles but materially different outcomes from incorrectly sharing an image. Existing style-v1 through style-v4 assets are preserved. No migration or silent regeneration is introduced.

The stored asset record continues to include its style version, model, dimensions, compression, creation time, and fingerprint. Initial course creation remains the only supported generated-banner mutation.

### 3.3 Deterministic landing flagship

Add a non-secret server runtime setting named `LANDING_FEATURED_COURSE_ID`.

`GET /api/courses?scope=public` continues returning the complete library in its existing order, and additionally returns `featuredCourseId` only when the configured ID resolves to an actually published course in that response. It must never feature a private, missing, stale-release, or malformed course.

`PublicCourseProof` selects the matching course when `featuredCourseId` is valid. If configuration is missing or invalid, it applies the existing eligibility rule—observable outcome plus a concrete artifact, capstone, or milestone—and makes the fallback stable by sorting eligible candidates by course ID before selecting one. Library ordering is not changed to control the landing page.

The selected production value is set only after the ten candidates have passed review and the scoring matrix in section 7 has been completed.

## 4. Flagship portfolio

The release produces ten new courses, not ten additional permanent catalog entries alongside the old set. Each course is first created as a private draft.

| # | Working course | Observable outcome | Primary evidence artifact |
|---|---|---|---|
| 1 | Evidence-Based Product Decisions for Small Software Teams | Evaluate conflicting product evidence and defend a proportionate decision | Decision memo with uncertainty, tradeoffs, and review rule |
| 2 | Spot AI Hallucinations and Verify Answers | Identify unsupported claims and build a fast primary-source verification plan | Annotated answer audit and verification dossier |
| 3 | Systems Thinking for Everyday Decisions | Map feedback, delays, boundaries, and leverage points in a real situation | Systems map and intervention brief |
| 4 | Data Storytelling from Messy Spreadsheets | Clean a bounded dataset and communicate one defensible finding without overstating it | Reproducible analysis sheet and concise data story |
| 5 | Storytelling That Sticks in Five Minutes | Design, rehearse, and deliver one clear short story for a real audience | Performance-ready story package |
| 6 | Learn Faster with Retrieval and Spacing | Build and test a four-week retrieval-and-spacing system | Study protocol, prompts, schedule, and before/after evidence |
| 7 | Write Analytical Paragraphs from Evidence | Make focused claims and explain how short evidence supports them | Four annotated analytical paragraphs |
| 8 | Visual Reasoning with Quadratic Functions | Connect equations, transformations, vertices, and intercepts to a visual model | Annotated quadratic design portfolio |
| 9 | Decode the Night Sky | Orient with a sky map and explain selected visible patterns using Earth motion | Observation plan and annotated sky journal |
| 10 | Navigate Difficult Conversations | Prepare and conduct a bounded conversation using observation, impact, inquiry, and next steps | Conversation plan, rehearsal record, and reflection |

Final titles may be tightened during creation, but the audience, outcome, scope, and evidence artifact may not drift without updating this design and Multica record.

## 5. Course creation and review pipeline

### 5.1 Brief preparation

Each course receives a structured brief covering:

- subject and observable goal;
- intended real-world use;
- audience and prerequisite knowledge;
- constraints and explicit exclusions;
- preferred artifact;
- scenario;
- course level, four-week target, and weekly time budget; and
- English as the release language.

The briefs must be reviewed as a set before provider-backed creation so the portfolio does not repeat the same scenario, artifact, audience, or assessment pattern.

### 5.2 Generation

For every course:

1. create the private outline through the normal owner product flow with a unique idempotency key;
2. record the course ID and initial banner result;
3. generate every expected lesson against the current course snapshot;
4. preserve valid generated lessons if a later lesson fails;
5. retry only the failed unit through the supported product recovery path;
6. run deterministic course, lesson, source, safety, accessibility, and asset validation; and
7. complete the semantic/manual review required for the exact publication snapshot.

No destructive repair, bulk replacement of valid lessons, database-side shortcut, or direct insertion that bypasses product quality contracts is permitted.

### 5.3 Source and evidence requirements

A release-grade course must distinguish:

- source-assigned claims;
- vetted further reading;
- model general knowledge;
- bounded fictional or hypothetical scenario evidence; and
- the learner's own observations or work.

Where claims depend on external facts, sources must be attributable released HTTPS pages with stable IDs and lesson assignments. A source pack containing only unassigned links does not prove lesson grounding. Courses that legitimately rely on supplied excerpts or a bounded fictional scenario must state that boundary rather than invent source support.

### 5.4 Publication gate

Each private course must prove:

- every outlined lesson exists;
- course and lesson schemas are current;
- objective-to-lesson and objective-to-assessment coverage is complete;
- no blocker-level safety, source, structure, or quality issue remains;
- any manual review is recorded against the exact snapshot;
- the banner is available or the deterministic fallback is verified;
- the public preview exposes structure without leaking lesson bodies; and
- the publication transaction produces a retrievable immutable release.

Owner override is not a normal acceptance route. It may address only eligible quality warnings after inspection and cannot bypass safety, missing structure, invalid sources, or changed content.

## 6. Catalog transition and destructive boundary

The transition is replacement-first:

1. deploy and verify hybrid banner v5;
2. create all ten private course drafts;
3. review every lesson and banner;
4. publish and verify all ten new courses;
5. select and configure the landing flagship;
6. verify landing, library, course preview, banner delivery, and release health;
7. unpublish the seven non-target legacy courses; and
8. only then prepare deletion of the approved target course.

The only permanent deletion target is:

`06f9ad150a1cd1d7d9c311f82113f0af94141780d42a27ce24ff61679ced7c7a`
`Evidence-based product decisions for small software teams`

Immediately before deletion:

- re-read the production course and confirm title, full ID, author ownership, publication state, and replacement availability;
- save a private, gitignored export of the public course and lesson snapshot for operational recovery and record its hash, without committing course content;
- show the exact target and consequences to Victor; and
- obtain action-time confirmation.

No other course, lesson, progress, evidence, banner asset, account, or shared data is deleted. The other seven legacy courses are only unpublished and remain recoverable.

## 7. Landing flagship scoring

Score each new course from 0–5 on:

1. outcome clarity;
2. audience breadth without becoming generic;
3. strength of visible public structure;
4. source and evidence integrity;
5. quality and variety of practice;
6. credibility of the capstone artifact;
7. banner recognition and crop quality;
8. demonstration of the Capability Cycle; and
9. fit with Filosage's learning-first positioning.

Safety or publication blockers disqualify a course regardless of score. The highest qualified score becomes the recommended landing flagship. Ties are resolved by stronger product differentiation, then broader audience relevance. The decision, runner-up, evidence, and configured ID are recorded in Multica.

## 8. Implementation surfaces

Expected source changes are intentionally bounded:

- `src/lib/course-banner-prompt.ts`: style-v5 semantic and art-direction contract;
- `src/lib/course-banners.ts`: fingerprint inclusion for outcome and mission;
- `src/lib/runtime-environment.ts` and relevant runtime configuration inventory: `LANDING_FEATURED_COURSE_ID`;
- `src/app/api/courses/route.ts`: validate and return the configured featured ID without reordering the library;
- `src/components/marketing/PublicCourseProof.tsx`: deterministic configured selection and stable fallback;
- focused tests for prompt semantics, fingerprint behavior, public API selection, landing rendering, and invalid configuration;
- operational evidence under existing gitignored or documentation paths as appropriate.

Before editing Next.js routes or configuration, read the applicable guides under `node_modules/next/dist/docs/` as required by the repository rules.

## 9. Verification strategy

### 9.1 Red-green tests

Add failing tests first for:

- the prompt using topic, category, outcome, and mission;
- explicit subject-anchor and relationship-motif guidance;
- preservation of tactile v4 material, palette, shape-count, crop, and text prohibitions;
- fingerprint divergence when outcome or mission changes;
- reuse when every semantic input is equal;
- valid configured flagship selection;
- missing, private, or unknown configured IDs;
- stable fallback independent of API response order; and
- existing public-preview privacy behavior.

### 9.2 Local verification

Run the focused tests, TypeScript validation, zero-warning lint, production build, course/publication contract suites, landing tests, and browser checks at desktop, mobile, WebKit, reduced motion, and dark/light themes where relevant.

Use generated banner fixtures for automated tests. Provider-backed image generation is a QA/production acceptance step, not a unit-test dependency.

### 9.3 Visual QA

Generate at least three isolated-QA samples before production promotion:

- conceptual/professional: evidence-based product decisions;
- visual/technical: quadratic functions; and
- human/communication: difficult conversations or five-minute storytelling.

Inspect each at full 3:2, hero crop, 2:1 card, compact drawer, and stacked deck crop. Reject text artifacts, generic symbols, literal clutter, weak subject recognition, inconsistent material, muddy contrast, or an unreadable thumbnail silhouette.

### 9.4 Production proof

Production completion requires fresh evidence that:

- `HEAD`, `origin/main`, and the deployed full SHA align for the release;
- `/api/health` is healthy and billing remains disabled;
- ten new public courses are returned and their immutable releases load;
- every new banner or approved deterministic fallback renders;
- the configured flagship ID is returned by the public API and shown by the live landing page;
- public previews do not expose lesson bodies;
- the seven legacy courses are no longer public but still exist for the owner;
- the single approved legacy target no longer resolves after deletion;
- no unrelated worktree changes entered the release; and
- no claim treats a commit, push, deployment, configuration update, data mutation, or browser observation as proof of another layer.

## 10. Rollback

- **Code:** keep the prior immutable Azure revision available until v5 and landing selection pass production checks; route traffic back if needed.
- **Banner prompt:** restoring style v4 affects only future generation. Already generated v5 assets remain attached and are not silently rewritten.
- **Flagship selection:** restore the prior `LANDING_FEATURED_COURSE_ID` or clear it to activate the stable fallback.
- **New catalog:** unpublish a failing new course without deleting it; restore a preserved legacy course to public visibility if necessary.
- **Legacy catalog:** do not unpublish until all ten replacements are live and verified.
- **Deletion:** the target is deleted only after the replacement release and private recovery export are verified. No second course is deleted as part of rollback or cleanup.

## 11. Acceptance checklist

- [ ] Hybrid style v5 is implemented and covered by red-green tests.
- [ ] Semantic inputs participate in prompt construction and fingerprinting.
- [ ] Three representative QA banners pass visual acceptance.
- [ ] The exact release commit is pushed and deployed with billing disabled.
- [ ] Ten new private courses are created from reviewed briefs.
- [ ] Every expected lesson is generated and reviewed.
- [ ] All ten courses pass publication gates and immutable-release checks.
- [ ] A complete scoring matrix names the landing flagship and runner-up.
- [ ] Production configuration pins the verified flagship.
- [ ] Live landing, library, preview, banner, accessibility, and privacy checks pass.
- [ ] Seven non-target legacy courses are unpublished but preserved.
- [ ] The exact target is reconfirmed and backed up before action-time deletion approval.
- [ ] Only the approved target course is permanently deleted.
- [ ] Commit, push, deployment, configuration, course mutations, and production verification are reported separately in Multica and the final handoff.
