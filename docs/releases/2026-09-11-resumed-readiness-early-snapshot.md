# Filosage resumed release readiness — September 11, 2026

> Historical September 11 recovery record, preserved during September 12 branch consolidation. Later evidence and instructions in [AGENT_PROGRESS.md](../AGENT_PROGRESS.md) supersede pending states and older tracker requirements here. This record grants no new operational authorization.

Owner: Codex coordinator. Request: recover the prior agent's log and continue through release readiness; Victor will manually handle unrelated Azure-resource deletion. This report supplements `2026-09-11-readiness-progress.md` and preserves the full original release scope. The release is not production-ready yet.

Multica: `filosage-public-release-2026-09-11`; tool and CLI unavailable. No issue ID, queued event, or successful delivery is invented. Local lifecycle: blocked on QA runtime provisioning approval and credentials; candidate verification and manual-cleanup inventory completed.

## Recovered candidate and current source

- Existing release worktree: `/home/ktr0nn/Work/filosage-release`, branch `feat/public-release-readiness`.
- Candidate: `04723a6f1207b420799dce266f70f9ddf767c92a`, tree `0bdb5de9025d91fdf5ffc70ea100e3cdb5ccfe73`.
- Main: `ae1abe3d5d3f51fa7e0bdf004972a9555852166e`, with newer CI cost controls. Candidate is one commit beyond their common source, while main has four later commits; neither branch was rewritten or merged during this continuation.
- Four prior untracked release reports were preserved. The completed desktop Project Center is preserved.

## Fresh verification

- Billing: 26 tests passed, zero failures/skips/cancellations; actual case execution confirmed outside the read-only worktree sandbox. Node 26.8.1/npm 11.19.0.
- Source export exactly matches committed candidate; Docker defaults match the committed capability manifest. QA must compile with `NEXT_PUBLIC_SITE_URL=https://qa.filosage.com` and full `SITE_VERSION`.
- GitHub Actions returned zero runs for the exact candidate SHA. Local tests are not exact-SHA CI.
- Earlier build, 454-contract, lint/typecheck, API, browser smoke, and security results remain historical; no full browser/mobile or PostgreSQL integration pass is claimed here.
- Public health returned HTTP 200, `ok=true`, configuration/datastore healthy, version `93f60f24afe59b19b6a592f455a09e8e813f1f84`, origin `https://filosage.com`, auth mode `migration-dual`. This is the old production artifact, not acceptance of the new candidate.
- Public Azure app still uses exact green 100% / blue 0% routing; current digest is `sha256:0c006852322a91d5e2540cfd27ab58e47dad33a3a1f793fd6afc1e2240bbadf2`.

## QA findings and concrete blocker

QA remains on `filosageqa-app--qa-93f60f24-1` at the older image. Its canonical domain is `https://qa.filosage.com`, database is `filosageqa`, Blob container is `qa-course-banners`, and its managed identity/secret references are QA-specific where required. A bounded external health GET timed out after 20 seconds; container exec and read-only PostgreSQL queries succeeded. The external route remains an acceptance gate.

The candidate startup verifier was transpiled with installed TypeScript and run against the existing QA database in a read-only transaction. It failed for the intended privilege guard:

| Check | Actual result |
|---|---|
| Required document columns / primary key | Compatible |
| All four table DML permissions | Available |
| Runtime login | `filosageqa_app` |
| Database and document-table owner | `filosageqa_app` |
| Public-schema owner | `azure_pg_admin` |
| Runtime schema/database CREATE | Both true |
| Elevated role membership | False |
| Candidate runtime permission acceptance | Failed |

A distinct `filosageqa_runtime` login with QA-only CONNECT, schema USAGE and exact-table DML avoids changing existing ownership. The name is currently unused. QA PUBLIC has no CREATE grants; production `filosage` PUBLIC has no CONNECT/CREATE. No PUBLIC revoke or production ACL change is needed. Some Azure/system databases retain their default PUBLIC CONNECT; do not claim universal no-connect isolation.

The reviewed proposal is `2026-09-11-qa-runtime-proposal.md`. Scope: create the non-owner login on `filosagestg-p4ujucgnxq3gs-pg`, grant only QA permissions, store a new `database-url-qa-runtime-v2` secret/reference, and bind only the candidate revision. Preserve existing owners, data, old QA secret and rollback revision. Exact bootstrap/secret binding approval remains required before execution; no ownership transfer is proposed.

## Stripe and image build

- Existing dedicated TEST webhook `we_1UENu8RANh4Mnfmav0d4Pf8k` remains enabled at the QA billing webhook route with all 15 required events and API version `2026-07-29.dahlia`.
- Existing TEST Portal `bpc_1UENu8RANh4Mnfmafj0zDVuU` retains price-only immediate `always_invoice` changes, unchanged anchor, period-end cancellation, history/recovery, and the exact four-Price catalog.
- The Stripe plugin is connected to Filosage TEST account `acct_1TtgXPRANh4Mnfma`. It freshly verified all four Prices: USD 9.99/month, 79.92/year, 14.99/month, 119.88/year; active, recurring, TEST, exclusive tax behavior.
- Plugin searches for restricted/API-key provisioning found no available operation. MCP authorizes the agent; the server still needs its own durable restricted TEST credential. No Stripe-named credential exists in the vault; existing QA webhook secret storage is preserved.
- Secure helper scripts and evidence are saved outside Git under `/home/ktr0nn/Work/Filosage/.filosage-local/qa-resume-20260911`. The TEST key prompt writes directly to the existing Key Vault, never chat/source/logs. It has not reported a successful key write.
- The prior temporary build/secrets files disappeared. The exact candidate was re-exported. The expected ACR tag was absent at readback. Docker requires local administrator authentication; no sudo/group policy was changed.
- Both first restored terminal windows exited with SIGHUP before completion. A misleading EXIT-only status was explicitly rejected as success because no build/push/image artifact existed. The build script now records stages and distinct HUP/INT/TERM failures; the build terminal was reopened with its result retained on screen. A launched terminal is not build or push evidence.

## Manual Azure cleanup list

Fresh readback confirmed these six resources in resource group `kbot-m0-recovery-lab`; the prior dependency audit identified the group as an expired Kbot lab unrelated to Filosage:

| Resource | Type |
|---|---|
| `kbot-m0-crashlab` | Virtual machine |
| `kbot-m0-crashlab-osdisk` | OS disk |
| `kbot-m0-crashlab-nic` | Network interface |
| `kbot-m0-crashlab-nsg` | Network security group |
| `kbot-m0-crashlab-vnet` | Virtual network |
| `shutdown-computevm-kbot-m0-crashlab` | Shutdown schedule |

Victor requested this list for manual deletion. No deletion is attempted by this continuation. Group deletion includes permanent loss of the VM disk's data. Preserve `NetworkWatcherRG`, `filosage-staging-central-rg`, and `ME_filosagestg-environment_filosage-staging-central-rg_centralus`; shared/uncertain regional monitoring is not classified as disposable.

## Remaining release outcome checklist

- [x] Recover approved work, preserve both worktrees and prior reports.
- [x] Fresh billing/candidate/manifest verification and current provider-state readbacks.
- [x] Deliver exact manual-cleanup inventory; cleanup now belongs to Victor.
- [ ] Approve and execute the reviewed QA non-owner runtime provision; rerun exact startup verifier and rolled-back DML test.
- [ ] Finish exact QA image build/push; verify immutable digest and QA origin/manifest.
- [ ] Bind durable TEST credential, existing webhook secret, Portal and four Price IDs only to QA; keep checkout/rollout/tax closed.
- [ ] Deploy QA by digest, preserve auth fingerprint and rollback state; establish external QA reachability and exact health.
- [ ] Run hosted signed TEST lifecycle, four-offer transitions, recovery/cancellation/deletion, and real signed-in learner/privacy flows with approved accounts.
- [ ] Freeze the production source including current main CI controls; obtain required exact-SHA engineering, PostgreSQL and full regression evidence.
- [ ] Close the seven hosted production proof gates: auth/privacy, learner journey, publication, billing containment, operations/probes/alerts, recovery/rollback, write compatibility.
- [ ] Retain qualified commercial/legal/tax review, real notice/support delivery, named operations owners, measured restore/rollback, flagship and non-owner learner acceptance.
- [ ] Present exact reviewed production image, traffic-swap/rollback packet and activation decision; perform authorized promotion only after its gates pass.
- [ ] Record post-promotion signed-in/monitoring evidence. Keep live billing activation separately explicit.

Commit: existing local candidate only; no new commit. Git push: none. Image push: unverified/pending. QA deployment: none in this continuation. Public deployment/traffic change: none. Billing activation: none. Production verification: bounded old-version health and management-plane readback only, not release acceptance. Remaining blockers/approvals are listed above; the release is not declared complete.
