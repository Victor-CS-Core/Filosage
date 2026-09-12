# Public release and monetization readiness

> Historical September 11 recovery record, preserved during September 12 branch consolidation. Later evidence and instructions in [AGENT_PROGRESS.md](../AGENT_PROGRESS.md) supersede pending states and older tracker requirements here. This record grants no new operational authorization.

Owner: Codex coordinating local implementation.

User scope: prepare Filosage for public release with monetization ready; retain desktop project center work. No live billing activation or production deployment yet.

- [ ] Audit public discovery, signup, subscription checkout, entitlements, cancellation, webhooks, and release gates.
- [ ] Fix actionable local implementation gaps with regression tests.
- [ ] Run billing, contract, lint, typecheck, build and relevant browser checks.
- [ ] Record remaining hosted configuration and commercial launch evidence.
- [ ] Prepare concrete release handoff and final activation/deployment decision.

Multica: no filosage_multica_event tool or Multica CLI is available in this session. This file is a local recovery record, not a delivered or queued Multica event. Stable sync key for eventual delivery: filosage-public-release-2026-09-11. Continue safe local work under AGENTS.md fallback.

State: started. No commits, push, deployment, billing activation, or production verification performed.

## Verified local results

- Production build: passed, 87 static pages. Initial worktree symlink dependency error resolved by copying the same locked dependencies into the worktree.
- Lint and TypeScript: passed.
- Billing: 26 passed; contract suite: 454 passed; API: 11 passed; Chromium smoke: 33 passed with no retries.
- Evaluation budget: 27 passed; lesson integrity: 22 passed; durable lesson operations: 11 passed. Evaluation harness command also completed; no live provider generation was run.
- npm audit: zero vulnerabilities. Tracked secret scan passed; support wiki: 19 articles validated.
- Corrected the publication-proof wrapper reporter for Node 26 and stale card-only payment-method documentation.
- Full browser/mobile matrix, PostgreSQL integration, live provider transactions, hosted learner acceptance, and production deployment were not performed in this session.

## Desktop deliverable

Project Center installed with Super+Ctrl+Shift+P and launcher entry. Source: /home/ktr0nn/Work/omarchy-project-center. Native GTK interface, 13 regression tests passed, independent review findings fixed. Filosage uses this release worktree; original main checkout remains unchanged. previous product local web/API startup verified, 109 web tests passed. Services stay running independently of the window; Stop is functional and deliberately stops only the owned project service.

## Hosted findings

Read-only Azure/Stripe account inspection is available. Billing audit report contains current hosted state and precise proposed next-stage changes. Current staging revision differs from this local candidate. Public release remains incomplete; live billing remains closed.

No commits or pushes have been made. No deployment, provider configuration, production data, secret changes, billing activation, or outgoing messages performed.

## Approved QA execution

User explicitly said proceed after approving isolated QA candidate deployment and Stripe TEST integration. Allowed: QA-only configuration/secret bindings, dedicated test Portal/webhook, test-mode lifecycle rehearsal. Live billing stays closed; public filosagestg-app and legacy Stripe objects remain unchanged. First verify database/storage isolation. Owner: Codex. Status: in progress.

## Additional authorized cleanup

User requested deletion of Azure resources unrelated to Filosage. Inventory/dependency audit delegated; only confirmed unrelated resources will be deleted. Shared/uncertain resources require evidence first.

QA deploy candidate committed locally as 04723a6f1207b420799dce266f70f9ddf767c92a. No Git push. Exact committed tree exported for image build. ACR Tasks denied by Azure subscription policy; local Docker fallback underway. QA isolation verified from KeyVault database URL path /filosageqa and qa-course-banners, with canonical qa.filosage.com preserved.

## QA execution checkpoint — awaiting user input

- Dedicated Stripe TEST webhook we_1UENu8RANh4Mnfmav0d4Pf8k and Portal bpc_1UENu8RANh4Mnfmafj0zDVuU created and verified. Canonical QA address stays https://qa.filosage.com. Existing legacy Stripe objects unchanged.
- QA app now stores stripe-qa-webhook-secret. Azure read-back verified secret name, original image and registry preserved. No API credential or environment binding yet; no integration-readiness claim.
- No durable Stripe key exists in KeyVault. Secure Foot prompt Filosage QA Stripe key accepts hidden TEST RAK entry into mode0600 /tmp/filosage-qa-api-key. Pending user input. Signing secret remains in private /tmp/filosage-qa-stripe-secrets.json for subsequent binding.
- ACR managed build blocked by Azure TasksOperationsNotAllowed. Local Docker requires OS privilege. Initial auto-review timed out; allowed retry reached OS authentication. The hidden pkexec wait was stopped and replaced by visible Foot terminal Filosage QA container build running /tmp/filosage-qa-build.sh. Pending user Linux password; build status will be /tmp/filosage-qa-docker-build.status, logs /tmp/filosage-qa-docker-build.log.
- Candidate exact source commit 04723a6f1207b420799dce266f70f9ddf767c92a. Exported build context /tmp/filosage-qa-build-04723a6f1207b420799dce266f70f9ddf767c92a. Expected image filosagestp4ujucgnxq3gsacr.azurecr.io/filosage-qa:04723a6f1207b420799dce266f70f9ddf767c92a. Not yet built/pushed/deployed.
- Private rollback config /tmp/filosage-qa-before.json; original QA image SHA 93f60f24afe59b19b6a592f455a09e8e813f1f84.
- Azure inventory: 42 resources in 4 groups; confirmed unrelated expired Kbot group has 6 resources and no cross-project dependencies. Delete attempt was rejected BEFORE execution by automatic approval review, which required exact group approval for permanent VM/disk destruction. Async explicit approval requested for kbot-m0-recovery-lab; no answer received at this checkpoint. No resources deleted. Shared East US 2 watcher preserved pending ownership evidence.

Next: consume user inputs without printing secrets; build/push exact image, bind durable TEST credential and new webhook secret plus dedicated Portal/test Price IDs to QA, retain closed checkout/tax flags and existing QA canonical/auth isolation, deploy by immutable digest, verify health/signatures/lifecycle. Delete Kbot only after exact group approval; verify group absence and Filosage resource health. Live billing and public deployment remain unauthorized.

Commit: local candidate only. Git push: none. Image push/deployment: pending. Provider TEST changes: dedicated objects complete. QA secret storage: signing secret complete. Public/Live mutations: none. Multica unavailable; same local recovery record.


## Resumed Codex continuation — September 11 evening

Victor requested continuation from this log, then asked for the unrelated Azure-resource list for manual deletion and directed Codex to continue production deployment/release readiness. The exact six Kbot resource names were freshly read and delivered. No deletion was attempted.

Fresh work and complete remaining outcomes are recorded in [resumed readiness](2026-09-11-resumed-readiness.md). The [QA runtime proposal](2026-09-11-qa-runtime-proposal.md) is independently reviewed and ready for the specific bootstrap approval.

- 26 billing tests genuinely passed; exact source archive and manifest/build defaults verified.
- Existing Stripe TEST webhook, Portal and all four Prices verified; plugin connected. Plugin exposes no durable API-key provisioning operation; deployed server still requires a restricted TEST credential.
- QA database/storage isolation confirmed. Candidate startup guard was actually run read-only against QA and failed: current runtime owns its database/table and can CREATE. Proposed absent role filosageqa_runtime plus new database-url-qa-runtime-v2 secret avoids owner/data/public-ACL/production changes. Await exact bootstrap approval before creating role or binding credential.
- Public health is HTTP 200 on old version 93f60f24; exact blue/green 100/0 routing preserved. QA external health timed out, while container/database reads succeeded. Exact candidate has no GitHub CI runs.
- Missing temporary artifacts were rebuilt from exact Git source. First restored terminal windows closed before build/key completion; no image or key completion is claimed. A bounded build terminal was reopened with stage/result retention. Password/key input remains an actual prerequisite; do not treat a launched prompt or a bare status file as successful work.

Same Multica sync key filosage-public-release-2026-09-11; CLI/tool unavailable, no event/outbox fabricated. Owner: Codex; state: blocked on QA bootstrap approval/credential/build prerequisites, with local verification and manual cleanup list complete. Existing candidate commit only; no new Git commit or push; no image push verified; no QA or production deployment; no live billing activation. Production evidence is old-version health/readback only, not release acceptance.
