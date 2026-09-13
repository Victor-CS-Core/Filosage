# Maintenance execution procedure

Status: preparation only. The next reviewable operation is the finite read-only observer job below, while production stays online. No maintenance, job creation, runtime binding, revision change, IAM change or traffic switch has executed. This procedure preserves R1–R9 and supplements the [baseline packet](2026-09-12-modern-baseline-preparation.md).

## Exact next operation: online observer verification

Create one Manual Container Apps job named `filosage-drain-20260913` in `filosage-staging-central-rg`, subscription `bfc8f890-2681-43dc-8eac-51644341ae12`, existing environment `filosagestg-environment`. The [complete ARM request body](../research/artifacts/release-readiness-20260912/transition-observer-job-20260913.json) is reviewable and contains no credential values.

The job uses frozen source `7c48bc02ff6623a81fee382b194864f1d04b76c0` image digest `sha256:95cc9529e6abcfdef5918f39996cfed55703e5b29b82d75304a69765c844b344`. Its command overrides application startup with only the reviewed [read-only diagnostic](../../scripts/inspect-transition-drain.mjs), bundled with the existing strict database connection validator. It imports `pg`, never starts Next.js, and has no HTTP listener, ingress, schedule, provider API calls or application writes. It reuses the existing production managed identity and existing versioned `database-url` reference. No identity, password, database role or IAM grant is created; QA never receives this credential.

Limits: one replica, one completion, zero retries, CPU0.25/memory0.5Gi, provider timeout900seconds and process deadline840seconds. At most72 aggregate samples are emitted, ten seconds apart. Statements have15second limits, locks3seconds, TLS verification and explicit read-only transactions. Errors emit only a fixed failure category. A failed job must be reconciled before retry; do not launch duplicate executions. This first run proves transport and query compatibility only. Nonzero sessions while the app is online are expected and never justify terminating them.

Execution after explicit approval:

```bash
export AZURE_LOGGING_ENABLE_LOG_FILE=false
export AZURE_CORE_COLLECT_TELEMETRY=false
transition_subscription=bfc8f890-2681-43dc-8eac-51644341ae12
transition_group=filosage-staging-central-rg
transition_job=filosage-drain-20260913
transition_job_url="https://management.azure.com/subscriptions/$transition_subscription/resourceGroups/$transition_group/providers/Microsoft.App/jobs/$transition_job?api-version=2025-01-01"
```

1. Read the exact job URL. Continue with creation only on a confirmed404, not on authentication, network or timeout errors. Re-read unchanged production configuration/template/authentication and the exact identity/secret-version/registry metadata. Verify the manifest checksum against the reviewed checkpoint. Existing unexpected resources or drift stop this operation.
2. Create the exact body with `az rest --method put --url "$transition_job_url" --subscription "$transition_subscription" --body @docs/research/artifacts/release-readiness-20260912/transition-observer-job-20260913.json --output none --only-show-errors`. Read the created job and compare its command, environment, identity, secret reference, registry, limits and template before starting it. ARM avoids CLI registry-identity convenience behavior that can create grants.
3. Start exactly once with `az containerapp job start --subscription "$transition_subscription" --resource-group "$transition_group" --name "$transition_job" --output json --only-show-errors`. Retain the returned execution name privately. An uncertain response requires an execution-list read before any retry.
4. Use bounded `job execution list/show` and `job logs show` reads without `--follow`; retain only parsed `transition-drain-sample` aggregates and fixed failure categories. Verify the exact execution image/command and successful sample. Provider readiness has a five-minute bound; the execution has its own15minute maximum. The operation deadline is25minutes including cleanup, with a final status read on timeout. Job completion alone is not a drain pass.
5. Stop any still-running owned execution, delete only this exact owned job and verify absence. Preserve the existing environment, identity, grants, secret/version and registry. Re-read production configuration/template/authentication, original93f60f24 health, QA revision and absence of unexpected jobs. Report any cleanup failure explicitly. No maintenance or app changes occur in this operation.

Azure documents the finite [Manual job lifecycle and timeout controls](https://learn.microsoft.com/en-us/azure/container-apps/jobs). Resource existence does not incur an always-on app replica; only the bounded execution is requested. No precise charge is promised.

## Maintenance entry and drain, after observer verification

The app's current configuration/template/authentication match the captured baseline at00:22:41UTC; exactly two old revisions are active. Database public access is disabled, one VNet has no peerings, no Container Apps jobs exist, and no GitHub runs are in progress or queued. These are read-time observations, not an exclusive operator lease. At maintenance entry, the executing operator and Victor must ensure no concurrent deployment/import/bootstrap/direct SQL/Blob/provider administration; recheck jobs, active workflows and private-network consumers. Preserve the enabled Stripe webhook and retained provider/accounting uncertainty.

The captured operator /32 still matches the current operator address. Its exact address and narrow restriction/restore bodies remain private under `.filosage-local/transition-20260912/`. QA has already proved a distinct outbound vantage. Recheck both addresses before execution; never add a broad proxy/cloud range. The entry patch modifies only `properties.configuration.ingress.ipSecurityRestrictions`. Compare every other configuration/template/authentication field after the patch.

From the denied vantage require403, without redirect following, for all seven inventoried canonical/default/label/revision origins at `/`, `/api/health`, `/.auth/me`, `/api/billing/webhook`, and the Google callback. Require denial for HEAD/GET/POST/OPTIONS with no real account/payment payload; a timeout,404 or application error is not fence proof. The allowed vantage checks harmless health/auth paths only before drain. For an inactive revision, verify inactivity/zero replicas and the app-wide ingress rule rather than waking it or accepting a404 as IP-denial evidence. New revisions require new origin coverage before application requests.

Resolve the standard workflow-runner access described below before applying maintenance. Once entry is authorized and the fence verified, run the same reviewed observer job. Treat its clock as separate from the wall-clock maintenance deadline. Allow at most15minutes for known in-flight work; record selected provider outcomes, nested leases, pending calls and accounting uncertainty. An expired lease alone never proves a provider completed. Historical terminal/uncertain accounting is retained and does not imply a refund. Unknown active work stops the transition for reconciliation.

Deactivate only `filosagestg-app--blue-7abae96f-1` and `filosagestg-app--green-93f60f24-1` with `az containerapp revision deactivate` against the pinned subscription/group/app. Verify both `active:false` and empty replica lists. Require two consecutive observer samples at least ten seconds apart **after** that shutdown, with `databaseClientsZero:true` and no unknown session visibility. Count every production client role, including idle clients; exclude only the observer PID. Any remaining connection stops the operation. Never terminate sessions by shared administrator username. Nonclient database backends and scheduled work remain separately inventoried.

The operator couples these observations to the still-enforced fence and exclusive operator control. The diagnostic deliberately leaves `drainVerified:false`; it cannot see revision state or prevent external reconnects. Stop/delete the observer and confirm its execution has ended before removing legacy credential access. Do not probe old endpoints after shutdown. The job can be recreated only from the same reviewed body for an explicitly approved subsequent maintenance execution.

## Exact prepared baseline and fallback patches

Private reviewable bodies live in `.filosage-local/transition-20260912/operation-packet/`; their hashes are retained in [the patch record](../research/artifacts/release-readiness-20260912/maintenance-operation-patches-20260913.json). They contain existing environment values, so only their hashes are tracked.

| Body | Exact proposed effect and ordering |
| --- | --- |
| `runtime-reference.private.json` | Add only the already-verified versioned `database-url-runtime-v1` reference; preserve the other references. After fence/drain approval only. |
| `green-baseline-template.private.json` | Create `filosagestg-app--green-7c48bc02ff66-baseline-1` on frozen95cc9529; restricted credential, pool2, exact source/digest/origin,15 capability settings, closed checkout, normal image startup. Preserve CPU/memory/scaling/authentication. |
| `blue-baseline-template.private.json` | Create equivalent modern blue revision, only after green startup and required acceptance. It supplies a distinct modern revision for compatible fallback; no legacy image becomes a modern fallback. |
| `modern-labels.private.json` | Bind only verified modern green100/blue0 under the maintained fence. Read back both exact bindings; any platform routing drift is reconciled under the fence, never called successful zero-traffic staging. |
| `restricted-references.private.json` | Remove only old app reference `database-url` after no surviving modern revision or observer uses it. Then remove only captured assignment353dc70c-614f-5df9-8163-954be81d9121 and prove required reads plus administrator-secret denial before accepting least privilege. Preserve the vault secret/version and shared owners. |
| `legacy-labels.private.json` | Captured old labels/weights, usable only for a verified pre-modern-write abort. Never apply after a modern application writer has run. |

Each body uses `az rest --method patch` to the exact `filosagestg-app` ARM resource with API2025-01-01, logs suppressed and the existing private baseline checked immediately beforehand. The template source is the captured application template; re-read the exact old green revision and require equality before using it. No patch is executed by generating or checking these files.

Require normal schema/capacity startup, exact SHA/digest/origin/manifest/auth health, production runtime allow/deny proof, real learner persistence/privacy and the required hosted acceptance before routing or maintenance exit. Preserve the passed isolated learner/recovery evidence; it does not replace production binding verification. Before modern startup, abort can reactivate captured old green, restore exact old routing and ingress, and verify public health. After modern startup assume writes may have occurred: keep the fence on failure and use only an accepted modern revision; no automatic old-image fallback or implied database restore.

## Cutover boundaries still to resolve

Independent review exercised the actual frozen runtime validator against both prepared templates. It found missing `STRIPE_TAX_READY`, invalid operations classification and absent alert receiver bindings. The first two are corrected to `false` and `production`; **both templates remain blocked** until real `OPERATIONS_ALERT_WEBHOOK_URL` and `OPERATIONS_ALERT_WEBHOOK_SECRET` bindings exist and pass the validator. Do not invent a receiver, use an invalid sentinel, classify production as QA or remove the health requirement to make the check pass. Receiver delivery/monitoring proof remains distinct from configuration.

The standard candidate workflow runs on an ephemeral GitHub-hosted runner. That runner is outside an operator-only /32 fence, so its preflight/hosted requests will fail. Do not start an outage assuming otherwise. An exact runner-vantage arrangement and its fingerprint ordering must be reviewed before the full maintenance/candidate operation; broad address ranges, weakened checks or invented workflow artifacts are not acceptable substitutes. This finding does not invalidate the frozen image or require another full regression.

Therefore the approval requested by this checkpoint covers **only the online read-only observer creation, one bounded run and exact cleanup**. It does not authorize the proposed fence/deactivation/runtime/IAM/routing patches. Those are concrete prepared inputs, not yet a complete approved production cutover. The15minute drain limit and measured23minute13second recovery rehearsal do not guarantee a full deployment outage duration. The final cutover approval must include its actual interruption/abort bounds after the alert receiver and runner access paths are resolved. Candidate acceptance, public promotion,30minute observation and QA retirement retain their existing gates.
