# Branch consolidation — 2026-09-12

Status: review_ready. Owner: current Codex task.

## Scope and authorization

Victor requested consolidation of every branch with work not merged into `main`, including work in progress; conflict remediation; merge into `main`; removal of consolidated branches; and final commit and push. This explicitly authorizes the requested merges, pushes, and branch deletion. Deployment, production changes, billing, and secret management are outside this request.

## Outcome checklist

- [x] Inventory fresh local/remote branches, worktrees, uncommitted changes, pull requests, and active owners; preserve all unfinished work.
- [x] Reconcile every unique branch change with current `main`, resolve conflicts without reviving superseded behavior, and commit unfinished in-scope work.
- [x] Review the combined diff and pass proportionate repository checks; document any dependency or policy blocker.
- [ ] Merge the verified consolidation into `main` and push without bypassing protections or rewriting published history.
- [ ] Delete consolidated local/remote branches only after verifying their work is retained; preserve non-source local artifacts when retiring worktrees.
- [ ] Confirm fresh remote/local `main`, branch/worktree state, and bounded CI results; update the active handoff and report final evidence.

## Plan, risks, and evidence

Fetch and classify branches by ancestry and content (including squash-merged equivalents), inspect active worktrees, and coordinate any current writers. Preserve the existing root `AGENTS.md` edit. Integrate changes in dependency order in an isolated consolidation worktree. Review both sides of conflicts, run the scripts required by current repository CI, and inspect GitHub protections before landing. Retire source branches only after their exact tips or explicitly documented equivalent changes are retained in pushed `main`.

Risks: stale historical branches may restore retired systems; automated dependency branches may conflict with current security choices; worktree owners may still be writing; main pushes may invoke CI. Evidence will include branch tip/ancestry inventory, conflict decisions, check outputs, final commit hashes, remote branch listing, worktree status, and CI conclusions. Poll external checks with bounded calls and a deadline, never an unbounded watcher.

## Progress

- Started: root `main` is at `ae1abe3`; three other local branches have worktrees, and root `AGENTS.md` has an existing edit. Remote inventory is being refreshed.

- Progress: isolated integration worktree created; visitor/QA work and Node 26 proof fix merged locally. `AGENTS.md` retained both the optional-tracker policy and the required progress-record section; checkout documentation retained the fuller card-only explanation. Visitor owner will supply one final documentation-only tip. Dependency and security consolidation run in separate worktrees with no push/deployment authority.
- Patch-equivalent helper branches are verified using `git cherry -v`; their exact source tips will be linked as ancestors without replaying already integrated or subsequently improved code.

- Progress: integrated visitor final `8353de5`; owner confirmed a clean tracked tree and frozen source writes. Retained six previously uncommitted September 11 handoffs, with clear historical status and exact originals archived locally. Repository readbacks show main unprotected, no branch rules, and ordinary push permission; Victor's explicit merge/push request supplies landing authorization without another permission prompt.
- Historical cleanup conflict decisions: preserve current PostgreSQL-only configuration and bounded evaluation harness; retain health-source cleanup, exact collection-index coverage, explicit restore-evidence wording and Azure resource documentation. Do not revive deleted adapter configuration or obsolete release procedures. Preserve private-artifact ignore rules. Optional Cursor CLI files are retained under current opt-in policy, and no CLI installation/login was run.
- Checks so far: 34/35 targeted infrastructure/index contracts passed initially; the remaining retired-name check found one obsolete adapter reference in a merged document. Corrected to current `document-store.ts`; all 3 retired-system contracts then passed. Focused support lint, Python syntax, shell syntax and secret checks passed. Test startup initially failed on `/tmp` write quota; task-local `TMPDIR` fixed startup.

## Initial branch tips retained for cleanup verification

| Ref | Initial tip | Already in main |
| --- | --- | --- |
| `refs/heads/codex/qa-managed-recovery-fixture-20260912` | `81b37acd03bfb3d3d07054a484fcd02bee4945c8` | no |
| `refs/heads/codex/visitor-experience-20260911` | `8353de5591a758d9fcec2f71328795333bfac5f0` | no |
| `refs/heads/feat/public-release-readiness` | `04723a6f1207b420799dce266f70f9ddf767c92a` | no |
| `refs/remotes/origin/agent/filosage-10-ticket-context` | `77f29784e54a5dc2b3b0beb29606658c74492089` | no |
| `refs/remotes/origin/codex/ci-control-review-20260911` | `d2cd615a0bcf53c8a19c8e8231fb3cceecd50831` | no |
| `refs/remotes/origin/codex/database-deadline-verification-20260911` | `ab285c96e26873748e7d2e54cf90d616afd166a8` | no |
| `refs/remotes/origin/codex/hosted-theme-plan-20260911` | `4bda8f485ff30871e392bfaa46e009b7a2f00d1e` | no |
| `refs/remotes/origin/codex/opengrep-security-20260911` | `9f7f735a1ed7ddf885b1ab1060c80e4af35fab24` | no |
| `refs/remotes/origin/codex/release-implementation-20260906` | `8b4c8c271243de249ea4a6d5303f6a66186ab4f1` | yes |
| `refs/remotes/origin/codex/release-local-verification-20260908` | `c3b55f70f6af433766a83d8e3aa0f0d412f08397` | yes |
| `refs/remotes/origin/codex/release-readiness-local-20260824` | `be16cd6810d8135d0a2f8de45650db2f73e3191b` | yes |
| `refs/remotes/origin/codex/security-fixtures-20260911` | `8a87b7373dc83babd7da8b911bc41d3394495b7c` | no |
| `refs/remotes/origin/codex/security-scan-20260911` | `465f06a052c6a28dee2813b649196f1004a1db75` | no |
| `refs/remotes/origin/codex/visitor-auth-20260911` | `5c7ecf28381cb7ef6f2efce5b993152a6be3bb48` | no |
| `refs/remotes/origin/codex/visitor-billing-20260911` | `a5746d72ae313a23c4eb8ad5d2163f1bf22a12e3` | no |
| `refs/remotes/origin/codex/visitor-ci-contracts-20260911` | `a1350bf0f27914c73393123b8f365f6197af7a53` | no |
| `refs/remotes/origin/codex/visitor-experience-20260911` | `8353de5591a758d9fcec2f71328795333bfac5f0` | no |
| `refs/remotes/origin/codex/visitor-home-isolation-20260911` | `f469928306be69ead8babdb10ded2444aee5aed6` | no |
| `refs/remotes/origin/cursor/azure-customer-login-theme-c86f` | `c5ea2cc1b010ba4eb2cac61f9560dd0c3b2c59db` | no |
| `refs/remotes/origin/cursor/azure-zero-cost-hardening-ad31` | `4c8eb16dd7affd8fa116e749cbb4c2e595fc4aa3` | yes |
| `refs/remotes/origin/cursor/connect-multica-23aa` | `511335ba244f3b06ad15d7d5fad065dd11f5eed1` | no |
| `refs/remotes/origin/cursor/fix-login-ci-c86f` | `6dc64326083350a3a1ebbd931d1d1f4c2196767f` | no |
| `refs/remotes/origin/cursor/leftover-provider-cleanup-b455` | `0fa08099524d6a43d36accc3dfd21f94c89ace3d` | no |
| `refs/remotes/origin/cursor/retire-deprecated-systems-dfd2` | `e47c0d6f72ad7a1443789ee771f69d64e4a6cda4` | no |
| `refs/remotes/origin/dependabot/github_actions/actions/checkout-7.0.1` | `e182074c155edd38562e0f34f27f243b33ccdb6a` | no |
| `refs/remotes/origin/dependabot/github_actions/actions/upload-artifact-7.0.1` | `236be4007800188e290ed766550dd1ec9742712e` | no |
| `refs/remotes/origin/dependabot/github_actions/azure/login-3.0.2` | `f9050dd4026001ce80c1c5b4b556132733e7d45c` | no |
| `refs/remotes/origin/dependabot/github_actions/github/codeql-action/analyze-4.37.9` | `22df9f8e811d67640c73ca4564281b567c6c7afe` | no |
| `refs/remotes/origin/dependabot/github_actions/github/codeql-action/init-4.37.9` | `1072b74d24b3aa2893599d2dfa3a7e218e6f32e3` | no |
| `refs/remotes/origin/dependabot/npm_and_yarn/development-minor-patch-4d0586fba2` | `1265579327bee5349be0452fdce7c8257c533caf` | no |
| `refs/remotes/origin/dependabot/npm_and_yarn/globals-17.12.0` | `1f12f8aaff478e8767deb6600273622fd75b37e9` | no |
| `refs/remotes/origin/dependabot/npm_and_yarn/openai-7.10.0` | `1dbe8ee4d79821028073646119dccceccdbd7ef1` | no |
| `refs/remotes/origin/dependabot/npm_and_yarn/production-minor-patch-42d41600e3` | `4f969dbdd6448cf49a751b4304298cdf52db5594` | no |
| `refs/remotes/origin/dependabot/npm_and_yarn/typescript-7.0.2` | `c1bc21a0b847e844eb40f51b20f2608fee60bc7d` | no |
| `refs/remotes/origin/docs/filosage-agent-command-center-product-design` | `99adc45f4e81b3e3e901e557aa0c781a1ea08782` | yes |

The visitor final tip is `8353de5591a758d9fcec2f71328795333bfac5f0`; cleanup must verify that newer tip as well.

- Progress: all 35 initially inventoried refs (32 remote non-main refs and three local refs, including one duplicate branch name) are ancestors of the consolidated history. Final visitor tip and both integration-agent tips are retained. Eight dependency branches are merged with pinned action upgrades and Microsoft's supported TypeScript 7 CLI / TypeScript 6 compatibility API aliases; existing runtime/test APIs and workflow triggers are preserved. Extra OpenGrep is manual-only; automatic Semgrep and manual CodeQL remain available.
- Combined verification: clean locked install, production build, TypeScript 7, lint (zero errors; four existing full-navigation warnings), 469 release contracts, 114 offline application tests, eight OpenGrep runner tests, secret/wiki checks and zero-vulnerability dependency audit passed. All ten Semgrep report tests pass after explicitly declaring the fake CLI sandbox CommonJS; a task-local temporary directory had otherwise inherited the repository's ESM package type. Scanner production code and all test assertions are unchanged.
- Browser verification: initial support run passed 12/13; the newly merged context test raced public-library session restoration. Waiting for the visible restored account preserves the identity-reset behavior and passes the focused regression. The new Command Center context UI test passes. Combined Chromium smoke and the context API assertion are still running. The API assertion belongs to the browser execution lane; the initial API-only command selected no tests and provides no verification.
- Independent review approved historical conflicts, eleven patch-equivalent merges, dependency/compiler/action changes, security reconciliation, and the two test-environment corrections. Manual OpenGrep validated 83 rule hashes and positive/negative fixtures, then failed closed at its unchanged 300-second full-scan deadline. No completed full OpenGrep scan is claimed; the automatic Semgrep gate remains required in CI.

- Review readiness: combined Chromium smoke passed 34/34 without retries. The submitted-context API regression passed in its owned browser lane, and the new Command Center UI regression passed. All relevant local gates are now passed; lint retains four non-failing navigation warnings. No running local test watcher remains. Proceed with Victor-authorized ordinary main fast-forward/push, then verify automatic engineering/PostgreSQL/Semgrep CI with a 30-minute deadline and a final bounded read before branch cleanup. No manual heavy workflow or deployment will be dispatched.
