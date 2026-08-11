# Filosage Course Intelligence Pipeline V2 Execution Plan

Status: local implementation and full desktop/mobile regression gates complete on 2026-08-11. The authorized production step is an owner-only canary; general release remains gated by the explicit limits in `RELEASE_EVIDENCE.md`.

## Release objective

Replace the current prose-coupled publication gate with one versioned contract that produces stable rule codes, paths, severities, repairability, snapshot hashes, and publication decisions. Preserve the existing safety, authorization, source-security, entitlement, and billing locks.

## Evidence already established

- Course creation is a single request that generates and validates a complete outline before persistence in `src/app/api/generate-course/route.ts`.
- Lesson creation is a separate single-request workflow with one whole-lesson fallback regeneration in `src/app/api/generate-lesson/route.ts`.
- Publication readiness and publication review share schema and lesson-quality checks, but their diagnostics are string arrays and all pedagogical quality findings prevent ordinary publication.
- At least two current rules encode enrichment or style as publication failures: a 1,500-character explanation threshold and a minimum of three teaching modes in courses with four or more lessons.
- Publication itself already reloads course and lesson documents in a Firestore transaction and compares stable fingerprints, so stale publication protection exists and must be retained.
- The existing whole-lesson repair can overwrite an author's edited lesson because it does not apply a path-scoped patch or require the edited lesson's base hash.
- Real private denial records are unavailable in this checkout. The preserved July 2026 incident proves an earlier readiness/review mismatch, while current representative fixtures are required for reproducible V2 work.

## Implementation sequence

1. Preserve representative failing fixtures for false denial, stale repair, unsupported labs, unsafe content, and legacy compatibility.
2. Add the machine-readable contract, rule registry, lifecycle state machine, content hashing, and feature flags.
3. Implement deterministic validation lanes and adapt existing schema, source, content-language, lesson, interaction, and visual checks into typed diagnostics.
4. Make publication preflight return the V2 decision and publish only the exact validated snapshot.
5. Add issue-scoped repair planning, optimistic base-hash checks, audited diffs, and undo metadata. Keep semantic auto-repair disabled until a bounded attempt ledger and unrelated-field preservation are proven.
6. Register only implemented lab and visual capabilities, with applicability and fallback policies.
7. Add author-facing readiness diagnostics without changing the learner-first shell or existing owner authorization.
8. Add correlation-aware events, evaluation corpus, shadow comparison, migration/compatibility adapters, and operations evidence.
9. Run six independent critic roles. Fix every P0/P1 and any P2 that violates the runtime contract. Require two complete passes without a new release blocker.
10. Run lint, type checking through production build, deterministic tests, focused E2E, full E2E, Sites build, accessibility, responsive/theme inspection, and on-demand live evals when credentials are available.

## Safety boundaries

- `BILLING_ENABLED` remains false and plan definitions are unchanged.
- V2 defaults off. Shadow mode cannot change user-visible publication decisions.
- No production deployment, canary expansion, migration write, or feature-flag activation occurs without explicit owner authorization.
- No legacy course is semantically regenerated merely to add V2 metadata.
- A nonessential visual or inapplicable lab cannot become a blocker.
- Code execution is not a registered capability; code learning remains non-executing analysis, tracing, or debugging.

## Phase gates

- Phase 0: current flow documented; representative failure corpus and confirmed regression tests recorded.
- Phase 1: generator, validator, repair, publication, API, UI, and tests import or derive from the same contract.
- Phase 2: generation stages have typed results, explicit provider errors, idempotency, and quota outcomes.
- Phase 3: valid gold fixtures pass; mutated fixtures return exact rule codes; publication rejects stale hashes.
- Phase 4: every enabled automatic repair rule proves path isolation, author-edit preservation, idempotency, stale rejection, and bounded attempts. The implemented deterministic removals meet the path/snapshot contract; semantic repair remains unavailable.
- Phase 5: only registered labs/visuals render; every registered capability has fallback and accessibility coverage.
- Phase 6: security tests pass and an authorized maintainer can trace a decision without sensitive-content logging.
- Phase 7: offline corpus passes, live eval results are recorded, two critic passes are clear, and the owner explicitly authorizes canary activation.

## Known evidence constraints

- No authenticated production/private-course dataset or production log connector is available in this session. Baseline rates must be recorded as unavailable, instrumented, and measured in shadow mode rather than invented.
- Live model evals require an available OpenAI credential and explicit cost-bearing execution. Recorded fixtures remain the stable CI gate.
- Deployment is an irreversible production action for this task and is intentionally excluded until the final local gauntlet is green and the owner approves it.
