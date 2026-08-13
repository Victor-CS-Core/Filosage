# Azure-native migration runbook

Status: Azure is the active host for `filosage.com` and `www.filosage.com`. Central US infrastructure, immutable blue/green deployment, authored-course import, content-fidelity verification, PostgreSQL point-in-time restore rehearsal, managed TLS, DNS cutover, and retirement of the former Sites host are complete. Azure Easy Auth with Google replaced the rejected customer-directory flow; live Google sign-in returned the verified owner to the Filosage dashboard and exposed the owner-only Command Center.

## Approved decisions

- Target: Azure Container Apps with built-in Google authentication (Easy Auth), Azure Database for PostgreSQL Flexible Server, Azure Blob Storage, Key Vault, Container Registry, Log Analytics, and Azure Monitor.
- Account sign-in email: `viticopq12@gmail.com`. Passwords, MFA challenges, recovery codes, and security keys remain owner-only.
- Data boundary: preserve only courses authored by the resolved owner, their lessons, and referenced banner assets. Do not migrate test learners, progress, analytics, waitlists, reports, billing state, or other disposable pre-release data.
- Billing remains disabled. The pre-release staging footprint uses scale-to-zero Container Apps, PostgreSQL `Standard_B1ms`, ACR Basic, LRS storage, 30-day logs, seven-day database backups, and no high availability.
- The Git checkpoint before migration is `c8ffa8721e3e742b40fcf81cef01bb61898e1b46` on `origin/main`. Migration work lives on `agent/azure-native-migration`.

## Architecture rationale

PostgreSQL is the compatibility target because the current application relies on multi-document transactions, collection-group reads, cascades, and document-shaped JSON. A JSONB document table preserves the application contract for the initial move while allowing later relational normalization. Cosmos DB transactional batches are limited to one logical partition, which does not cover all existing workflows without a larger redesign.

Container Apps provides a revisioned HTTPS runtime that can scale to zero for an unreleased staging app. Its built-in authentication sidecar manages Google OAuth, the session cookie, and trusted identity headers before requests reach Next.js. Blob Storage holds private generated banners. Runtime secrets are referenced through Key Vault using a managed identity.

Staging uses two labeled Container Apps revisions. `blue` is the stable baseline that receives the default staging hostname traffic; `green` is the zero-traffic QA candidate. Each label has its own HTTPS hostname and both can scale to zero. The staging workflow refuses to replace a label carrying live traffic, deploys only to the selected inactive label, and verifies that label's exact Git SHA. Promotion is a separate traffic decision after QA.

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

## Gate 3: staging infrastructure

The staging resource group is `filosage-staging-central-rg`. Foundation deployment `filosage-foundation-retry-20260812193319` succeeded and bootstrap deployment `filosage-app-bootstrap` assigned `https://filosagestg-app.salmontree-eb10220f.centralus.azurecontainerapps.io`. Azure rejected ACR Tasks for this subscription, so the staging workflow builds on the hosted GitHub runner and pushes to ACR using short-lived OIDC with `AcrPush` and `Container Apps Contributor` scoped only to the target registry and app. Never place parameter secrets in a committed parameter file or command history.

The PostgreSQL template enables private networking, seven-day automated backup retention, and no high availability for the inexpensive pre-release staging environment. Burstable Flexible Server does not support on-demand backups. Production requires a renewed cost/reliability decision.

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

The Azure importer is create-only: it fails if any target document or blob already exists. Import only after the PostgreSQL schema migration has completed and the operator has verified the target connection. The verified source bundle contains 9 owner-authored courses, 106 lessons, 9 referenced banners, 133 allowlisted documents total, and no user/progress/analytics paths. The independent Azure verification job `filosagestg-course-verify` compares every canonical PostgreSQL JSON value plus every Blob byte and MIME type against the private source bundle. Its current post-cutover execution `filosagestg-course-verify-puq5mxu` succeeded on 2026-08-13 with exactly 133 documents (9 courses and 106 lessons), 9 banners, no unexpected migrated records, and content fingerprint `588c4e2334c555ea0078de9e3cb1dd93e6d5df91dab626513f4233b5bf938757`. The legacy Firebase data was not deleted.

The initial export omitted the immutable `courseReleases` referenced by eight published roots. Preserve the 133-document source bundle, run `migrate:azure:complete-courses` to produce a separate private schema-v2 bundle, and import it with `--apply --missing-only`. Completion derives release records only from the verified published roots and lessons, writes the private output create-only, refuses conflicting Azure data, and restores the immutable runtime contract without changing the source documents.

## Gate 6: staging acceptance

- Deploy an immutable image tagged with the full Git SHA.
- Verify `/api/health` reports that exact SHA.
- Run the focused and full browser suites against staging.
- Test owner course read/edit/generation, lesson read/edit, banner retrieval, publish/unpublish, privacy export/deletion, admin access, rate limiting, alerts, and scale-from-zero behavior.
- Verify PostgreSQL automated backup recovery-window evidence.
- Perform point-in-time restore into a separate recovery server, verify representative preserved course/lesson/banner records, then obtain separate approval before deleting the recovery server.

Restore evidence: on 2026-08-12, Azure restored the 2026-08-13T01:28:00Z point into a separate private `Standard_B1ms` server attached to the staging PostgreSQL subnet and private DNS zone. The content verifier reproduced fingerprint `588c4e2334c555ea0078de9e3cb1dd93e6d5df91dab626513f4233b5bf938757` from that recovery database. The temporary server was then removed, the verifier was returned to the primary hostname, and the original server remained `Ready` with seven-day retention.
- Keep `BILLING_ENABLED=false`.

## Gate 7: domain cutover

Completed on 2026-08-13:

1. Azure managed certificates were issued and SNI-bound for `filosage.com` and `www.filosage.com`.
2. Both origins are bound to the same Container App; the dedicated Google OAuth client must retain each host's Easy Auth callback URI.
3. GoDaddy apex web records were replaced with `4.249.188.219`, and `www` now aliases `filosagestg-app.salmontree-eb10220f.centralus.azurecontainerapps.io`. Existing MX, SPF, DKIM, DMARC, Apple verification, and other non-web records were preserved.
4. GitHub Actions run `31662271485` deployed commit `023aefa5c7d67c627e3d8bf6a53a8eea933ac93a` to green and proved its SHA, datastore health, and `https://filosage.com` canonical origin before promotion. Run `31662814607` promoted green to 100% traffic.
5. Public health succeeded through the apex. `www` returned a permanent HTTPS redirect to the matching apex path with CSP and HSTS retained.
6. Both custom domains were detached from Sites, its generated URL was changed from public to a custom allowlist containing only `viticopq12@gmail.com`, and the obsolete Sites build/deployment configuration was removed from the repository.

Keep the Azure blue slot as the zero-traffic rollback candidate. A rollback promotes an already verified exact-SHA slot; it does not restore the retired Sites DNS records or delete either data source.
