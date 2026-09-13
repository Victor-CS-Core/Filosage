# Final source candidate staging

Status: prepared for approval after the modern baseline's public observation passes. No workflow dispatch or final-source image build has occurred.

The approved maintenance transition uses source `7c48bc02ff6623a81fee382b194864f1d04b76c0` and image `sha256:95cc9529e6abcfdef5918f39996cfed55703e5b29b82d75304a69765c844b344`. The next operation stages final main source `b5ba5803c2205922bf68d7fa740d1c660312ee71` through the standard workflow. These are distinct source identities; retain their separate evidence.

## Concrete operation

1. Require successful public observation, fresh exact main and provider readback, no competing deployment, and preserved serving green100 on the accepted baseline. Verify that the zero-traffic modern blue has no unexplained work, then deactivate only `filosagestg-app--blue-7c48bc02ff66-baseline-1` and verify zero replicas. Keep its metadata. The workflow's connection budget permits at most two active production revisions including the future candidate; it does not deactivate the previous blue automatically.
2. Dispatch `.github/workflows/azure-staging.yml` on `main` with the exact inputs below. It builds the final source once in ACR and pins the resulting digest. The workflow copies the serving template, verifies the candidate revision, and binds only blue0. Public green100, shared authentication, identity, secrets and ingress restrictions must remain unchanged. Normal ingress makes the optional maintenance-runner rule a no-op.
3. Read the terminal workflow result within its 40-minute job bound plus five minutes for final artifact retrieval. Download and checksum the exact `release-candidate-<full SHA>` artifact, verify source/digest/readback and candidate/previous revision identity. A failed run is not approval to rebuild blindly; reconcile its build and deployment evidence first.

| Input | Value |
| --- | --- |
| `expected_sha` | `b5ba5803c2205922bf68d7fa740d1c660312ee71` |
| `expected_auth_mode` | `migration-dual` |
| `quality_run_id` | `34735888733` |
| `regression_run_id` | `34735947262` |
| `featured_course_id` | `none` |

Exact-source engineering, security and full regression have passed. The regression artifact's source and checksum are verified: 458 passed, nine declared skips, zero unexpected failures or flaky tests. Do not rerun them without a new reason, and do not rebuild the accepted baseline.

## Acceptance and limits

Staging success requires the immutable final-source candidate artifact, passing hosted smoke checks, unchanged public routing/auth/settings and an available compatible green predecessor. This approval would cover zero-traffic blue deactivation and final-source build/staging only. It does not cover promotion, QA retirement, billing activation or unrelated configuration changes.

After staging, collect actual exact-candidate evidence for BFF authentication/privacy, learner journey, publication, billing containment, operations/alerts, recovery/rollback and data-write compatibility. Baseline evidence supports context but does not stand in for candidate evidence. Run the candidate-verification workflow with the reviewed packet and actual stage run ID. Present the verified candidate and promotion operation for approval, reuse its immutable image, and perform the prescribed public observation after promotion.

The main changes from baseline to final source are the receiver and maintenance-runner implementation, associated workflow integration, tests and documentation. There are no application `src/` changes in that range; the workflow still requires evidence tied to the exact final SHA.
