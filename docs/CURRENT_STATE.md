# Filosage current state

Last materially updated: October 21, 2026.

## Active outcome: local workspace and authorized production release

Owner authorized production deployment after required checks, then explicitly authorized replacing the retired Azure operational-alert receiver in Cloudflare. The [persistent release checklist](releases/2026-10-21-production-workspace.md) and [sanitized evidence](releases/2026-10-21-production-evidence.json) track the complete scope. **Application production has not yet been deployed in this session**; full browser regression remains in progress.

- Frozen application/receiver source candidate: `e3c5c711734ef6699f36fa9d063242dcb41248a3`. Later documentation commits must remain distinct from the deployed source SHA.
- Initial remote main was `b6cbb06dab72ed657dfc69ba84b3304cf475c265`, matching the supplied historical reference. This session added the reviewed Cloudflare receiver and a live-quota-driven durable-alarm correction on top.
- Existing checkout `/home/victor/Projects/Filosage/repo` was initially clean; all 1,421 baseline tracked files matched Git blobs, including 152 binary files. No incomplete connector checkout is used as a release artifact.
- Node 22.18.0/npm 10.9.3 installed; lockfile dependencies installed in development and directly in the clean release worktree `/home/victor/Projects/Filosage/releases/production`. Development has an ignored runtime pin and mode-0600 `.env.local`. Release builds exclude development environment files.
- GitHub keyring login and Wrangler 4.151.0 normal browser OAuth work. Account `447a556505dd5e72b66e7c1c63d754ae` and both existing application workers are accessible. GitHub, npm registry, Cloudflare OAuth and API outbound access are verified.

## Actual application deployments and rollback

- Production `filosage` remains version `a086abd4-b244-487e-9b58-f509b0a6b5a5`, deployment `b87904e0-42bc-4c2f-8008-c8c2e42609f0`, from October 10. This is the recorded application rollback version.
- Production D1 remains `5fa98a30-1ece-4d6a-8771-db4b2f0aad34`; R2 remains `filosage-assets`. Six existing secret bindings were inventoried by name only. Website routes `filosage.com/*` and `www.filosage.com/*` and apex/www web DNS are unchanged.
- Old production aggregate health/readiness report configuration/datastore false. Live version bindings establish that the required production operations environment/webhook/signing-secret settings are absent. The exact bundle reproduces 503 with those settings absent and 200 against local D1 with the proper configuration shape. Do not remove or bypass the readiness requirement.
- The live old course-create JavaScript contains the automatic evaluation header. Fix `15c96649` is included in the candidate; it removes that header for ordinary owner creation while retaining saved request identity and Idempotency-Key. Server evaluation, generation admission/reconciliation and credit safeguards remain intact.
- Staging remains `1ee07017-449a-4444-847e-114e3a9eecd3` from October 16 (recovery bundle `cba6ea6e` with persisted logs). Its earlier isolated real-D1 acceptance passed 8/8 with cleanup; successful authenticated course generation remains unverified. No staging app/storage changes occurred here.

## Cloudflare operational alert receiver: deployed and qualified

- Source `e3c5c71`; live receiver `filosage-operations` version `41a301ca-3a3e-45b5-8f58-9d02735b5892`, deployment `4ff7a8e4-b0e3-4831-bc82-2659066a641c`. Initial corrected code version was `fa886cb1-813c-4e6d-9e1f-a74f9ef638e1`; the live version includes its privately configured receiver secrets.
- Dedicated operations D1 `8b75b7b7-4e40-4a1e-8f1a-b5bdc5af5e83` contains only bounded operational metadata. A dedicated SQLite Durable Object alarm provides two-minute retry wakeups. No application schema or data was changed.
- Email Routing is ready on new `alerts.filosage.com`. Owner selected the provider-verified Cloudflare account email; its value is kept out of Git. The native email binding is used; the newer Sending beta API refused access (2036). Existing web routing is preserved.
- Exact-byte HMAC authentication, bounded bodies/schema/timestamps, durable acknowledgement, sender-compatible deduplication and payload conflicts are enforced. Raw messages/context are not retained or emailed. Per-alert leases, bounded mail waits, retries/dead-letter, completed-metadata retention and fail-closed health are implemented. Email is at least once after unknown outcomes; transport acceptance and inbox delivery are separate facts.
- Live signed test: new 202, duplicate 200, fresh-timestamp duplicate 200, bad signature 401, stale 401, conflicting payload 409. Exactly one row persists, state `accepted`, attempts 1, no last error. Receiver `/health` returns 200. Owner confirmed the clearly labeled FiloSage test email arrived.
- Hosted alarm execution observed in both live tail and persisted telemetry at 2:59 p.m. EDT on October 21 (`AlertScheduler`, event type `alarm`, live receiver version). Persisted invocation logging is verified.
- Initial cfc0628 receiver upload succeeded but Cron registration hit the existing account's five-trigger free limit. No unrelated schedule or account plan changed. The final dedicated durable alarm replaces Cron without a paid upgrade. See [receiver operations](../infra/cloudflare/operations/README.md).

## Candidate verification and remaining release work

- Exact-SHA [Engineering quality gate 39655302871](https://github.com/Victor-CS-Core/Filosage/actions/runs/39655302871): all four jobs successful. [Security scan 39655302867](https://github.com/Victor-CS-Core/Filosage/actions/runs/39655302867): successful.
- [Full browser regression 39657130756](https://github.com/Victor-CS-Core/Filosage/actions/runs/39657130756) is running at the same candidate SHA, dispatched after engineering success. Earlier runs were superseded by the owner-approved receiver addition and live Cron-capacity correction; none is represented as full-regression success.
- Clean candidate OpenNext build and actual local Workers bundle smoke pass 4/4. Production dry run emits byte-identical worker code. Production-shaped configuration with local-only signing fixtures passes aggregate health/readiness against local D1.
- Receiver/scheduler tests 15/15 pass, with failing-then-passing regressions for sender timestamp deduplication, slow/hung delivery and durable alarm acceptance. Independent reviews found no remaining blocking issues. Existing unit 21/21, Python deployment 3/3, focused operations/release contracts 33/33, TypeScript and lint pass (four pre-existing navigation warnings). Tracked-secret scan passes.
- Local Chromium owner saved-request test passes 1/1. Local WebKit archives require missing system libraries on this Arch host; hosted full regression installs its own Chromium/WebKit dependencies. No local full-browser success is claimed.
- Remaining: full regression success; privately add the new application signing secret while preserving the six existing secrets; deploy the clean committed candidate through supported native Wrangler OAuth path; verify active source/version, public pages/assets, health/readiness, billing/Spark and deployed course-create client. Update and push post-deployment evidence separately from source SHA.

## Standing constraints

Keep `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, `STRIPE_TAX_READY=false` and all five Spark activation flags false. Preserve production secrets, routing, application D1/R2, user data and saved request identities. Never bypass evaluation approval, generation idempotency or credit controls; never deploy uncommitted source, mix staging/production storage, perform destructive application migrations or unrelated refactoring. Public health and simulated/client regression evidence do not prove successful authenticated generation; that remains unverified. Separate paid/Spark legal/provider/evaluation gates, iOS lesson-sync acceptance and D1/R2 backup/restore proof remain open. Do not alter Azure resources or OpenAI proxy.

## Maintenance contract

Update this snapshot after meaningful milestones and before checkpoints/handoff. Replace stale facts, link detailed dated evidence, and distinguish local, committed, pushed, deployed and production-verified states. Git history retains earlier snapshots; `docs/AGENT_PROGRESS.md` is historical. Never commit credentials, personal addresses or private logs.
