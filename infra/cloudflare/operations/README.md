# FiloSage Cloudflare operations receiver

The dedicated `filosage-operations` Worker and D1 database replace the retired
Azure receiver. They never read application D1/R2 or learner records. The sender
contract stays unchanged: HMAC-SHA256 of the exact JSON bytes, v1 signature,
matching alert/idempotency IDs and timestamp. Bodies are capped at 16 KiB;
requests older than five minutes or over 30 seconds in the future are refused.

`POST /alerts` acknowledges only after D1 persistence. Repeated IDs with identical
payloads (ignoring only the fresh occurrence timestamp) return 200; conflicting
payloads return 409. Signatures always authenticate the exact received bytes. Only code, severity, environment,
version, timestamps and body hash are stored. Raw messages and context are omitted
from storage and notifications. No public listing/read endpoint exists.

Email uses the native Email Routing binding from `operations@alerts.filosage.com`
to the owner's verified Cloudflare account email (a runtime secret, not in Git).
Email Routing is configured only on `alerts.filosage.com`; existing apex/www
website routes and application storage are unchanged. No email API key is used.

Delivery runs after acceptance with `waitUntil`, backed by a two-minute Cron retry.
Atomic D1 leases prevent concurrent claims within their five-minute lease.
Every claim and retry delay uses its actual current time. Sends have a 60-second
wait deadline; unknown outcomes are not retried before the prior lease expires.
Native email calls cannot be canceled after submission, so a timed-out call may
still be accepted later. Failed notifications back off for at
most eight attempts; exhausted or stale queues make `GET /health` fail. Crash
recovery is at least once: a send accepted by the mail service followed by a lost
D1 acknowledgement can cause a repeated notification. This is not an exactly-once
email guarantee. `state=accepted` means mail-binding transport acceptance, not inbox
delivery. Confirm a clearly identified signed test in the owner's inbox separately.

Completed metadata expires after 30 days in batches of 100. Pending and exhausted
alerts are retained for investigation. Persisted invocation logs contain only
allowlisted event codes, alert IDs and attempt counts, never raw provider errors.
An external monitor should watch receiver `/health`; the receiver cannot itself
notify through a completely unavailable email service. Existing external homepage
and liveness monitoring remains a separate failure channel.

## Deploy and operate

1. Run `npm run test:operations-receiver`, lint, and the repository release gates.
2. Commit the candidate. Deploy only committed source using:
   `npx wrangler deploy --autoconfig=false --config infra/cloudflare/operations/wrangler.jsonc`.
3. Apply `schema.sql` only to **filosage-operations** using Wrangler D1, never an
   application database. This idempotent schema contains no application migration.
4. Generate a random signing secret privately and configure it as
   `ALERT_SIGNING_SECRET` on the receiver and `OPERATIONS_ALERT_WEBHOOK_SECRET`
   on the production app. Configure receiver `ALERT_TO` with the verified recipient.
   Use protected files/stdin with Wrangler secret bulk; never command arguments or
   chat. Preserve all existing production secrets.
5. The app's production vars set `OPERATIONS_ENVIRONMENT=production` and the
   receiver HTTPS `/alerts` URL. Requalify any code/config change at its exact SHA.
6. Send one bounded signed test using the existing `deliverOperationalAlert`
   contract. Verify D1 durable acceptance and email transport state, duplicate
   acceptance, tamper/replay rejection, and no extra record for refused requests.
7. Inspect rows via `wrangler d1 execute filosage-operations --remote --command`
   with metadata-only SELECT queries. Investigate pending/failed states and
   persisted logs. Do not blindly reset exhausted alerts or claim inbox delivery.

Rollback application code to the recorded prior version if needed. Keep the
receiver and signing secret available while any current app version references
them; do not delete operations evidence as part of application rollback.

References: Cloudflare [Email Routing subdomains](https://developers.cloudflare.com/email-service/configuration/subdomains/),
[verified destinations](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/),
[send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/),
and [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
