# Filosage production operations

Updated: 2026-09-06 (source/workflow reconciliation; no hosted run in this change)

Filosage runs on Azure Container Apps with PostgreSQL Flexible Server, Blob Storage, Key Vault, Container Registry, Log Analytics, and Azure Monitor. Google sign-in uses Container Apps built-in authentication (Easy Auth). Git publication, an Azure candidate deployment, and traffic promotion are separate release states.

## Required production configuration

The release contract is validated by `npm.cmd run check:release`. It requires Azure Easy Auth, the Azure datastore and storage, owner email, OpenAI key, activity-receipt secret, canonical public origin, and the full 40-character Git SHA.

- `NEXT_PUBLIC_SITE_URL` must be `https://filosage.com` for the production image. Google OAuth must authorize each deployed host's `/.auth/login/google/callback` URL.
- `DATABASE_URL` must use Azure PostgreSQL with TLS verification.
- `AZURE_STORAGE_ACCOUNT_URL` and `AZURE_STORAGE_BANNER_CONTAINER` identify private banner storage.
- `OWNER_EMAIL` and `MIGRATED_OWNER_UID` must match the separately approved environment configuration; owner authorization requires the verified identity checks. Never copy an old runbook address into a release.
- `ACTIVITY_RECEIPT_SECRET` is server-only and must contain at least 32 cryptographically random bytes.
- `SITE_VERSION` is the exact full Git SHA built into and exposed by the image; environment verification compares it with the approved full `EXPECTED_SITE_VERSION`.
- `OPERATIONS_ALERT_WEBHOOK_URL` and `OPERATIONS_ALERT_WEBHOOK_SECRET` are required before claiming production alert delivery is operational.
- Every optional switch must exactly match `config/release-capabilities.json`. Flashcards support disabled, decks-only, and decks-plus-generation; generation without decks is invalid. The prior August 21 all-on requirement is superseded.
- `EXPECTED_SITE_ORIGIN` and `EXPECTED_AUTH_MODE` are required by the environment/health checks. Health also requires `EXPECTED_IMAGE_DIGEST` from the verified inactive-revision evidence; the deployed `RELEASE_IMAGE_DIGEST` and Azure revision image must agree.

Keep `BILLING_ENABLED=false` and `BILLING_ROLLOUT_MODE` at `closed` or `configured` until checkout activation is separately authorized and all legal, support, backup, alerting, and Stripe launch gates are complete. `configured` may prove readiness but cannot create Checkout Sessions. An authorized activation must begin with a bounded `canary` allowlist before `open`; Stripe-hosted Checkout and Customer Portal remain the only subscription acquisition and management pages.

## Blue/green release procedure

One Container App serves the Next.js frontend and same-origin BFF API in one immutable image. Blue and green are its revision labels; the separate QA website is retired from source. Follow [BLUE_GREEN_BFF_OPERATIONS.md](BLUE_GREEN_BFF_OPERATIONS.md) for the exact source/SHA/digest, 100/0 traffic, shared authentication and evidence contract.

`azure-staging.yml` builds once after exact-SHA quality/full-regression evidence, copies the live template to a zero-public-traffic candidate, tests its revision/label URLs and retains immutable evidence. `azure-candidate-verification.yml` checks the independently reviewed hosted proof artifacts. `azure-promote-staging.yml` consumes those exact successful runs and swaps traffic without rebuilding, only after Victor approves the concrete packet. No workflow changes shared app authentication before verification. Runtime schema/privilege cutover, QA resource retirement and effective access probes are separate resource-specific live gates.

After a swap, record apex/www routing, exact public SHA/digest and fresh real signed-in/monitoring evidence. A failure can restore only the explicitly reviewed compatible predecessor; restored weights alone do not prove recovery. Record source, local tests, CI, inactive-revision verification, promotion, rollback and production verification separately.

## Monitoring and alerts

- Poll `/api/health` externally every one to five minutes. Alert after two consecutive failures and again on recovery.
- Treat a 503, unhealthy configuration/datastore, missing or nonboolean capability, invalid feature dependency, unexpected feature activation/deactivation, origin/auth mismatch, or SHA/digest mismatch as an unhealthy release.
- Monitor Container Apps revision health/restarts, Easy Auth sign-in failures, PostgreSQL availability and connections, OpenAI budget exhaustion and Blob failures. Monitor existing-customer Stripe lifecycle and webhook recovery even while new Checkout is closed.
- Keep the $30 monthly Azure budget alerts active at 80% actual and 100% forecast while the app remains pre-release.
- The alert receiver must verify `X-Filosage-Signature`, reject stale timestamps, deduplicate the alert ID, and acknowledge only after durable acceptance. Run `npm.cmd run test:operations-alert` after configuring or rotating it.

## Backups and restore

- The template's PostgreSQL backup retention, tier and availability settings require current provider readback and explicit service-target approval. Set the observation workflow's exact `AZURE_POSTGRES_RESOURCE_ID` and approved retention; it must never select the first server returned by a resource-group query.
- Verify Blob versioning and blob/container soft-delete on the exact account. PostgreSQL point-in-time restore does not restore Blob objects.
- Before a consequential data or schema change, confirm the recovery window and choose an available restore point.
- Never test a restore against the active server or either revision's shared services. Follow [RECOVERY_REHEARSAL.md](RECOVERY_REHEARSAL.md) to approve and verify a separate private destination, accounting for Azure's source-networking restore constraints.
- Validate current-schema account, course/release, learner evidence, entitlement, credit, generation and deletion relationships as well as counts and fingerprints. Restore representative Blob versions separately and reconcile ownership/references.
- Remove only explicitly approved temporary recovery resources after independent validation and evidence retention; record the exact cleanup and provider readback.
- Blob recovery and retention require a separate reviewed policy before paid activation; PostgreSQL point-in-time restore does not restore Blob objects.

The scheduled Azure workflow captures a recovery-window observation, not a restore rehearsal. Its artifact can show that Azure reports an available restore window and retention period at a point in time, but paid activation still requires a current restore into a separate non-production server and application-level verification of that restored copy.

The historical 2026-08-12 restore rehearsal reproduced fingerprint `588c4e2334c555ea0078de9e3cb1dd93e6d5df91dab626513f4233b5bf938757` from a separate recovery server. That historical result does not satisfy the current paid-release restore gate without a fresh rehearsal against the current schema and candidate.

## Incident response

1. Triage severity, affected users, start time, and any active exploit or outage.
2. Contain the issue with the relevant feature flag, billing lock, content quarantine, credential revocation, or promotion of a verified last-known-good Azure slot.
3. Preserve GitHub Actions, Container Apps and Easy Auth, PostgreSQL, Blob, OpenAI, Stripe, and operational-webhook evidence without copying private content or secrets into general-purpose chat.
4. Recover application traffic from an immutable exact-SHA revision and data only from a verified recovery copy.
5. Repeat public health, authentication routing, datastore, and visible smoke checks before reopening the affected feature.
6. Notify affected users or authorities when required by counsel or law, and complete a written post-incident review.

If `ACTIVITY_RECEIPT_SECRET` is compromised, rotate it immediately. Outstanding signed activity receipts will become invalid; already stored completed progress remains intact.
