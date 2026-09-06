# Blue/green BFF implementation report

September 6, 2026. Owner: blue_green_bff implementation agent. Base: `9e1206685718084b3a8df02da0eb6799faf576b8`. Branch: `codex/blue-green-bff`.

## Scope delivered

- Retired the separate QA workflow and Bicep application template. One Container App serves Next frontend plus same-origin BFF API from one runtime image; blue/green are revision labels.
- Stage checks exact-SHA quality/full-regression runs, reads exact 100/0 state, builds once, resolves digest, copies the observed live revision template and checks public traffic stayed unchanged. Atomic scoped traffic-array replacement binds the inactive label without leaving the CLI's old unlabeled zero-weight entry.
- Candidate evidence binds full SHA/digest, committed manifest, canonical origin, app/revision/label, shared auth fingerprint, before/after traffic and exact predecessor. Shared app authentication is never changed by staging/promotion.
- Added independent candidate-review workflow and bounded packet validation requiring successful exact-SHA immutable proof artifacts, candidate-matching proof content, named human review, write/in-flight compatibility and an explicit compatible rollback target. No fake hosted passes are embedded.
- Promotion consumes the successful stage and review artifacts, rechecks state and image, then swaps 100/0 by exact revision names without a rebuild. Public health/origin/SHA/digest/manifest and apex/www checks run afterward. Failure recovery only uses the explicitly approved compatible predecessor; fresh signed-in outcomes remain a separate operator gate.
- Separated manual bootstrap job/image/identity and two secret-scoped reads from runtime. Runtime starts with a read-only schema/privilege check. Bootstrap explicitly targets the app DB, runs the additive schema and grants bounded DML/USAGE with no schema CREATE. Existing ownership and inherited privilege cleanup remain separate reviewed provider operations.
- Current BFF, capability, operations and auth runbooks now match one-app topology. The previous complete External ID runbook/approval ledger is preserved in `docs/history`. The retirement inventory names every known resource class/source locator and explicitly marks live IDs/readbacks unavailable.

## Verification

- Initial failing traffic/helper and bootstrap tests preceded their implementation.
- Final combined focused run: **58 passed** across blue-green release, bootstrap isolation, Azure infrastructure, Azure hardening and release-capability suites. This includes actual Bicep compilation of `main.bicep` and `bootstrap.bicep`.
- Additional selected deployment/auth-runbook/security workflow contracts: **26 passed** (includes overlaps with the 58-test run).
- Full TypeScript check, changed-file Oxlint/ESLint, workflow YAML parsing, Node syntax checks and Git whitespace validation performed separately.
- Microsoft primary documentation and installed Azure CLI implementation reviewed. Tests caught and corrected conditional-resource scope omission in compiled Bicep and the label-add retained-row behavior. The revision label host is `app---label.domain`.
- No local PostgreSQL, Docker build, full integrated regression, CI, Azure deployment, real learner/provider session, alert delivery or live privilege probe is claimed by these local contracts. A bounded real PostgreSQL privilege test follows in a separate commit for root CI integration.

## Remaining external gates

Retrieve exact live app/revision/digest/traffic/auth and QA-retirement resource IDs; inventory/review legacy runtime DB/table ownership, memberships and broad inherited Key Vault grants; execute approved runtime allow/admin-deny probes; configure/verify protected GitHub environments and exclusive deployment/registry writer control; retain successful final integrated SHA/digest evidence; collect actual candidate hosted gate artifacts; obtain Victor's concrete promotion approval; verify fresh signed-in behavior and independent monitoring after swap/rollback. Any old binary bypassing current account/publication/accounting fences is excluded from rollback.

Removing resources from an incremental template does not delete them or revoke assignments. No live QA cleanup, RBAC/secret changes, database migration, deployment, traffic change, external account creation or paid activation has occurred. `BILLING_ENABLED=false` remains the candidate boundary.

## Integration and state

Root owns shared test-manifest wiring, integrated regression and push. Register `tests/blue-green-release.spec.ts` and `tests/azure-bootstrap-isolation.spec.ts` in the contract lane. Deployment-only hunks of `tests/release-hardening.spec.ts` are separate from the quality agent's runner changes. PostgreSQL privilege test will depend on root's already-integrated `tests/postgres/fixture.ts`.

Multica: unavailable in this session; no fabricated item/outbox. Owner: blue_green_bff agent; status: local source and focused verification ready for independent root review. Commit: local branch commit only. Push: root-owned/pending. Deployment: not performed. Production verification: not performed. Required approvals: concrete Azure bootstrap/privilege/retirement operations and promotion/paid activation remain separate.

### PostgreSQL privilege follow-up

Added `tests/postgres/bootstrap-privileges.test.ts`, depending on root's existing PostgreSQL16 fixture/test lane. It checks the actual bootstrap target connection and migration script, creates only a UUID fixture runtime role, verifies CRUD and startup schema checks, rejects schema/table CREATE and table ALTER/DROP inside always-rolled-back transactions, and verifies missing DELETE, schema CREATE and privileged-role membership invalidate startup. Cleanup removes only that UUID role and its fixture grants. Full typecheck and focused lint passed using a temporary read-only fixture link, removed before commit. The test has **not run against PostgreSQL locally**; root's exact-SHA CI execution is required before claiming a real privilege-probe pass.
