# Deployment approval policy

Status: native GitHub deployment reviewer prerequisite removed under Victor's explicit September 12 instruction. This is the current R3 policy in [the release checklist](../AGENT_PROGRESS.md); remaining R1–R9 operational and hosted gates stay open. This documentation change is not a deployment or acceptance of a new source SHA.

## Current release policy

Stage (`azure-staging.yml`), candidate review (`azure-candidate-verification.yml`) and promotion (`azure-promote-staging.yml`) all use the existing `azure-staging` environment. Require exactly one allowed deployment rule: `main`, type `branch`. Preserve the existing deployment identity, input references and exact Azure OIDC issuer/audience/subject trust; do not broaden trust or create new release environments. `production-operations` remains outside this change.

Before each concrete production operation, obtain Victor's explicit approval of its resource-scoped packet and record that approval in the current task/handoff. Approval must cover the actual operation, targets and applicable rollback; general plan approval, workflow dispatch, an agent-written `reviewedBy` value or environment metadata does not establish it. This is a procedural operator control, not GitHub-enforced independent review. No new machine approval protocol is required.

Native required reviewers, self-review prevention and administrator-bypass prevention are no longer release prerequisites. Enterprise, repository transfer, a new collaborator, a separate workflow initiator and new environment/identity setup are not required. The earlier organization/reviewer question and remediation proposal are superseded; they must not block this release or authorize account, billing, ownership, visibility or access changes.

Preserve all seven hosted candidate gates and their packet validation and honest review attribution, exact source SHA, immutable image/artifact digests and successful matching CI. Reviewers must inspect the evidence; metadata cannot manufacture a review or test result. Preserve current recovery proof, minimum runtime privileges and actual allow/deny tests, compatible predecessor/write protocols, complete legacy drain, exclusive deployment control, safe rollback, privacy, closed new checkout and bounded post-promotion observation. See [release prerequisites](2026-09-12-release-prerequisites.md), [maintenance packet](2026-09-12-maintenance-transition.md) and [operational runbook](../BLUE_GREEN_BFF_OPERATIONS.md).

Verify current `azure-staging` branch restriction, required input names and exact OIDC trust through fresh metadata. A passing environment-readiness check proves configuration only, never approval, hosted acceptance or production readiness. Do not dispatch a deployment merely to test this configuration before its operation-specific gates and Victor's approval are satisfied.

## Historical native-gate investigation (superseded requirement)

The former policy required native independent reviewers, self-review prevention and no administrator bypass on three separate release environments. Its private-repository protection attempt returned HTTP 422, and the investigation proposed Enterprise ownership and a distinct human reviewer. Victor subsequently approved removing that prerequisite while retaining his explicit approval before production changes. The observations below remain historical evidence; no plan entitlement, ownership transfer, invitation or provider mutation is implied by the new policy.

### Verified September 12 at 19:32 UTC

[Sanitized GitHub/Azure metadata](../research/artifacts/release-readiness-20260912/github-native-gate-20260912.json) records:

- `Victor-CS-Core/Filosage` is private, personally owned, and has `main` as its default branch. The only returned collaborator is `Victor-CS-Core`, with administrator access. The authenticated token does not expose the personal billing plan; its absence is not evidence of a particular plan.
- `azure-staging` and `production-operations` are the only environments. Each restricts deployment to the branch `main`; neither has required reviewers, and both permit administrator bypass.
- `azure-candidate-review` and `azure-production-promotion` are absent. The earlier HTTP422 protection failure remains historical evidence; this investigation did not repeat a write that could partially create an unprotected environment.
- The deployment application's one federated credential trusts staging only. The repository uses immutable OIDC subjects, with prefix `repo:Victor-CS-Core@216034367/Filosage@1281583859`. The actual staging trust matches that prefix plus `:environment:azure-staging`, issuer `https://token.actions.githubusercontent.com`, and audience `api://AzureADTokenExchange`.
- Staging has all three deployment identity secret names and required deployment variable names. No secret or variable values were emitted or saved in this record.

The investigation and this policy update performed no deployment, new account, invitation, repository transfer, billing change or workflow dispatch. Continue with the remaining recovery/runtime/maintenance and exact-candidate gates in the coordinator's checklist.
