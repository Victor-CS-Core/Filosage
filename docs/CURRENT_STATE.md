# Filosage current state

Last materially updated: October 21, 2026.

## Active outcome: complete local workspace and authorized production release

Owner explicitly authorized deployment of all pending committed main changes to production after required checks. The persistent [release checklist and evidence](releases/2026-10-21-production-workspace.md) owns scope, gates, rollback and verification. Production deployment has **not occurred**. Owner authorized reimplementing the retired operations receiver in Cloudflare and selected the Cloudflare account email. The replacement is locally validated and independently reviewed; hosted receiver qualification and fresh exact-SHA application gates remain required before production deployment.

- Application release candidate is `b6cbb06dab72ed657dfc69ba84b3304cf475c265`: Git fetch verified remote main had not advanced beyond the owner's historical reference at session start. The later documentation-only checkpoint containing this snapshot advances main without changing application source. Keep that documentation identity separate from the tested candidate and any future deployed source.
- Complete existing checkout: `/home/victor/Projects/Filosage/repo`; initial worktree clean, fast-forwarded from `654c3c8`. All 1,421 tracked files match their Git blobs, including 152 binary files. No previous incomplete connector workspace is used as a release artifact.
- Node 22.18.0/npm 10.9.3 installed with mise, lockfile `npm ci` successful. Ignored local runtime pin and mode-0600 `.env.local` configured from the documented example. No production secrets copied to local development. Development environment files must be excluded from deployment builds.
- GitHub keyring login works. Wrangler 4.151.0 browser OAuth login completed October 21; account `447a556505dd5e72b66e7c1c63d754ae` and both workers accessible. Outbound Git fetch, npm installation, Cloudflare OAuth and API reads work.

## Actual live deployments before release

- Production Worker `filosage`: version `a086abd4-b244-487e-9b58-f509b0a6b5a5`, deployment `b87904e0-42bc-4c2f-8008-c8c2e42609f0`, created October 10, 2026 at 05:08 UTC. This is the recorded rollback version.
- Production bindings verified: D1 `5fa98a30-1ece-4d6a-8771-db4b2f0aad34`, R2 `filosage-assets`, six existing secret bindings by name only. Routes `filosage.com/*` and `www.filosage.com/*` point to `filosage`. No secret values, data or routing changed.
- Production public `/api/health` before release reports configuration and datastore false; billing status remains disabled/closed/tax not ready. Live binding inventory identifies missing `OPERATIONS_ENVIRONMENT=production`, `OPERATIONS_ALERT_WEBHOOK_URL`, and `OPERATIONS_ALERT_WEBHOOK_SECRET`. Production-shaped local bundle reproduces both health/readiness 503; adding only these three settings with local dummy values yields 200 and healthy local D1. Dummy values are not deployed. The owner authorized a Cloudflare replacement; keep this gate intact until real receiver qualification and application configuration are complete.
- Staging Worker `filosage-staging`: active version `1ee07017-449a-4444-847e-114e3a9eecd3` (October 16), same recovery bundle as `cba6ea6e` with persisted invocation logging. Prior staging real-D1 acceptance passed 8/8 with probe cleanup; successful authenticated generation remains unverified.

## Candidate behavior and release gates

- Owner course-creation fix `15c96649` is included in candidate main: ordinary requests omit the automatic `x-filosage-model-evaluation` header and preserve saved request identity/Idempotency-Key. Evaluation enforcement, generation admission, reconciliation and credit safeguards remain unchanged.
- Candidate includes the fail-closed OpenNext preview-props registry workaround, adapter 1.20.11 and Wrangler 4.151.0, recovery terminal-status fix, sanitized provider failure logging, Stripe 23 card-only Checkout compatibility, and explicit persisted invocation logging.
- Exact-SHA [Engineering quality gate](https://github.com/Victor-CS-Core/Filosage/actions/runs/39516328997): all four jobs successful, including Workers bundle smoke. Exact-SHA [security scan](https://github.com/Victor-CS-Core/Filosage/actions/runs/39516329015): successful.
- Prior [full browser regression](https://github.com/Victor-CS-Core/Filosage/actions/runs/39648980369) at `b6cbb06` was canceled during Browser matrix after the owner authorized receiver code/config changes, which require a new candidate. Earlier tier, command-center, shared-evidence and API lanes passed. No full-regression success is claimed for the old or new candidate yet.
- Production-targeted OpenNext build succeeds; actual bundled Workers runtime smoke with QA-shaped local bindings passes 4/4 (SSR, health, local-D1 readiness, 404). Production dry run emits byte-identical worker code. First local smoke correctly rejected an accidentally included development operations environment; rebuild excluded `.env.local`, preserving source and checks.
- Local unit 21/21, Python deployment tests 3/3, Chromium owner saved-request regression 1/1 and tracked-secret scan pass. Local WebKit archives downloaded but require missing system libraries on this Arch host; full hosted regression installs its own dependencies. Audit findings are confined to the existing accepted dev-only braces advisory chain; no exemption broadened.

## Cloudflare receiver implementation checkpoint

- New isolated Worker source/config: `infra/cloudflare/operations/`; dedicated D1 `filosage-operations` (`8b75b7b7-4e40-4a1e-8f1a-b5bdc5af5e83`) provisioned with only its operations metadata schema. Application storage is untouched.
- Email Routing configured on new `alerts.filosage.com` subdomain, reported ready. Account email destination is provider-verified. No personal destination address is committed. New Email Sending beta API returns 401/2036; native Email Routing binding is used instead.
- Receiver authenticates exact-byte HMAC, bounds bodies/schema/timestamps, persists metadata before acceptance and deduplicates sender-compatible identities. Raw messages/context are not retained or emailed. Atomic per-alert leases, bounded mail waits, durable retries/dead-letter and 30-day completed-metadata retention are implemented. Mail acceptance does not prove inbox receipt; crash/unknown-outcome retries are at least once.
- Twelve receiver tests pass, including real sender-envelope integration and slow/hung notification regressions. Independent reviewer rechecked both findings after fixes and found no remaining blocking correctness/security issues. Existing unit 21/21, deployment Python 3/3, focused operations/release contracts 33/33, TypeScript and lint (zero errors, four existing warnings) pass.
- Local native Workers receiver: health 200, signed POST 202, duplicate 200, simulated email binding acceptance recorded. Receiver dry run succeeds. Compatibility date 2026-10-19 is the newest supported by the repository-pinned local workerd; today's date was rejected rather than bypassed.
- No receiver/application code deployment, production secret update, application migration or production data mutation has occurred at this checkpoint. Commit and push this candidate, collect engineering/security evidence, dispatch full regression once engineering succeeds, then qualify hosted receiver and production application.

## Standing constraints and remaining work

- `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, `STRIPE_TAX_READY=false`. All five Spark activation flags stay false. Spark legal/provider, metered evaluation and activation gates remain separate and unapproved.
- Preserve production secrets, D1/R2 bindings, routes, user data and saved request identities. Never mix staging storage into production, bypass evaluation approval/idempotency/credit controls, deploy uncommitted source, or perform destructive migrations or unrelated refactoring.
- Remaining release work: finish full regression; deploy and qualify the approved Cloudflare receiver and verify delivery/configuration without exposing credentials; confirm frozen source and rollback details; authorized deployment; active-version, homepage/assets, health/readiness, billing/Spark and deployed-client verification; validated documentation commit/push distinct from deployed source SHA.
- Public health, source regression and deployed JavaScript inspection do not prove successful authenticated course generation. Do not claim that without direct evidence.
- Separate unresolved work: iOS lesson-sync acceptance on owner device; Cloudflare D1/R2 backup/restore proof; qualified launch-market legal/provider review before paid/public Spark expansion. Do not alter Azure resources or OpenAI proxy.

## Maintenance contract

Keep this snapshot current after meaningful milestones and before checkpoints or handoff. Replace stale facts; link detailed dated evidence. Distinguish local, committed, pushed, deployed and production-verified states. `docs/AGENT_PROGRESS.md` is historical. Git history retains prior current-state snapshots. Never commit credentials, personal data or private logs.
