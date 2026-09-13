# Recovery rehearsal and evidence

Status: September12 bounded private PostgreSQL and isolated Blob recovery checks have executed and their task-created resources have been cleaned up; see [execution packet](releases/2026-09-12-recovery-rehearsal.md). The frozen candidate’s representative non-owner sign-in, private-course denial, lesson completion, reload persistence and restored banner display now pass in the isolated app; see [learner evidence](research/artifacts/release-readiness-20260912/service-recovery-learner-20260912.json) and [final cleanup](research/artifacts/release-readiness-20260912/service-recovery-cleanup-20260912.json). The selected-point rehearsal meets the approved recovery targets:22.712-second committed-state coverage age and23minutes13seconds through representative learner verification. [Consistency evidence](research/artifacts/release-readiness-20260912/selected-point-recovery-consistency-20260912.json) combines complete database-row equality with unchanged pre-point assets, restored references and prior isolated version-recovery tests. This does not certify arbitrary older points, live external-provider recovery or future outage duration. No production write or permission change was performed. The release owner must approve the exact resource inventory, recovery targets, cost ceiling, access controls, RPO/RTO and cleanup before execution. A candidate at zero public traffic still shares production services; it is not a recovery database or a safe target for destructive tests.

## Backup observation

`azure-backup-evidence.yml` observes the exact `AZURE_POSTGRES_RESOURCE_ID` using its GitHub OIDC identity. Set `AZURE_POSTGRES_APPROVED_RETENTION_DAYS` only after owner approval. The validator rejects missing inputs, a different server, non-Ready state, retention drift, and an invalid or future restore-window start. It records the full source SHA, run/attempt, resource ID and observation time. It does not read application records or restore anything.

Before enabling the observation, inventory the principal's effective inherited permissions and approve the required server-scoped read access. Record the resulting role assignment IDs and a readback; a template or successful login does not establish least privilege. Run a manual observation and retain the next scheduled result. A failed scheduled run requires an assigned operator response. The output explicitly says `restoreRehearsal: false`.

## Approved service targets and remaining evidence

Victor approved RPO of15minutes and RTO of60minutes for this rehearsal; do not ask for those values again. The September12 isolated learner path completed in approximately23minutes13seconds from restore request, including setup and human sign-in. This is observed rehearsal duration, not a production-outage guarantee. All522committed-visible baseline rows matched the restore, including retained accounting documents present in that snapshot. The simulated incident/request followed that baseline by22.712seconds; unknown writes in that interval are within the approved15minuteRPO. All15source assets predate the selected point and the13restored references match the verified copies. Lost transaction count and arbitrary older-point recovery remain unmeasured; neither is represented as a zero-loss guarantee.

## Approve an isolated rehearsal

Prepare a packet containing the candidate's full SHA and image digest, current schema/migration version, exact source PostgreSQL and Blob resource IDs, approved UTC recovery point, destination resource IDs/names, maximum spend and lifetime, accountable operator, independent reviewer, access/network plan and cleanup decision. Do not put credentials or personal records in the packet.

Use a separate recovery server and isolated Blob destination. Do not repoint either blue or green at restored data. Azure PostgreSQL point-in-time restore creates another server. Its networking constraints depend on the source: private-access servers can restore with supported private networking, while a public-access source cannot be assumed to restore directly into the private-access deployment model. Resolve the actual supported configuration before approval. Prove that the resulting destination is reachable only through the approved private path; a default public endpoint or inherited firewall assumption is not acceptable. Where necessary, use an approved isolated intermediate restore and controlled migration into a private target, accounting for the extra time, data handling and cost.

Disable customer ingress, scheduled workers, outbound payment/email/AI calls and webhooks on any rehearsal app. Use dedicated recovery credentials with no production write permission. Inspect destination firewall rules, private endpoints, DNS, server parameters, database ownership and login permissions explicitly: restoration does not prove all configuration was copied. Permit access only to the approved operator and test identity for the bounded rehearsal.

## Execute and measure

1. Capture the source recovery window and choose a valid point. Record request start, resource-ready time, database-connect time and application-validation finish independently. Keep provider operation IDs and sanitized error summaries.
2. Restore to the approved separate server. Verify resource identity, region/network restrictions, selected restore point and schema before connecting a test runner. Never run a destructive reset or production bootstrap against the source.
3. Validate the current document schema and runtime DML-only role. Run the candidate's database verification against the recovery target. Confirm it cannot create, alter or drop application tables. Account for any schema transition between the restore point and candidate using an explicitly reviewed migration; do not assume the old and new revisions can both write it safely.
4. Using approved representative accounts, compare counts and restricted keyed fingerprints for account lifecycle generations, identity links, course/lesson/release relationships, private notes, mastery/progress, evidence shares and references, subscriptions/entitlements, credit ledgers, generation operations and deletion jobs. Check ownership and references as well as document presence. Include an in-progress generation, a completed credit operation and a deletion tombstone; do not resume workers or send billing reconciliation to a live provider from the recovery target.
5. Compare the latest known committed markers before the incident point with the recovered markers. Measure actual lost committed work and elapsed recovery time against the approved RPO/RTO. Mark gaps or unverifiable markers as unresolved; avoid treating restored row counts as proof of consistency.
6. Independently restore representative Blob versions, including a replaced object and a deleted object, into the approved isolated destination. Record the source object version and nonpublic checksum, verify bytes, metadata ownership and matching database asset/reference state, and ensure a tombstoned/deleted account is not made accessible. Database recovery does not restore Blob versions. Confirm the actual account supports the required versioning and retention before relying on this procedure.
7. Run the approved learner read/recovery checks against the isolated candidate with live provider calls disabled. Confirm that evidence from one account cannot be read by another. Retain sanitized results; keep personal data and restricted fingerprint keys out of GitHub artifacts.
8. Have the independent reviewer record pass/fail, remaining inconsistencies and the measured targets. Recovery is accepted only after both database and Blob validation succeed. Obtain the explicit cleanup decision for the exact recovery resources, perform approved cleanup, and retain deletion/readback evidence. Never automatically delete a resource selected by name prefix.

## Required evidence record

| Field | Required result |
| --- | --- |
| Candidate and schema | Full SHA, immutable image digest, schema/migration version |
| Source and destination | Exact resource IDs; reviewer-approved access and cost scope |
| Recovery point | Requested and observed UTC point; provider operation ID |
| Timing and data loss | Measured stages, committed-marker gap, approved RPO/RTO comparison |
| Database consistency | Sanitized counts/fingerprints, ownership/reference checks, role checks |
| Blob recovery | Version IDs, checksums and database ownership/reference consistency |
| Operator and review | Named operator, independent reviewer, dated decision and unresolved findings |
| Cleanup | Approval, exact removed resources and readback, or approved bounded retention |

Provider references: [Azure PostgreSQL backup and restore](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore) and [Azure Blob versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview). Recheck the selected resource's supported restore/network/versioning behavior when preparing the live packet.
