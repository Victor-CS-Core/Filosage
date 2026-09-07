> Historical subsystem report. Current integration and remaining gates: [September 7 generation recovery](2026-09-07-generation-recovery.md). Later lesson/budget integration supersedes the exclusions below.

# R08 generation durability — implementation report

Status: local implementation and focused tests complete; awaiting parent integration/review and candidate PostgreSQL/hosted gates. Branch `codex/r08-generation-durability`, requested base `9e1206685718084b3a8df02da0eb6799faf576b8`. Root alone pushes. No subagents, paid provider calls, Azure changes, deployment, production mutation, billing activation or secret administration.

Implemented: atomic operation/credit/budget admission with canonical request fingerprint; original-period paths and attempt ownership; bounded provider waves; immediate durable output/usage checkpoints; saved result replay; status/resume/list/end APIs; complete outline/lesson-grant/accounting transaction; exact-once refund; explicit unknown-cost containment and late actual reconciliation; account-scoped client identity and foreground recovery with real stages; bounded dry-run/apply reconciliation. Existing deterministic course covers replace the optional initial paid banner workflow, as approved by root. Baseline had no banner-regeneration endpoint; that absence is preserved.

The actual final course payload now receives its R07 safety proof only after real successful output moderation, after ownership/grants and all R10 source fields are final. Local provider stubs do not mint remote moderation proofs. Reused provider timestamps are original observation times. Research publication freshness binding remains root's separate R07/R10 integration gate. R11's helper call rejects unresolved learning-design blockers, atomically saves explicit replan recovery, refunds, and requires a deliberate revised request.

The durable contract, API shapes, ownership inventory, accounting uncertainty, maintenance instructions and minimum safe old-writer/shared-DB cutover are committed in `docs/releases/2026-09-generation-recovery-contract.md`.

## Dependencies and integration

- R04 `account-lifecycle.ts`, `withAccountRequest`, and the `generation-operation` learner-storage family are required. Read-only copies of lifecycle/auth/session/storage files were used for isolated verification and are excluded from R08's commit. Main generate-course and all new operation handlers are already wrapped; do not wrap again.
- R04 deletion must replace its generation hold with `await abandonGenerationUsage(operationId)` for every inventoried operation before personal deletion. API takes one opaque string ID; global-only, idempotent, preserves uncertain in-flight spend. R04 agent has exact signature.
- R11 exports `LearningDesignReplanRequiredError` and `assertLearningDesignReady` in learning-design.ts. Only its helper/class hunk was copied locally as an excluded dependency. Integrate R11 before the combined candidate typecheck.
- The new PostgreSQL test imports R02's `tests/postgres/fixture.ts`; that fixture is copied locally as an excluded dependency. Root registers `tests/generation-operations.spec.ts`; PostgreSQL test is `tests/postgres/generation-operations.test.ts` under R02's existing Node suite.
- R09 still owns lesson guarded writes/stage integration. Generic AI tokens/original periods and reconciliation are strengthened here, but full saved lesson-stage recovery is not claimed.
- R13 receives owner-only durable usage telemetry. No hard provider-spend ceiling capability is advertised; the live harness must fail closed until that separate server contract is proven.

## Verification

Read R08 full brief, global constraints, R07/R10 reports, repository AGENTS/PRODUCT/DESIGN and installed Next route-handler guide. Activated provided Node 22.23.2 runtime. Initial RED: absent durable operation module. Additional verification exposed/fixed stale fixture-clock assumptions, accounting tests that omitted earlier shard costs, resumed observation timestamps, optional-chaining lint, and obsolete old split-finalizer/banner source assertions.

- Real file-store behavioral fixture: **16 passed**, including atomic credit/payload conflict, exact-once refund, saved provider output without another call, full lesson grants, zero-balance recovery, overlap rejection, stale-owner/original-month reclaim, ambiguous timeout, new-key abandonment preserving current lock, late actual replacing unknown cost, deletion without personal resurrection, actual production route with local provider fixture, final payload/proof binding, lost HTTP response after transaction without new spend, and generic token/month/uncertainty accounting.
- Focused contracts: **112 passed**, covering new wrapper plus existing course research, R10 expiry, credits/tier boundaries, source citations and V2 regressions. Research fixture now adapts to the new operation boundary; it still tests source behavior in isolation and is not durability/provider acceptance evidence.
- Actual PostgreSQL competing-connection test authored with R02 fixture, exact UUID-owned cleanup, one admission/grant/debit assertions. Local execution fails closed because the explicit loopback PostgreSQL 16 test target is unavailable. This is an outstanding acceptance gate, not a skipped/pass claim.
- `npm run lint` passed full repository Oxlint + ESLint; final touched-file lint passed after the last UI/list guard changes. `tsc --noEmit --incremental false` passed on the final sources. `git diff --check` passed. No browser/build/hosted/provider acceptance claimed.

Evidence files beside this report: R08-behavior.log, R08-focused.log, R08-postgres-gate.log. Runtime proxy/NO_COLOR/MockTimers warnings are environmental/test warnings.

## Limits and operational state

A store:false response lost with its process is unrecoverable without external provider evidence. The implementation does not repeat it automatically: it refunds the course product, retains explicit uncertain spend, and accepts late actual reconciliation. Legacy claims that predate operation/path identity require a reviewed cutover reconciliation; incompatible old writers must be drained and blocked. No scheduler/background completion is installed. The existing moderation/source-quality/content-language behavior remains in force.

Multica: tools unavailable; no item or outbox event invented. Request-level owner/tracking remains root. R08 owner: generation-durability agent. Status: local review-ready after final evidence/commit below. Push: root-owned, not performed by agent. Merge/deployment/production verification/billing activation: not performed. Additional approval requested: none; banner and R11 integration choices were coordinated with root/owners.

Final source checks: full repository lint exit 0; final touched-file lint exit 0; full TypeScript noEmit exit 0; 112 focused contracts passed on final sources, including the 16-case subprocess wrapper. Commit identity follows after the authorized local commit. Known read-only dependency copies remain unstaged in this isolated worktree and are not part of R08.


## Independent review followup

Review identified three real defects: first-response loss could replace the client key, an older same-key attempt could permanently retain personal uncertainty, and manual legacy accounting did not make maintenance fail. The followup establishes recovery before dispatch, retains the original key, transactionally closes never-admitted keys before permitting edits after fresh quota/credit/validation denial, adds immutable UID/generation-scoped personal attempt accounting, and counts manual reconciliation as blocked. It adds the generic deletion containment hook required by R04.

The expanded actual file-store fixture passes 23 cases against the complete integrated R04 store/fence implementation, including real route recovery and guarded deletion transitions. The two accounting/maintenance review reproductions were confirmed failing before the fixes. New cases preserve a newer active lock, repair personal cost after a global-only checkpoint, and replace uncertainty once after deletion. Full TypeScript and touched-file lint pass. This corrects the original fixture’s insufficient seed scopes; the final evidence uses real lifecycle enforcement. Actual PostgreSQL, browser rendering, hosted provider, hard spend ceiling and deployment gates remain unclaimed.
