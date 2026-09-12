# QA retirement inventory and execution manifest

Status: inventory and execution-input review ready; retirement blocked and not executed. Owner: delegated QA inventory agent; the release coordinator owns `docs/AGENT_PROGRESS.md`. Baseline: `40f02c7`, branch `codex/release-qa-retirement-20260912`. Azure/GitHub metadata snapshot: September 12, 15:12 UTC; reviewed database probe: 15:13:03–15:13:32 UTC. All provider actions in this package were read-only. No push, merge, deployment, retirement, secret retrieval, or private content extraction occurred.

## Outcome checklist and acceptance

- [x] Inventory the exact QA app, revisions, domain, certificate, DNS, identity and grants; compare production consumers.
- [x] Inventory database/role metadata, Blob metadata, secret references, Stripe TEST endpoints and GitHub QA configuration without secret values or personal content; record inaccessible auth callback registries explicitly.
- [x] Identify preservation, recovery, configured retention/holds and all unknown dispositions.
- [x] Prepare exact dependency-ordered retirement inputs that preserve every shared resource and production consumer.
- [x] Validate sanitized documentation/tooling; provide the checkpoint for coordinator review. Commit identity is reported in the task handoff.
- [ ] Execution gate, coordinator-owned: successful production acceptance, required private preservation/disposition and missing provider consumer readbacks. No retirement success is claimed.

The approved release plan permits exclusive QA retirement only after production acceptance and required preservation. This package prepares review inputs; it does not satisfy or execute that gate. Missing consumer proof or retention disposition blocks the affected removal. Shared database server, vault, storage account, registry, managed environment and authentication consumers must remain.

## Plan and evidence policy

Read current release records, retrieve only allowlisted Azure/GitHub/provider metadata, compare QA with production references, inventory data using aggregate counts/catalog information only where read-only access exists, then record exact resource identifiers and ordered prerequisites. Do not fetch secret values, connection strings, tokens, sessions, account/lesson bodies or raw runtime logs. Use bounded reads and preserve configured recovery/holds. Unknown data or identity ownership is a blocker, not proof of exclusivity.

## Critical findings

**Preserve PostgreSQL role `filosageqa_app`, OID `25351`. It owns both production database `filosage` (OID `24762`) and QA database `filosageqa` (OID `25042`).** Fresh `pg_database` ownership and two shared ownership dependencies in `pg_shdepend` independently agree. Its name is not evidence of QA exclusivity. Do not drop/alter this role, run `DROP OWNED`/`REASSIGN OWNED`, change its password, or revoke its shared access as QA cleanup. Preserve `database-url-qa` and `postgres-qa-app-password` references/recovery versions pending explicit consumer and recovery disposition. The coordinator and operations owner were notified immediately.

QA holds real persisted records: 506 documents, including four courses (one public), 34 lessons, two user documents, one course release, three progress documents, nine mastery records and 26 documents in retained-policy categories. Eight documents remain deliberately unclassified by the safe collection allowlist. Ten Blob entries total 628,248 bytes. These are preservation/disposition inputs, not proof that QA is disposable or that all records belong to synthetic fixtures.

Production and QA share the Google OAuth client and its secret, OpenAI key, migrated-owner identifier secret, registry, managed environment, PostgreSQL server, vault, storage account, logging workspace and operational action group. Production uses a different runtime MI and External ID tenant/client. Both customer tenants must remain. The shared GitHub deployment identity and its `azure-staging` federation also remain.

## Evidence and scope

- [Azure/GitHub/DNS inventory](../research/artifacts/release-2026-09-12/qa-retirement-inventory.json): 34 metadata groups collected successfully; exact resource/role-assignment IDs, secret names and version references, auth client IDs, retention and public DNS. Secret values, ordinary environment values, private Blob names/content/tags and logs are omitted. The two public `AZURE_QA_*` configuration locators are included.
- [Database evidence](../research/artifacts/release-2026-09-12/qa-retirement-database.json): one independently reviewed, 29-second exact-revision execution, exit 0. Existing credential remained inside the QA process. Explicit read-only transaction, catalog/aggregate reads and rollback succeeded.
- [Stripe TEST metadata](../research/artifacts/release-2026-09-12/qa-retirement-stripe.json): exact QA endpoint/Portal configuration selected from fully paginated GET results. No customer, subscription, event payload, credential or LIVE access was needed.
- [Dependency-ordered manifest](../research/artifacts/release-2026-09-12/qa-retirement-manifest.json): exact identifiers, prerequisites, blocked steps and explicit shared-resource preservation. This is review input, not a mutation script.
- Historical [QA recovery and TEST binding](../research/artifacts/visitor-release-2026-09-11/qa-stripe-recovery-20260912.json) remains preserved. Current findings above supersede historical ownership assumptions.

The inventory covers the accessible Azure subscription, its resource identity metadata, both apps, all QA revisions and resource-group jobs. No Container Apps jobs or QA identity federated credentials were returned. The infrastructure-tenant CLI cannot currently address the QA customer-tenant registration; this is a missing provider read path, not proof that the app is absent. No DNS management connector was available. Public DNS is observed, but authoritative management ownership/record identifiers remain unverified.

## Exact topology and entrypoints

All Azure resources below are under subscription `bfc8f890-2681-43dc-8eac-51644341ae12`, resource group `filosage-staging-central-rg`. Full ARM IDs appear in the inventory and manifest; paths must never be selected by a wildcard.

| Target | Observed state and disposition |
| --- | --- |
| `Microsoft.App/containerApps/filosageqa-app` | Single revision mode, latest-revision traffic 100%, public ingress port 3000; exclusive compute candidate after production acceptance and entrypoint drain |
| `filosageqa-app--qa-stripe-test-1` | Sole active Healthy revision; immutable `filosage-qa@sha256:3d33eacc178c4e6323c957ab9fd1d81c2dd2f8e149b3b43bbe44e9b09a76bf14`; source `c7d9c2c274bfcaee805332a83d94a208af32f09e`; initial metadata `ScaledToZero`, successful health GET/DB probe subsequently warmed it |
| `filosageqa-app--qa-c7d9c2c-1` | Inactive, stopped, traffic 0; same immutable QA image |
| `filosageqa-app--qa-93f60f24-1` | Inactive, stopped, traffic 0; legacy tagged image `filosage:93f60f24afe59b19b6a592f455a09e8e813f1f84` |
| QA domain | `qa.filosage.com`, SNI binding to QA certificate; default ingress `filosageqa-app.salmontree-eb10220f.centralus.azurecontainerapps.io` |
| QA certificate | `Microsoft.App/managedEnvironments/filosagestg-environment/managedCertificates/mc-filosagestg-en-qa-filosage-com-4745`; subject `qa.filosage.com`, CNAME validation, Succeeded; neither production domain references it |
| DNS CNAME | Zone `filosage.com`, name `qa`, target `filosageqa-app.salmontree-eb10220f.centralus.azurecontainerapps.io.`, observed TTL 3600 seconds |
| DNS ownership TXT | Name `asuid.qa`, value/TTL in manifest; remove only after CNAME absence and domain unbind |
| Authoritative nameservers | `ns15.domaincontrol.com.` and `ns16.domaincontrol.com.`; Azure DNS zone list empty |
| Production preserved | `filosagestg-app`; `filosage.com` and `www.filosage.com`; distinct apex/www managed certificates. Snapshot still has green `93f60f24` 100%, blue `7abae96f` 0%; this is baseline metadata, not acceptance of the new release |

Preserve all shared ACR images and immutable QA evidence while recovery/disposition is pending. App retirement does not authorize deleting repositories/tags/digests from the shared registry.

## Identity, secret and integration consumers

QA MI `filosageqa-app-identity` has client ID `aa4f7188-36bc-49dd-a4eb-a6f296b81094`, principal ID `ace6a746-1953-483b-b4e0-d4429753d6b6`. The visible subscription attaches it only to QA. It has ten enumerated grants: registry `AcrPull`, `Storage Blob Data Contributor` on `qa-course-banners`, and eight exact secret-scope `Key Vault Secrets User` assignments. There is no observed whole-vault QA grant. Remove assignment objects only; their shared scopes remain.

| Grant scope suffix | Assignment UUID |
| --- | --- |
| Registry `filosagestp4ujucgnxq3gsacr` | `e663dbe1-1ef5-5829-bf83-217e0caaee2c` |
| Container `qa-course-banners` | `07de23d2-73c8-53b1-8537-0686359841e8` |
| Secret `activity-receipt-secret-qa` | `717ab5b9-4d21-5880-8a32-4580ad1f5ed1` |
| Secret `database-url-qa-runtime-v2` | `bcd65c93-f179-586d-bb83-baea501cda98` |
| Secret `external-id-client-secret-qa` | `699dd219-a3d5-5d2f-84fc-a9c46d8d250a` |
| Secret `google-easy-auth-client-secret` | `d45a2a45-70fc-524e-8625-0d47b016c9e1` |
| Secret `identity-link-hmac-secret-qa` | `2067861d-dee4-57cd-87cd-0230b69e10b8` |
| Secret `migrated-owner-uid` | `ef23077c-a508-508a-91cf-0f82fe4aa91f` |
| Secret `openai-api-key` | `264a42cc-8512-58a4-aa14-9cd7a851f197` |
| Secret `stripe-qa-api-key` | `b040221e-bd5e-5de9-967b-f09ddc825db1` |

`google-easy-auth-client-secret`, `openai-api-key` and `migrated-owner-uid` are referenced by both apps: retain the secrets and every production grant. QA-specific receipt/HMAC/runtime/External ID secret references are absent from production's app metadata, but external consumers and recovery requirements must be resolved before deleting them. Version URLs, including old QA owner-secret versions, were obtained through metadata-only secret listing. No `secret show`, app `listSecrets`, key retrieval or access token extraction was used.

QA's `stripe-qa-webhook-secret` is an app-local secret reference with no Key Vault URL; its value was not requested. App deletion removes that reference. The referenced standard Stripe TEST API credential must not be revoked merely because its vault name says QA; confirm all TEST consumers first.

| Integration | Exact observed identifier and disposition |
| --- | --- |
| Google OAuth | Shared client `557534798515-f1419k6iqqb0ptk6b1a4f8qs20uqd1hv.apps.googleusercontent.com`; preserve client and production callbacks. Read exact QA callback/origin registry entries before removing any |
| QA External ID | Tenant `69d76567-5377-4393-bfe5-47565b8df5dd`, `filosagecustomers`; client `4cfac47a-8324-43e1-aea9-2f2da51e5645`; app object ID, service principal/flow consumers and callback registry not retrieved; preserve tenant and block app deletion |
| Production External ID | Tenant `4964ba2f-fc79-4933-b272-0bb3671a841a`, `filosagecustomersprod`; client `d544f3da-63cb-49d4-9021-47444063865e`; preserve |
| Stripe TEST webhook | Account `acct_1TtgXPRANh4Mnfma`, `livemode=false`; `we_1UENu8RANh4Mnfmav0d4Pf8k`, enabled, `https://qa.filosage.com/api/billing/webhook`; exact 15 event types preserved in evidence |
| Stripe TEST Portal | `bpc_1UENu8RANh4Mnfmafj0zDVuU`, active, non-default; QA pricing return URL and QA Terms/Privacy links; candidate for deactivation after preservation. Preserve default Portal, unrelated endpoints/products/prices, processor history and all LIVE configuration |
| GitHub QA variables | Only `AZURE_QA_CONTAINER_APP_NAME=filosageqa-app` and `AZURE_QA_URL=https://qa.filosage.com` in shared `azure-staging` environment; no repo-level vars or secrets; no `azure-qa` environment |
| GitHub deployment principal | App ID `8156a54e-d644-4792-9b8e-65444e004dc8`, object ID `c90eb4a8-aa20-4872-9fb4-9ed528911898`, SP `6a25b4c2-f60a-4995-82ae-d2ea64786577`; preserve shared app and federation `74a21f13-cb0b-48d6-9f56-674979544b13` for `azure-staging` |
| Exclusive deploy grant | `Container Apps Contributor` at QA app only, assignment `cdb56bcd-884d-4b49-b606-71d474bcd931`; remove only this grant, preserving deployer's four other production/shared grants |

Current `.github` and `infra` search finds no `AZURE_QA`, `qa.filosage`, `filosageqa` or `qa-course-banners` consumer. Do not remove shared GitHub environment or `AZURE_CLIENT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID` secret references.

Four exact metric alert resources are QA-exclusive: `filosage-qa-http-5xx`, `filosage-qa-high-cpu`, `filosage-qa-high-memory`, `filosage-qa-restarts`. Their action group is shared and remains. Shared log rules `filosage-console-fatal-errors` and `filosage-platform-failures` both select `ContainerAppName_s in ("filosagestg-app", "filosageqa-app")`; after retirement, change only that selector to retain production. Preserve all other predicates, scopes, action groups and retained logs.

## Database and content disposition

The reviewed probe confirms exact QA DB/role/read-only identity and no runtime database/schema CREATE. `filosageqa_runtime` OID `25364` is a login with no elevated flags; production CONNECT is false. It has one shared ACL dependency and two QA ACL dependencies, no observed ownership dependencies. At the read, it had two sessions including the probe itself; one other runtime session remained. `filosageqa_app` had zero sessions, but is still the shared production/QA database owner. Membership rows reference member OID `24610`, two owner-role grants with different admin-option flags, and one runtime-role grant; preserve until exact post-drain dependency review. No role membership cleanup was executed.

QA DB size is 10,427,415 bytes; `public.filosage_documents` OID `25043`, owner OID `25351`, total relation size 2,293,760 bytes. Document timestamps span August 13 through September 12. Production DB size was deliberately not queried because the runtime lacks production access.

| Aggregate | Observed |
| --- | --- |
| All documents | 506 |
| Courses / public courses / lessons / immutable course releases | 4 / 1 / 34 / 1 |
| User documents / course progress / mastery evidence | 2 / 3 / 9 |
| Documents in retained-policy categories | 26: account lifecycle 1; command-center approvals 2, audit events 12, ticket requests 2, tickets 2; identity email owners 2 and links 2; legal acceptances 3 |
| Banner asset/key documents | 10 / 10 |
| Stripe event documents | 1; historical sanitized transport record exists, raw event was not read |
| Documents with selected account / course relation fields | 186 / 222 |
| Documents with selected billing-customer/subscription fields | 0; this is not proof of absent processor subscriptions or obligations |
| Account-deletion-job documents | 0 |
| Unclassified documents | 8; raw collection names intentionally suppressed |

The source [account-data policy](../../src/lib/account-data-policy.ts) records `owner_privacy_review_pending`, with approved durations and holds unset. This is a pending application policy decision, **not evidence that an actual legal hold exists**. Do not invent a retention duration. Preserve the 26 relevant records privately while their required disposition is determined, and classify the eight remaining records through a reviewed expanded fixed allowlist. A zero count for a selected field or pending job does not determine erasure eligibility.

Before deletion, a designated operator should privately identify which authored courses/lessons, progress and banner assets must survive. Use reviewed aggregate joins or ephemeral comparisons to show that cross-environment account/course/banner references are understood without logging identifiers or bodies. Transfer only approved content through the product's ownership/publication rules; copying the entire QA document store into production would not prove compatible identity, publication or accounting semantics.

If content must be preserved outside the site, create an encrypted, access-controlled QA-only logical export and Blob archive under an approved retention/disposition record. Keep checksums, aggregate counts, recovery location/access owner and an isolated restore comparison in evidence; never store the export in Git or ordinary tool logs. This worker created no archive, copied no private content and performed no restore. The data and the recovery credentials remain intact.

## Recovery and holds

| Resource | Fresh readback | Consequence |
| --- | --- | --- |
| Shared PG16 server | Private network only, Ready; seven-day backup retention, earliest restore `2026-09-06T00:07:39.641251+00:00`, geo redundancy disabled | Preserve server and its backups. This is configured recovery, not a current restore proof or permanent QA archive |
| Shared Blob service | Blob and container soft delete enabled, seven days each; versioning enabled; no restore policy/change feed returned | Retain settings and any soft-deleted data; no permanent purge or recreation of retired container name during recovery |
| QA Blob container | Private; container `hasLegalHold=false`, `hasImmutabilityPolicy=false`; ten entries, 628,248 bytes, modified August 14 | All pages inspected via metadata-only Blob listing; no deleted, snapshot or version entries returned. Blob legal-hold fields null and all ten immutability descriptors have null expiry/mode: no active Blob policy was returned |
| Blob lifecycle policy | `ManagementPolicyNotFound` | No lifecycle deletion rule was observed; do not create one as cleanup |
| Shared Key Vault | Soft delete and purge protection enabled; 30-day retention | Normal recoverable deletion only when exclusivity/recovery is proved; preserve shared and owner-recovery secrets; no purge |
| Shared Log Analytics | 30-day retention | Preserve existing recovery/security evidence in place and retain sanitized release artifacts; no raw-log export requested |
| Resource-group locks | None returned | Absence of locks does not replace data/consumer/acceptance gates |

Azure documents that container soft delete can restore a deleted container and contents during its configured period; the original name must remain available. That finite window is not durable archival retention. [Microsoft container recovery guidance](https://learn.microsoft.com/en-us/azure/storage/blobs/soft-delete-container-overview). PostgreSQL's `pg_shdepend` is shared across the cluster and records role ownership/ACL dependencies, supporting the shared-owner finding. [PostgreSQL 16 dependency catalog](https://www.postgresql.org/docs/16/catalog-pg-shdepend.html). Azure PostgreSQL managed backup files cannot be exported; logical export is a separate mechanism. [Microsoft backup and restore guidance](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore).

## Dependency order and exact execution blockers

The manifest expands every known Azure target to a full resource/assignment ID and names exact provider locators. It contains no wildcard deletion and makes no claim of execution authorization beyond the coordinator's approved release gates.

1. Accept the exact production release, compatible predecessor and observation evidence. Privately preserve required QA content/history and resolve disposition. Keep the predecessor through retirement.
2. Disable exact QA TEST webhook/Portal integration, remove only verified QA auth callback/origin entries, and remove the exact QA DNS CNAME. Allow the previous TTL to expire and verify authoritative/public absence; missing provider access blocks this step.
3. Unbind QA custom domain, stop/drain QA compute and verify no in-flight writes/sessions. Delete exact QA app and dedicated certificate. Remove ownership TXT only after CNAME absence and domain unbind.
4. Remove two unused GitHub QA variables, four dedicated QA alerts, the QA selector in two shared log rules, ten exact QA MI grants and the shared deployer's single QA app grant. Keep shared providers and grants.
5. Only after preservation and zero-writer proof, remove exact QA database and QA Blob container through normal recoverable mechanisms. Re-read server dependencies before removing only non-owner `filosageqa_runtime`. **Shared owner `filosageqa_app` remains.**
6. Retire only proven exclusive secret names and the QA MI after fresh zero-consumer/grant proof. Preserve the shared owner/password recovery references, Google client, customer tenants, all shared backing services and recovery settings.
7. Re-read exact resource absence or documented soft-deleted/retained state, provider callback/endpoint/configuration absence, DNS and operational selectors; recheck production health/routing/auth/SHA/digest and signed-in learner access. An unresolved retained object must be reported as retained, not retired.

Current blockers are concrete: production acceptance is not yet supplied; required private content/recovery preservation is not performed; eight document classes and cross-environment asset/account references are unreviewed; application retention/disposition remains undecided; authoritative DNS management and exact customer-tenant/Google callback registry consumers are unavailable. Whole QA-named owner-role deletion is disallowed because a production dependency is proved. These blockers do not imply a need to repeat Victor's general release authorization.

## Verification and handoff

The coordinator independently reviewed the new [Python transport adapter](../../scripts/qa-retirement-readonly.py) and [remote SQL probe](../../scripts/qa-retirement-readonly.cjs) before execution. The imported earlier transport's SHA-256 is pinned; its bootstrap entrypoint is guarded by `if __name__ == '__main__'` and was not invoked. Expected document timestamp/schema fields were checked against the committed runtime verifier. Echo-off/readiness, encoded-source integrity, exact app/revision/digest, server/database/login/SHA, read-only transaction and closed result validation all passed in the single live run.

Six [offline containment tests](../../scripts/qa-retirement-readonly.test.py) cover accepted aggregate output and rejection of extra private fields, unknown category labels, writable transactions, raw error text and mismatched totals. Python compilation, Node syntax and whitespace checks passed. No app code, dependencies or Next.js behavior changed. The adapter uses the preserved local transport path and intentionally fails closed if that file is missing or changes; review is required before reuse on another machine or revision.

All owned local inventory/probe processes exited; no watcher or background job remains. No provider mutation, private export, secret retrieval, push, merge, deployment, production acceptance or QA retirement occurred. The coordinator owns final review, integration and any subsequent authorized execution.
