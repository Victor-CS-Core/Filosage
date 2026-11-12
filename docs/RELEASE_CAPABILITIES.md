# Reviewed release capabilities

Updated 2026-11-12. This document describes source behavior and the reviewed Worker selection. It contains no claim that a CI run, hosted verification, production deployment, or commercial activation has passed.

`config/release-capabilities.json` is the reviewed optional-feature selection. A change to that file requires a new candidate SHA and Worker bundle evidence. The selection preserves the approved owner V2 canary: pipeline, validation, repair, and publication on with owner-only eligibility and cohort zero. Flashcards are enabled; Command Center, labs, and visuals remain off. These values do not assert any current hosted flag state.

| Capability | Manifest key | Runtime/build variable | Selection |
| --- | --- | --- | --- |
| Private flashcard decks | `flashcardDecks` | `FLASHCARD_DECKS_ENABLED` | true |
| AI flashcards | `flashcardGeneration` | `FLASHCARD_AI_GENERATION_ENABLED` | true |
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

## One candidate through Worker verification and deployment

The [production operations guide](PRODUCTION_OPERATIONS.md) defines the current release process. The selected SHA must pass the automatic quality gate, an explicitly requested full regression, `npm run build:cloudflare`, and `npm run test:worker-smoke` before a separately approved deployment. D1 migrations, R2 changes, secrets, routes, and billing activation remain separate gates.

Build-time and Worker runtime values must both match the committed manifest. This is necessary for browser build-time flags such as `NEXT_PUBLIC_COMMAND_CENTER_V2`. Evidence includes the full SHA, manifest, Worker bundle result, canonical production origin, Worker version and deployment ID, and direct-Google authentication mode. Successful exact-SHA checks and deployed version identities are checked together; local JSON alone is not hosted approval.

`/api/health` reports the source version and bounded runtime state. Read the actual Worker version and deployment IDs from Cloudflare after deployment; application self-reporting alone is insufficient deployment proof.

## Manual verification and downstream interface

Use Node 22. Work from the candidate checkout and retain the successful quality and regression run IDs. The following commands validate the local candidate; populate the release environment separately through the approved process.

```bash
npm run check:release
npm run build:cloudflare
npm run test:worker-smoke
```

Set `EXPECTED_AUTH_MODE=direct-google`, then verify the hosted target after an approved deployment:

```bash
npm run check:production -- https://filosage.com <full-sha>
```

`check:release` requires `SITE_VERSION` to match the approved full `EXPECTED_SITE_VERSION`, exact explicit runtime switches, `EXPECTED_SITE_ORIGIN`, and direct Google authentication; it also validates the closed-billing and provider configuration. `RELEASE_CAPABILITIES_JSON` accepts a complete, strictly validated manifest for isolated local matrix fixtures; release evidence uses the committed file.

Record independent local tests, CI, Worker bundle verification, production readback, rollback, and paid-activation evidence. Optional feature activation needs its separate persistence, recovery, accessibility, quality, cost, and entitlement proof. No command here authorizes deployment, secret changes, migrations, or paid activation.

## Historical evidence

The August 18 flashcard activation plan and August 21 operations all-on requirements describe earlier decisions and are superseded for new release selection by this manifest. Historical runs, screenshots, model outputs, dates, and hashes remain historical evidence. The July 28 roadmap's anonymous local-progress and one-outline/ten-lesson Plus assumptions are superseded by verified-account learner work and course credits (Plus two monthly, cap 24; Pro five monthly, cap 60; redeemed outlines grant planned lessons). Publication source has multiple proof paths; earlier statements that every publication reruns a fresh full review are not current readiness evidence.
