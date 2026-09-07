# R08/R13 durable lesson operations — phase 2

Review candidate worktree: `/workspace/scratch/735f0a2ac981/filosage-worktrees/lesson-operations`. Baseline `5a8e610` contains phase 1 R09 integrity and shared hook provenance. Root's exact shared `evaluation-budget.ts` and `generation-provider-client.ts` updates were copied from `2de96251bf9ddaf7f5efd5ec75c75f18d5182fea` and `32944e31e05ca00a7898adad35d4b8876eca4a5a`; no independent budget tariff/transport changes are claimed. Independent review is pending.

## Implemented

- Generalized durable generation kind to `course`/`lesson` with the existing lesson request hash, original-period shared budgets, resource lesson locks, immutable attempt records, stage checkpoints and pending provider intents. Lesson admission consumes no second course credit and keeps the route's planned-lesson grant gate.
- Route and operation status/resume now support durable lessons. Paid generation and moderation responses checkpoint before parsing/policy inspection; parse uses the installed SDK on replay. Stable observed timestamps keep later moderation input stable across waves. Completed lesson receipts recover exact original results without regeneration and reject newer changes.
- Lesson, evidence downgrade, operation completion, exact result receipt and original accounting settle in one guarded document transaction for all existing V1/V2 owner/nonowner integrity paths. Terminal failure and generic finalization cannot release a completed lesson or a successor lock.
- Pre-dispatch evaluation refusal removes only its unstarted intent. Ambiguous dispatches retain uncertain cost and never automatically repeat a paid call. Approved evaluation usage samples are authoritative in the ordinary usage receipt, including moderation charges.
- Existing evaluation operations require their original approved request context before admission and again inside the admission transaction. A missing evaluation header cannot resume outside the ceiling or mutate the saved lease. Owned status evidence also verifies approval/cap/configuration through the shared budget reader. This was a concrete red-to-green actual SDK route finding, not only a source assertion.
- Added the shared lesson runtime configuration helper and operation IDs to terminal lesson generation responses. No full evaluation capability is advertised by this branch; root owns that registration, course configuration and package/CI changes.

## Fresh local verification

Node 24.19 local evidence (does not substitute for hosted Node 22):

- `node --conditions=react-server --import tsx --experimental-test-module-mocks --test tests/lesson-operations/*.test.ts tests/lesson-integrity/*.test.ts`: **31 passed, 0 failed/skipped**, `lesson-operations-green.log`. This includes 9 phase 2 cases and 22 retained integrity cases. Actual SDK transport is fixture-backed with zero real provider requests. The SDK case covers three-wave status resume, exactly three dispatches (two moderation, one generation), exact replay, approved total 24 microdollars in both accounting ledgers, cap-7 refusal before generation dispatch, completed GET approval mismatch refusal, and headerless resume refusal with unchanged saved operation.
- `node --conditions=react-server --import tsx --test tests/fixtures/generation-operations-behavior.ts`: **23 passed**, `lesson-operations-course-regression.log`. Preserves existing course/generic accounting, deletion, late usage, maintenance and actual status behavior.
- TypeScript no-emit, scoped Oxlint and ESLint pass: `lesson-operations-types.log`, `lesson-operations-oxlint.log`, `lesson-operations-eslint.log`. Diff whitespace check passes.
- Counterexample evidence: `lesson-operations-no-header-red.log` showed headerless resume dispatching and returning 202; the same assertion passes in the final green log.

## PostgreSQL and external gates

`tests/postgres/lesson-operations.test.ts` contains two real PostgreSQL fixture cases: competing durable admission plus an observed lock waiter whose publication epoch changes before commit; and independent lesson commits with provider checkpoint replay, exact committed result replay, late failure finalization and shared accounting settlement. Uses unique fixture paths and far-future accounting months; cleanup deletes only exact registered paths. The existing four phase 1 PostgreSQL cohort cases remain present.

Invocation fails closed because `FILOSAGE_POSTGRES_TEST_URL` is missing (`lesson-operations-postgres.log`). **These two new cases have not executed against PostgreSQL.** No local callback test is represented as database evidence. Actual previous/new binary overlap, compatible rollback, exact-head Node 22/PG16 CI, hosted frontend+BFF candidate and real provider/moderation quality evidence remain external acceptance gates.

## Integration and operational state

Root owns final integration, independent review, command/manifest/CI registration, exact-head push, and capability advertisement. Recommended phase 2 command: `node --conditions=react-server --import tsx --experimental-test-module-mocks --test --test-concurrency=1 --test-reporter=tap tests/lesson-operations/*.test.ts`. Existing PostgreSQL wildcard discovers the new test file.

Multica: unavailable in current tool registry; no invented item, event or queue claim. Owner: root for release outcome; lesson-operations agent for this source slice. Status: review ready locally, external gates blocked as above. Commit authorized and to be recorded by root; push not performed by this agent. No deployment, merge, traffic change, production verification, paid call, account creation or secret change performed. Missing original artwork index entries are preserved; commit uses authorized `write-tree --missing-ok`, `commit-tree`, and compare-and-set `update-ref`.


## Independent review corrections

Independent review of `f4f244d` reproduced two findings; both are corrected in the follow-up candidate.

1. Late provider success after expired in-flight finalization now includes the original immutable lesson attempt in the guarded personal reconciliation transaction. Request and attempt cost, uncertainty and all token fields receive the same observed delta, using the existing accounted call IDs for idempotency. The original attempt identity/account generation/accounting paths are checked; no successor lock is written. Targeted red evidence: `lesson-late-accounting-red.log`; green: `lesson-late-accounting-green.log`. The regression starts a successor operation before releasing the late response, then verifies repeated maintenance/finalization leaves all reconciled records and its lock unchanged.
2. Schema repair, quality repair, grounding repair and model-knowledge fallback now yield `GenerationPauseError` when an eligible repair lacks time in the current HTTP wave. They retain confirmed checkpoints and resume with the existing timeouts unchanged. The actual SDK fixture now also advances each dispatch by 36 seconds and supplies an invalid primary schema; it resumes through four waves with one primary dispatch, one fallback dispatch and two moderation dispatches, exactly 34 approved microdollars. Red: `lesson-slow-repair-red.log` (500 instead of 202); green: `lesson-slow-repair-green.log`.

Fresh combined verification: `node --conditions=react-server --import tsx --experimental-test-module-mocks --test tests/lesson-operations/*.test.ts tests/lesson-integrity/*.test.ts tests/fixtures/generation-operations-behavior.ts`: **56 passed, 0 failed/skipped**, `lesson-review-fixes-green.log`. TypeScript no-emit, scoped ESLint/Oxlint and whitespace check pass (`lesson-review-fixes-types.log`, `lesson-review-fixes-eslint.log`, `lesson-review-fixes-oxlint.log`). Re-review remains requested; PostgreSQL/Node22 CI and external gates above are unchanged. No paid calls, push, deployment, merge or production verification by this agent. Multica unavailable; root retains release ownership and review/push coordination.
