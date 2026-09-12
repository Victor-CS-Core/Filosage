# Native deployment approval gate

Status: blocked on Enterprise organization and independent human reviewer selection. This is the current R3 step in [the release checklist](../AGENT_PROGRESS.md). It does not replace the remaining R1–R9 outcome or the tested source `3a0e772fbb41a16396cf6761274e75b65f175f02`.

## Verified September 12 at 19:32 UTC

[Sanitized GitHub/Azure metadata](../research/artifacts/release-readiness-20260912/github-native-gate-20260912.json) records:

- `Victor-CS-Core/Filosage` is private, personally owned, and has `main` as its default branch. The only returned collaborator is `Victor-CS-Core`, with administrator access. The authenticated token does not expose the personal billing plan; its absence is not evidence of a particular plan.
- `azure-staging` and `production-operations` are the only environments. Each restricts deployment to the branch `main`; neither has required reviewers, and both permit administrator bypass.
- `azure-candidate-review` and `azure-production-promotion` are absent. The earlier HTTP422 protection failure remains historical evidence; this investigation did not repeat a write that could partially create an unprotected environment.
- The deployment application's one federated credential trusts staging only. The repository uses immutable OIDC subjects, with prefix `repo:Victor-CS-Core@216034367/Filosage@1281583859`. The actual staging trust matches that prefix plus `:environment:azure-staging`, issuer `https://token.actions.githubusercontent.com`, and audience `api://AzureADTokenExchange`.
- Staging has all three deployment identity secret names and required deployment variable names. No secret or variable values were emitted or saved in this record.

## Supported remedy and required decisions

GitHub makes required deployment reviewers available on private repositories through Enterprise. Free, Pro and Team offer that rule only for public repositories. Pro's private pull-request review feature does not satisfy this deployment rule. [Deployment protection rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments), [GitHub plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans).

Keeping the repository private and retaining Victor's selected native gates therefore requires an Enterprise organization to own this repository. First identify an existing suitable organization, or obtain Victor's decision on Enterprise setup. Membership in an organization alone proves neither Enterprise entitlement nor authority to transfer Filosage there. The current task asked Victor for the target and a separate human reviewer's GitHub username. Neither has been selected or invited by the coordinator.

The checklist also requires self-review prevention. The workflow initiator cannot approve their own deployment, even if they are a configured reviewer. Current CLI dispatches use Victor's account, so an agent using that same account does not provide independent approval. Promotion still requires Victor's concrete approval; its initiator must be a different authorized person when self-review prevention is enabled. [Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).

Billing, account creation, repository transfer and collaborator invitations await the exact target/participant decision and any required explicit approval. No visibility change or alternate approval mechanism is part of the current remedy. These limits come from the current handoff and [maintenance packet](2026-09-12-maintenance-transition.md), not a failed automatic approval review.

## Configuration to execute after selection and approval

1. Verify the selected organization's Enterprise entitlement, Victor's transfer/create authority, absence of a conflicting repository, default repository access, Actions policy and the designated reviewer's access. Capture current repository settings and federated trust metadata before presenting the exact ownership/access change for approval. Transfer changes who can administer the repository and applies the destination organization's permissions. [Repository transfer documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository).
2. Preserve repository privacy, name, commit history and frozen source. After an approved transfer, read the actual OIDC subject configuration again. Prepare exact environment subjects from that readback; do not substitute legacy name-only subjects or wildcard trust. GitHub's immutable format includes owner and repository IDs. [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).
3. Configure the three release environments below with actual selected reviewers, self-review prevention, administrator bypass disabled, and exactly one allowed branch rule (`main`, type `branch`). Preserve existing unrelated environment data. Keep `production-operations` outside this change unless separately scoped.

| Environment | Purpose | Required human participation |
| --- | --- | --- |
| `azure-staging` | Stage an exact inactive candidate | Reviewer distinct from the run initiator |
| `azure-candidate-review` | Review exact hosted candidate evidence | Independent reviewer distinct from the run initiator |
| `azure-production-promotion` | Promote the reviewed digest | Victor's concrete approval; another authorized person initiates |

4. Bind the verified Azure target variables and deployment identity references to each environment through the private authorized channel. GitHub cannot return existing secret values. Preserve OIDC authentication and review the Azure role scope for each operation; do not add client passwords or broaden trust to all branches/environments. Add only the exact needed federated subjects after the protected environment readbacks pass. Recheck existing staging/backup access before retiring obsolete trust under a reviewed cleanup step.
5. Run the existing `environmentReadiness` assessment on fresh metadata for all three environments. Require `independentReview`, `noAdminBypass`, `onlyMain`, complete input names and `ready` to pass. Verify the exact issuer/audience/subject configuration independently. A successful write response alone is insufficient; inspect for partial state after any failed update.
6. Preserve the other release prerequisites. Environment configuration can close this setup blocker only; it does not prove an actual human approved a candidate, a restore passed, database access is least privilege, legacy writers drained, or production was released. Actual reviews remain mandatory on the relevant future runs. Do not dispatch deployment workflows just to test this setup before their recovery/runtime/maintenance gates pass.

## Current next action

Await Victor's Enterprise organization and reviewer selection. If no Enterprise organization exists, prepare its exact account/cost/ownership proposal before requesting approval. All provider operations in this checkpoint were read-only. No deployment, new account, invitation, repository transfer, billing change or workflow dispatch occurred.
