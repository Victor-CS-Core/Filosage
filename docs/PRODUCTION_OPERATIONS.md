# Filosage production operations

Updated: 2026-11-12 (Cloudflare-only source reconciliation; no hosted run in this change)

Filosage runs on Cloudflare Workers through OpenNext, with D1 document storage, R2 object storage, Workers secrets, and Workers Logs. Google sign-in uses direct OAuth with signed HTTP-only session cookies. Git publication and a Cloudflare deployment are separate release states.

## Required production configuration

The release contract is validated by `npm run check:release`. It requires D1 and R2, direct Google OAuth, owner email, OpenAI key, activity-receipt and identity-link secrets, the canonical public origin, and the full 40-character Git SHA.

- `NEXT_PUBLIC_SITE_URL` must be `https://filosage.com` for production. Google OAuth must authorize `https://filosage.com/api/auth/google/callback`.
- `CLOUDFLARE_D1_ENABLED=true` and `CLOUDFLARE_R2_ENABLED=true` must agree with the `FILOSAGE_D1` and `FILOSAGE_R2` Wrangler bindings.
- `DIRECT_GOOGLE_AUTH_ENABLED=true`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` configure the sole production sign-in path.
- `OWNER_EMAIL` must match the separately approved environment configuration; owner authorization requires the verified identity checks. Never copy an old runbook address into a release.
- `ACTIVITY_RECEIPT_SECRET` is server-only and must contain at least 32 cryptographically random bytes.
- `SITE_VERSION` is the exact full Git SHA built into and exposed by the image; environment verification compares it with the approved full `EXPECTED_SITE_VERSION`.
- `OPERATIONS_ALERT_WEBHOOK_URL` and `OPERATIONS_ALERT_WEBHOOK_SECRET` are required before claiming production alert delivery is operational.
- Every optional switch must exactly match `config/release-capabilities.json`. Flashcards support disabled, decks-only, and decks-plus-generation; generation without decks is invalid. The prior August 21 all-on requirement is superseded.
- `EXPECTED_SITE_ORIGIN` and `EXPECTED_AUTH_MODE=direct-google` are required by the environment and health checks.

Keep `BILLING_ENABLED=false` and `BILLING_ROLLOUT_MODE` at `closed` or `configured` until checkout activation is separately authorized and all legal, support, backup, alerting, and Stripe launch gates are complete. `configured` may prove readiness but cannot create Checkout Sessions. An authorized activation must begin with a bounded `canary` allowlist before `open`; Stripe-hosted Checkout and Customer Portal remain the only subscription acquisition and management pages.

## Worker release procedure

One Worker serves the Next.js frontend and same-origin BFF API. Build with `npm run build:cloudflare`, verify with `npm run test:worker-smoke`, and record the exact Git SHA before any separately approved deployment. Confirm the Wrangler D1/R2 binding names and IDs, secret binding names, capability manifest, canonical origin, and billing lock without printing secret values.

After deployment, record the Worker version and deployment IDs, apex/www routing, exact public SHA, health/readiness responses, and fresh signed-in and monitoring evidence. Restore only an explicitly reviewed compatible predecessor. Record source, local tests, CI, bundle verification, deployment, rollback, and production verification separately.

## Monitoring and alerts

- Poll `/api/health` externally every one to five minutes. Alert after two consecutive failures and again on recovery.
- Treat a 503, unhealthy configuration/datastore, missing or nonboolean capability, invalid feature dependency, unexpected feature activation/deactivation, origin/auth mismatch, or SHA mismatch as an unhealthy release.
- Monitor Worker errors and latency, Google OAuth failures, D1 and R2 errors, OpenAI budget exhaustion, and existing-customer Stripe lifecycle and webhook recovery even while new Checkout is closed.
- Keep Cloudflare usage and billing alerts aligned with the approved operating budget.
- The alert receiver must verify `X-Filosage-Signature`, reject stale timestamps, deduplicate the alert ID, and acknowledge only after durable acceptance. Run `npm.cmd run test:operations-alert` after configuring or rotating it.

## Backups and restore

- Do not claim D1 or R2 recovery readiness until the exact Cloudflare backup/export, retention, and restore procedure has been approved and exercised against an isolated destination.
- Before a consequential data or schema change, export or back up the exact D1 database and affected R2 objects using the approved procedure.
- Never test restore behavior against production bindings.
- Validate current-schema account, course/release, learner evidence, entitlement, credit, generation, and deletion relationships as well as counts and fingerprints.
- Remove only explicitly approved temporary recovery resources after independent validation and evidence retention.

## Incident response

1. Triage severity, affected users, start time, and any active exploit or outage.
2. Contain the issue with the relevant feature flag, billing lock, content quarantine, credential revocation, or restoration of a verified last-known-good Worker version.
3. Preserve GitHub Actions, Workers, Google OAuth, D1, R2, OpenAI, Stripe, and operational-webhook evidence without copying private content or secrets into general-purpose chat.
4. Recover application traffic from an exact-SHA Worker version and data only from a verified recovery copy.
5. Repeat public health, authentication routing, datastore, and visible smoke checks before reopening the affected feature.
6. Notify affected users or authorities when required by counsel or law, and complete a written post-incident review.

If `ACTIVITY_RECEIPT_SECRET` is compromised, rotate it immediately. Outstanding signed activity receipts will become invalid; already stored completed progress remains intact.
