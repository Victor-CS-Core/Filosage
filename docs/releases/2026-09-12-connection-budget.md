# Modern database connection budget

Status: source correction prepared; no pool setting, replica scaling or active legacy revision has been changed. Coordinator owns the fresh provider inventory, separate runtime role/secret preparation and production acceptance in `docs/AGENT_PROGRESS.md`.

The coordinator's September 12 metadata reports PostgreSQL `max_connections=50`, `reserved_connections=5` and `superuser_reserved_connections=10`. Production permits three replicas per revision. QA has one active revision, maximum one replica, and the older default main pool of ten plus one health connection. Keep existing replica scaling.

| Allocation | Maximum connections |
| --- | ---: |
| Two modern production revisions × three replicas × (main pool 2 + health pool 1) | 18 |
| Existing QA: one replica × (main pool 10 + health pool 1) | 11 |
| Provider-reserved and superuser-reserved | 15 |
| Operations and other separately inventoried clients | 6 |
| Total | 50 |

The modern app defaults to two main connections. `DATABASE_POOL_MAX` accepts only literal `1` or `2`; empty, malformed, fractional, nonfinite and larger values fail. Bicep and the actual revision-copy stage explicitly set two. Candidate readback checks that exact setting. The startup verifier requires at least 50 server connections and at least 35 after subtracting both actual reserved settings. The proposed dedicated production role's connection limit of 18 is a separate provider operation; source configuration alone does not prove that limit exists or that all clients use that role.

Before staging, fresh revision inventory must contain exactly one active modern predecessor, with explicit bounded pool configuration. The zero-weight previous revision must already have completed the separately approved drain and deactivation. Staging reserves the second modern revision before creating it. Review, promotion and rollback recheck every active revision, including unlabelled revisions; a third active revision, missing/legacy pool configuration or maximum replicas above three blocks the workflow. No automatic deactivation is added. Existing exclusive operator control remains necessary between reads and mutations.

The workflow inventories the known QA app in the same configured resource group and budgets all its active revisions against eleven connections. Its absence is accepted only after a successful app-list read. Missing QA pool settings conservatively retain the old default ten. Additional applications, direct database clients, rollout replica overlap and manual jobs require an updated operational inventory; the six-connection reserve is not unlimited capacity. Preserve the dedicated role ceiling and abort admission when capacity cannot be bounded.

The existing live legacy main pools remain ten until the maintenance/drain and modern-baseline transition. This source change cannot make their overlap safe. A modern baseline must carry the explicit pool setting and pass read-only startup and hosted verification before normal staging. Pool wait/timeout and workload latency should be measured on that isolated modern candidate; a smaller bound proves connection capacity, not equivalent performance or completed service recovery.
