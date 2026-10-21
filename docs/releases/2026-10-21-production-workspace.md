# October 21 local workspace and production release

Scope: complete local checkout, Node 22 lockfile installation, documented local environment, Wrangler browser authentication, exact-candidate release checks, authorized production deployment and verification. Preserve secrets, routing, production storage, user data, saved request identities, billing closed and Spark disabled. No destructive migrations or unrelated refactoring.

Candidate: b6cbb06dab72ed657dfc69ba84b3304cf475c265 (remote main verified at session start October 21; unchanged from historical reference). Later documentation-only checkpoints advance main and are distinct from this tested application candidate. Existing clean checkout fast-forwarded from 654c3c8. GitHub normal keyring login available.

- [x] Locate checkout, preserve work, read AGENTS and current state, fetch main.
- [x] Verify complete tracked assets and install Node 22/dependencies from lockfile: 1,421 files, 152 binary files, no Git blob mismatches; Node 22.18.0/npm 10.9.3; npm ci succeeds.
- [x] Configure ignored local environment from examples; `.env.local` mode 0600; `.mise.local.toml` pins Node 22.18.0.
- [x] Wrangler 4.151.0 normal browser OAuth login completed; account and production/staging deployment history accessible.
- [x] Production rollback version `a086abd4-b244-487e-9b58-f509b0a6b5a5`, deployment `b87904e0-42bc-4c2f-8008-c8c2e42609f0` (October 10). D1 `5fa98a30-1ece-4d6a-8771-db4b2f0aad34`, R2 `filosage-assets`; six secret names recorded without values. Routes `filosage.com/*` and `www.filosage.com/*` point to `filosage`. Billing false/closed/tax false and all five Spark activation flags false.
- [ ] Verify exact-SHA engineering and security gates; run required full regression after engineering success.
- [x] Run actual production-shaped OpenNext Workers bundle smoke locally: all four checks pass after excluding development environment file; bundled worker SHA-256 `b6cd0fe74a87a9e1c47ea2653485b218b543ce60080de822e55b62636f0c83c6`.
- [ ] Deploy committed candidate through supported deployment path (owner explicitly authorized October 21).
- [ ] Verify active version, homepage/assets, health/readiness, billing/Spark and deployed client fix. Authenticated generation requires separate evidence.
- [x] Update current-state evidence and push validated documentation checkpoint at the concrete blocker, separately from the tested application candidate. Deployment/post-deployment documentation remains pending.

Risks: old checkout/builds cannot establish current deployability; no bypass of evaluation approval, idempotency or credit accounting is allowed. Production is held until all release gates pass.

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
- [ ] Implement and test isolated receiver and durable retry/retention schema.
- [ ] Provision dedicated Cloudflare operations resources, keep generated signing secret private, deploy committed receiver and verify actual notification transport.
- [ ] Configure production application operations settings, requalify exact application candidate, deploy and verify original release outcome.

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
