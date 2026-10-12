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
3. **D1 transaction atomicity — partial, rework is next.** Version-guarded writes exist, but `applyWrites()` executes them individually, so a later conflict leaves earlier writes committed; documents read but not written (account-lifecycle and publication guards) are no longer validated at commit, and deleting a document that was absent at transaction start is unguarded. Required: atomic validation of the entire read set plus all mutations in one batch, with multi-document rollback and failure-injection tests.
4. **AI-assessed evidence — partial.** Spark assessment now writes `authority: "ai-assessed"` and mastery scoring no longer lets it grant demonstrated mastery. Still open: the mastery API schema accepts only the two old authorities (stored `ai-assessed` records are rejected on read), and evidence reports relabel AI evidence as learner-reported. Client-submitted evidence must remain untrusted.
5. **PR #52 port — partial.** Tier C account-deletion inventory ported (illustration assets/keys/budgets, credit-refund collections, shared asset cleanup). Still open: `courseIllustrationBudgets` ownership/fence (`AUTHOR_ARTIFACT_COLLECTIONS` omits them, so they are retained, not deleted) with behavioral deletion tests; atomic course deletion + credit refund (`CourseRootDeletion`) — sequenced *after* the D1 fix; hero-serving, illustration-cost accounting, and lesson-DTO changes from PR #52.
6. **Mobile progress — partial.** Shared normalization extracted to `src/lib/progress-normalization.ts`; web and mobile routes both use it. The mobile route is on `main` as of `10ec81ef`. Still open: the mobile mutation replaces the progress document without preserving `capstone` or `recentOperations`, and there are no real web→mobile→web route tests yet (the normalization tests only exercise the shared functions).

## Verification evidence

Local, exact-candidate tree of `10ec81ef` plus this checkpoint's fixes, October 12, 2026:

- `npm ci` (Node 22.18.0 / npm 10.9.3): clean.
- `npm run test:contracts`: **452/452 passing** (includes generation-operations under full parallel load, release-hardening, release-prerequisites).
- `npm run lint`: 0 errors (4 pre-existing warnings). `npx tsc --noEmit`: clean.
- Node suites: eval-harness 22/22, evaluation-budget 27/27, lesson-integrity 22/22, lesson-operations 11/11, billing 32/32, D1 document store 6/6, unit (mastery authority + progress normalization) 8/8.
- CI/workflow tests 24/24; maintenance/runner/candidate-proof 23/23; tracked-secret scan and support-wiki checks pass.
- Not yet evidence: the quality gate at this checkpoint's exact SHA (must be green before the candidate is considered verified), a fresh full browser regression (last full pass September 28, 2026 on an older SHA), and any deployment of the remediation sequence.

Earlier Spark checkpoint evidence (October 9) is recorded in `docs/SPARK_RELEASE_APPROVAL_2026-10-09.md` and remains valid for the Spark source as of that date.

## Pending items, in order

1. **D1 transaction integrity** (item 3 above), then re-verify the exact SHA in CI.
2. **Tier C illustration-budget ownership/fence** + behavioral deletion tests (item 5).
3. **AI authority through the API/report path** (item 4).
4. **Mobile progress preservation** (`capstone`, `recentOperations`) + real web→mobile→web route tests (item 6).
5. **CourseRootDeletion credit atomicity** on top of the fixed datastore: failed deletion preserves the credit, successful deletion refunds exactly once, concurrent retries cannot double-refund, interrupted operations recover.
6. **Production readiness diagnosis** (read-only): why configuration and datastore checks return false on the deployed version.
7. **D1/R2 backup and restore verification** designed and proven separately.
8. **Release gates still ahead:** green quality gate at the exact candidate SHA, fresh full browser regression on the frozen candidate, then separate explicit approvals for staging deployment, Spark staging evaluation, and any production decision. Legal/provider counsel review also remains open.
9. **iOS lesson-sync end-to-end test** on the owner's iPhone against production.

## Standing constraints

- Keep billing closed (`BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, `STRIPE_TAX_READY=false`) and all Spark flags false until their separate gates and approvals are complete.
- Repo pushes follow the owner's October 12 instruction: commit and push after each major validated change in this remediation. Production deploys and production configuration changes still require separate explicit approval each time. Never stop, restart, or alter a running service without explicit approval.
- Never commit secrets or route them through chat. Do not alter the OpenAI proxy or Azure resources without approval.
- Do not promise human assessment review; no Spark human-review workflow exists.
- Preserve existing course, publication, tutor allowance, evidence, account deletion, and privacy behavior.
