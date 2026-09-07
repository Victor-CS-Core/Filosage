# September 7 implementation recovery checkpoint

Implementation remains in progress. This checkpoint does not certify release readiness.

The resumed workspace lacked the September 6 implementation checkout and unpushed worktrees. The GitHub branch still identified `3ee8327fedc14bbf75f8195e2bb9ce96e8bfee67`, tree `dac7bac66a70a53d92c8a7b7c3b343194bb86cbb`. That exact commit/tree was restored: 815 file contents verified against Git blob hashes; 15 unavailable artwork/screenshot entries retained unchanged in the Git index. No source, configuration or documentation file was unavailable. Unpushed changes described in the earlier conversation are being reconstructed and reverified, not assumed present.

## Recovered and independently reviewed

- Evaluation HTTP requests bind the approved build, profile and operation ceiling. Explicit durable call purposes distinguish generation, research, verification, fallback, recovery and moderation. Moderation identifiers are validated separately.
- Rejected telemetry retains the operation identity and a bounded error; it cannot become trusted cost evidence or release its reservation. Known operations can reconcile uncertainty through read-only status requests, while creation/resume spending remains blocked. Malformed reconciliation flags fail closed.
- All engineering jobs and full browser regression check out and assert the actual candidate SHA, retaining it with test artifacts. Full regression runs on pull requests as well as its existing schedule/manual trigger, with a 60-minute job deadline.
- PostgreSQL role formatting explicitly types both parameters for CREATE and ALTER. The real PostgreSQL fixture exercises both and connects using the rotated password before its existing privilege checks.
- Browser fixtures use actual completion state, wait for rendered session identity, provide learner-state responses for synthetic managed sessions, and scope duplicate publication/mission text without removing account-isolation assertions.

Local commits: `e2da53bcbb0c1a02d176e9147e06c0c9a534656f` (adapter) and `c126d38d4a947f2a541505bb882af36f24e708d3` (CI/bootstrap/browser fixtures). Remote integration may use a different commit with the identical verified tree.

## Actual verification

Fresh local Node 24: dependency install from lockfile, production build, TypeScript and lint succeeded; API tests passed 11/11. Evaluation harness passed 22/22, including seven new behavior regressions observed failing before the corresponding fixes. Scoped CI changes passed TypeScript/lint, 14 focused contracts, three PostgreSQL target-safety tests, and actual matching/mismatching SHA-guard checks. The independent review accepted both bounded changes after two adapter findings were fixed.

These are distinct from required Node 22 CI. Local browser engines and PostgreSQL are unavailable. A broader contract attempt stopped at unavailable Azure CLI; neither browser discovery nor PostgreSQL target-safety tests establish browser or transaction success. The next exact-commit GitHub runs must verify these changes, including the previously failing seven smoke cases and real PostgreSQL bootstrap.

## Still open

- Reconstruct and verify R09 universal lesson commit/attempt guards, durable lesson output recovery and PostgreSQL repair/publication races.
- Complete server-enforced evaluation budgets and durable course/lesson integration. Reviewed rates must include cache writes; unresolved/nonterminal responses must retain exposure; approval must bind exact runtime configuration. The backend does not yet advertise completed evaluation capabilities.
- Reconstruct R03/R14 private async-effect identity checks, truthful learner load/sync recovery, and R15 blocking-dialog lifecycle/accessibility.
- Final whole-branch review, complete exact-SHA engineering/browser success, branch policy and CodeQL administration. Previous CodeQL analysis could not upload because repository code scanning was disabled; the workflow is not being weakened.
- Actual Azure inventory/permissions, hosted identity, no-traffic candidate tests, compatible rollback/restore, alert delivery, real provider evaluations and human/commercial review.

The committed topology remains one Azure Container App containing frontend and same-origin BFF, with blue/green candidate revisions and no separate QA deployment. No live Azure resource was deleted, deployed or switched. No merge, paid provider evaluation or billing activation occurred. AppCreator remains recorded in `docs/APP_CREATOR_REFERENCE.md` for later native-app work.

Multica integration is unavailable; no live item or queued event is claimed. Root owns source integration, verification and push; platform/product owners retain the documented live approval and evidence gates.
