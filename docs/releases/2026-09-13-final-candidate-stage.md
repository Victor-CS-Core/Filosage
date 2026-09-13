# Final source candidate staging

Status: approved staging resumed after PR30, PR31 and PR32 merged. The first staging run34740853590 failed before image build; no candidate was deployed. The new source is undergoing fresh verification.

The approved maintenance transition uses source `7c48bc02ff6623a81fee382b194864f1d04b76c0` and image `sha256:95cc9529e6abcfdef5918f39996cfed55703e5b29b82d75304a69765c844b344`. The next operation stages final main source `9f1c08ed9b055e8742c28601b2e3b5334632cc3f` through the standard workflow. These are distinct source identities; retain their separate evidence.

## Concrete operation

1. Require successful public observation, fresh exact main and provider readback, no competing deployment, and preserved serving green100 on the accepted baseline. Verify that the zero-traffic modern blue has no unexplained work, then deactivate only `filosagestg-app--blue-7c48bc02ff66-baseline-1` and verify zero replicas. Keep its metadata. The workflow's connection budget permits at most two active production revisions including the future candidate; it does not deactivate the previous blue automatically.
2. Dispatch `.github/workflows/azure-staging.yml` on `main` with the exact inputs below. It builds the final source once on the GitHub runner and pushes to ACR and pins the resulting digest. The workflow copies the serving template, verifies the candidate revision, and binds only blue0. Public green100, shared authentication, identity, secrets and ingress restrictions must remain unchanged. Normal ingress makes the optional maintenance-runner rule a no-op.
3. Read the terminal workflow result within its 40-minute job bound plus five minutes for final artifact retrieval. Download and checksum the exact `release-candidate-<full SHA>` artifact, verify source/digest/readback and candidate/previous revision identity. A failed run is not approval to rebuild blindly; reconcile its build and deployment evidence first.

| Input | Value |
| --- | --- |
| `expected_sha` | `9f1c08ed9b055e8742c28601b2e3b5334632cc3f` |
| `expected_auth_mode` | `migration-dual` |
| `quality_run_id` | `34743287595` |
| `regression_run_id` | `34743308180` |
| `featured_course_id` | `none` |

Exact-source engineering34743287595, security34743287591 and full regression34743308180 are running. Require their actual success and verify the regression artifact source/checksum before dispatch. Earlier b5 results remain historical evidence only. Do not rebuild the accepted baseline.

## Acceptance and limits

Staging success requires the immutable final-source candidate artifact, passing hosted smoke checks, unchanged public routing/auth/settings and an available compatible green predecessor. This approval would cover zero-traffic blue deactivation and final-source build/staging only. It does not cover promotion, QA retirement, billing activation or unrelated configuration changes.

After staging, collect actual exact-candidate evidence for BFF authentication/privacy, learner journey, publication, billing containment, operations/alerts, recovery/rollback and data-write compatibility. Baseline evidence supports context but does not stand in for candidate evidence. Run the candidate-verification workflow with the reviewed packet and actual stage run ID. Present the verified candidate and promotion operation for approval, reuse its immutable image, and perform the prescribed public observation after promotion.

The main changes from baseline to final source are the receiver and maintenance-runner implementation, runner build repair, hosted-evidence packaging, explicitly requested Flashcards activation, tests and documentation. There are no application `src/` changes in that range; the workflow still requires evidence tied to the exact final SHA.
