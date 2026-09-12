# Current Course System Map

Verified against the repository on 2026-08-11.

| Stage | Current implementation | Boundary and behavior | Coverage/evidence |
|---|---|---|---|
| Author request | `src/app/create/page.tsx` | Preserves fields; one idempotency key per serialized payload; accessible stage announcement | creation and V2 regressions |
| Authorization/entitlement | generation routes and membership helpers | Account, capability, capacity, and AI-usage reservation before provider work | billing suites plus source assertions |
| Request normalization | `courseRequestSchema` | Bounded topic, outcome, audience inputs, language, freshness, lab/visual applicability hints, and up to five sources | V2 corpus and prompt tests |
| Source boundary | `sourcePackPromptBlock()` | Author metadata is isolated as untrusted JSON; URLs are not fetched | source-safety tests |
| Outline generation | `POST /api/generate-course` | Flagged V2 prompt/provenance, structured output, bounded retries, deterministic idempotent recovery | generation-profile and V2 tests |
| Blueprint/outline validation | shared schemas and quality contract | Schema, language, stable objective relationships, duplicates, lab/visual plans, manual-review routing | 100-case offline corpus plus mutation fixtures |
| Course persistence | `createCourse()` | Deterministic request ID; explicit provenance and initial pipeline stage when V2 is enabled | focused static/API tests |
| Lesson generation | `POST /api/generate-lesson` | Structured lesson output, objective mappings, registered lab/visual bounds, moderation, idempotent replay recovery | generation, interaction, learning-flow tests |
| Stage state | stage transactions in `document-store.ts` | State-machine transitions persist on private courses; validation/approval commit readiness against exact fingerprints | state tests and route integration assertions |
| V2 validation | `GET /api/courses/[courseId]/validation` | Exact aggregate snapshot, expected modes, typed diagnostics, explicit manual gates for unexecuted lanes, snapshot-atomic readiness transition | V2 regressions |
| Deterministic repair | `POST /api/courses/[courseId]/repair` | Allowlisted path operations, document fingerprints, document transaction, full revalidation, audit diff, stale-safe undo | V2 regressions; emulator concurrency proof pending |
| Manual review | owner API under `api/admin/.../manual-review` | Recent-owner auth, exact snapshot/contract, evidence selection for high-risk approval, approval/rejection audit | focused API/UI tests; operational assignment queue pending |
| Banner | banner API and Azure Blob helper | Optional decorative asset and distinct usage event; never instructional support | banner suites |
| Publication preflight | `reviewCourseForPublication()` | V1 assessment plus guarded V2 contract; V2 manual resolution honored only for the identical snapshot | publication suites |
| Publication transaction | `publishCourseWithReview()` | Transaction reloads every document, rechecks fingerprints, enforces retry key, and writes an immutable learner-facing release copy | focused publication tests; emulator race proof pending |
| Operations | `coursePipelineEvents` and owner timeline API | Privacy-safe actor hash, correlation, decision/rule/hash/version/flag data, durable V1/V2 shadow comparison | source assertions; live shadow run pending |
| Learner runtime | course/lesson APIs, pages, and typed renderers | Public reads resolve `publishedReleaseId`; only registered V2 labs/visuals render; Recognition has durable progress | interaction and learning-flow suites |

## Persistence and compatibility

- Existing course documents remain readable through explicit compatibility adapters. Legacy artifacts are warned, not destructively regenerated.
- V2 provenance is emitted only by its enabled generation path. The legacy display schema remains separate from `courseSchemaVersion` to avoid rewriting existing documents.
- Objective, lesson, quiz, challenge, lab, visual, and capstone relationships use stable IDs in V2 artifacts.
- Published candidates create immutable `courseReleases` records with released lesson copies. Public learner API reads resolve the selected `publishedReleaseId`; owner draft reads remain on mutable authoring documents.
- Learner progress/enrollment keys and existing URLs are unchanged.

## Retry, timeout, quota, and concurrency behavior

- Create, lesson generation, repair, manual review, normal publish, and owner override use idempotency keys. Generation replay is payload-bound and can recover an already completed result.
- Usage finalization changes accounting only while the reservation is still `reserved`; duplicate finalization cannot double-add cost or double-refund allowance.
- Failed technical/product events release request allowance and outline capacity while preserving actual provider-cost telemetry.
- Publication, validation readiness, generated lesson saves, and deterministic repair bind to exact course/lesson fingerprints. Late provider results cannot overwrite a published course or newer edit. Repair undo refuses to overwrite a newer edit.
- Provider calls remain bounded; a structured parse/quality failure is not persisted as a successful stage.

## User-visible states

- The Course Studio loads the current V2 validation report, grouped issues/warnings, stage, stale snapshot status, repair action/diff/undo, manual-review evidence decision, and readiness.
- Technical failures remain separate from content-quality decisions.
- Server-persisted stages replace elapsed-time status fiction after a course exists. A durable background job/resume worker is not implemented; provider requests are still synchronous.
