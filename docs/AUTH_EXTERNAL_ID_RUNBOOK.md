# External ID rollout operator runbook

Status: local handoff only. This runbook does not record approval, tenant configuration, secret creation, registry writes, workflow dispatch, deployment, activation, or production verification. Every blank below must be completed from operator-observed evidence after its own approval gate. Do not infer a value from this document.

This procedure implements the approved Microsoft Entra External ID design while Azure Container Apps Authentication continues to own the browser session. Direct Google remains the rollback path throughout migration, and `BILLING_ENABLED=false` is invariant.

## Approval ledger

An unchecked row is not authorization. Each gate needs its own complete record before the corresponding action begins. The production enablement approver and the later direct-Google retirement approver must be Victor.

| Approval gate | Approved | Approver | Approval time | Operator | Target tenant / subscription / resource group | Change reference | Evidence link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QA external tenant, application, sign-up/sign-in user flow, and Google-provider writes | [ ] |  |  |  |  |  |  |
| QA External ID OAuth-secret creation or rotation and one-time identity-link HMAC key creation | [ ] |  |  |  |  |  |  |
| QA inactive deployment | [ ] |  |  |  |  |  |  |
| QA External ID provider enablement | [ ] |  |  |  |  |  |  |
| QA registry backfill `--apply --missing-only` | [ ] |  |  |  |  |  |  |
| QA new-account enablement | [ ] |  |  |  |  |  |  |
| Production external tenant, application, sign-up/sign-in user flow, and Google-provider writes | [ ] |  |  |  |  |  |  |
| Production External ID OAuth-secret creation or rotation and one-time identity-link HMAC key creation | [ ] |  |  |  |  |  |  |
| Production registry backfill `--apply --missing-only` | [ ] |  |  |  |  |  |  |
| Production inactive zero-traffic deployment | [ ] |  |  |  |  |  |  |
| Production External ID provider enablement | [ ] |  |  |  |  |  |  |
| Production new-account enablement | [ ] |  |  |  |  |  |  |
| Direct Google retirement | [ ] |  |  |  |  |  |  |
| Later direct-Google secret removal | [ ] |  |  |  |  |  |  |

If scope, target, operator, or evidence differs from an approved row, stop and obtain a new approval. A QA approval never authorizes a production change.

## Non-secret configuration inventory

Complete QA and production separately before any write. Values must be copied from the target tenant, Azure resource, or reviewed deployment output. Record exact identifiers, URLs, Key Vault secret names, and secret version identifiers only.

| Field | QA value | Production value | Evidence link |
| --- | --- | --- | --- |
| External tenant display name |  |  |  |
| External tenant ID |  |  |  |
| External tenant subdomain |  |  |  |
| Tenant region and data location |  |  |  |
| Approved tenant administrator |  |  |  |
| Sign-up/sign-in user-flow ID |  |  |  |
| Application client ID |  |  |  |
| Exact issuer URL |  |  |  |
| Exact OpenID discovery URL |  |  |  |
| Named Container Apps Easy Auth provider, expected `filosage` |  |  |  |
| Azure subscription ID |  |  |  |
| Azure resource group |  |  |  |
| Container App name, QA committed default `filosageqa-app` |  |  |  |
| Container App origin |  |  |  |
| Easy Auth callback URL ending `/.auth/login/filosage/callback` |  |  |  |
| Google OAuth web client ID |  |  |  |
| Maintenance target fingerprint, exactly `postgres:server/database` |  |  |  |
| Key Vault name |  |  |  |
| External ID OAuth Key Vault secret name, expected QA `external-id-client-secret-qa`, production `external-id-client-secret` |  |  |  |
| External ID OAuth Key Vault secret version identifier |  |  |  |
| Identity-link HMAC Key Vault secret name, expected QA `identity-link-hmac-secret-qa`, production `identity-link-hmac-secret` |  |  |  |
| Identity-link HMAC Key Vault secret version identifier |  |  |  |
| QA or production revision full Git SHA |  |  |  |
| Immutable container image digest |  |  |  |

Never place connection strings, secret values, cookies, authorization responses, raw claim headers, provider subjects, email addresses, one-time codes, or link-intent values in this inventory, command output, screenshots, tickets, or logs. Redact correlation evidence to the bounded correlation ID; retain no raw identity payload.

The inventory is incomplete if a placeholder, shortened SHA, unversioned secret reference, or guessed tenant value remains.

## Google federation redirect URIs

The redirect URI list produced by the selected External ID tenant and user-flow portal is authoritative. Portal labels may drift. Do not derive, shorten, normalize, or guess redirect URIs from this runbook.

Before saving a Google OAuth change:

1. Open the approved QA tenant and exact user flow recorded in the inventory.
2. Copy every Google federation redirect URI displayed by that tenant/user-flow experience.
3. Confirm that the tenant-produced list includes both the tenant-ID and tenant-subdomain `ciamlogin.com` forms required by the portal.
4. Paste the exact values into this non-secret record before changing the Google OAuth client.
5. Compare the saved Google OAuth redirect list byte-for-byte with the tenant-produced list.
6. Record the portal evidence link and time; do not include credentials or user data.

| Environment | Tenant-produced redirect URI | Portal evidence link | Verified time |
| --- | --- | --- | --- |
| QA |  |  |  |
| QA |  |  |  |
| Production |  |  |  |
| Production |  |  |  |

An incomplete or mismatched list blocks Google federation. Production redirect changes require the production approval row even when QA already works.

## QA activation procedure

Perform these phases in order. Every external or mutating step is conditional on its matching approval-ledger row. Use the isolated QA tenant, QA customer directory, QA Key Vault versions, QA database, and immutable QA image only.

### 1. Confirm the target before creation

- Confirm the approved External ID tenant display name, tenant subdomain, region/data location, and administrator.
- Confirm the QA subscription, resource group, Container App, Key Vault, datastore target fingerprint, and permanent QA origin.
- Confirm the application callback will be exactly `https://<qa-container-app-host>/.auth/login/filosage/callback` after replacing the placeholder with the inventory host.
- Stop if any observed value differs from the approved inventory or if a production resource appears in the QA target.

### 2. Configure the approved External ID application and user flow

After the tenant/provider-write approval:

1. Register one application with the exact QA Easy Auth callback from the inventory.
2. Create one sign-up/sign-in user flow with local email one-time passcode and Google federation.
3. Add the built-in `displayName` attribute using the exact `displayNameAttribute` contract in the reviewed manifest. It must be visible, editable, required, and written to the directory. Do not create a custom duplicate attribute or derive a name from an email address.
4. Request only the OIDC scopes `openid profile email`.
5. Record the exact application client ID, issuer, discovery URL, user-flow ID, and callback; do not record credential material.
6. Confirm the issuer and discovery URL match the QA tenant and the Container Apps provider name is `filosage`.

Filosage must not collect, generate, receive, inspect, or validate an email code. Microsoft hosts the credential and code screens and Container Apps owns the HTTP-only browser session.

### 3. Apply reviewed hosted branding

- Use `infra/azure/external-id-branding/manifest.json` as the reviewed non-secret manifest.
- Upload the reviewed banner, background, favicon, light square logo, and dark square logo named by that manifest. Use the banner as the header logo when the portal exposes the header image control.
- Apply the built-in partial-screen layout, header/footer visibility, background color, sign-in text, username hint, Privacy Notice, and Terms of Service settings even if custom CSS is unavailable. The hosted experience must remain recognizably Filosage without CSS.
- `infra/azure/external-id-branding/custom.css` is a reviewed optional enhancement only (`customCssRequired=false`). If the exact External ID tenant supports it, apply it and retain its visible focus, reduced-motion, responsive, and forced-colors behavior. If the tenant rejects it, record that bounded capability result and continue only when the built-in experience passes the same accessibility checks.
- Configure the application registration with the same Privacy Notice and Terms URLs plus the public Filosage marketing and support URLs. This metadata contains no credential or user data.
- Configure the reviewed footer, Privacy Notice link, and Terms of Service link.
- Keep the Microsoft-hosted domain for this release; a custom login domain is out of scope.
- Capture screenshots with no user data for 320 px, 390 px, desktop, dark mode, forced colors, reduced motion, and 200% zoom.

### 4. Configure Google federation

Follow [Microsoft's Google federation procedure](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers). Use only the tenant-produced redirect URI list recorded above, including its tenant-ID and tenant-subdomain forms. Copy the Google OAuth web client ID into the non-secret inventory. Never paste its credential into this runbook or operator output.

### 5. Create the separately approved QA secrets

After the QA secret approval, store the External ID OAuth credential in the QA Key Vault under `external-id-client-secret-qa`. Generate independent identity-link HMAC key material from at least 32 random bytes and store it once under `identity-link-hmac-secret-qa`. Record each secret name and version identifier, never its value. Do not reuse a production secret, rotate the `v1` HMAC material, or expose a secret through a command argument, parameter file, terminal transcript, or screenshot.

### 6. Validate infrastructure before deployment

Use reviewed, non-secret parameter inputs and the approved secure-input channel for required secret parameters. Do not persist secure values in shell history or files.

```powershell
az bicep build --file infra/azure/qa.bicep
az deployment group validate --resource-group <approved-qa-resource-group> --template-file infra/azure/qa.bicep --parameters @<approved-qa-parameters-file>
az deployment group what-if --resource-group <approved-qa-resource-group> --template-file infra/azure/qa.bicep --parameters @<approved-qa-parameters-file>
```

Review the complete `what-if` diff. Stop on deletion, replacement, production targeting, an unexpected provider, a secret value in output, direct Google disablement, billing enablement, or any resource outside the approved scope.

### 7. Establish the inactive QA state

Only after QA inactive-deployment approval, use the repository's supported `.github/workflows/azure-qa.yml` handoff for the immutable reviewed SHA. The initial run keeps workflow inputs `external_id_auth_enabled=false` and `external_id_new_accounts_enabled=false` and uses these exact runtime gates:

```text
DIRECT_GOOGLE_AUTH_ENABLED=true
EXTERNAL_ID_AUTH_ENABLED=false
EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false
BILLING_ENABLED=false
```

The External ID configuration may be present, but the `filosage` Easy Auth provider and the application entry gate remain disabled. Retain the workflow's pre-deployment and post-deployment provider-state checks plus its exact-SHA health result. Record the full SHA, image digest, revision name, provider-state output, health output, workflow run link, and deployment evidence separately. A successful deployment is not QA activation evidence. Do not improvise a manual deployment path when this supported workflow is available.

### 8. Prepare the identity registry

The dry run is mandatory, non-mutating, and must target the datastore fingerprint already recorded in the inventory:

```powershell
npm.cmd run migrate:identity-links
```

Record counts only. Stop on invalid accounts, duplicate normalized emails, conflicting mappings, a target mismatch, or any output containing identity data. Resolve every problem through a separately reviewed, non-destructive process and repeat the dry run.

Write mode requires the separate registry-apply approval and an exact target confirmation:

```powershell
$identityTarget = Read-Host 'Type the exact datastore target recorded in the approved inventory'
npm.cmd run migrate:identity-links -- --apply --missing-only "--expected-target=$identityTarget"
```

The environment must report `OPERATIONS_ENVIRONMENT=qa`. The command writes missing registry records only. Record counts and completion state only, rerun the dry run to prove idempotency, and stop on any conflict; never overwrite or merge learner records.

### Phase A: Existing-account readiness

After the QA provider-enable approval and successful registry evidence:

1. Enable only the named `filosage` Easy Auth provider through the separately reviewed configuration path.
2. Dispatch `.github/workflows/azure-qa.yml` with `external_id_auth_enabled=true` and `external_id_new_accounts_enabled=false`.
3. Keep `DIRECT_GOOGLE_AUTH_ENABLED=true` and `BILLING_ENABLED=false`.
4. Retain the workflow's provider-state checks before and after deployment and its exact-SHA `migration-dual` health result.
5. Prove the owner/existing-account two-session link path first, including an unchanged canonical UID and unchanged learning data.
6. Complete every Phase A row in the live matrix: direct Google, existing-account linking, failure and concurrency cases, collision prevention, recovery behavior, recent authentication for both External ID methods, and hosted-page accessibility.
7. Stop if the new identity resolves to a new canonical UID, if either session is not freshly verified, or if any existing data changes unexpectedly.

The provider-state check consumes the bounded JSON shape from `az containerapp auth show` on standard input and the expected External ID boolean as its only argument:

```powershell
$providerState = az containerapp auth show --resource-group <approved-qa-resource-group> --name <approved-qa-container-app> --query "{google:properties.identityProviders.google.enabled,filosage:properties.identityProviders.customOpenIdConnectProviders.filosage.enabled}" --output json
$providerState | node scripts/check-auth-provider-state.mjs true
```

### Phase B: New-account acceptance

Only after every Phase A row passes and the distinct QA new-account approval is recorded may the operator dispatch `.github/workflows/azure-qa.yml` with `external_id_auth_enabled=true` and `external_id_new_accounts_enabled=true`. Direct Google remains enabled and `BILLING_ENABLED=false`.

Complete every Phase B row, including all three new-account methods, authenticated legal acceptance, logout, session restoration, malicious-return handling, disabled-account denial, account export/deletion, existing authorization regressions, and bounded monitoring. The full QA matrix is complete only after both Phase A and Phase B pass against the recorded immutable revision. Any new revision invalidates the prior exact-SHA claim and requires the affected rows to be repeated.

For an inactive check where External ID is expected to remain disabled, pass the same bounded JSON shape to:

```powershell
$providerState | node scripts/check-auth-provider-state.mjs false
```

## Live acceptance matrix

Run this matrix only against the exact immutable QA revision after the relevant activation approval. Every row needs observed evidence. Use a redacted correlation ID and a pseudonymous canonical-UID comparison; do not paste the UID, email, subject, raw claims, cookie, authorization response, or code.

| Phase | Scenario | Pass / fail | Time | QA revision full SHA | Browser / device | Auth method | Canonical-UID evidence | Redacted correlation ID | No-mutation / notes evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Existing direct-Google sign-in and ordinary account use |  |  |  |  |  |  |  |  |
| A | Owner migration through the two-session intent; canonical UID and learning data unchanged |  |  |  |  |  |  |  |  |
| B | Google federation sign-up through External ID and returning sign-in |  |  |  |  |  |  |  |  |
| B | Non-Gmail email-code sign-up and returning sign-in |  |  |  |  |  |  |  |  |
| B | Gmail email-code sign-up and returning sign-in |  |  |  |  |  |  |  |  |
| A | Wrong-email link attempt fails without mutation |  |  |  |  |  |  |  |  |
| A | Expired link intent fails without mutation |  |  |  |  |  |  |  |  |
| A | Replayed link intent fails without mutation |  |  |  |  |  |  |  |  |
| A | Concurrent link attempts produce one success and one bounded conflict without duplicate mutation |  |  |  |  |  |  |  |  |
| A | Same-email second identity is blocked from automatic linking |  |  |  |  |  |  |  |  |
| A | User cancellation returns to a recoverable state without mutation |  |  |  |  |  |  |  |  |
| A | Email-code resend and expiry behavior remains Microsoft-hosted |  |  |  |  |  |  |  |  |
| A | Registration and link throttling is bounded and non-enumerating |  |  |  |  |  |  |  |  |
| A | Google or External ID provider outage is recoverable and non-destructive |  |  |  |  |  |  |  |  |
| A | Network interruption and retry recover without duplicate mutation |  |  |  |  |  |  |  |  |
| A | Fresh Google-federation authentication permits deletion only when recent |  |  |  |  |  |  |  |  |
| A | Fresh email-code authentication permits deletion only when recent |  |  |  |  |  |  |  |  |
| A | Fresh Google-federation authentication protects owner-sensitive actions |  |  |  |  |  |  |  |  |
| A | Fresh email-code authentication protects owner-sensitive actions |  |  |  |  |  |  |  |  |
| A | Missing or stale `auth_time` fails closed for sensitive actions |  |  |  |  |  |  |  |  |
| A | Hosted branding, Privacy Notice, Terms, and visible keyboard focus |  |  |  |  |  |  |  |  |
| A | Reduced motion, 320 px, 390 px, desktop, dark mode, and 200% zoom |  |  |  |  |  |  |  |  |
| B | Legal acceptance is stored only after authenticated return |  |  |  |  |  |  |  |  |
| B | Logout denies protected APIs |  |  |  |  |  |  |  |  |
| B | Session restoration works after a fresh browser navigation |  |  |  |  |  |  |  |  |
| B | Malicious external return URLs resolve to `/` |  |  |  |  |  |  |  |  |
| B | Disabled or suspended accounts remain denied |  |  |  |  |  |  |  |  |
| B | Monitoring records bounded categories without secrets or raw identity payloads |  |  |  |  |  |  |  |  |
| B | Account export preserves the canonical account boundary |  |  |  |  |  |  |  |  |
| B | Account deletion retains the approved identity-link maintenance boundary |  |  |  |  |  |  |  |  |
| B | Existing owner and plan authorization regressions remain denied or allowed correctly |  |  |  |  |  |  |  |  |

For both Google federation and email code, inspect the managed claim evidence with personal values redacted. If either method does not produce a trustworthy fresh `auth_time`, mark its sensitive-operation rows failed, block those operations for that method, and stop promotion. Session age or an application-generated timestamp is not a substitute.

The completed QA evidence package also includes automated test output, accessibility evidence, Bicep build and redacted `what-if`, registry counts with zero unresolved conflicts, provider-state output, exact SHA and image digest, and a non-destructive rollback rehearsal.

## Production promotion gates

Do not execute this section without its separate production approvals. QA success does not authorize production configuration or traffic.

### Production registry preparation

Complete this gate against the maintenance target fingerprint in the approved production inventory, after the production secret approval and before production External ID provider enablement. The production dry run is mandatory and non-mutating, and must target the recorded production datastore fingerprint:

```powershell
npm.cmd run migrate:identity-links
```

The environment must report `OPERATIONS_ENVIRONMENT=production`. Record counts only. Fail closed on invalid accounts, duplicate normalized emails, conflicting mappings, a target mismatch, missing target evidence, or any output containing identity data. Do not copy identities, emails, subjects, canonical UIDs, connection strings, or credentials into the evidence package.

Production write mode requires its separate production registry-backfill approval and an exact confirmation of the same recorded production target:

```powershell
$identityTarget = Read-Host 'Type the exact production datastore target recorded in the approved inventory'
npm.cmd run migrate:identity-links -- --apply --missing-only "--expected-target=$identityTarget"
```

The approved command may write missing registry records only; it must never overwrite or merge learner records. Record counts and completion state only, then rerun the non-mutating production dry run to prove idempotency and zero unresolved invalid accounts, duplicate normalized emails, or conflicts. Stop on any discrepancy. This complete evidence is required before production External ID provider enablement; a QA dry run or QA registry write is not production evidence or approval.

The repository's intended inactive production handoff is `.github/workflows/azure-staging.yml`. It requires the approved full `expected_sha` and a zero-traffic `target_slot`; the workflow is designed to recheck that SHA in isolated QA, confirm the production `filosage` provider is disabled, resolve the immutable image digest, refuse to replace a slot carrying traffic, deploy direct-Google-only gates, and run the exact health and release-safety checks.

The authentication-mode handoff is resolved in the reviewed workflows: the isolated-QA proof is scoped to `EXPECTED_AUTH_MODE=migration-dual`, while the zero-traffic revision, labeled production candidate, and promotion checks are scoped to `EXPECTED_AUTH_MODE=direct-google`. Promotion also rechecks that managed direct Google is enabled and the production `filosage` provider remains disabled immediately before any traffic change. Do not change or bypass these scopes during dispatch.

- [ ] The final local verification ladder is green for the exact commit.
- [ ] The reviewed staging and promotion authentication-mode scopes and managed-provider checks are unchanged, and their exact-SHA checks pass.
- [ ] Independent isolated QA proves the exact full commit SHA and immutable image digest.
- [ ] Every live-matrix row passes, with fresh-auth proof for both methods or an explicit promotion blocker.
- [ ] Registry evidence shows idempotency and zero invalid accounts, duplicate normalized emails, or conflicts.
- [ ] The production inventory and callback are complete, independently reviewed, and contain no placeholder.
- [ ] The production Bicep build, validation, and complete `what-if` are reviewed with secret values redacted.
- [ ] Current backup and restore evidence is attached and restoration ownership is named.
- [ ] Alerts, bounded authentication audit events, dashboards, on-call ownership, and support response are ready.
- [ ] The rollback rehearsal passes without deleting a provider, identity mapping, or learner record.
- [ ] The candidate is deployed only as an inactive zero-traffic production revision.
- [ ] Before activation, `EXPECTED_AUTH_MODE=direct-google`, direct Google is enabled, External ID is disabled, new External ID accounts are disabled, and `BILLING_ENABLED=false`.
- [ ] Victor's production External ID enablement approval row is complete.
- [ ] Victor's later new-account rollout approval row is complete before new production sign-ups are enabled.

Verify the inactive zero-traffic revision with the current release-safety boundary. Replace every placeholder from the approved inventory; do not treat this example as evidence:

```powershell
$env:EXPECTED_AUTH_MODE = 'direct-google'
npm.cmd run check:production -- <zero-traffic-revision-url> <full-40-character-sha> <public-site-origin>
npm.cmd run check:release-safety -- <zero-traffic-revision-url>
```

Record commit, push, production configuration, zero-traffic deployment, traffic state, activation, and signed-in production verification as separate facts. A local commit, push, healthy anonymous endpoint, or zero-traffic revision does not prove production authentication.

## Rollback

Rollback is configuration-first, non-destructive, and separately authorized as an incident change. Preserve evidence before changing state.

1. Set `EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false`.
2. Set `EXTERNAL_ID_AUTH_ENABLED=false` and disable only the named `filosage` Easy Auth provider.
3. Confirm `DIRECT_GOOGLE_AUTH_ENABLED=true`, `AZURE_EASY_AUTH_ENABLED=true`, and health authentication mode `direct-google`.
4. Keep the External ID tenant, application, user flow, Google provider registration, Key Vault secrets, identity registry documents, link intents, and learner records intact for diagnosis and recovery.
5. Re-run signed-in direct-Google smoke tests and the exact-SHA health and release-safety checks.

```powershell
$env:EXPECTED_AUTH_MODE = 'direct-google'
npm.cmd run check:production -- <target-url> <full-40-character-sha> <expected-public-origin>
npm.cmd run check:release-safety -- <target-url>
```

Rollback must not delete either provider, unlink identities, rewrite canonical UIDs, rotate the `v1` identity-link HMAC key, remove secrets, regenerate accounts, or delete registry records. Any HMAC key rotation requires a separately approved `v2` dual-read/dual-write migration design so existing registry paths remain reachable.

Record the exact configuration diff, operator, time, provider state, revision SHA, image digest, health result, signed-in direct-Google result, learner-data checks, and incident reference. Rollback completion is not direct-Google retirement authorization.

## Direct Google retirement criteria

Direct Google remains configured and available until all criteria below are evidenced and Victor gives a later, explicit retirement approval. Secret removal is later than provider disablement and retains its own approval row.

- [ ] Approved migration coverage target is recorded and met; target and observed value remain blank until approved and measured.
- [ ] The approved observation window is recorded and complete; duration and dates remain blank until approved.
- [ ] Support-volume and authentication-error thresholds are recorded before observation and met; thresholds and observed values remain blank until approved and measured.
- [ ] Canonical-UID continuity, learner-data continuity, duplicate prevention, and recent-auth evidence remain green throughout the window.
- [ ] Rollback-retention period is recorded and complete; no incident or unresolved mapping conflict remains.
- [ ] Current backup/restore, alerts, owner access, support readiness, and rollback evidence are still valid.
- [ ] Victor explicitly approves direct-Google provider retirement after reviewing the complete evidence.
- [ ] Victor separately approves the later removal of the direct-Google secret after rollback retention completes.

Retirement must never infer linkage from email equality, rewrite canonical UIDs, remove the External ID rollback evidence, or rotate the `v1` HMAC key. Any exception requires a new reviewed design and approval ledger.

## Sources

Portal labels may drift. The selected tenant's generated identifiers and redirect URI list are authoritative for that tenant; these primary sources define the supported platform behavior:

- [Microsoft Entra External ID authentication methods](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers)
- [Add Google as an External ID identity provider](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers)
- [Customize branding for External ID customers](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-customize-branding-customers)
- [Microsoft Entra company-branding themes and image constraints](https://learn.microsoft.com/en-us/entra/fundamentals/how-to-customize-branding-themes-apps)
- [Microsoft company-branding CSS reference](https://learn.microsoft.com/en-us/entra/fundamentals/reference-company-branding-css-template)
- [Azure Container Apps authentication and authorization](https://learn.microsoft.com/en-us/azure/container-apps/authentication)
- [Container Apps `authConfigs` Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/containerapps/authconfigs)
- [NIST SP 800-63B digital identity guidelines](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
