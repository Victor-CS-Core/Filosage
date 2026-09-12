# Branch consolidation — 2026-09-12

Status: started. Owner: current Codex task.

## Scope and authorization

Victor requested consolidation of every branch with work not merged into `main`, including work in progress; conflict remediation; merge into `main`; removal of consolidated branches; and final commit and push. This explicitly authorizes the requested merges, pushes, and branch deletion. Deployment, production changes, billing, and secret management are outside this request.

## Outcome checklist

- [ ] Inventory fresh local/remote branches, worktrees, uncommitted changes, pull requests, and active owners; preserve all unfinished work.
- [ ] Reconcile every unique branch change with current `main`, resolve conflicts without reviving superseded behavior, and commit unfinished in-scope work.
- [ ] Review the combined diff and pass proportionate repository checks; document any dependency or policy blocker.
- [ ] Merge the verified consolidation into `main` and push without bypassing protections or rewriting published history.
- [ ] Delete consolidated local/remote branches only after verifying their work is retained; preserve non-source local artifacts when retiring worktrees.
- [ ] Confirm fresh remote/local `main`, branch/worktree state, and bounded CI results; update the active handoff and report final evidence.

## Plan, risks, and evidence

Fetch and classify branches by ancestry and content (including squash-merged equivalents), inspect active worktrees, and coordinate any current writers. Preserve the existing root `AGENTS.md` edit. Integrate changes in dependency order in an isolated consolidation worktree. Review both sides of conflicts, run the scripts required by current repository CI, and inspect GitHub protections before landing. Retire source branches only after their exact tips or explicitly documented equivalent changes are retained in pushed `main`.

Risks: stale historical branches may restore retired systems; automated dependency branches may conflict with current security choices; worktree owners may still be writing; main pushes may invoke CI. Evidence will include branch tip/ancestry inventory, conflict decisions, check outputs, final commit hashes, remote branch listing, worktree status, and CI conclusions. Poll external checks with bounded calls and a deadline, never an unbounded watcher.

## Progress

- Started: root `main` is at `ae1abe3`; three other local branches have worktrees, and root `AGENTS.md` has an existing edit. Remote inventory is being refreshed.
