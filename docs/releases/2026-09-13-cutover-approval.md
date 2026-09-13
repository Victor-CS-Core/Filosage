# Proposed modern-baseline cutover

Status: preparation only; no maintenance or production app change is authorized by PR29 merge. The receiver and runner fixes are integrated. Receiver signed storage, both alert firings, actual inbox delivery and both automatic resolutions have been verified. The final source regression is running before any outage.

## Scope and pinned inputs

Use subscription `bfc8f890-2681-43dc-8eac-51644341ae12`, group `filosage-staging-central-rg`, and app `filosagestg-app`. Preserve migration-dual authentication, canonical URLs, shared resources, existing subscriber obligations and closed new checkout. QA retirement is excluded.

The transitional modern baseline remains frozen source `7c48bc02ff6623a81fee382b194864f1d04b76c0`, image `sha256:95cc9529e6abcfdef5918f39996cfed55703e5b29b82d75304a69765c844b344`, with its previously passed exact-source engineering/security/full regression and selected-point recovery evidence. It is distinct from final workflow candidate source `b5ba5803c2205922bf68d7fa740d1c660312ee71`, whose own regression is required for the main-only deployment workflow. Do not relabel old evidence or rebuild the baseline.

Private reviewed patches remain under `.filosage-local/transition-20260912/operation-packet/`. Their updated hashes and zero-issue frozen runtime validation are recorded in [receiver execution evidence](../research/artifacts/release-readiness-20260912/operations-receiver-execution-20260913.json). They bind the restricted production database credential and the verified signed-alert destination. Full drain/origin/rollback procedures are preserved in `docs/releases/2026-09-13-maintenance-execution.md` on branch `codex/release-evidence-20260912`; that historical document's receiver/runner blockers are superseded by the new verified evidence.

## Approval to request when preparation passes

Reserve a 90-minute maintenance window starting when Victor explicitly approves entry and is available for real non-owner learner sign-in. The 90 minutes is a planned work window, not a guaranteed maximum outage. The critical risk is that, after a modern writer starts, the old image cannot safely be restored automatically. A failed modern validation can therefore extend the outage while the app stays fenced for reconciliation.

The requested operation consists of:

1. Freshly verify production/config/auth, jobs, active workflow runs, private-network writers, exact operator address and denied QA vantage. Require exclusive deployment/import/SQL/Blob/provider administration during the window. Stop before entry if anything is unexplained. Preserve all secret values and before-state metadata privately.
2. Apply only the reviewed operator `/32` ingress restriction. Verify denial across canonical, default, label and revision origins and specified HTTP methods from the independent QA vantage. Verify allowed harmless health/auth requests from the operator. A timeout or application404 is not denial proof.
3. Recreate the exact previously verified read-only observer job for this explicitly approved maintenance execution. Allow at most15 minutes for known in-flight work. Preserve historical terminal reservation/accounting fields; do not treat them as active jobs or issue refunds. Unknown work prevents transition.
4. Deactivate only the two recorded legacy revisions. Verify inactive/zero replicas and two consecutive zero-production-client observer samples at least10seconds apart, including idle connections. Stop/delete the owned observer and verify absence before changing legacy credential access. Never terminate arbitrary database sessions.
5. Apply the prepared restricted runtime/alert references and start the exact modern green baseline with normal image startup. Check schema/capacity, source/digest/origin/authentication, runtime access and denial, signed operations path, real learner progress/privacy and enabled journeys. Then start and verify the equivalent modern blue fallback before accepting a compatible fallback. Each revision gets a15-minute readiness bound.
6. Bind only accepted modern green100/blue0 under the fence. Remove only the old app database reference and its captured production identity grant after every consumer is accounted for; retain the vault secret/version and shared database owners. Verify new required access and old administrator-secret denial. Preserve unrelated grants, auth and settings.
7. Reopen public ingress only after acceptance passes and both exact modern revisions/labels are read back. Verify public source/digest, real sign-in and lesson progress, then observe for30 minutes with bounded reads. Final main-source candidate staging/review/promotion is a separate standard workflow operation with its own exact-source artifacts; it must not be fabricated as part of this baseline transition.

## Stop and recovery decisions

Before any modern application writer starts, failure or unknown activity aborts the transition: restore the captured old active revision/routing/ingress and verify original health. Target that abort decision no later30minutes after maintenance entry, with up to10minutes for restoration/readback. Do not begin modern startup if the fence/drain gate is incomplete.

After modern startup, assume writes may have occurred. Keep the fence on any failed acceptance and use only a verified compatible modern revision. Do not restore the old image, replay old routing, terminate unknown sessions or restore data automatically. At60minutes, assess remaining work against the window; stop introducing new changes if safe completion is uncertain and report exact state to Victor. A data restore or other recovery outside the approved procedure requires a separate concrete decision. Never promise the earlier23minute recovery rehearsal bounds this production outage.

At90minutes, provide a final state read regardless of outcome; no unbounded watcher or silent maintenance remains. A successful maintenance exit is followed by the separate30-minute public observation. Retain necessary rollback metadata and test receipts. No QA deletion, live billing activation, new domain/account, broad ingress rule or unrelated IAM change is included.
