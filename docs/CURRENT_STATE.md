# Filosage current state

Last materially updated: October 23, 2026.

## Active outcome: generation failure and progress recovery

Owner authorized fixing generation/recovery UI and real course/lesson tests. [Outcome checklist](releases/2026-10-21-generation-recovery.md). On October 23 the work resumed with uncommitted final schema/test-inventory corrections preserved.

- OpenAI originally returned401 invalid_api_key. Owner privately replaced/deployed the key; the real authenticated test then reached research/bibliography and returned400 invalid_json_schema. Unsupported Zod format starts_with was replaced with equivalent HTTPS regex constraints.
- Sources30f3077/baf7a2c contain the generation fixes but have not been deployed. Prior engineering failed browser-count budgets (corrected) and then the production npm audit. New Oct22 registry advisories classify Next16.4.0 as vulnerable; patched Next16.4.2 is installed locally with a lockfile-only dependency update. Production audit now reports zero vulnerabilities, and fresh contracts459/459, unit26/26, receiver15/15, Python3/3, TypeScript/lint pass. Patched OpenNext validation build and actual Worker smoke pass4/4; final committed bundle/exact-SHA gates remain required. No full browser run has been dispatched for these fixes.
- Owner explicitly confirmed there are no old courses and requested removing the outline defaults. Both sourceIds/contentBasis are now required directly; no compatibility schema is retained. Expanded provider-schema checks caught those defaults before deployment. Valid test fixtures explicitly state model-knowledge/empty source IDs; the structural test rejects omission of either field.
- Prior local validation passed unit26/26, receiver15/15 and recovery browser7/7. Fresh full contracts459/459, unit26/26, receiver15/15, Python3/3, types/lint/secrets/wiki pass after the final schema change (lint has four pre-existing navigation warnings). Independent review found no important issue; real successful course and lesson generation remain unverified.
- Current production is still source e3c5c71 with the owner's credential update: version df1a44f0-298b-44b7-914f-89dd67734f89, deployment321298d4-bdfb-4c91-8f66-386ed4a8fe12. This is the immediate rollback target with the working key. No production app code has changed since the previous release. Preserve all standing constraints and saved identities.

## Active outcome: local workspace and authorized production release

Owner authorized production deployment after required checks, then explicitly authorized replacing the retired Azure operational-alert receiver in Cloudflare. The [persistent release checklist](releases/2026-10-21-production-workspace.md) and [sanitized evidence](releases/2026-10-21-production-evidence.json) track the complete scope. **Production release is deployed and publicly verified** at the frozen source below. Successful authenticated course generation remains unverified.

- Frozen application/receiver source candidate: `e3c5c711734ef6699f36fa9d063242dcb41248a3`. Later documentation commits must remain distinct from the deployed source SHA.
- Initial remote main was `b6cbb06dab72ed657dfc69ba84b3304cf475c265`, matching the supplied historical reference. This session added the reviewed Cloudflare receiver and a live-quota-driven durable-alarm correction on top.
- Existing checkout `/home/victor/Projects/Filosage/repo` was initially clean; all 1,421 baseline tracked files matched Git blobs, including 152 binary files. No incomplete connector checkout is used as a release artifact.
- Node 22.18.0/npm 10.9.3 installed; lockfile dependencies installed in development and directly in the clean release worktree `/home/victor/Projects/Filosage/releases/production`. Development has an ignored runtime pin and mode-0600 `.env.local`. Release builds exclude development environment files.
- GitHub keyring login and Wrangler 4.151.0 normal browser OAuth work. Account `447a556505dd5e72b66e7c1c63d754ae` and both existing application workers are accessible. GitHub, npm registry, Cloudflare OAuth and API outbound access are verified.

## Actual application deployments and rollback

- The October 21 code release activated version `7c1ca966-3d06-423d-b545-414f074d07d7`, deployment `7280a183-7e19-4e09-9883-7a6e8dfad7ee`, 100% traffic at 3:52 p.m. EDT; the later owner credential update/current version is recorded above. `SITE_VERSION` and public health report source `e3c5c711734ef6699f36fa9d063242dcb41248a3`.
- Rollback version `a086abd4-b244-487e-9b58-f509b0a6b5a5` (October 10), prior deployment `b87904e0-42bc-4c2f-8008-c8c2e42609f0`, is retained.
- Production D1 `5fa98a30-1ece-4d6a-8771-db4b2f0aad34`, R2 `filosage-assets`, both website routes and Workers.dev configuration are unchanged. All six prior secret bindings remain; only `OPERATIONS_ALERT_WEBHOOK_SECRET` was added privately. No application migration ran.
- Aggregate health, readiness and liveness return 200; configuration/datastore checks pass. Homepage and 20 referenced static assets return 200 and match local release bytes. Billing status is disabled/closed/tax false; live version confirms all five Spark activation flags false. Unknown route returns 404.
- Live `/create` references the exact candidate chunk (`0svqi9c3khxvn.js`, SHA-256 `1a17429d19daad193d4f26e90d83ad99042561f8d1c8e73e20a218e537976782`): automatic evaluation header absent, Idempotency-Key retained. Fix `15c96649` is deployed. Saved request identities and server safeguards were preserved. This is client/public verification, not authenticated generation evidence.
- Staging remains `1ee07017-449a-4444-847e-114e3a9eecd3` from October 16 (recovery bundle `cba6ea6e` with persisted logs). Its earlier isolated real-D1 acceptance passed 8/8 with cleanup; successful authenticated course generation remains unverified. No staging app/storage changes occurred here.

## Cloudflare operational alert receiver: deployed and qualified

- Source `e3c5c71`; live receiver `filosage-operations` version `41a301ca-3a3e-45b5-8f58-9d02735b5892`, deployment `4ff7a8e4-b0e3-4831-bc82-2659066a641c`. Initial corrected code version was `fa886cb1-813c-4e6d-9e1f-a74f9ef638e1`; the live version includes its privately configured receiver secrets.
- Dedicated operations D1 `8b75b7b7-4e40-4a1e-8f1a-b5bdc5af5e83` contains only bounded operational metadata. A dedicated SQLite Durable Object alarm provides two-minute retry wakeups. No application schema or data was changed.
- Email Routing is ready on new `alerts.filosage.com`. Owner selected the provider-verified Cloudflare account email; its value is kept out of Git. The native email binding is used; the newer Sending beta API refused access (2036). Existing web routing is preserved.
- Exact-byte HMAC authentication, bounded bodies/schema/timestamps, durable acknowledgement, sender-compatible deduplication and payload conflicts are enforced. Raw messages/context are not retained or emailed. Per-alert leases, bounded mail waits, retries/dead-letter, completed-metadata retention and fail-closed health are implemented. Email is at least once after unknown outcomes; transport acceptance and inbox delivery are separate facts.
- Live signed test: new 202, duplicate 200, fresh-timestamp duplicate 200, bad signature 401, stale 401, conflicting payload 409. Exactly one row persists, state `accepted`, attempts 1, no last error. Receiver `/health` returns 200. Owner confirmed the clearly labeled FiloSage test email arrived.
- Hosted alarm execution observed in both live tail and persisted telemetry at 2:59 p.m. EDT on October 21 (`AlertScheduler`, event type `alarm`, live receiver version). Persisted invocation logging is verified.
- Initial cfc0628 receiver upload succeeded but Cron registration hit the existing account's five-trigger free limit. No unrelated schedule or account plan changed. The final dedicated durable alarm replaces Cron without a paid upgrade. See [receiver operations](../infra/cloudflare/operations/README.md).

## Completed release verification and limits

- Exact-SHA [Engineering quality gate 39655302871](https://github.com/Victor-CS-Core/Filosage/actions/runs/39655302871): all four jobs successful. [Security scan 39655302867](https://github.com/Victor-CS-Core/Filosage/actions/runs/39655302867): successful.
- [Full browser regression 39657130756](https://github.com/Victor-CS-Core/Filosage/actions/runs/39657130756) passed at the same candidate SHA, dispatched after engineering success. Three Chromium tests passed on configured retries (evidence navigation timing, subpixel touch-target rounding, owner handbook visibility timing); four tests were skipped by the existing suite. No retry settings/checks were weakened; timing root causes remain unestablished. Earlier runs were superseded by the owner-approved receiver addition and live Cron-capacity correction; none is represented as full-regression success.
- Clean candidate OpenNext build and actual local Workers bundle smoke pass 4/4. Production dry run emits byte-identical worker code. Production-shaped configuration with local-only signing fixtures passes aggregate health/readiness against local D1.
- Receiver/scheduler tests 15/15 pass, with failing-then-passing regressions for sender timestamp deduplication, slow delivery and durable alarm acceptance; the bounded hung-delivery test also passes. Independent reviews found no remaining blocking issues. Existing unit 21/21, Python deployment 3/3, focused operations/release contracts 33/33, TypeScript and lint pass (four pre-existing navigation warnings). Tracked-secret scan passes.
- Local Chromium owner saved-request test passes 1/1. Local WebKit archives require missing system libraries on this Arch host; hosted full regression installs its own Chromium/WebKit dependencies. No local full-browser success is claimed.
- Supported native Wrangler OAuth deployment used the clean committed release worktree, `--keep-vars` and exact SITE_VERSION. The Python helper's default production refusal remains unchanged; owner authorization covered this native production path. Later documentation commits were excluded from the artifact.
- Required release work is complete. Authenticated generation, unrelated acceptance gates below and intermittent browser timing remain explicit limits; no provider generation was attempted or user request identity reset during that prior release. The later real test is recorded above.


## Standing constraints

Keep `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, `STRIPE_TAX_READY=false` and all five Spark activation flags false. Preserve production secrets, routing, application D1/R2, user data and saved request identities. Never bypass evaluation approval, generation idempotency or credit controls; never deploy uncommitted source, mix staging/production storage, perform destructive application migrations or unrelated refactoring. Public health and simulated/client regression evidence do not prove successful authenticated generation; that remains unverified. Separate paid/Spark legal/provider/evaluation gates, iOS lesson-sync acceptance and D1/R2 backup/restore proof remain open. Do not alter Azure resources or OpenAI proxy.

## Maintenance contract

Update this snapshot after meaningful milestones and before checkpoints/handoff. Replace stale facts, link detailed dated evidence, and distinguish local, committed, pushed, deployed and production-verified states. Git history retains earlier snapshots; `docs/AGENT_PROGRESS.md` is historical. Never commit credentials, personal addresses or private logs.
