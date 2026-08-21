# Azure-native migration runbook

Status: Azure is the active host for `filosage.com` and `www.filosage.com`. Production uses immutable blue/green revisions. Permanent QA uses the separate scale-to-zero `filosageqa-app` at `qa.filosage.com`, an isolated `filosageqa` database, and the private `qa-course-banners` container. Azure Easy Auth with Google is the only application sign-in provider in both environments. The former Sites host is retired.

## Approved decisions

- Target: Azure Container Apps with built-in Google authentication (Easy Auth), Azure Database for PostgreSQL Flexible Server, Azure Blob Storage, Key Vault, Container Registry, Log Analytics, and Azure Monitor.
- Account sign-in email: `viticopq12@gmail.com`. Passwords, MFA challenges, recovery codes, and security keys remain owner-only.
- Data boundary: preserve only courses authored by the resolved owner, their lessons, and referenced banner assets. Do not migrate test learners, progress, analytics, waitlists, reports, billing state, or other disposable pre-release data.
- Billing remains disabled. QA scales to zero with at most one 0.5 CPU / 1 GiB replica and reuses the production server, registry, vault, storage account, and Container Apps environment. Its database, blob container, application identity, receipt-signing secret, and app runtime are isolated from production.
- `origin/main` is the deployable source of truth. Every environment reports the full Git SHA through `/api/health`; abbreviated SHAs are never accepted for release decisions.

## Architecture rationale

PostgreSQL is the compatibility target because the current application relies on multi-document transactions, collection-group reads, cascades, and document-shaped JSON. A JSONB document table preserves the application contract for the initial move while allowing later relational normalization. Cosmos DB transactional batches are limited to one logical partition, which does not cover all existing workflows without a larger redesign.

Container Apps provides a revisioned HTTPS runtime that can scale to zero for an unreleased staging app. Its built-in authentication sidecar manages Google OAuth, the session cookie, and trusted identity headers before requests reach Next.js. Blob Storage holds private generated banners. Runtime secrets are referenced through Key Vault using a managed identity.

Production uses two labeled Container Apps revisions. One label receives 100% of `filosage.com` traffic and the other remains at 0% as the rollback candidate. Permanent QA is a different Container App and never shares production traffic or production data. The production-staging workflow refuses to replace a label carrying live traffic and accepts only the immutable ACR digest for a full Git SHA already proven healthy on `qa.filosage.com`. Promotion remains a separate traffic decision after QA approval.

## Environment contract

| Concern | Permanent QA | Production |
| --- | --- | --- |
| Origin | `https://qa.filosage.com` | `https://filosage.com` |
| Container App | `filosageqa-app` | `filosagestg-app` |
| Data | PostgreSQL database `filosageqa` | PostgreSQL database `filosage` |
| Banners | private container `qa-course-banners` | private container `course-banners` |
| Scaling | 0-1 replicas | blue/green revisions; active traffic plus rollback |
| Owner | Azure customer account `ktr0nn@icloud.com` | Verified Google account `viticopq12@gmail.com` |
| Search indexing | `robots.txt` disallow plus `X-Robots-Tag: noindex` | public indexing rules |
| Billing | disabled | disabled until an explicit owner launch decision |

Both environments keep billing disabled. QA owner access is the verified Azure customer-account email `ktr0nn@icloud.com`. Production owner access remains the verified Google account `viticopq12@gmail.com`. QA shares the Google OAuth client and OpenAI Key Vault secret, but its OAuth callback, datastore, storage container, managed identity, database role, and activity-receipt secret are separately scoped.

## Gate 1: local implementation

Required before provisioning:

1. `npm.cmd run lint`
2. `npx.cmd tsc --noEmit --incremental false`
3. `npm.cmd run build`
4. Focused identity, privacy deletion, course lifecycle, storage, transaction, and production-health tests.
5. `npm.cmd audit --omit=dev` must report no production vulnerability. Development-only findings must be recorded separately.
6. Compile `infra/azure/main.bicep` with current Azure tooling and build/run the Docker image. These cannot be claimed locally when Azure CLI and Docker are absent.

## Gate 2: account and cost review

The owner completes Azure portal password/MFA. Then inspect, without creating resources:

- tenant and subscription names/IDs;
- available regions and Container Apps authentication support;
- forecast for Container Apps, PostgreSQL `Standard_B1ms` with 32 GiB storage, ACR Basic, Blob Storage, Key Vault, and Log Analytics;
- budget and alert configuration.

The selected subscription is `Azure subscription 1` and the selected region is Central US. East US rejected PostgreSQL 16 for this subscription offer, so the failed empty foundation was removed before the Central US retry. The `filosage-monthly` budget is configured at $30 per month with an 80% actual-spend alert and a 100% forecast alert sent to `viticopq12@gmail.com`.

## Gate 3: Azure infrastructure

The resource group is `filosage-staging-central-rg`; its historical name is retained to avoid a disruptive rename. Production is `filosagestg-app`. QA is defined by `infra/azure/qa.bicep`. Azure rejected ACR Tasks for this subscription, so GitHub Actions builds on a hosted runner and pushes to ACR using short-lived OIDC. `AcrPush` is scoped to the registry and `Container Apps Contributor` is assigned separately to the production and QA app resources. Pass the GitHub OIDC service-principal object ID as `deploymentPrincipalId` when provisioning QA so this least-privilege assignment remains reproducible. The existing QA assignment was bootstrapped as `cdb56bcd-884d-4b49-b606-71d474bcd931`; pass that value as `deploymentRoleAssignmentName` when reconciling this environment, while a fresh environment may omit it. Never place parameter secrets in a committed parameter file or command history.

The PostgreSQL template enables private networking, seven-day automated backup retention, least-privilege `filosage_app` and `filosageqa_app` logins, and no high availability for the inexpensive pre-release environment. Isolated QA never receives the server administrator password. Burstable Flexible Server does not support on-demand backups. Production requires a renewed cost/reliability decision.

## Gate 4: identity

Create a dedicated Google Web OAuth client for Azure Container Apps. Register the apex, `www`, base Container Apps, and blue/green label origins, with `/.auth/login/google/callback` appended to every authorized redirect URI. Store the client secret only as an Azure Container App secret backed by Key Vault.

Enable the Container Apps auth platform with Google as the sole provider, HTTPS required, token storage disabled, and `AllowAnonymous` so public learning remains available without adding a token-storage account. The application starts sign-in at `/.auth/login/google`, reads the Azure-injected principal through its same-origin `/api/auth/session` endpoint, and signs out at `/.auth/logout`. Protected routes accept only the Google principal injected by the auth sidecar. `OWNER_EMAIL=viticopq12@gmail.com` remains the exact server-side owner boundary.

The migrated course documents intentionally retain their legacy Firebase author UID so their canonical migration fingerprint remains stable. Store that UID as the Key Vault-backed `MIGRATED_OWNER_UID` setting. Only the exact verified owner account may resolve this alias; other Google accounts remain restricted to their own author UID.

Verify owner sign-in, learner sign-in, sign-out, canceled sign-in, expired session, spoofed-header rejection, and non-owner authorization. Account deletion remains fail-closed until live Google claims prove that Azure supplies a recent `auth_time`; do not substitute token issue time or a browser-only marker for that proof.

## Gate 5: authored-course migration

Export refuses an unresolved owner or missing object-backed banner:

```powershell
npm.cmd run migrate:azure:export-courses -- --source-url=https://CURRENT_HOST
```

The bundle is written under `migration-private/`, which is gitignored and must not be shared. Review the reported course, lesson, and banner counts. The importer is a dry run unless `--apply` is present:

```powershell
npm.cmd run migrate:azure:import-courses
npm.cmd run migrate:azure:import-courses -- --apply
```

The Azure importer is create-only: it fails if any target document or blob already exists. Import only after the PostgreSQL schema migration has completed and the operator has verified the target connection. The verified source bundle contains 9 owner-authored courses, 106 lessons, 9 referenced banners, 133 allowlisted documents total, and no user/progress/analytics paths. The legacy Firebase data was not deleted.

The initial export omitted the immutable `courseReleases` referenced by eight published roots. The preserved 133-document source bundle was completed into a separate private schema-v2 bundle. Completion deterministically derived 8 release roots and 100 released lessons only from the verified published source documents, wrote the private output create-only, and left every source record unchanged. Azure execution `filosagestg-course-verify-pkw9pp1` inserted exactly those 108 missing release documents after confirming all 133 existing records matched. Independent execution `filosagestg-course-verify-19doyvc` then verified all 241 PostgreSQL documents plus all 9 Blob bytes and MIME types, found no unexpected records, and produced content fingerprint `ac8660234fb84eeadb5ea7d04f1fc8310c6d14863b34b46858f9c1414a6afaaf`.

## Gate 6: QA acceptance and production release

- Deploy an immutable image tagged with the full Git SHA.
- Verify `/api/health` reports that exact SHA.
- Run the focused and full browser suites against staging.
- Test owner course read/edit/generation, lesson read/edit, banner retrieval, publish/unpublish, privacy export/deletion, admin access, rate limiting, alerts, and scale-from-zero behavior.
- Verify PostgreSQL automated backup recovery-window evidence.
- Perform point-in-time restore into a separate recovery server, verify representative preserved course/lesson/banner records, then obtain separate approval before deleting the recovery server.

Restore evidence: on 2026-08-12, Azure restored the 2026-08-13T01:28:00Z point into a separate private `Standard_B1ms` server attached to the staging PostgreSQL subnet and private DNS zone. The content verifier reproduced fingerprint `588c4e2334c555ea0078de9e3cb1dd93e6d5df91dab626513f4233b5bf938757` from that recovery database. The temporary server was then removed, the verifier was returned to the primary hostname, and the original server remained `Ready` with seven-day retention.
- Keep `BILLING_ENABLED=false`.

### Repeatable deployment pipeline

1. Commit the intended change, validate it locally, and push the exact full SHA to `origin/main`.
2. Run **Deploy isolated Azure QA** (`.github/workflows/azure-qa.yml`). It validates, builds, and pushes `filosage:<full-sha>`, updates only `filosageqa-app`, and proves the SHA and canonical QA origin.
3. Perform signed-in QA at `https://qa.filosage.com`. Confirm the QA banner is visible and test data does not appear on production.
4. Run **Stage QA-approved image for production** (`.github/workflows/azure-staging.yml`) with the same `expected_sha` and the currently inactive `target_slot`. It refuses a SHA that is not healthy on QA, resolves the ACR digest, updates only the 0% production slot, and verifies the slot before any traffic change.
5. Run **Promote Azure staging slot** (`.github/workflows/azure-promote-staging.yml`) with that exact SHA and slot only after acceptance. The promoted slot becomes 100%; the former live slot remains at 0% for rollback.

Required GitHub environment `azure-staging` variables are `AZURE_ACR_NAME`, `AZURE_RESOURCE_GROUP`, `AZURE_CONTAINER_APP_NAME`, `AZURE_STAGING_URL`, `AZURE_BLUE_URL`, `AZURE_GREEN_URL`, `AZURE_QA_CONTAINER_APP_NAME`, and `AZURE_QA_URL`. OIDC credentials remain encrypted environment secrets. Any agent can run the workflows, but no agent should copy or expose those secrets.

## Gate 7: domain cutover

Completed on 2026-08-13:

1. Azure managed certificates were issued and SNI-bound for `filosage.com` and `www.filosage.com`.
2. Both origins are bound to the same Container App; the dedicated Google OAuth client must retain each host's Easy Auth callback URI.
3. GoDaddy apex web records were replaced with `4.249.188.219`, and `www` now aliases `filosagestg-app.salmontree-eb10220f.centralus.azurecontainerapps.io`. Existing MX, SPF, DKIM, DMARC, Apple verification, and other non-web records were preserved.
4. GitHub Actions run `31662271485` deployed commit `023aefa5c7d67c627e3d8bf6a53a8eea933ac93a` to green and proved its SHA, datastore health, and `https://filosage.com` canonical origin before promotion. Run `31662814607` promoted green to 100% traffic.
5. Public health succeeded through the apex. `www` returned a permanent HTTPS redirect to the matching apex path with CSP and HSTS retained.
6. Both custom domains were detached from Sites, its generated URL was changed from public to a custom allowlist containing only `viticopq12@gmail.com`, and the obsolete Sites build/deployment configuration was removed from the repository.
7. GitHub Actions run `31675453639` deployed commit `c97bcfe12e94d39fda07795b2a3f1f9eb5901557` to green after the completed data migration. Signed-in QA proved 8 public courses, 1 owner draft, 8 owner-published courses, creator controls, a released lesson, Command Center owner access, and decoded Google profile images. Run `31676274203` promoted that exact green revision to 100% traffic; blue remains the zero-traffic rollback slot.

Keep the Azure blue slot as the zero-traffic rollback candidate. A rollback promotes an already verified exact-SHA slot; it does not restore the retired Sites DNS records or delete either data source.
