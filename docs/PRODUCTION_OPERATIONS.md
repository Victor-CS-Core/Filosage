# Filosage production operations

Updated: 2026-08-02

This runbook covers release checks, monitoring, backup, restore, and incident response. Production deployment remains a separate, explicit operator action.

## Required production configuration

In addition to the Firebase, OpenAI, owner, and public-site variables listed in `.env.example`, configure the signing secret before deployment. The backup and alert integrations are strongly recommended operational controls, but they do not prevent the application runtime from starting:

- `ACTIVITY_RECEIPT_SECRET`: at least 32 cryptographically random bytes. Keep it server-only.
- `FIRESTORE_BACKUP_BUCKET`: a dedicated Google Cloud Storage bucket in the Firestore database location. Required before running managed backups.
- `OPERATIONS_ALERT_WEBHOOK_URL`: a monitored alert receiver. Without it, critical events remain in platform logs only.
- `OPERATIONS_ALERT_WEBHOOK_SECRET`: recommended; the receiver should verify `X-Filosage-Signature`.
- `PRODUCTION_HEALTH_URL`: the canonical production origin used by the post-deploy check.
- `SITE_VERSION`: the full 40-character Git SHA for the exact source being deployed.

Keep `BILLING_ENABLED=false` until checkout activation is separately authorized and all legal and Stripe launch items are complete.

The Firebase service account needs the minimum roles required for the app plus Firestore export/import and access to the dedicated backup bucket. Use separate deploy and runtime identities when the hosting platform supports it.

## Release procedure

1. Confirm the intended commit, record its full 40-character SHA, and review `git status --short`.
2. Load production environment values into the deployment environment. Never paste secret values into logs or issue trackers.
3. Run:

   ```text
   npm.cmd run check:release
   npm.cmd run lint
   npm.cmd run build
   npm.cmd run build:sites
   npm.cmd run test:e2e
   npm.cmd audit --audit-level=high
   ```

4. Create and verify a pre-release backup with `npm.cmd run backup:firestore`.
5. Deploy the exact validated source state.
6. Run `npm.cmd run check:production -- https://filosage.com <full-40-character-sha>`. The release is not verified if the deployed health response omits or mismatches that SHA.
7. Smoke-test sign-in, public course discovery, lesson gating, Plus and Pro author progression, Pro publication review, owner unpublish/delete, account export, and account deletion.
8. Record the deployed version, time, operator, backup URI, and smoke-test result.

## Monitoring

- Poll `/api/health` every one to five minutes from an external monitor. Alert after two consecutive failures and again when service recovers.
- The endpoint returns 503 when required runtime configuration is incomplete or Firestore is unreachable.
- Route the operational webhook to a channel that is actively monitored. The payload contains event identifiers and service status only, never lesson content, tokens, payment details, or credentials.
- Monitor Firebase request errors, OpenAI budget exhaustion, Sites errors, and Stripe delivery status if billing is activated.

## Backups

- Run `npm.cmd run backup:firestore` daily and before every release or data migration.
- Configure bucket retention or object lock according to legal advice and recovery needs. A practical starting point is 35 daily and 12 monthly copies.
- Managed exports are not complete until the script reports completion.
- Quarterly, restore the latest export into a separate non-production Firebase project and verify course, lesson, progress, publication, and entitlement records.

## Restore

Never test restoration against production.

1. Confirm the incident scope and preserve logs.
2. Select a completed export URI under the configured backup bucket.
3. Preview the command:

   ```text
   npm.cmd run restore:firestore -- --input=gs://BUCKET/filosage-backups/TIMESTAMP
   ```

4. Restore into a separate recovery project first. The service account and `FIREBASE_PROJECT_ID` must point to that project.
5. After verification and explicit operator approval, apply with:

   ```text
   npm.cmd run restore:firestore -- --input=gs://BUCKET/filosage-backups/TIMESTAMP --apply --confirm-project=EXACT_PROJECT_ID --wait
   ```

Firestore import replaces documents with matching IDs and does not remove unrelated newer documents. A point-in-time rollback may therefore require a separately reviewed reconciliation plan.

## Incident response

1. Triage severity, affected users, start time, and active exploit or outage.
2. Contain: disable the affected feature flag, keep billing locked, unpublish unsafe content, or revoke compromised credentials as appropriate.
3. Preserve Sites, Firebase, OpenAI, Stripe, and webhook evidence. Do not include private content in general-purpose chat channels.
4. Recover from a known-good source version and verified data copy.
5. Run the release and smoke-test procedure before reopening the affected feature.
6. Notify affected users and authorities when required by counsel or law.
7. Complete a written post-incident review with root cause, timeline, impact, and prevention work.

If `ACTIVITY_RECEIPT_SECRET` is compromised, rotate it immediately. Existing outstanding Plus- and Pro-author receipts will become invalid and those authors must repeat the current lesson checks; already stored completed progress remains intact.
