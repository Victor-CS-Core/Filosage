# Azure-native migration runbook

Status: Azure is the active host for `filosage.com` and `www.filosage.com`. Central US infrastructure, External ID/Google federation, immutable blue/green deployment, authored-course import, content-fidelity verification, PostgreSQL point-in-time restore rehearsal, managed TLS, DNS cutover, and retirement of the former Sites host are complete. Owner Google sign-in acceptance is still pending.

## Approved decisions

- Target: Azure Container Apps, Azure Database for PostgreSQL Flexible Server, Microsoft Entra External ID, Azure Blob Storage, Key Vault, Container Registry, Log Analytics, and Azure Monitor.
- Account sign-in email: `viticopq12@gmail.com`. Passwords, MFA challenges, recovery codes, and security keys remain owner-only.
- Data boundary: preserve only courses authored by the resolved owner, their lessons, and referenced banner assets. Do not migrate test learners, progress, analytics, waitlists, reports, billing state, or other disposable pre-release data.
- Billing remains disabled. The pre-release staging footprint uses scale-to-zero Container Apps, PostgreSQL `Standard_B1ms`, ACR Basic, LRS storage, 30-day logs, seven-day database backups, and no high availability.
- The Git checkpoint before migration is `c8ffa8721e3e742b40fcf81cef01bb61898e1b46` on `origin/main`. Migration work lives on `agent/azure-native-migration`.

## Architecture rationale

PostgreSQL is the compatibility target because the current application relies on multi-document transactions, collection-group reads, cascades, and document-shaped JSON. A JSONB document table preserves the application contract for the initial move while allowing later relational normalization. Cosmos DB transactional batches are limited to one logical partition, which does not cover all existing workflows without a larger redesign.

Container Apps provides a revisioned HTTPS runtime that can scale to zero for an unreleased staging app. Blob Storage holds private generated banners. Entra External ID owns customer authentication and can federate Google. Runtime secrets are referenced through Key Vault using a managed identity.

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
- available regions and Entra External ID tenant status;
- forecast for Container Apps, PostgreSQL `Standard_B1ms` with 32 GiB storage, ACR Basic, Blob Storage, Key Vault, and Log Analytics;
- budget and alert configuration.

The selected subscription is `Azure subscription 1` and the selected region is Central US. East US rejected PostgreSQL 16 for this subscription offer, so the failed empty foundation was removed before the Central US retry. The `filosage-monthly` budget is configured at $30 per month with an 80% actual-spend alert and a 100% forecast alert sent to `viticopq12@gmail.com`.

## Gate 3: staging infrastructure

The staging resource group is `filosage-staging-central-rg`. Foundation deployment `filosage-foundation-retry-20260812193319` succeeded and bootstrap deployment `filosage-app-bootstrap` assigned `https://filosagestg-app.salmontree-eb10220f.centralus.azurecontainerapps.io`. Azure rejected ACR Tasks for this subscription, so the staging workflow builds on the hosted GitHub runner and pushes to ACR using short-lived OIDC with `AcrPush` and `Container Apps Contributor` scoped only to the target registry and app. Never place parameter secrets in a committed parameter file or command history.

The PostgreSQL template enables private networking, seven-day automated backup retention, and no high availability for the inexpensive pre-release staging environment. Burstable Flexible Server does not support on-demand backups. Production requires a renewed cost/reliability decision.

## Gate 4: identity

Create or select an Entra External ID external tenant and configure:

- SPA redirect/logout URI for the Container Apps staging URL;
- an exposed delegated API scope;
- Google as an external identity provider;
- token issuer, audience, and JWKS values;
- a separate confidential Graph application only if automatic identity deletion is approved, with the narrow required application permission and admin consent.

The external tenant is `filosagecustomers.onmicrosoft.com`. `Filosage Web` exposes `access_as_user`, requests the email claim in access and ID tokens, is attached to the `Filosage Customers` sign-up/sign-in flow, and has localhost, the base/blue/green Container Apps origins, `https://filosage.com`, and `https://www.filosage.com` registered as SPA redirects. Google is configured as a federated provider and the application passes `domain_hint=google` so Google remains the primary sign-in path. Email/password remains a recovery method. `OWNER_EMAIL=viticopq12@gmail.com` is the server-side owner boundary and still requires a verified token email match.

The Google OAuth client used by External ID must retain the complete Microsoft callback set below. On 2026-08-12, a live Google sign-in exposed `redirect_uri_mismatch` because the client contained only one CIAM callback. These exact callbacks were added to the existing `Filosage Entra External ID` client and re-read from Google Cloud after saving:

- `https://login.microsoftonline.com`
- `https://login.microsoftonline.com/te/69d76567-5377-4393-bfe5-47565b8df5dd/oauth2/authresp`
- `https://login.microsoftonline.com/te/filosagecustomers.onmicrosoft.com/oauth2/authresp`
- `https://69d76567-5377-4393-bfe5-47565b8df5dd.ciamlogin.com/69d76567-5377-4393-bfe5-47565b8df5dd/federation/oidc/accounts.google.com`
- `https://69d76567-5377-4393-bfe5-47565b8df5dd.ciamlogin.com/filosagecustomers.onmicrosoft.com/federation/oidc/accounts.google.com`
- `https://filosagecustomers.ciamlogin.com/69d76567-5377-4393-bfe5-47565b8df5dd/federation/oauth2`
- `https://filosagecustomers.ciamlogin.com/filosagecustomers.onmicrosoft.com/federation/oauth2`

Verify owner sign-in, learner sign-in, sign-out, token refresh, canceled popup, blocked popup, recent-authentication deletion, wrong issuer, wrong audience, expired token, and non-owner authorization.

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

The Azure importer is create-only: it fails if any target document or blob already exists. Import only after the PostgreSQL schema migration has completed and the operator has verified the target connection. The verified source bundle contains 9 owner-authored courses, 106 lessons, 9 referenced banners, 133 allowlisted documents total, and no user/progress/analytics paths. The independent Azure verification job `filosagestg-course-verify` was rerun after cutover preparation on 2026-08-13 and compared every canonical PostgreSQL JSON value plus every Blob byte and MIME type against the private source bundle. Execution `filosagestg-course-verify-2z2jqjf` succeeded with exactly 133 documents (9 courses and 106 lessons), 9 banners, no unexpected migrated records, and content fingerprint `588c4e2334c555ea0078de9e3cb1dd93e6d5df91dab626513f4233b5bf938757`. The legacy Firebase data was not deleted.

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
2. Both origins were registered as Entra SPA redirects; the Microsoft-owned Google federation callbacks were preserved unchanged.
3. GoDaddy apex web records were replaced with `4.249.188.219`, and `www` now aliases `filosagestg-app.salmontree-eb10220f.centralus.azurecontainerapps.io`. Existing MX, SPF, DKIM, DMARC, Apple verification, and other non-web records were preserved.
4. GitHub Actions run `31662271485` deployed commit `023aefa5c7d67c627e3d8bf6a53a8eea933ac93a` to green and proved its SHA, datastore health, and `https://filosage.com` canonical origin before promotion. Run `31662814607` promoted green to 100% traffic.
5. Public health succeeded through the apex. `www` returned a permanent HTTPS redirect to the matching apex path with CSP and HSTS retained.
6. Both custom domains were detached from Sites, its generated URL was changed from public to a custom allowlist containing only `viticopq12@gmail.com`, and the obsolete Sites build/deployment configuration was removed from the repository.

Keep the Azure blue slot as the zero-traffic rollback candidate. A rollback promotes an already verified exact-SHA slot; it does not restore the retired Sites DNS records or delete either data source.
