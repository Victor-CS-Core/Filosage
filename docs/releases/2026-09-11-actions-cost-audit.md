# GitHub Actions usage and proposed controls

Status: local proposal, remote controls unchanged pending Victor's approval. The current full regression was canceled; no new workflow has been dispatched. This audit supplements the [release handoff](../AGENT_PROGRESS.md).

## What is consuming time

The retained history contains 411 runs between August 13 and September 11. September accounts for 192 records. The jobs API was read successfully for the 123 September records outside the invalid-workflow category. Summing each executed job's duration, rounded up independently to minutes, gives this estimate:

| Workflow | Runs | Estimated runner minutes |
| --- | ---: | ---: |
| Full browser regression | 30 | 1,041 |
| Engineering quality gate | 28 | 179 |
| CodeQL security analysis | 27 | 129 |
| Support wiki | 22 | 23 |
| Backup evidence checks | 11 | 11 |
| Dependabot update jobs | 2 | 9 |
| Offline security candidates | 3 | 7 |
| **Total** | **123** | **1,399** |

These are job-time estimates, not an invoice or a claim about remaining account quota. The billing API requires a scope unavailable to the current login. The run timing endpoint returned zero billable durations even for executed jobs; those values were not treated as free execution. The calculation uses actual completed job timestamps and excludes jobs without an allocated runner. GitHub documents [per-job rounding](https://docs.github.com/en/billing/reference/actions-runner-pricing) and [private-repository minute usage](https://docs.github.com/en/actions/concepts/billing-and-usage). The [aggregate evidence](../research/artifacts/visitor-release-2026-09-11/actions-usage.json) retains run IDs and estimates for independent review.

Full regression accounts for about 74% of the estimate. Its triggers explain the waste:

- Eleven daily runs used about 386 minutes. The same main commit `8597824` was scheduled every day from September 1 through September 10; retained August history shows the same pattern back to August 24.
- Ten dependency PR runs used about 405 minutes. Dependency updates start the complete browser suite independently of whether the fast quality gate fails.
- Five earlier release PR runs used about 185 minutes.
- Four visitor-audit checkpoint pushes used about 65 minutes. Cancellation limits overlap, but already-executed minutes are still spent. Frequent remote checkpoints were therefore contributing to the problem.

CodeQL consumed another approximately 129 minutes without usable uploaded results. The [latest failure](https://github.com/Victor-CS-Core/Filosage/actions/runs/34639584877) is a repository code-scanning capability failure after analysis, not an application vulnerability finding. CodeQL is not a runtime dependency. The separate offline scanner has six project-owned detectors. Strict fixtures and its deliberate-failure probe pass; a network-isolated local scan at `4bd9d7c` subsequently passed with 428 eligible source files, zero errors and zero findings. The pinned CI image remains unverified. This is narrower coverage than CodeQL and does not establish that every security issue has been found; see the offline-security record and static-security triage.

## High run counts that are different problems

Sixty-nine September records have an Azure workflow filename as their name and zero elapsed time. The representative [run 34547154505](https://github.com/Victor-CS-Core/Filosage/actions/runs/34547154505) has zero jobs and zero check runs. These invalid-workflow records inflate the failure count; no runner-minute charge was inferred from the count. Current main already contains the prior Azure syntax repairs, so the old records do not justify changing production deployment controls again.

The retained August history also contains 78 manually dispatched isolated-QA deployments, 22 staging deployments, ten QA-image staging runs, and 15 promotions. They were dispatched under Victor's account; the Actions event cannot distinguish a UI click from an authorized CLI/agent invocation. They are not September's daily browser schedule, and no currently running deployment was found. This audit did not dispatch or alter any Azure operation.

An older `codex/opengrep-security-20260911` branch has one failed static-security run, separate from the two new offline candidate runs. Its existence is recorded to avoid treating old workflow names as additional active triggers on the visitor branch. Only one replacement should ultimately be integrated after evidence review.

## Concrete proposal for approval

1. Make full regression **manual-only**, retaining every test lane, its timeout, source-SHA verification and evidence artifact. Run it on a frozen release candidate. Azure's existing verifier must continue to require successful quality and full-regression evidence for that exact SHA; manual runs satisfy the same existing contract.
2. Make CodeQL **manual-only** until the private repository has its required code-scanning capability. Retain its pinned actions and restricted permissions. Do not remove dependency, secret or offline scan checks, and do not declare the replacement verified prematurely.
3. Keep quality checks automatic on PRs and main. Bound static/build work to 15 minutes and browser smoke to 20; retain PostgreSQL's existing ten-minute cap.
4. Remove `npm ci` from the separate support-wiki impact check because the checker uses Node built-ins. Add a five-minute cap and cancel superseded runs on the same ref.
5. Commit locally as often as needed; batch remote checkpoints after local checks. Avoid full-matrix reruns until the candidate is ready. Existing weekly npm minor/patch grouping is already configured; no dependency-security updates are disabled.

This would remove the automatic triggers responsible for 1,170 of the 1,399 estimated minutes in this snapshot (about 84%). That is the historical share targeted, not a guaranteed future saving: deliberate full-release checks would still consume time. Existing fast checks remain necessary and still run automatically.

## Current action and approval state

- Canceled [full regression 34639584955](https://github.com/Victor-CS-Core/Filosage/actions/runs/34639584955); GitHub confirms `completed / cancelled` at 19:52:04 UTC. A subsequent API read found no in-progress run.
- Paused all further agent pushes, workflow dispatches and reruns during this investigation.
- Automatic approval review rejected disabling full regression and CodeQL remotely because it would weaken CI/security controls without specific authorization. No workflow was disabled and the rejected operation was not retried through another mechanism.
- The local workflow patch is committed as `1718133` (agent source `0092687`). Four focused contracts pass on the integrated root tree. TypeScript, support-wiki and tracked-secret checks pass; the isolated worktree also passed YAML parsing and focused lint. Approval must cover applying these controls remotely and temporarily pausing full/CodeQL until the manual-only definitions reach main. Until then, existing main schedules and PR triggers remain active.
- No repository visibility, billing plan, credentials, Azure deployment or production data changed. Existing public-release blockers remain in the handoff.
