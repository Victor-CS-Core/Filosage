# Resumed release readiness

Updated September 12, 2026, 11:00 UTC. Owner: Codex coordinator. The complete outcome remains checklist A–K in [AGENT_PROGRESS](../AGENT_PROGRESS.md). Current application work is draft [PR #22](https://github.com/Victor-CS-Core/Filosage/pull/22), with deployed QA source `c7d9c2c274bfcaee805332a83d94a208af32f09e`. The older `04723a6` worktree is historical evidence.

Victor requested continuation and set this effort as an active goal. He reaffirmed full permissions and asked to avoid repeated permission questions. Use that authorization for the presented QA correction and ongoing preparation; technical authentication and release evidence still have to work. No production-ready claim follows from permission alone.

## Source and CI

Scanner repair `929aad8` preserves the pinned image, offline scan, strict validation and private output while running the scanner with the invoking UID/GID and a writable HOME. Independent review and ten local regression cases passed. All five required jobs passed on exact `c7d9c2c`: [security](https://github.com/Victor-CS-Core/Filosage/actions/runs/34663630384), [engineering/static, PostgreSQL and browser smoke](https://github.com/Victor-CS-Core/Filosage/actions/runs/34663630394), and [wiki](https://github.com/Victor-CS-Core/Filosage/actions/runs/34663630427). Actual pinned Semgrep 1.177.0 passed six detector fixtures and the synthetic failure proof, then scanned 428 files with zero errors/findings.

Preserve PR #23's merged CI controls on main `ae1abe3`: full regression and CodeQL remain manual. No heavy workflow was dispatched. Supported Debian 12/Playwright 1.61.1/WebKit 26.5 executed the six pending cases: four passed and two failed. A focused unchanged diagnostic rerun passed both failures; traces implicate cold development-server reload timing, which is not deterministic release acceptance. The two focused checks subsequently passed against real QA production assets, with no retries in 12.6 seconds and a reviewed controlled-session fixture. The temporary test container needed its config included and Debian’s CA bundle installed; certificate checks remained enabled. Preserve all earlier matrix evidence.

## QA preparation

QA uses database `filosageqa`, Blob container `qa-course-banners`, and app `filosageqa-app` in `filosage-staging-central-rg`. Revision `filosageqa-app--qa-stripe-test-1` now serves the exact c7 source by immutable image digest `sha256:3d33eacc178c4e6323c957ab9fd1d81c2dd2f8e149b3b43bbe44e9b09a76bf14`. The image came from a verified git archive and was read back in the existing registry after push.

The new `filosageqa_runtime` login passed real login, exact privilege and nonownership checks, plus a DML probe rolled back without retaining a row. It has QA CONNECT, schema USAGE and only SELECT/INSERT/UPDATE/DELETE on `public.filosage_documents`; no DDL, elevated attributes or memberships. Existing owners and the old credential remain preserved for rollback. No PUBLIC or production database ACL changes were required.

The new credential was saved and verified in `database-url-qa-runtime-v2`, then bound to the QA revision. Administrator credentials were carried privately to the bounded bootstrap, never placed in the application environment or printed. QA's vault-wide secret-read role was replaced by eight exact secret grants. Actual probes on both the old and new c7 revisions read all eight required secrets and received 403 for four administrator/production database secrets; the separate c7 proof is qa-vault-access-c7d9c2c-precutover.json. The transitional old QA owner-secret app reference and exact secret-scope grant have now been removed. The owner-retirement probe proved seven required 200 responses and five denied 403 responses. After the approved TEST key binding, the actual new revision probe proves eight required 200 responses and the same five denied 403 responses; the only added grant is at the new TEST API key secret scope. Fresh health/auth/platform readbacks pass and unrelated state is preserved. The old Key Vault secret/version, database role and inactive revision remain; rollback first requires restoring the exact grant, proving access and restoring the pinned app secret reference. A private metadata-only rollback manifest records that sequence.

QA health is HTTP 200 with matching source version, digest, origin and release manifest; configuration and datastore are healthy. Actual startup logs confirm the database guard passed. Authentication configuration hashes match before and after deployment. Billing remains closed. Manual anonymous checks opened the public course outline and account-start modal, returned focus on Escape, and rendered explicit light/dark course views. These checks do not establish a real account sign-in or lesson participation.

## Stripe and hosted release gates

The Stripe plugin connects to Filosage account `acct_1TtgXPRANh4Mnfma`. TEST reads confirmed the existing four active USD Prices, dedicated QA webhook `we_1UENu8RANh4Mnfmav0d4Pf8k`, and Portal configuration `bpc_1UENu8RANh4Mnfmafj0zDVuU`. Reuse these objects.

The supplied authenticated Dashboard exposed the existing TEST API credential, which was saved to the approved QA Key Vault secret, verified against the account and four prices, and bound by immutable secret version to the new QA revision. No new Stripe credential was created. The plugin freshly verified the existing QA webhook and expanded Portal configuration. The existing QA signing secret is retained. Paid checkout and Stripe Tax remain disabled, with rollout closed.

Remaining acceptance includes owned-account sign-in and lesson return, hosted Azure light/dark behavior, and four-offer subscription checkout, cancellation/expiry, renewal/failure, recovery, and webhook handling. The supplied Azure session now reaches the exact QA customer tenant's branding controls. An unassigned fixed-light theme draft is prepared but unsaved: supported browser file-picker attempts timed out, so no CSS upload or theme was submitted. Current CLI branding authorization remains limited (AADSTS65002). No hosted identity, application assignment or default-branding change occurred. User-approved tax information does not need repeated onboarding; retain the documented integration-evidence gap until it is resolved.

## Recovered availability and verified TEST binding

Both QA and public initially timed out at their shared Azure environment address. Container Apps reported `ManagedClusterSuspended` while the subscription reported Enabled. They recovered without an activation, restart or deployment by this task. Real browser checks subsequently loaded QA home, the published course preview, library and pricing. Public recovered on its unchanged image.

The separate approved Stripe binding was applied once. Its first final check stopped while Azure still reported old c7 as active/Deprovisioning at zero traffic. Bounded read-only verification confirmed the old revision stopped and the new revision became the sole active Healthy target at 100%. No mutation was retried. Exact target managed-identity, health, image and auth checks passed. Canonical retained-revision comparisons prove the old 59 environment entries plus only seven reviewed additions, and an otherwise unchanged container/scale template. Saved baseline metadata proves the old application secrets and role IDs plus only the TEST key binding/grant. Current shared configuration and known historical invariants pass; no full historical shared-configuration snapshot was persisted, so complete historical byte equality is not claimed.

Azure app-show adds empty value fields beside some old secret references; the canonical runtime revision has the expected exclusive secret references and healthy datastore. Do not rerun the one-shot helper against the completed target.

The reviewed three-request synthetic webhook probe passed: bad signature 400, valid signed event 200, duplicate 200 with duplicate recognition. Exactly one QA event-evidence record is retained, without customer, learner or subscription changes. This does not establish actual Stripe delivery or the paid lifecycle. See the [sanitized recovery and TEST binding evidence](../research/artifacts/visitor-release-2026-09-11/qa-stripe-recovery-20260912.json).

## Manual Azure cleanup

Victor completed the unrelated cleanup. Azure records the resource-group deletion as Succeeded at 10:13:50 UTC on September 12, and a fresh existence check is false. This historical list is fulfilled, not outstanding:

| Resource | Type |
| --- | --- |
| `kbot-m0-crashlab` | Virtual machine |
| `kbot-m0-crashlab-osdisk` | Managed OS disk |
| `kbot-m0-crashlab-nic` | Network interface |
| `kbot-m0-crashlab-nsg` | Network security group |
| `kbot-m0-crashlab-vnet` | Virtual network |
| `shutdown-computevm-kbot-m0-crashlab` | VM shutdown schedule |

No deletion was performed by Codex. Preserve `filosage-staging-central-rg` and its managed environment resource group. `NetworkWatcherRG` is shared/uncertain and is outside this cleanup list.

## Tracking and deployment state

Owner: Codex coordinator. Track scope, progress, evidence and actual blockers in `AGENT_PROGRESS.md`, the persistent outcome checklist and PR22. Victor removed the mandatory Multica dependency on September 12. No external tracker item, synchronization event, connection or availability report is required; use Multica only on explicit request. Earlier tracking identifiers remain historical references.

Commit/push: checkpoint `81b37acd03bfb3d3d07054a484fcd02bee4945c8` is pushed to PR22 with all five required jobs green: engineering34668435830, security34668435863 and wiki34668435829. It corrected the earlier documentation contract failure without weakening the guard. Recovery/binding checkpoint `eb0e603` is committed and pushed with all five required jobs green (engineering34689894833, security34689894841, wiki34689894801). The subsequent tracking-policy edit requires its own checkpoint validation. Build/QA deployment: unchanged exact c7 image in the new Stripe TEST revision, healthy at 100%; old c7 revision retained and stopped at 0%. Public production: unchanged at old `93f60f24`; fresh post-outage HTTP 200 is baseline availability only. No public promotion, live billing activation or release completion is claimed. The active goal includes all remaining A–K gates. Sanitized QA evidence is retained under the ignored `.filosage-local/qa-resume-20260911/` directory; chronological attempts and limitations remain in the progress log. The [sanitized QA summary](../research/artifacts/visitor-release-2026-09-11/qa-resume-20260912.json) records committed evidence and hashes of the local execution artifacts.
