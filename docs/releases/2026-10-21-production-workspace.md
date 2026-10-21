# October 21 local workspace and production release

Scope: complete local checkout, Node 22 lockfile installation, documented local environment, Wrangler browser authentication, exact-candidate release checks, authorized production deployment and verification. Preserve secrets, routing, production storage, user data, saved request identities, billing closed and Spark disabled. No destructive migrations or unrelated refactoring.

Frozen release candidate: `e3c5c711734ef6699f36fa9d063242dcb41248a3`. Initial main was `b6cbb06dab72ed657dfc69ba84b3304cf475c265`; later documentation commits are distinct from deployed source. The sections below retain the investigation chronology; this checklist is the current outcome record.

- [x] Locate complete checkout, preserve work, read instructions/current state, fetch main and verify binary assets.
- [x] Install Node 22.18.0/npm 10.9.3 and lockfile dependencies; configure ignored local examples with private permissions.
- [x] Authenticate GitHub and Wrangler through normal flows; verify account, production/staging and outbound access.
- [x] Record production rollback version, existing secret names, routes and production D1/R2; retain billing/Spark constraints.
- [x] Implement, review, test and deploy isolated Cloudflare operations receiver; verify durable alarm, signed delivery and owner-confirmed inbox receipt.
- [x] Pass exact-SHA engineering and security gates.
- [x] Pass full browser regression `39657130756` at the frozen SHA.
- [x] Build actual OpenNext bundle and pass local Workers smoke 4/4; production dry run emits identical worker SHA-256 `f33df78d5034305d067b241e63bd64952209b9d0dbbab7a5f9c07743552d6f48`.
- [x] Add only the new signing secret, deploy committed candidate through supported native Wrangler path under explicit authorization.
- [x] Verify active version, homepage/static assets, public health/readiness, billing/Spark, preserved bindings/routes/secrets and deployed course-create client fix.
- [x] Push final validated release documentation separately from deployed source SHA.

Authenticated course generation remains unverified unless direct evidence is collected. Preserve saved request identities and all evaluation/idempotency/credit safeguards. No destructive application migrations or staging storage changes are authorized.

## Release checks and checkpoint status

- Exact candidate engineering gate [39516328997](https://github.com/Victor-CS-Core/Filosage/actions/runs/39516328997): all four jobs successful, including Workers bundle smoke. Security scan [39516329015](https://github.com/Victor-CS-Core/Filosage/actions/runs/39516329015): successful.
- Full regression [39648980369](https://github.com/Victor-CS-Core/Filosage/actions/runs/39648980369): attempt 1 failed before tests, npm registry ECONNRESET; attempt 2 authorized by demonstrated transient network failure. Source SHA verified exact candidate.
- Local tracked-secret scan passes; unit tests 21/21 and Python deployment tests 3/3 pass. npm audit reports only the existing exempt dev-only braces chain (four high package entries); no exemption broadened.
- First local bundle smoke failed readiness because the newly created development `.env.local` was included by Next build, setting operations environment to local. Rebuilding with development environment file temporarily excluded; same candidate and smoke checks retained. Production remains unchanged.
- Owner header fix `15c96649` is an ancestor of candidate; current create form preserves Idempotency-Key and omits automatic evaluation header. Existing owner recovery regression asserts the saved key and body are preserved.

## Local commands

Run from the `repo/` directory using `mise exec node@22.18.0 -- npm run dev` (or activate mise). Local mode uses deterministic generation stubs and file storage; no production credentials were copied. For release builds exclude `.env.local` and set the production Wrangler vars plus `SITE_VERSION` to the candidate SHA; never use local environment files as release configuration.

- Live pre-release create-page asset `/_next/static/chunks/0ar1jc2udojm8.js` (SHA-256 `6a98ee08df4a4c0802d23a290df562069d4b32e3cc93976d274676f8385390dc`) contains both `/api/generate-course` and `x-filosage-model-evaluation`, confirming production still has the client defect. Local Chromium owner-saved-request regression passes 1/1 and verifies preserved identity and omitted header.
- Supported deployment path inspected: Python helper uses native Wrangler for OAuth. Its CLI default refuses production, and that safeguard remains unchanged. For this explicitly authorized production release use the equivalent native OAuth command (`wrangler deploy --autoconfig=false --config wrangler.jsonc --keep-vars --var SITE_VERSION:<candidate> --message <candidate release>`). Wrangler help confirms deployments preserve secrets; `--keep-vars` also preserves existing dashboard vars. Existing production D1/R2 config matches live bindings; routes are not supplied or modified. No migrations run.

## Concrete production blocker: operations alert receiver absent

Live production has `DEPLOYMENT_ENVIRONMENT=production` but no `OPERATIONS_ENVIRONMENT`, `OPERATIONS_ALERT_WEBHOOK_URL` or `OPERATIONS_ALERT_WEBHOOK_SECRET`. This is established by live version binding inventory, not an inference from old Azure notes. `src/lib/runtime-config.ts` requires operations environment production plus the webhook URL and a signing secret of at least 32 characters in this environment. The historical October 9 monitoring record confirms the old receiver was retired and readiness monitoring was intentionally left paused.

The exact smoke-tested bundle was run locally on port 8892 with production vars and local D1/R2, retaining dummy substitutes for the six existing production secrets. Both `/api/health` and `/api/health/ready` return HTTP 503 with configuration/datastore false. Adding only the three missing operations settings with local dummy values changes both to HTTP 200 with configuration/datastore true. Dummy alert URL uses the reserved `.invalid` domain; no receiver test or provider call was performed, no production values changed, and dummy settings are never a deployable configuration. This isolates the current readiness blocker without weakening the gate. The QA-shaped four-check smoke passes but does not establish production readiness.

Owner participation requested: identify an approved replacement receiver by service/name and configure its credentials directly in Cloudflare. Never send passwords, URLs containing credentials, or signing secrets in chat. A real receiver must verify signatures/timestamps, deduplicate IDs and durably accept alerts; successful public health alone cannot prove delivery. Production deployment is held at this concrete blocker; native deployment safeguard remains intact.

## Handoff at concrete blocker

Production remains unchanged at rollback version `a086abd4-b244-487e-9b58-f509b0a6b5a5`; no deployment, secret change, migration, provider generation or data mutation occurred. Full regression attempt 2 remains in progress in Browser matrix as of October 21 at 18:14 UTC; completed tier, command-center, shared-evidence and API lanes pass. Workflow timeout is 60 minutes, so the remote run is bounded; no background watcher is left. Re-read its final result before release.

Local Chromium owner recovery passes; Chromium/WebKit archives downloaded, but local WebKit reports missing system dependencies (`libicu74`, `libxml2`, `libflite1`) on this Arch host. Chromium works; the full hosted regression installs its required Linux dependencies. This is a local WebKit limitation, not passing local full-browser evidence.

Resume only after an approved real operational receiver is available and production configuration can be verified without dummy values. Re-check main/candidate identity, engineering/security/full-regression evidence, local bundle, production version/bindings/routes and standing flags. Production authorization from October 21 remains recorded. After deployment verify active version, served asset hash, public health/readiness/billing/Spark; authenticated generation requires direct evidence.

## Approved continuation: Cloudflare operational alert receiver

Owner confirmed the Azure receiver/configuration was removed during migration and explicitly requested reimplementation in Cloudflare if feasible. Owner selected the Cloudflare account email as notification destination; verification requested through Cloudflare's normal email flow. Scope adds an isolated signed receiver Worker and operations-only D1 database, durable deduplication and notification retry state, and Cloudflare-native email delivery. Preserve application data, secrets, domain routing, billing/Spark and generation safeguards. Do not remove readiness requirements or use dummy production settings. Validate signature/replay/body bounds, durable acknowledgement, duplicate conflicts, database/notification failures and retries; verify hosted receiver acceptance and notification evidence before application deployment. A code/config candidate change requires fresh exact-SHA engineering/security/full regression and bundle smoke.

- [x] Inspect existing sender contract and current Cloudflare Workers/Email Service documentation.
- [x] Select notification destination with owner and request verification email.
- [x] Implement and test isolated receiver and durable retry/retention schema.
- [x] Provision dedicated Cloudflare operations resources, keep generated signing secret private, deploy committed receiver and verify actual notification transport.
- [x] Configure production application operations settings, requalify exact application candidate, deploy and verify original release outcome.

## Receiver implementation validation checkpoint

- Isolated D1 `filosage-operations` created (`8b75b7b7-4e40-4a1e-8f1a-b5bdc5af5e83`); idempotent operations-only schema applied remotely. No application DB/storage touched.
- Cloudflare reports account notification destination verified; Email Routing subdomain `alerts.filosage.com` enabled and ready without changing apex/www website DNS or routes. Email Sending beta API returned Unauthorized (2036); native Routing EmailMessage binding is the supported fallback.
- Receiver tests initially failed, then 9/9 passed. Independent review found timestamp/body deduplication mismatch with the existing sender and stale per-batch delivery leases. Both new regressions failed before fixes and pass afterwards. Final receiver suite 12/12; no blocking re-review findings.
- Existing unit 21/21, deployment Python 3/3, focused operational/release contracts 33/33, TypeScript clean and full lint zero errors (four pre-existing navigation warnings). Receiver actual local Worker: health 200, signed acceptance 202, repeat 200 and local email-binding acceptance. No real email test yet.
- Current-date receiver compatibility was refused by pinned workerd (supports through October 19), so receiver config uses 2026-10-19. No dependency upgrade or runtime check bypass.
- Prior full regression at b6cbb06 canceled after code/config scope changed; new frozen candidate requires its own engineering/security, full regression and actual application bundle smoke. Production app remains on recorded October 10 version.

## Live Cron capacity correction

`cfc0628` passed exact-SHA engineering `39653118227` (all four jobs) and security `39653118211`. Full regression `39654559312` was started after engineering success and canceled before its matrix when receiver scheduling required a code correction. Receiver upload succeeded, but Cron registration failed with Cloudflare 10072: all five free-account Cron slots are occupied. No unrelated schedule was changed and no account upgrade was made. Receiver secrets/application operations settings were not activated.

The correction uses a dedicated SQLite Durable Object alarm and private RPC binding. Successful alert acknowledgement waits for durable alarm creation. Each two-minute alarm persists the next alarm before draining; delivery failure cannot stop the timer. Fifteen behavioral tests pass (three alarm tests failed before implementation); independent review finds no blocking issues. Real local Worker/DO execution and the hosted alarm remain qualification requirements. Existing D1 durable outbox, leases, retry bounds, data minimization and mail-acceptance semantics are preserved.

A separate clean release worktree avoids incorporating later documentation changes. Turbopack rejected an external dependency symlink; it was removed and the lockfile installed directly there. Rebuild/smoke occurs on the final corrected candidate, without altering build safeguards.

## Hosted receiver qualified; application held for full regression

Final frozen candidate `e3c5c711734ef6699f36fa9d063242dcb41248a3` passes engineering `39655302871` (all four jobs), security `39655302867`, a clean OpenNext build and 4/4 actual Workers bundle smoke; production dry run is byte-identical. Full regression `39657130756` is running on that exact SHA.

The durable-alarm receiver deployed successfully; live receiver version `41a301ca-3a3e-45b5-8f58-9d02735b5892` includes its privately configured signing/recipient secrets. Signed probe returned 202/200/200/401/401/409 for new/duplicate/fresh-timestamp repeat/tamper/stale/conflict. One durable record has state accepted, attempts 1 and no error. Native email transport accepted the notification; owner explicitly confirmed inbox receipt. Hosted AlertScheduler alarm ran at 2:59 p.m. EDT and is recorded in persisted Cloudflare telemetry. No application production secret/configuration/deployment change has occurred yet.

Clean release source is `/home/victor/Projects/Filosage/releases/production`, detached at the exact candidate; later local documentation updates are excluded from deployment. New namespace migration and retention affect only dedicated operations state. Existing account schedules, plan, app D1/R2, production secrets, web routes, billing and Spark remain unchanged.

## Completed production release

All three required remote gates passed on frozen source `e3c5c711734ef6699f36fa9d063242dcb41248a3`, including full regression `39657130756`. The matrix had three flaky Chromium tests that passed configured retries: published-course evidence navigation (5-second URL wait), admin touch-target rounding (43.999969px versus 44px), and owner handbook visibility (5-second wait). Four existing-suite skips remain. Timing root causes are unestablished; no check, timeout or retry setting was weakened.

Production deployment `7280a183-7e19-4e09-9883-7a6e8dfad7ee` activated version `7c1ca966-3d06-423d-b545-414f074d07d7` at 100% on October 21, 3:52 p.m. EDT. The supported native Wrangler OAuth path deployed the clean frozen worktree, preserved vars/secrets and supplied the exact SITE_VERSION. Default Python production refusal remains intact. Six prior secrets remain; one new signing secret was privately added. D1/R2, domain routes and Workers.dev settings match the recorded baseline; no application migration ran.

Public verification passed homepage, health, readiness, liveness, billing status and unknown-route 404. Twenty referenced static assets match the local tested bundle byte for byte. `/create` serves candidate chunk `0svqi9c3khxvn.js` with no evaluation header and preserved Idempotency-Key. Live version confirms billing false/closed/tax false and all five Spark activation flags false. Successful authenticated course generation remains unverified; no saved request identities were reset. Rollback version remains `a086abd4-b244-487e-9b58-f509b0a6b5a5`.

The earlier blocker/handoff sections above are historical investigation evidence; this completed outcome and CURRENT_STATE supersede them. Final documentation is committed/pushed separately from deployed source.
