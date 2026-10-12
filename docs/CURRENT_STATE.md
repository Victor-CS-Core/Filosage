# Filosage current state

Last materially updated: October 12, 2026

This is the canonical living snapshot for the repository. Read it before starting or resuming work. The source identity for this snapshot is the commit that contains this file; verify remote `main` and the exact CI run before relying on it for release decisions.

## Maintenance contract

- Update this file in the same checkpoint whenever application behavior, deployment state, feature flags, release gates, blockers, or next actions change.
- Replace stale statements instead of appending a chronological diary. Put detailed evidence in a dated document and link it here.
- Distinguish local implementation, committed source, pushed source, deployed source, and production verification. One does not prove another.
- Do not put credentials, private logs, personal data, or secret values here.
- `docs/AGENT_PROGRESS.md` is a historical execution log, not the current source of truth.

## Repository and deployment

- Primary branch: `main`. The October 12 integrity-remediation sequence (16 commits through `10ec81ef`, plus this checkpoint) is pushed source, **not** deployed source.
- Production application: Cloudflare Worker at `https://filosage.com`, with Cloudflare D1 and R2 and direct Google authentication. Production still runs the October 10 deployments (mobile-auth, then the mobile-progress endpoint). No remediation commit has been deployed.
- Observed October 12, 2026: `/` returns 200. `/api/health/ready` still returns not-ready with `configuration: false` and `datastore: false` on the deployed version; the cause is not established. Treat production readiness as an open operational blocker; investigate read-only before proposing a change.
- Billing remains disabled and closed, verified October 12 via `/api/billing/status`: `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, `STRIPE_TAX_READY=false`. Spark flags remain false. Keep both disabled until the integrity fixes and exact-candidate verification pass and separate approvals are given.
- The iOS app works only against production data, not staging. Its end-to-end lesson-sync test (real Google sign-in on device, lesson completion syncing both ways) is still pending with the owner.
- Azure resource deletion is owner-side and unconfirmed; do not alter Azure resources. The obsolete Azure backup-evidence schedule was retired (workflow deleted); Cloudflare D1/R2 backup and restore verification is separate, still-unproven work — retiring the schedule does not establish recovery readiness.

## Integrity remediation status (October 12, 2026)

1. **Lockfile / install blocker — fixed.** `package-lock.json` regenerated with Node 22.18.0 / npm 10.9.3 (CI versions); clean `npm ci` verified locally and in CI. Related repairs: Next.js 16.4.0 (critical RCE), esbuild override, oxlint react/purity cleanup, `python`→`python3` in tests, generation-operations subprocess timeouts raised.
2. **CI deterministic failure — fixed in this checkpoint.** At `10ec81ef` the quality gate failed during contract-test *collection*: `tests/operations-scripts.spec.ts` read `.github/workflows/azure-backup-evidence.yml`, which the schedule retirement had deleted, so no contract test ran and build/browser jobs were skipped. The obsolete contract and its dead validator (`scripts/validate-backup-observation.mjs`) are retired, the suite manifest and lane count updated, and the new D1/unit tests are wired into the quality gate (`test:d1`, `test:unit` steps). A pre-existing retired-name failure (a retired datastore name in a code comment and the migration analysis doc) was fixed by rewording both files.
3. **D1 transaction atomicity — fixed locally, awaiting exact-SHA CI.** `finishTransaction()` now commits through `applyTransactionalWrites()`: the entire read set (versions of existing documents, non-existence of absent ones — including documents read but never written, such as account-lifecycle and publication guards) is validated by assertion statements inside the SAME atomic D1 batch as every mutation, so a conflict or mid-batch failure commits nothing. Conflicts surface as the retryable `Document store request failed (409)` contract the other backends use. Five new tests cover multi-document rollback on a later conflict, read-only guard changes, concurrent creation of an absent read document, delete of a document created after the transaction began, and mid-batch failure injection; the D1 suite is 11/11. Known residual: the begin-time snapshot is read path-by-path (optimistic model), so validation is atomic at commit, not a serializable snapshot.
4. **AI-assessed evidence — fixed.** Spark assessment writes `authority: "ai-assessed"` and mastery scoring no longer lets it grant demonstrated mastery. The API/report path now honors the tier end to end: the mastery route parses all three authorities for stored records (GET no longer drops `ai-assessed` records), client submissions are still downgraded to learner-reported by normalization (parsing is not trust), and clients can no longer overwrite or downgrade server-minted (`server-verified` or `ai-assessed`) records by reusing their ids. Evidence reports preserve the tier in the ledger, label it "AI-assessed" on the shared-evidence page, explain it in the methodology, and count it as meaningful evidence. Route-level coverage: `tests/fixtures/mastery-authority-behavior.mjs` runs under `test:unit`; both the schema fix and the report mapping were mutation-verified.
5. **PR #52 port — Tier C complete; credit atomicity fixed.** Tier C account-deletion inventory ported (illustration assets/keys/budgets, credit-refund collections, shared asset cleanup), and the ownership/fence gap is fixed: `courseIllustrationBudgets` joined `AUTHOR_ARTIFACT_COLLECTIONS` (the records carry only a `courseId`, so they are owned through their course) and the write fence now accepts `illustration-receipt` mutations for `courseIllustrationAssets` like banner receipts. The behavioral fixture `tests/fixtures/tier-c-deletion-behavior.mjs` (in `account-deletion-recovery.spec.ts`) proves an author with art, a spend budget, and credit-back receipts deletes cleanly with no manual review, and that an in-flight illustration upload holds deletion until its receipt lands; both fence changes were mutation-verified (removing either makes the fixture fail). **CourseRootDeletion credit atomicity:** course deletion and the credit-back cannot share one transaction (deletion is a multi-commit sweep), so the DELETE route now records a durable refund intent (`users/{uid}/courseCreditRefundIntents/{courseId}`) before deleting and settles it in the refund transaction afterwards. A failed deletion never mints a credit (the refund and its recovery path both refuse while the course exists); an interruption between the delete commit and the refund leaves a pending intent that the next DELETE request settles exactly once (the refund document remains the exactly-once marker, the 24-hour window is judged from the intent's recorded deletion time, and the monthly cap still applies in the settlement transaction). Proofs in `tests/course-credit-refund.test.ts` (`test:unit`): successful deletion refunds once, retries and concurrent duplicate deletes cannot double-refund, failed deletion preserves the credit, recovery refuses a live course, and an interrupted refund recovers exactly once. Still open from PR #52: hero-serving, illustration-cost accounting, and lesson-DTO changes.
6. **Mobile progress — fixed.** Shared normalization extracted to `src/lib/progress-normalization.ts`; web and mobile routes both use it. The mobile route is on `main` as of `10ec81ef`. The mobile mutation now parses the previous document with private operations included and carries `capstone` and `recentOperations` forward into the replacement document, so a phone completion no longer erases web-owned state. The two tautological normalization tests were replaced with contract tests (independent FNV-1a shard computation; capstone kept publicly while `recentOperations` stays gated behind `includePrivateOperations`, filtered and capped at 50), and `tests/fixtures/mobile-progress-preservation-behavior.mjs` drives the real mobile POST and web GET routes web→mobile→web; removing the preservation makes it fail.

## Verification evidence

Local, exact-candidate tree of `10ec81ef` plus this checkpoint's fixes, October 12, 2026:

- `npm ci` (Node 22.18.0 / npm 10.9.3): clean.
- `npm run test:contracts`: **452/452 passing** (includes generation-operations under full parallel load, release-hardening, release-prerequisites).
- `npm run lint`: 0 errors (4 pre-existing warnings). `npx tsc --noEmit`: clean.
- Node suites: eval-harness 22/22, evaluation-budget 27/27, lesson-integrity 22/22, lesson-operations 11/11, billing 32/32, D1 document store 6/6, unit (mastery authority + progress normalization) 8/8.
- CI/workflow tests 24/24; maintenance/runner/candidate-proof 23/23; tracked-secret scan and support-wiki checks pass.
- Exact-SHA CI: at `ca80d604` (CI fix) and `969420d6` (Tier C), the `static-and-release-contracts` and `postgres-transactions` jobs both completed **success**. At `969420d6` the `browser-smoke` job completed with **31 passed / 3 failed**: `account-storage-isolation` (offline drafts survive reload; delayed mastery response) and `learner-recovery` (note draft retry) time out with the app stuck on the session-restore splash. This failure is **pre-existing relative to the AI/mobile/credit checkpoints**: it reproduces locally, serially, in a tree containing none of those unpushed changes, and the browser suites run on the local file store, so the D1 batch change is not implicated. It is an open release-gate item (see pending item 4), not yet root-caused.
- D1 atomicity checkpoint (`c13f7313`): `npm run test:d1` 11/11 locally (5 new atomicity tests), TypeScript clean, lint 0 errors.
- AI authority / mobile preservation / credit atomicity checkpoints: `npm run test:unit` 12/12 (includes route-level fixtures for the mastery API + evidence report, web→mobile→web progress, and course credit refunds incl. interruption recovery), TypeScript clean, lint 0 errors, affected contract suites 21/21, billing 32/32.
- Not yet evidence: a fully green quality gate at one exact SHA, a fresh full browser regression (last full pass September 28, 2026 on an older SHA), and any deployment of the remediation sequence.

Earlier Spark checkpoint evidence (October 9) is recorded in `docs/SPARK_RELEASE_APPROVAL_2026-10-09.md` and remains valid for the Spark source as of that date.

## Pending items, in order

1. **Production readiness diagnosis** (read-only): why configuration and datastore checks return false on the deployed version.
2. **D1/R2 backup and restore verification** designed and proven separately.
3. **Release gates still ahead:** green quality gate at the exact candidate SHA, fresh full browser regression on the frozen candidate, then separate explicit approvals for staging deployment, Spark staging evaluation, and any production decision. Legal/provider counsel review also remains open.
4. **Browser-smoke session-restore failure (pre-existing, unrooted):** at `969420d6`, 3 smoke tests fail with the app stuck on "Restoring your Filosage session" (`account-storage-isolation.spec.ts:174`, the delayed-mastery-response test in the same file, `learner-recovery.spec.ts:75`). Reproduced locally and serially; not caused by the D1 change (browser suites use the local file store) or by the AI/mobile/credit checkpoints (reproduced with them reverted). Root cause to be established before the candidate can be called verified.
5. **iOS lesson-sync end-to-end test** on the owner's iPhone against production.

## Standing constraints

- Keep billing closed (`BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, `STRIPE_TAX_READY=false`) and all Spark flags false until their separate gates and approvals are complete.
- Repo pushes follow the owner's October 12 instruction: commit and push after each major validated change in this remediation. Production deploys and production configuration changes still require separate explicit approval each time. Never stop, restart, or alter a running service without explicit approval.
- Never commit secrets or route them through chat. Do not alter the OpenAI proxy or Azure resources without approval.
- Do not promise human assessment review; no Spark human-review workflow exists.
- Preserve existing course, publication, tutor allowance, evidence, account deletion, and privacy behavior.
