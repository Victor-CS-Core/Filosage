# Resumed release readiness

Recorded September 12, 2026, 00:51 UTC. Owner: Codex coordinator. The complete outcome remains checklist A–K in [AGENT_PROGRESS](../AGENT_PROGRESS.md). Current application work is draft [PR #22](https://github.com/Victor-CS-Core/Filosage/pull/22), resumed from `56e56e209869aec23a4d6b5b48160f2ebcf5fdbc`. The older `04723a6` QA worktree is retained as historical evidence, not the selected release source.

Victor requested continuation and set this effort as an active goal. He reaffirmed full permissions and asked to avoid repeated permission questions. Use that authorization for the presented QA correction and ongoing preparation; technical authentication and release evidence still have to work. No production-ready claim follows from permission alone.

## Source and CI

At the resumed head, engineering/static, PostgreSQL, browser smoke, and wiki checks passed. Security run `34652732361` failed because the scanner produced no readable JSON report after nine report tests and six detector fixtures passed. The immediate task is a minimal correction that retains the pinned Semgrep image, offline scan, strict inventory/report validation, synthetic failure test, and private output directory. Record the final repair commit and exact-head CI in the progress log.

Preserve PR #23's merged CI controls on main `ae1abe3`: full regression and CodeQL remain manual. Run the full regression once the release candidate and hosted prerequisites are ready. Six Windows WebKit keyboard preflights still need supported Linux evidence. This host is Omarchy/Arch; a browser download by itself is not that evidence.

## QA preparation

Read-only checks confirmed QA uses database `filosageqa`, Blob container `qa-course-banners`, and app `filosageqa-app` in `filosage-staging-central-rg`. The old deployed source is `93f60f24`; no new candidate has been deployed in this continuation.

The current login `filosageqa_app` owns its database/table and has CREATE privileges, so the candidate's startup privilege guard rejects it. The reviewed correction creates a separate `filosageqa_runtime` login with QA CONNECT, schema USAGE, and only SELECT/INSERT/UPDATE/DELETE on `public.filosage_documents`. Preserve existing owners and the old secret for rollback. Fresh ACL reads show no PUBLIC revocation is needed. The production database grants PUBLIC neither CONNECT nor CREATE. The proposed role was absent.

The new credential should use a new `database-url-qa-runtime-v2` secret and bind only to the new QA candidate. Do not inject administrator credentials into application environment variables. The vault contains `database-admin-url` and `postgres-admin-password`; only their names were inspected in the resumed inventory. Provisioning needs a secure channel into the private database. No role, grant, secret, or revision mutation has yet occurred.

The earlier local build terminal exited before producing verified build/push/image evidence. Do not treat its stale status file as success or restart it against the superseded `04723a6` source.

## Stripe and hosted release gates

The Stripe plugin connects to Filosage account `acct_1TtgXPRANh4Mnfma`. TEST reads confirmed the existing four active USD Prices, dedicated QA webhook `we_1UENu8RANh4Mnfmav0d4Pf8k`, and Portal configuration `bpc_1UENu8RANh4Mnfmafj0zDVuU`. Reuse these objects.

The plugin's OAuth access supports provider operations but does not provision a durable server API credential. The deployed QA app still needs a TEST credential placed securely in the vault. Do not ask Victor to paste it into chat. Preserve the existing signing secret and closed billing configuration until the complete hosted test matrix passes.

Remaining acceptance includes exact candidate health/startup identity, owned-account sign-in and lesson return, hosted Azure light/dark behavior, and four-offer subscription checkout, cancellation/expiry, renewal/failure, recovery, and webhook handling. User-approved tax information does not need repeated onboarding; retain the documented integration-evidence gap until it is resolved.

## Manual Azure cleanup

Victor will handle unrelated cleanup. Prior dependency inspection and the refreshed inventory identify these six resources in `kbot-m0-recovery-lab` as unrelated to Filosage:

| Resource | Type |
| --- | --- |
| `kbot-m0-crashlab` | Virtual machine |
| `kbot-m0-crashlab-osdisk` | Managed OS disk |
| `kbot-m0-crashlab-nic` | Network interface |
| `kbot-m0-crashlab-nsg` | Network security group |
| `kbot-m0-crashlab-vnet` | Virtual network |
| `shutdown-computevm-kbot-m0-crashlab` | VM shutdown schedule |

No deletion was performed. Preserve `filosage-staging-central-rg` and its managed environment resource group. `NetworkWatcherRG` is shared/uncertain and is outside this cleanup list.

## Tracking and deployment state

Primary Multica sync key: `filosage-visitor-audit-20260911`; related QA key: `filosage-public-release-2026-09-11`. Owner: Codex coordinator. Status: in progress. Multica tool/CLI is unavailable; no delivered item or queued event is claimed.

At this record: repair changes are local; no new commit or push is claimed; no new image build, QA deployment, public deployment, traffic switch, or billing activation occurred. Public health returned HTTP 200 on old `93f60f24`, which is baseline availability evidence only. See subsequent progress-log checkpoints for changes to these states.
