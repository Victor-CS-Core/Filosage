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
- `EXPECTED_SITE_ORIGIN` and `EXPECTED_AUTH_MODE` are required by the environment/health checks. Health also requires `EXPECTED_IMAGE_DIGEST` from the verified QA evidence; the deployed `RELEASE_IMAGE_DIGEST` and Azure revision image must agree.

Keep `BILLING_ENABLED=false` and `BILLING_ROLLOUT_MODE` at `closed` or `configured` until checkout activation is separately authorized and all legal, support, backup, alerting, and Stripe launch gates are complete. `configured` may prove readiness but cannot create Checkout Sessions. An authorized activation must begin with a bounded `canary` allowlist before `open`; Stripe-hosted Checkout and Customer Portal remain the only subscription acquisition and management pages.

## Blue/green release procedure

1. Review the capability manifest, freeze one full candidate SHA, and satisfy the required quality and full regression workflows on that SHA. Git publication and approval remain separate actions.
2. Run the isolated QA workflow from that SHA with separately approved auth inputs. It builds with the manifest, deploys by digest, verifies the runtime values and origin, and retains `release-candidate-<sha>` on the successful QA run.
3. With staging authorization, run `azure-staging.yml` from the same SHA and provide `qa_run_id`, `expected_sha`, `target_slot`, `expected_auth_mode`, `external_id_new_accounts_enabled`, and `featured_course_id` (`none` is explicit). The canonical production origin is `https://filosage.com`; the retired `public_site_url` input no longer exists.
4. The workflow verifies the QA run and artifact, checks the QA revision image digest and health, and deploys that digest to a zero-traffic revision with the same optional switch selection. QA authentication is checked against the artifact's QA mode; production authentication is checked against the reviewed production input.
5. Retain candidate learner/owner/privacy/accessibility smoke evidence, release safety, featured-course verification, and the exact revision name. A healthy response alone does not prove these flows.
6. Only with promotion authorization, run `azure-promote-staging.yml` from the same SHA with the same `qa_run_id`, target slot, auth mode, expected SHA, and featured-course selection. It verifies the target revision image and canonical origin before switching traffic and checks the promoted host afterward. Failed or cancelled promotion restores the captured traffic weights.
7. For manual checks, verify the downloaded candidate evidence, export its validated digest and the reviewed auth mode, and run the command in [RELEASE_CAPABILITIES.md](RELEASE_CAPABILITIES.md). Keep artifact/run/revision URLs in the release packet.
8. Confirm `https://www.filosage.com/<path>` redirects to the matching apex path. Record source, local tests, CI, QA, staging, promotion, and production readback separately.

Never overwrite the slot carrying live traffic. Deploy the next candidate to the zero-traffic slot and preserve the last known-good revision until the new release is accepted.

## Monitoring and alerts

- Poll `/api/health` externally every one to five minutes. Alert after two consecutive failures and again on recovery.
- Treat a 503, unhealthy configuration/datastore, missing or nonboolean capability, invalid feature dependency, unexpected feature activation/deactivation, origin/auth mismatch, or SHA/digest mismatch as an unhealthy release.
- Monitor Container Apps revision health/restarts, Easy Auth sign-in failures, PostgreSQL availability and connections, OpenAI budget exhaustion, Blob failures, and Stripe delivery only if billing is later activated.
- Keep the $30 monthly Azure budget alerts active at 80% actual and 100% forecast while the app remains pre-release.
- The alert receiver must verify `X-Filosage-Signature`, reject stale timestamps, deduplicate the alert ID, and acknowledge only after durable acceptance. Run `npm.cmd run test:operations-alert` after configuring or rotating it.

## Backups and restore

- PostgreSQL Flexible Server retains seven days of automated backups. The current low-cost `Standard_B1ms` configuration has no high availability and does not support an operator-triggered on-demand backup.
- Blob versioning and seven-day blob/container soft-delete protect course banners. PostgreSQL point-in-time restore does not restore Blob objects.
- Before a consequential data or schema change, confirm the recovery window and choose an available restore point.
- Never test a restore against the active server. Restore to a separate private recovery server in the same virtual network and private DNS zone.
- Run the authored-course verifier against the recovery database and compare its exact document/banner counts and content fingerprint with the accepted source evidence.
- Remove the temporary recovery server only after the verification evidence is retained and the primary server is confirmed healthy.
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
