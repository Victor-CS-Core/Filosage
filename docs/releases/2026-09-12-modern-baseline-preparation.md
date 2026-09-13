# Modern baseline and maintenance preparation

Status: replacement image is built and verified; maintenance has not started. This packet implements preparation approved by Victor and preserves the full R1–R9 checklist. It supplements the [transition sequence](2026-09-12-maintenance-transition.md). The exact read-only observer operation is now ready for independent review in [the execution procedure](2026-09-13-maintenance-execution.md). Live fence/drain and modern cutover are separate execution gates.

## Frozen replacement

- Source: `7c48bc02ff6623a81fee382b194864f1d04b76c0`, frozen branch `codex/modern-baseline-20260912`.
- Engineering `34720284493` and security `34720284478`: successful on that exact source.
- Full regression: `34720798392` succeeded on the exact source. Downloaded artifact checksum and embedded source match: 457 direct passes, one retry pass, nine declared skips and no unexpected final failures. The first-attempt navigation timeout has no retained network trace; the cause remains unknown and the permitted retry passed. No code change was justified. Actual review-page navigation and optimized-server checks remain in hosted acceptance. [Report verification](../research/artifacts/release-readiness-20260912/modern-baseline-full-regression-20260912.json). Earlier results do not substitute for this source.
- Image: `filosagestp4ujucgnxq3gsacr.azurecr.io/filosage@sha256:95cc9529e6abcfdef5918f39996cfed55703e5b29b82d75304a69765c844b344`.
- ACR build `cj1` succeeded at 21:52:59 UTC. One build submission; registry tag, immutable digest and task output match. [Provenance](../research/artifacts/release-readiness-20260912/modern-baseline-image-20260912.json).
- OCI manifest and configuration hashes verify Linux amd64, source label, `nextjs` user, 15 capability settings and startup `node scripts/verify-azure-database.ts && exec node server.js`. No container execution is implied. [Configuration verification](../research/artifacts/release-readiness-20260912/modern-baseline-image-config-20260912.json).

The prepared image is baseline B. The final candidate C remains separately identified through the standard stage workflow once B is a verified compatible predecessor; the existing stage workflow builds C. Each image is built once and promotion must reuse C's digest. Neither old legacy image is an acceptable fallback after modern writes.

## Exact production targets and retained state

Subscription `bfc8f890-2681-43dc-8eac-51644341ae12`; group `filosage-staging-central-rg`; app `filosagestg-app`; ARM API `2025-01-01`.

Current green `filosagestg-app--green-93f60f24-1` carries 100%; blue `filosagestg-app--blue-7abae96f-1` carries 0%. Both revisions are active. Keep authentication `migration-dual`, all existing identity/provider registrations, capabilities, closed checkout, CPU/memory and minimum 0 / maximum 3 replicas scaling.

The [prepared controls record](../research/artifacts/release-readiness-20260912/transition-prepared-controls-20260912.json) pins app/configuration/template/authentication fingerprints, traffic, managed identity, new secret version, old secret reference and the single legacy-secret assignment. Configuration snapshots and the operator's actual address are private in the coordinator's ignored `.filosage-local/transition-20260912/` directory, mode 0600. No credential values were extracted. Recheck every fingerprint and the operator address immediately before execution; drift invalidates this packet.

## Maintenance entry and restoration

The proposed access change is one operator IPv4 `/32` Allow rule named `release-maintenance-operator-20260912`. Fresh DNS resolved all seven public/default/label/revision origins to the same Azure ingress address; the operator probe has no HTTP proxy environment. This supports the proposed direct-ingress path but does not prove enforcement.

Prepared private files:

- `ingress-restrict.private.json`: patch only `properties.configuration.ingress.ipSecurityRestrictions` with the one exact Allow rule.
- `ingress-restore.private.json`: restore that field to the captured empty list. It does not replace authentication, traffic, secrets or the whole app configuration.
- `before-app.private.json`, `before-auth.private.json`, `operator-network.private.json`: exact private comparison and recovery inputs.

The proposed write is `az rest --method patch` to the exact app ARM URL with `--body @<prepared-private-patch>`, subscription pinned, logs/telemetry disabled and response suppressed. Compare the whole app before/after and allow only that one field to differ. The restore operation uses the same target and its paired patch. Do not execute either automatically from a documentation check.

Azure documents that Allow rules admit only their specified ranges and that blocked clients receive an access-denied response. This plan therefore causes a visible access-denied maintenance interval, not a custom maintenance page. [Microsoft ingress restriction documentation](https://learn.microsoft.com/en-us/azure/container-apps/ip-restrictions).

Proposed allowed vantage: the operator's current `/32`. Proposed denied vantage: the existing QA container's outbound HTTP connection, after independently pinning its revision/image and verifying its egress differs. No QA settings or credentials need changing. The reviewed probe ran at 22:07 UTC and confirmed a different egress address using hashes only. Public/default/green health returned 200; both blue platform paths timed out, which is not denial evidence. [Vantage baseline](../research/artifacts/release-readiness-20260912/transition-qa-vantage-20260912.json). Never allow an Azure-wide range or shared proxy range to make a probe pass.

After restriction, require the expected deny response from that second vantage at every current origin, including `/`, `/api/health`, `/.auth/me` and callback/API paths. Exercise other methods only while denial is expected, using no real account/payment payload. From the allowed vantage, check only harmless health/platform paths until the old writers are drained. Platform404, redirects, DNS failures and timeouts do not prove the IP rule denied access. Re-inventory any newly created revision origin and repeat coverage before application testing.

## Writer inventory and drain

[Origin evidence](../research/artifacts/release-readiness-20260912/transition-origins-20260912.json) records seven origins. Public/green health returned 200. Old blue health timed out within 20 seconds; platform authentication paths returned 404 and www redirected. Do not call blue healthy or treat its timeout as isolation. App HTTP probes can wake a min0 legacy revision and its startup; baseline probing must finish before the final drain, and no old app endpoint may be probed after deactivation.

Azure subscription/resource-group inventory found only the production and QA apps, no Container App Jobs, Functions, Logic Apps, VMs or queue services. Only backup observation and wiki automation are scheduled in the legacy/current repository workflows; no server interval worker was found in source. These observations do not enumerate arbitrary external scripts or prove a drain.

The [read-only database observation](../research/artifacts/release-readiness-20260912/transition-writers-20260912.json) found 510 documents, no selected unfinished generation/deletion/upload/AI/billing work, and no installed `pg_cron` in the production database. Eight documents contain top-level lease fields; all 16 projected lease/sibling fields were null or missing, with no future timestamp. Nested locks and unknown statuses remain outside that classification. Shared administrator sessions exist and are not yet attributed to a revision. Never terminate all sessions belonging to that shared owner.

The [live Stripe inventory](../research/artifacts/release-readiness-20260912/transition-stripe-inventory-20260912.json) contains one enabled callback, `we_1TwwFXRANh4MnfmajnqAdEA3`, at `https://filosage.com/api/billing/webhook`, and zero subscriptions across all statuses. Preserve the endpoint and signing secret. During restriction, do not return a false success for undelivered events; retain and reconcile delivery/provider outcomes before reopening. No new billing activation or subscription creation is part of the transition.

Before entry, establish exclusive operator control: no concurrent deployment/import/bootstrap/SQL/Blob/admin script or manual provider operation. Recheck GitHub runs, Azure jobs/activity and every consumer with private-network access. QA must retain its separate database/runtime identity and denial of production credentials. Unknown consumers or provider work stop entry.

After the complete fence is verified, allow at most 15 minutes for in-flight requests, provider calls, work leases and mutations to settle. Recheck aggregate work and provider outcomes, not just database active-query counts. Proposed deactivation targets are exactly the two old revision names above, through `az containerapp revision deactivate`; verify zero old replicas/processes and no attributable old sessions. Same-user ambiguity stops progress. The 15-minute drain limit is not a total-outage estimate.

## Baseline startup and credential transition

Only after the fence and complete drain:

1. Add app secret reference `database-url-runtime-v1`, using the exact version URL and existing production identity from the controls record. Preserve all other references.
2. Copy the captured green template into proposed revision `filosagestg-app--green-7c48bc02ff66-baseline-1`, using the immutable image above. Set `DATABASE_URL=secretref:database-url-runtime-v1`, `DATABASE_POOL_MAX=2`, exact `SITE_VERSION` and `RELEASE_IMAGE_DIGEST`, production origin, the 15 manifest settings and closed-billing settings. Preserve existing featured-course selection, identity/auth and scaling. Use the normal image command; do not override startup or run the bootstrap target.
3. Check routing immediately after revision creation. If the platform changes explicit weights while all predecessors are inactive, stop under the fence; do not claim zero-traffic staging or silently continue. Verify the new origin remains restricted before any learner request.
4. Require the read-only schema/capacity startup marker, exact SHA/digest/manifest health, real learner sign-in/access/persisted progress, privacy/publication/accounting checks and controlled concurrency evidence. Initial health alone does not establish B.
5. Before declaring B least-privilege accepted or reviewing/promoting C, once all surviving modern revisions reference only the restricted credential, remove the old app secret reference `database-url` and only assignment `353dc70c-614f-5df9-8163-954be81d9121` at its exact old-secret scope. Prove production can still read every required secret and cannot read the administrator secret; QA denial and unrelated grants must remain intact. Preserve the vault secret/version and shared database owners for separately reviewed recovery.
6. Only after B acceptance including the preceding access-denial proof, bind the modern baseline as the green predecessor under the maintained fence. Run the standard candidate C stage/review/promote sequence with separately bound C artifacts and all seven hosted gates.

All creation/binding/removal steps are proposed, not executed. The probe locations, real non-owner recovery and selected-point recovery targets are verified. Actual fence/drain and production hosted acceptance remain execution gates; use the current execution procedure for the observer and exact prepared patches.

## Recovery, interruption and remaining dependencies

Before any modern write, failed entry/drain can restore the exact captured restriction/caller state and the verified old green revision, then recheck public health and sign-in. After modern writes, keep maintenance in place on ambiguity and use only a verified modern B as fallback. Restoring a database is a separate operation that must reconcile newer commits and provider obligations.

The [selected-point recovery artifact](../research/artifacts/release-readiness-20260912/selected-point-recovery-consistency-20260912.json) closes the approved rehearsal: all522baseline documents matched; all13banner references matched unchanged source objects predating the restore point; committed-state coverage age22.712seconds and real non-owner learner recovery23minutes13seconds meet the approved15minute/60minute targets. Owned recovery resources and callback were removed. Do not repeat that rehearsal or request another recovery sign-in. Production hosted acceptance remains distinct.

The baseline templates also need real production operations-alert receiver URL/signing-secret bindings before runtime validation can pass; corrected fixed values are `STRIPE_TAX_READY=false` and `OPERATIONS_ENVIRONMENT=production`. No production template is declared ready.

The remaining transport issue has a concrete proposed solution: one finite Manual job, `filosage-drain-20260913`, with the already-built image, reviewed read-only command, existing production identity and existing versioned database reference. It has no ingress or schedule and adds no grants. It can observe the database after old app replicas stop without giving QA production credentials. Creating/running it needs explicit approval; the first run is online and observational, not a maintenance outage or drain pass.

Actual restriction coverage, zero old replicas plus zero remaining production client sessions, unresolved provider work disposition and modern hosted acceptance are checked at execution. A 15-minute observer timeout is not an outage guarantee. Before maintenance, resolve how the standard candidate workflow's ephemeral runner reaches the operator-only ingress: an exact independently verified runner /32 must be included in the reviewed fence before its preflight, or the runner must use a separately reviewed controlled vantage. No GitHub-wide/Azure-wide ranges, weakened preflight, fabricated stage artifacts or false blocked-request success are permitted. That workflow-access decision is still open; no outage should start while it is unresolved.

After successful candidate acceptance and compatible fallback, restore only the ingress/caller restrictions, verify canonical routing plus actual sign-in/lesson/progress, and observe 30 minutes. QA retirement stays deferred until that acceptance and its separate dependency/retention checklist.
