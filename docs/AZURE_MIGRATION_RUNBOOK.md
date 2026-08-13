# Azure-native migration runbook

Status: Central US staging foundation, External ID/Google federation, immutable blue/green deployment, authored-course import, content-fidelity verification, and PostgreSQL point-in-time restore rehearsal are complete. Owner Google sign-in acceptance is still pending. No production traffic has been cut over.

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

The selected subscription is `Azure subscription 1` and the selected region is Central US. East US rejected PostgreSQL 16 for this subscription offer, so the failed empty foundation was removed before the Central US retry. A $30 monthly budget alert remains to be configured because the cost API rejected the interactive account's current RBAC token.

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

The external tenant is `filosagecustomers.onmicrosoft.com`. `Filosage Web` exposes `access_as_user`, requests the email claim in access and ID tokens, is attached to the `Filosage Customers` sign-up/sign-in flow, and has both localhost and the exact Container Apps staging origin registered as SPA redirects. Google is configured as a federated provider and the application passes `domain_hint=google` so Google remains the primary sign-in path. Email/password remains a recovery method. `OWNER_EMAIL=viticopq12@gmail.com` is the server-side owner boundary and still requires a verified token email match.

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

The Azure importer is create-only: it fails if any target document or blob already exists. Import only after the PostgreSQL schema migration has completed and the operator has verified the target connection. The verified source bundle contains 9 owner-authored courses, 106 lessons, 9 referenced banners, 133 allowlisted documents total, and no user/progress/analytics paths. The independent Azure verification job `filosagestg-course-verify` succeeded on 2026-08-12 and compared every canonical PostgreSQL JSON value plus every Blob byte and MIME type against the private source bundle. It confirmed exactly 133 documents (9 courses and 106 lessons), 9 banners, no unexpected migrated records, and content fingerprint `588c4e2334c555ea0078de9e3cb1dd93e6d5df91dab626513f4233b5bf938757`. Do not delete Firebase data during migration or staging acceptance.

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

Only after staging acceptance and explicit approval:

1. Add and validate the custom domain on Container Apps.
2. Add the production redirect/logout URI in Entra External ID.
3. Lower DNS TTL, preserve all existing mail records, and change only the required web records.
4. Verify TLS, redirects, sign-in, health SHA, public courses, private owner access, and mail delivery.
5. Retain the previous hosting/data source as a read-only rollback path through the acceptance window.

Rollback changes DNS back to the prior host and stops Azure writes. It does not delete either data source. Any reverse synchronization is a separately reviewed operation.
