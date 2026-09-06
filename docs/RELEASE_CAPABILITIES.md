# Reviewed release capabilities

Updated 2026-09-06. This document describes source behavior and the proposed candidate selection. It contains no claim that a CI run, hosted QA, production promotion, or commercial activation has passed.

`config/release-capabilities.json` is the reviewed optional-feature selection. A change to that file requires a new candidate SHA and new QA image evidence. The selection preserves the approved owner V2 canary: pipeline, validation, repair, and publication on with owner-only eligibility and cohort zero. Flashcards, Command Center, labs, and visuals remain off. These values do not assert any current hosted flag state.

| Capability | Manifest key | Runtime/build variable | Selection |
| --- | --- | --- | --- |
| Private flashcard decks | `flashcardDecks` | `FLASHCARD_DECKS_ENABLED` | false |
| AI flashcards | `flashcardGeneration` | `FLASHCARD_AI_GENERATION_ENABLED` | false |
| Legacy lesson visuals | `lessonVisuals` | `LESSON_VISUALS_ENABLED` | false |
| Owner operational Command Center | `commandCenter` | `COMMAND_CENTER_ENABLED` | false |
| Command Center AI drafts | `commandCenterDrafts` | `COMMAND_CENTER_DRAFTS_ENABLED` | false |
| Command Center V2 UI | `commandCenterV2` | `NEXT_PUBLIC_COMMAND_CENTER_V2` | false |
| V2 pipeline | `pipelineV2` | `COURSE_PIPELINE_V2` | true |
| V2 validation | `validationV2` | `COURSE_VALIDATION_V2` | true |
| V2 repair | `repairV2` | `COURSE_REPAIR_V2` | true |
| V2 labs | `labsV2` | `COURSE_LABS_V2` | false |
| V2 visuals | `visualsV2` | `COURSE_VISUALS_V2` | false |
| V2 publication | `publicationV2` | `COURSE_PUBLICATION_V2` | true |
| Pipeline shadow mode | `pipelineShadowMode` | `COURSE_PIPELINE_SHADOW_MODE` | false |
| Owner-only eligibility | `pipelineOwnerOnly` | `COURSE_PIPELINE_V2_OWNER_ONLY` | true |
| Non-owner pipeline cohort | `pipelineCohortPercent` | `COURSE_PIPELINE_V2_COHORT_PERCENT` | 0 |

Flashcards accept exactly `false/false`, `true/false` (manual decks/review without AI generation), or `true/true`. `false/true` is invalid. V2 validation/labs/visuals require the pipeline; repair/publication require validation. Every release value must have the exact type; absent values, boolean strings in health JSON, invalid dependencies, and unexpected activation or deactivation fail verification.

Core published discovery and verified-account learning are governed by authorization and learner gates, not by this optional-feature manifest. The public command palette remains distinct from the owner operational Command Center. Free/Plus/Pro/owner entitlements and the verified-account boundary are unchanged. Enabling a flag does not grant an entitlement, prove teaching quality, or authorize marketing. Billing is separately checked and the workflows keep `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`, and `STRIPE_TAX_READY=false`. Existing subscriber management and webhooks remain governed by their provider configuration and separate gates.

## One candidate through QA, staging, and promotion

1. Review the manifest in Git and qualify its full 40-character SHA through the existing quality/full-regression workflows. Do not change the feature selection using ad hoc environment overrides after QA.
2. The QA workflow renders manifest values using `node scripts/release-capabilities.mjs environment`. It supplies that exact set as Docker build arguments and explicit Azure runtime settings. Docker validates the build environment before Next builds; the image retains matching runtime defaults. Standalone `infra/azure/qa.bicep` also loads the same committed manifest for every release-controlled environment value, so applying the template cannot restore an independent feature selection. This matters especially for `NEXT_PUBLIC_COMMAND_CENTER_V2`, which Next freezes into browser bundles during build.
3. QA resolves the pushed image digest, deploys the digest reference, and verifies the actual Azure revision image plus health. Only after success does it upload `release-candidate-<full-sha>` containing `release-candidate.json`. Evidence includes schema version, SHA, image digest, full manifest, canonical production origin, QA origin, and QA auth mode. The successful workflow run is the approval evidence; the JSON alone is not.
4. Staging and promotion require `qa_run_id`, execute from the same candidate SHA, verify that exact QA run using `check-workflow-run-evidence.mjs`, and download that run's candidate artifact. The manifest must match the current candidate checkout exactly. Expired/missing artifacts require a fresh QA run; a mutable SHA tag is never substituted.
5. Staging verifies QA's recorded origin/auth mode, reads the QA image from Azure, deploys the same digest with the same explicit features to an inactive revision, and checks production's separately reviewed auth mode and canonical origin. Promotion rechecks the selected revision's Azure image and health before switching traffic. Both promotion health calls explicitly expect `https://filosage.com`.

The image digest in `/api/health` is a deployment assertion (`RELEASE_IMAGE_DIGEST`), because a process cannot infer its registry digest. Each workflow also reads the actual image reference from Azure and compares it with the artifact. A reported digest without that platform readback is insufficient deployment proof.

## Manual verification and downstream interface

Use Node 22. Work from the candidate checkout and retain the successful QA run ID and downloaded artifact. The following commands validate non-secret evidence; populate the release environment separately through the approved process.

```bash
node scripts/release-capabilities.mjs verify-evidence /path/to/release-candidate.json <full-sha> https://filosage.com
node scripts/release-capabilities.mjs environment
```

The first command prints only validated `EXPECTED_IMAGE_DIGEST`, `QA_AUTH_MODE`, and `QA_EVIDENCE_ORIGIN` assignments. Set `EXPECTED_IMAGE_DIGEST` from that output, set `EXPECTED_AUTH_MODE` to the separately approved mode for the target, and run:

```bash
npm run check:production -- https://target-revision.example <full-sha> https://filosage.com
```

For QA use the recorded QA origin as the final argument and the recorded QA auth mode. `check:release` requires `SITE_VERSION` to match the approved full `EXPECTED_SITE_VERSION`, exact explicit runtime switches, `EXPECTED_SITE_ORIGIN`, and `EXPECTED_AUTH_MODE`; it also validates the closed-billing and provider configuration. `RELEASE_CAPABILITIES_JSON` accepts a complete, strictly validated manifest for isolated local matrix fixtures; release workflows always use the committed file and do not expose an override input.

Downstream R19–R25 consume the same artifact, SHA, digest, manifest, canonical origin, auth selection, and actual Azure revision image. Record independent local test, CI, QA journey, inactive-slot, production readback, rollback, and paid-activation evidence. Optional feature activation needs its separate persistence, recovery, accessibility, quality, cost, and entitlement proof. No command here authorizes deployment, promotion, secret changes, or paid activation.

## Historical evidence

The August 18 flashcard activation plan and August 21 operations all-on requirements describe earlier decisions and are superseded for new release selection by this manifest. Historical runs, screenshots, model outputs, dates, and hashes remain historical evidence. The July 28 roadmap's anonymous local-progress and one-outline/ten-lesson Plus assumptions are superseded by verified-account learner work and course credits (Plus two monthly, cap 24; Pro five monthly, cap 60; redeemed outlines grant planned lessons). Publication source has multiple proof paths; earlier statements that every publication reruns a fresh full review are not current readiness evidence.
