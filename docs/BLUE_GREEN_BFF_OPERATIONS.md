# Single-application BFF release operations

Approval policy updated September 12, 2026. Source implementation only; no Azure deployment, traffic change, privilege change, hosted test or QA resource retirement is claimed.

One Azure Container App runs the Next.js frontend and same-origin `/api` Backend for Frontend route handlers in one immutable `Dockerfile` runtime image. Browser requests stay on their current origin. Provider, PostgreSQL, Blob and billing credentials stay server-side. Azure Easy Auth owns identity headers; the BFF verifies the account and authorization for each private operation. The separate QA website and its deployment template/workflow have been retired from source. Blue and green are labels on this application's revisions.

## Before deployment

Obtain the actual app resource ID, blue/green revision names, image digests, full source SHAs, exact 100/0 traffic and shared auth configuration. `latestRevision` routes, absent weights, extra labels, split weights and aliases to the same revision fail closed. A first transition from a legacy/tag-based deployment needs a separately reviewed initialization; the release workflow does not guess a safe inactive revision.

Review the resource-specific bootstrap/ownership/RBAC cutover below first. Check effective inherited role assignments, not only this template. Use existing `azure-staging` for all stage/review/promote workflows, with exactly one allowed deployment rule (`main`, type `branch`) and the existing Azure OIDC identity and exact issuer/audience/subject trust. Read back the branch restriction, input names and trust. Obtain Victor's explicit approval for the concrete production operation and record it in the task/handoff. This is procedural approval, not GitHub-enforced independent review; dispatch, packet metadata and environment readiness do not prove it. Native required reviewers, self-review prevention and administrator-bypass prevention are no longer prerequisites. No Enterprise, repository transfer, new collaborator, separate initiator, new environment or machine approval protocol is required. See [current approval policy](releases/2026-09-12-native-deployment-gate.md). All three workflows share one GitHub concurrency key. Azure's CLI traffic operation has no compare-and-swap in this implementation: an exclusive operator deployment lease and no competing Portal/CLI writers are required across the final readback and swap.

The canonical image origin remains `https://filosage.com`, including when its revision URL is used. Preserve the observed `direct-google` or `migration-dual` mode and existing registration/linking behavior. App auth configuration, identities, secrets and ingress are shared by revisions. Candidate staging only copies the observed live revision template and changes revision settings; it never changes shared authentication. Any shared provider/callback/secret transition requires a separate compatible operation before candidate verification.

## Build, test and promote

1. Freeze a full SHA and obtain successful `quality-gate.yml` and `full-regression.yml` runs at exactly that SHA. Execute all release workflows from the same SHA; modifying source invalidates its evidence.
2. With deployment approval, dispatch `azure-staging.yml` using `expected_sha`, the two successful run IDs, the observed `expected_auth_mode`, and `featured_course_id` (or `none`). It checks actual traffic, builds the runtime image once with the committed capability manifest, resolves its immutable ACR digest, and copies the live template to a unique candidate revision. It rechecks that public traffic stayed exactly unchanged, tests the revision URL, atomically replaces the inactive label row while preserving the live row, and tests that label URL. The scoped JSON Merge Patch avoids the Azure CLI label-add behavior that retains an unlabeled old zero-weight row. `release-candidate-<sha>` contains the exact candidate and previous revision, canonical origin, manifest, auth fingerprint and before/after traffic.
3. Test the exact candidate with approved accounts/data. A label with 0% public traffic is still externally reachable and shares durable services with the live revision. Review BFF/header forgery and real Google/linked-account flows, recent-auth destructive controls, privacy isolation, full learner/publication flow, existing-customer billing containment, probe/dependency loss, alert acknowledgment/escalation/recovery, restore/rollback, and overlapping/in-flight writes. Required evidence is listed in `scripts/blue-green-review.ts`. No mere health response or flag proves these outcomes.
4. Retain each gate's measured evidence in an immutable GitHub Actions artifact on a successful exact-SHA evidence-producing run. Each artifact must contain `candidate-proof.json` with: `candidateFingerprint`, `gate`, `result: "passed"`, `sha`, `imageDigest`, `appId`, `revision`, `manifestFingerprint`, `authConfigSha256`, `productionOrigin`, `observedAt`, and `method`. Include the underlying redacted test transcripts/results in that artifact. Human-attested records must identify that method honestly; a manual upload is not an automated hosted test. Use the reviewed-source packaging workflow below; source implementation alone does not establish any hosted gate result.
5. After reviewing the underlying evidence, dispatch `azure-candidate-verification.yml` with `candidate_run_id`, exact SHA/mode, and `review_packet` JSON (at most 32 KiB). The packet schema is described below. It downloads the unique stage artifact, verifies successful exact-SHA evidence runs and immutable artifact digests, checks each proof's candidate identity, rereads live/candidate state, and repeats smoke. Reviewers inspect the underlying transcripts and compatibility evidence and retain honest review attribution in the packet. The workflow does not establish Victor's approval of a production operation. The workflow retains a separate `candidate-verification-<sha>` artifact; it never fabricates test results.
6. Present Victor the concrete packet. Only after promotion approval dispatch `azure-promote-staging.yml` with the same SHA/mode, `candidate_run_id` and `verification_run_id`. It verifies both successful runs, candidate artifact identity and digest, reviewed packet, candidate readback, unchanged predecessor and shared auth, then routes by exact revision names to 100/0. There is no build in promotion. Public health checks require exact SHA/digest/capabilities/auth and canonical origin; apex/www routing is checked.
7. Record fresh real signed-in smoke and independently observed monitoring after the swap. The promotion artifact explicitly leaves those operator outcomes pending. They must pass before Gate A is declared complete. Retain the exact compatible predecessor at 0% for rollback.

## Review packet contract

The packet has `schemaVersion: 1`, `candidateFingerprint` (SHA-256 of recursively key-sorted candidate JSON), named `operator` and `reviewedBy`, a concrete `rollbackTrigger`, `testDataPolicy: "approved-accounts-and-data-only"`, and `writeCompatibility: "overlapping-readers-writers-and-inflight-fences-verified"`. `minimumSafeRollbackSha`, `rollbackRevision`, and `rollbackImage` must exactly identify the captured predecessor; `rollbackAuthorized: true` explicitly authorizes fallback to that reviewed version if the attempted swap fails. This authorization must not be entered until the old binary's account/publication/accounting fences are proved compatible.

`evidence` contains one record for each gate exported as `hostedGates`. Each record includes `gate`, `runId`, `workflow`, `artifact`, `artifactDigest` (GitHub artifact `sha256:` digest), `candidateFingerprint`, `result`, `method`, `reviewedBy`, and `observedAt`. The stage/promotion workflow cannot itself serve as hosted proof. The referenced artifact's `candidate-proof.json` must agree with the reviewed result and exact candidate identity. Missing, expired, duplicate, mismatched or failed evidence blocks promotion. Never put tokens, raw claims, account content, connection strings or secrets in a packet.

## Runtime and bootstrap separation

`infra/azure/main.bicep` grants the runtime identity Secrets User on individual approved runtime secrets. Its container receives only the app database URL; there is no admin URL or production/QA role password. The runtime image runs `verify-azure-database.ts` in a read-only transaction before `server.js`: required column types/nullability, primary key, DML rights, absence of schema/database creation and elevated role/ownership privileges are verified. It does not create tables, roles or indexes. The startup/readiness/liveness HTTP probes remain distinct.

`infra/azure/bootstrap.bicep` defines a **manual** Container Apps job using a separate identity. That identity has only registry pull and two secret-scoped reads (admin URL and app role password); it has no Blob permission and is never assigned to the web app. Build its separately tagged, immutable image with Docker target `bootstrap`. Deploying the job does not execute it. Review the exact job/image/database operation before starting it. It has one replica, one completion, zero retries, a 600-second bound and no ingress.

The explicit job runs the additive checked-in document schema migration, then configures the app role with bounded DML on `public.filosage_documents` and schema USAGE. It refuses absent manual acknowledgment/admin configuration; it always retargets the admin connection to the explicitly selected app database instead of accidentally migrating `/postgres`. The app role is not granted CREATE or broad default privileges. Existing runtime ownership blocks provisioning; inspect and separately review the precise table/database ownership transfer and inherited membership cleanup before using this cutover. Do not silently transfer every object or run destructive migration against the shared live database.

Schema and document protocols must support overlapping old/new readers and writers. Account deletion fences, publication proof/write versions and generation/accounting cutovers are independent of traffic weight. Zero public traffic does not cancel requests, workers, lease holders or queued writes. An older binary that bypasses current fences is not a safe rollback target. Approve the minimum compatible version and verify in-flight fencing before any swap or automatic fallback.

The failure handler only restores the explicitly approved predecessor from the known post-swap binding after checking image/SHA/auth and compatibility review. Ambiguous states stop for operator inspection; no blind weight restoration is attempted. Traffic rollback rereads the exact old image and verifies public health/origin/SHA with its captured manifest; fresh signed-in verification remains separately required. Database rollback is not implied.

## Packaging actual reviewed hosted evidence

After the exact candidate observations exist, dispatch `azure-candidate-evidence.yml` on the same main SHA with `expected_sha`, `expected_auth_mode`, `candidate_run_id`, and `hosted_packet` (at most 32 KiB). This reuses the stage artifact, live candidate/previous-revision readback and smoke checks. It never builds, promotes or executes the seven supplied gate scenarios. Operator records remain operator-reviewed; reviewed automated transcripts remain supplied automated-probe evidence, not tests performed by the packaging job. Shared main-only environment, deployment concurrency and optional narrowly owned maintenance access are retained.

The packet contains `schemaVersion: 1`, the exact `candidateFingerprint`, and exactly one `evidence` entry per existing `hostedGates` value. Each entry has:

- `gate`, `result: "passed"`, actual `reviewedBy`, ISO `observedAt`, and `method` equal to `operator-reviewed` or `automated-probe-reviewed`.
- `source: { reference, observations }`: a concrete sanitized task/log/test reference and one or more records `{ check, expected, observed, result: "passed" }`. Include actual observations, not empty assertions. Do not include credentials, personal identifiers, learner text, callback URLs or raw provider output.
- `sourceSha256`: `fingerprint(source)` using the existing canonical JSON SHA-256 function in `scripts/blue-green-contract.ts`. This binds the reviewed embedded record, not an unverified remote URL's contents. The reviewer remains responsible for its truth, completeness and redaction.

Only a successful packaging run can supply the consumer's successful-run requirement. Each `candidate-proof-<gate>` artifact contains `candidate-proof.json`, the exact `reviewed-source.json` and separate live `candidate-readback.json`. Proofs bind the candidate SHA/digest/revision/auth/manifest, the downloaded stage artifact identity/digest, source hash and reviewer; packaging actor/run attribution is separate. A partial upload from a failed run is unusable. No GitHub artifact digest is guessed: after success, read each actual artifact digest and use it with the packaging run ID, workflow `.github/workflows/azure-candidate-evidence.yml`, artifact name and matching proof method/time in the existing `review_packet`. Then execute the unchanged `azure-candidate-verification.yml` flow. Packaging or dispatch metadata is not approval and does not replace the compatibility/rollback review.

## QA retirement inventory and outstanding live gates

The following inventory targets come from retired source; exact deployed resource IDs and contents are **not yet retrieved**. Inventory before approving any cleanup. Preserve required recovery/history and legal retention.

| Inventory target | Source name or locator | Required readback before retirement |
| --- | --- | --- |
| QA Container App, revisions and ingress | prior `AZURE_QA_CONTAINER_APP_NAME`, QA workflow environment | Exact app/revision IDs, FQDN, traffic, custom domains and revision image/SHA |
| QA managed identity and deployment principal | prior QA Bicep identity and `deploymentPrincipalId` | Principal IDs, all direct/inherited role-assignment IDs/scopes and federated credentials |
| Shared Key Vault grants | old QA and runtime whole-vault Secrets User assignments | Exact role-assignment IDs, approved runtime secret allowlist and effective allow/deny probes |
| QA secret references | previous QA app secrets; `external-id-client-secret-qa`, `identity-link-hmac-secret-qa`, QA DB password | Secret names/version references and consumers; never collect values in the inventory |
| QA PostgreSQL database/login | `filosageqa`, `filosageqa_app` | Actual database and role IDs/names, owner, memberships, grants, active sessions and retained records |
| QA Blob container | `qa-course-banners` | Resource ID, version/retention/legal-hold inventory and exact approved disposition |
| DNS and authentication callbacks | prior QA URL and Google/External ID callback registries | Exact DNS records, provider app IDs/callback entries, current legitimate account consumers |
| GitHub operational configuration | `azure-qa` environment, `AZURE_QA_*` vars and QA federated subject | Environment protections, non-secret variable names, credential references and any remaining workflow consumer |
| Runtime privilege cutover | current app identity and database table/database owner | Effective RBAC/membership and ownership readback, reviewed changes, runtime admin-deny and DML-allow probes |

Removing resources from an **incremental** Bicep template does not delete resources or revoke old assignments. The retired source files are preserved in Git history. No live deletion, purge, role revocation, callback removal or credential rotation has occurred. Deletion plans must name exact resource IDs and preserved records; apply only after the separate review and authorization. Private temporary recovery targets for R18 remain permitted and are not another application website.

## Provider references

Verified against Microsoft documentation September 6, 2026:

- [Container Apps blue/green deployment](https://learn.microsoft.com/en-us/azure/container-apps/blue-green-deployment)
- [Revision scope and labels](https://learn.microsoft.com/en-us/azure/container-apps/revisions)
- [Container Apps JSON Merge Patch](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/container-apps/update?view=rest-resource-manager-containerapps-2025-01-01)
- [Azure CLI revision copy](https://learn.microsoft.com/en-us/cli/azure/containerapp/revision?view=azure-cli-latest#az-containerapp-revision-copy)
- [Manual Container Apps jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [Secret references](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets)
- [Key Vault RBAC scopes](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
- [Incremental deployment behavior](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deployment-modes)

Installed Next.js 16 documentation for BFF route handlers and self hosting was reviewed. No framework platform rewrite is needed for the existing frontend and route handlers.
