# Resumed release readiness

Updated September 12, 2026, 02:34 UTC. Owner: Codex coordinator. The complete outcome remains checklist A–K in [AGENT_PROGRESS](../AGENT_PROGRESS.md). Current application work is draft [PR #22](https://github.com/Victor-CS-Core/Filosage/pull/22), with deployed QA source `c7d9c2c274bfcaee805332a83d94a208af32f09e`. The older `04723a6` worktree is historical evidence.

Victor requested continuation and set this effort as an active goal. He reaffirmed full permissions and asked to avoid repeated permission questions. Use that authorization for the presented QA correction and ongoing preparation; technical authentication and release evidence still have to work. No production-ready claim follows from permission alone.

## Source and CI

Scanner repair `929aad8` preserves the pinned image, offline scan, strict validation and private output while running the scanner with the invoking UID/GID and a writable HOME. Independent review and ten local regression cases passed. All five required jobs passed on exact `c7d9c2c`: [security](https://github.com/Victor-CS-Core/Filosage/actions/runs/34663630384), [engineering/static, PostgreSQL and browser smoke](https://github.com/Victor-CS-Core/Filosage/actions/runs/34663630394), and [wiki](https://github.com/Victor-CS-Core/Filosage/actions/runs/34663630427). Actual pinned Semgrep 1.177.0 passed six detector fixtures and the synthetic failure proof, then scanned 428 files with zero errors/findings.

Preserve PR #23's merged CI controls on main `ae1abe3`: full regression and CodeQL remain manual. No heavy workflow was dispatched. Supported Debian 12/Playwright 1.61.1/WebKit 26.5 executed the six pending cases: four passed and two failed. A focused unchanged diagnostic rerun passed both failures; traces implicate cold development-server reload timing, which is not deterministic release acceptance. The two focused checks subsequently passed against real QA production assets, with no retries in 12.6 seconds and a reviewed controlled-session fixture. The temporary test container needed its config included and Debian’s CA bundle installed; certificate checks remained enabled. Preserve all earlier matrix evidence.

## QA preparation

QA uses database `filosageqa`, Blob container `qa-course-banners`, and app `filosageqa-app` in `filosage-staging-central-rg`. Revision `filosageqa-app--qa-c7d9c2c-1` now serves the exact c7 source by immutable image digest `sha256:3d33eacc178c4e6323c957ab9fd1d81c2dd2f8e149b3b43bbe44e9b09a76bf14`. The image came from a verified git archive and was read back in the existing registry after push.

The new `filosageqa_runtime` login passed real login, exact privilege and nonownership checks, plus a DML probe rolled back without retaining a row. It has QA CONNECT, schema USAGE and only SELECT/INSERT/UPDATE/DELETE on `public.filosage_documents`; no DDL, elevated attributes or memberships. Existing owners and the old credential remain preserved for rollback. No PUBLIC or production database ACL changes were required.

The new credential was saved and verified in `database-url-qa-runtime-v2`, then bound to the QA revision. Administrator credentials were carried privately to the bounded bootstrap, never placed in the application environment or printed. QA's vault-wide secret-read role was replaced by eight exact secret grants. Actual probes on both the old and new c7 revisions read all eight required secrets and received 403 for four administrator/production database secrets; the separate c7 proof is qa-vault-access-c7d9c2c-precutover.json. The transitional old QA owner-secret app reference and exact secret-scope grant have now been removed. The final strict-redirect managed-identity probe proves seven required 200 responses and five denied 403 responses. Fresh health/auth/platform readbacks pass and unrelated state is preserved. The old Key Vault secret/version, database role and inactive revision remain; rollback first requires restoring the exact grant, proving access and restoring the pinned app secret reference. A private metadata-only rollback manifest records that sequence.

QA health is HTTP 200 with matching source version, digest, origin and release manifest; configuration and datastore are healthy. Actual startup logs confirm the database guard passed. Authentication configuration hashes match before and after deployment. Billing remains closed. Manual anonymous checks opened the public course outline and account-start modal, returned focus on Escape, and rendered explicit light/dark course views. These checks do not establish a real account sign-in or lesson participation.

## Stripe and hosted release gates

The Stripe plugin connects to Filosage account `acct_1TtgXPRANh4Mnfma`. TEST reads confirmed the existing four active USD Prices, dedicated QA webhook `we_1UENu8RANh4Mnfmav0d4Pf8k`, and Portal configuration `bpc_1UENu8RANh4Mnfmafj0zDVuU`. Reuse these objects.

The plugin's OAuth access supports provider operations but does not provision a durable server API credential. The deployed QA app still needs a TEST credential placed securely in the vault. Do not ask Victor to paste it into chat. Preserve the existing signing secret and closed billing configuration until the complete hosted test matrix passes.

Remaining acceptance includes owned-account sign-in and lesson return, hosted Azure light/dark behavior, and four-offer subscription checkout, cancellation/expiry, renewal/failure, recovery, and webhook handling. Both customer tenants remain without branding themes. Current CLI reads work, but its OAuth client cannot obtain the branding write scope (AADSTS65002); no hosted identity or theme mutation is claimed. User-approved tax information does not need repeated onboarding; retain the documented integration-evidence gap until it is resolved.

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

Commit/push: the reviewed fixture and QA evidence are pushed in checkpoint `5ebaf9f` on PR22. Its security, wiki and PostgreSQL checks passed; a historical vendor label caused the sole contract failure and was corrected without changing the guard. The documentation correction requires its own subsequent CI. Build/QA deployment: exact c7 digest deployed and healthy. Public production: unchanged at old `93f60f24`; its earlier HTTP 200 is baseline availability only. No public promotion, live billing activation or release completion is claimed. The active goal includes all remaining A–K gates. Sanitized QA evidence is retained under the ignored `.filosage-local/qa-resume-20260911/` directory; chronological attempts and limitations remain in the progress log. The [sanitized QA summary](../research/artifacts/visitor-release-2026-09-11/qa-resume-20260912.json) records committed evidence and hashes of the local execution artifacts.
