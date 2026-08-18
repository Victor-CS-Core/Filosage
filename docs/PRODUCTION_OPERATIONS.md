# Filosage production operations

Updated: 2026-08-13

Filosage runs on Azure Container Apps with PostgreSQL Flexible Server, Blob Storage, Key Vault, Container Registry, Log Analytics, and Azure Monitor. Google sign-in uses Container Apps built-in authentication (Easy Auth). Git publication, an Azure candidate deployment, and traffic promotion are separate release states.

## Required production configuration

The release contract is validated by `npm.cmd run check:release`. It requires Azure Easy Auth, the Azure datastore and storage, owner email, OpenAI key, activity-receipt secret, canonical public origin, and the full 40-character Git SHA.

- `NEXT_PUBLIC_SITE_URL` must be `https://filosage.com` for the production image. Google OAuth must authorize each deployed host's `/.auth/login/google/callback` URL.
- `DATABASE_URL` must use Azure PostgreSQL with TLS verification.
- `AZURE_STORAGE_ACCOUNT_URL` and `AZURE_STORAGE_BANNER_CONTAINER` identify private banner storage.
- `OWNER_EMAIL` remains `viticopq12@gmail.com`; owner authorization also requires an exact verified token email match.
- `ACTIVITY_RECEIPT_SECRET` is server-only and must contain at least 32 cryptographically random bytes.
- `SITE_VERSION` is the exact full Git SHA built into and exposed by the image.
- `OPERATIONS_ALERT_WEBHOOK_URL` and `OPERATIONS_ALERT_WEBHOOK_SECRET` are required before claiming production alert delivery is operational.
- `FLASHCARD_DECKS_ENABLED=true` is required for a production release so learners can access private flashcard decks.
- `FLASHCARD_AI_GENERATION_ENABLED=true` is required for a production release so learners can generate grounded flashcards.

Keep `BILLING_ENABLED=false` until checkout activation is separately authorized and all legal, support, backup, alerting, and Stripe launch gates are complete.

## Blue/green release procedure

1. Confirm the intended commit and clean worktree, then push that exact commit to `origin/main`.
2. Run lint, TypeScript, the production build, focused tests, `npm.cmd audit --omit=dev`, and a tracked-file secret scan.
3. Dispatch `.github/workflows/azure-staging.yml` to the inactive `blue` or `green` slot with `public_site_url=https://filosage.com`.
4. Require the candidate label health check to prove datastore health, the exact full SHA, and the canonical origin before review.
5. Smoke-test the candidate label, including sign-in routing, public course discovery, owner access, lessons, banners, and account privacy flows.
6. Dispatch `.github/workflows/azure-promote-staging.yml` with the candidate slot and exact expected SHA. The workflow rechecks health before assigning 100% traffic.
7. Verify the public domain:

   ```text
   npm.cmd run check:production -- https://filosage.com <full-40-character-sha> https://filosage.com
   ```

8. Confirm `https://www.filosage.com/<path>` permanently redirects to the matching apex path, and record the deployment and promotion run URLs.

Never overwrite the slot carrying live traffic. Deploy the next candidate to the zero-traffic slot and preserve the last known-good revision until the new release is accepted.

## Monitoring and alerts

- Poll `/api/health` externally every one to five minutes. Alert after two consecutive failures and again on recovery.
- Treat a 503, `checks.datastore=false`, an origin mismatch, or a version mismatch as an unhealthy release.
- Monitor Container Apps revision health/restarts, Easy Auth sign-in failures, PostgreSQL availability and connections, OpenAI budget exhaustion, Blob failures, and Stripe delivery only if billing is later activated.
- Keep the $30 monthly Azure budget alerts active at 80% actual and 100% forecast while the app remains pre-release.
- The alert receiver must verify `X-Filosage-Signature`, reject stale timestamps, deduplicate the alert ID, and acknowledge only after durable acceptance. Run `npm.cmd run test:operations-alert` after configuring or rotating it.

## Backups and restore

- PostgreSQL Flexible Server retains seven days of automated backups. The current low-cost `Standard_B1ms` configuration has no high availability and does not support an operator-triggered on-demand backup.
- Before a consequential data or schema change, confirm the recovery window and choose an available restore point.
- Never test a restore against the active server. Restore to a separate private recovery server in the same virtual network and private DNS zone.
- Run the authored-course verifier against the recovery database and compare its exact document/banner counts and content fingerprint with the accepted source evidence.
- Remove the temporary recovery server only after the verification evidence is retained and the primary server is confirmed healthy.
- Blob recovery and retention require a separate reviewed policy before paid activation; PostgreSQL point-in-time restore does not restore Blob objects.

The 2026-08-12 restore rehearsal reproduced fingerprint `588c4e2334c555ea0078de9e3cb1dd93e6d5df91dab626513f4233b5bf938757` from a separate recovery server.

## Incident response

1. Triage severity, affected users, start time, and any active exploit or outage.
2. Contain the issue with the relevant feature flag, billing lock, content quarantine, credential revocation, or promotion of a verified last-known-good Azure slot.
3. Preserve GitHub Actions, Container Apps and Easy Auth, PostgreSQL, Blob, OpenAI, Stripe, and operational-webhook evidence without copying private content or secrets into general-purpose chat.
4. Recover application traffic from an immutable exact-SHA revision and data only from a verified recovery copy.
5. Repeat public health, authentication routing, datastore, and visible smoke checks before reopening the affected feature.
6. Notify affected users or authorities when required by counsel or law, and complete a written post-incident review.

If `ACTIVITY_RECEIPT_SECRET` is compromised, rotate it immediately. Outstanding signed activity receipts will become invalid; already stored completed progress remains intact.
