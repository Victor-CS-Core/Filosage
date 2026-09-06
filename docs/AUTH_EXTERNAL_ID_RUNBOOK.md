# External ID rollout operator runbook

Updated September 6, 2026. The prior approval ledger, provider setup and measured historical results are preserved in [the historical runbook](history/AUTH_EXTERNAL_ID_RUNBOOK_BEFORE_BLUE_GREEN.md). Its QA activation commands are superseded and must not be executed as a current release procedure.

## Current authentication release boundary

One Azure Container App serves frontend and BFF. The shared Easy Auth configuration applies to both blue/green revisions. Preserve the actual `direct-google` or `migration-dual` mode, linked identities and registration behavior; do not disable a provider to simplify a candidate release. No separate QA app, QA secret or QA callback is a release prerequisite.

Use [BLUE_GREEN_BFF_OPERATIONS.md](BLUE_GREEN_BFF_OPERATIONS.md) and `.github/workflows/azure-staging.yml` for the exact inactive-candidate release. `expected_sha` identifies the full source SHA and `expected_auth_mode` must match the currently observed shared providers. The workflow derives the inactive label from actual 100/0 traffic, builds one image and verifies its revision URL before promotion. It never flips shared auth configuration during candidate staging.

## Provider changes and live acceptance

Provider/callback/registration changes require a separate concrete approval, account inventory and compatible shared configuration plan. Test real Google onboarding/current legal acceptance, owner/non-owner access, logout/return, suspended and stale-terms accounts, configured External ID and linked-account paths, direct-origin/header forgery rejection, and genuinely recent versus missing/stale/future `auth_time`. Keep `BILLING_ENABLED=false`. Server-side BFF authorization remains authoritative; public discovery never exposes private lesson bodies or learner work.

Destructive actions require the approved recent-auth and privacy workflow. A missing provider or unverified identity cannot be repaired by creating an implicit link. Inspect conflicts with the existing identity-link preflight before any separately approved backfill; preserve established account IDs and ownership.

## Promotion and rollback

Retain measured candidate evidence in immutable exact-SHA artifacts. An independent review through `.github/workflows/azure-candidate-verification.yml` binds that evidence to the app/revision, image digest, manifest, canonical origin and shared auth fingerprint. Victor approves the exact packet before `.github/workflows/azure-promote-staging.yml` swaps 100/0 traffic without rebuilding. Recheck fresh signed-in behavior on the canonical host after the swap.

Rollback requires an exact compatible predecessor that honors current account/publication/accounting fences. Restoring weights does not restore data or prove signed-in behavior. Shared provider changes cannot be rolled back merely by changing a revision label. Retiring direct Google requires a separate linked-account inventory and explicit authorization; no retirement is implied by this release.

## Evidence handling and remaining provider gates

Do not retain connection strings, secret values, cookies, authorization responses, raw claim headers or account content in release artifacts. The live app/RBAC/callback inventory, environment reviewer protections, approved test accounts, hosted probes and actual post-swap checks remain pending. The QA retirement inventory in the blue/green runbook must be completed before any live resource, role or callback removal.
