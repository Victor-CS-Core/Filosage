# Reviewed release capabilities

Updated 2026-09-06. This document describes source behavior and the proposed candidate selection. It contains no claim that a CI run, hosted candidate verification, production promotion, or commercial activation has passed.

`config/release-capabilities.json` is the reviewed optional-feature selection. A change to that file requires a new candidate SHA and new inactive-revision image evidence. The selection preserves the approved owner V2 canary: pipeline, validation, repair, and publication on with owner-only eligibility and cohort zero. Flashcards, Command Center, labs, and visuals remain off. These values do not assert any current hosted flag state.

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

## One candidate through inactive verification and promotion

The [single-application runbook](BLUE_GREEN_BFF_OPERATIONS.md) supersedes the separate-QA flow. `azure-staging.yml` builds the committed selection once, deploys by digest to the observed inactive revision, verifies 100/0 traffic and shared auth stability, and retains `release-candidate-<sha>`. `azure-candidate-verification.yml` binds the hosted proof artifacts and human review to that candidate; `azure-promote-staging.yml` rechecks the exact image and evidence and swaps traffic without rebuilding.

Build arguments and revision runtime values both come from `node scripts/release-capabilities.mjs environment`; Docker validates them before Next builds. This is necessary for browser build-time flags such as `NEXT_PUBLIC_COMMAND_CENTER_V2`. The artifact includes schema version 2, full SHA, image digest, manifest, canonical production origin, revision URL/name/label, app resource ID and shared authentication fingerprint. Successful exact-SHA run and artifact identities are checked together; the JSON alone is not a hosted approval.

The image digest in `/api/health` is a deployment assertion (`RELEASE_IMAGE_DIGEST`), because a process cannot infer its registry digest. Each workflow also reads the actual image reference from Azure and compares it with the artifact. A reported digest without that platform readback is insufficient deployment proof.

## Manual verification and downstream interface

Use Node 22. Work from the candidate checkout and retain the successful candidate run ID and downloaded artifact. The following commands validate non-secret evidence; populate the release environment separately through the approved process.

```bash
node scripts/release-capabilities.mjs verify-evidence /path/to/release-candidate.json <full-sha> https://filosage.com
node scripts/release-capabilities.mjs environment
```

The first command prints only validated `EXPECTED_IMAGE_DIGEST`, `EXPECTED_AUTH_MODE`, and `CANDIDATE_ORIGIN` assignments. Set `EXPECTED_IMAGE_DIGEST` from that output, set `EXPECTED_AUTH_MODE` to the separately approved mode for the target, and run:

```bash
npm run check:production -- https://target-revision.example <full-sha> https://filosage.com
```

The expected canonical origin remains `https://filosage.com` when testing the candidate revision URL. `check:release` requires `SITE_VERSION` to match the approved full `EXPECTED_SITE_VERSION`, exact explicit runtime switches, `EXPECTED_SITE_ORIGIN`, and `EXPECTED_AUTH_MODE`; it also validates the closed-billing and provider configuration. `RELEASE_CAPABILITIES_JSON` accepts a complete, strictly validated manifest for isolated local matrix fixtures; release workflows always use the committed file and do not expose an override input.

Downstream R19–R25 consume the same artifact, SHA, digest, manifest, canonical origin, auth selection, and actual Azure revision image. Record independent local test, CI, inactive-revision journey, production readback, rollback, and paid-activation evidence. Optional feature activation needs its separate persistence, recovery, accessibility, quality, cost, and entitlement proof. No command here authorizes deployment, promotion, secret changes, or paid activation.

## Historical evidence

The August 18 flashcard activation plan and August 21 operations all-on requirements describe earlier decisions and are superseded for new release selection by this manifest. Historical runs, screenshots, model outputs, dates, and hashes remain historical evidence. The July 28 roadmap's anonymous local-progress and one-outline/ten-lesson Plus assumptions are superseded by verified-account learner work and course credits (Plus two monthly, cap 24; Pro five monthly, cap 60; redeemed outlines grant planned lessons). Publication source has multiple proof paths; earlier statements that every publication reruns a fresh full review are not current readiness evidence.
