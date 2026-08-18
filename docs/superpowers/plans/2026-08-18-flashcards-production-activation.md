# Flashcards Production Activation Plan

**Goal:** Make the already-deployed flashcard deck and AI-generation system available in isolated Azure QA and the guarded blue/green production release path while keeping billing closed.

**Root cause:** Production code contains the flashcard UI and APIs, but `FLASHCARD_DECKS_ENABLED` resolves false because the Azure deployment paths do not set either flashcard flag.

## Global Constraints

- Set `FLASHCARD_DECKS_ENABLED=true` and `FLASHCARD_AI_GENERATION_ENABLED=true` in both isolated QA and production candidate runtime configuration.
- Preserve `BILLING_ENABLED=false` everywhere; do not alter Stripe, secrets, accounts, or billing activation.
- Preserve `.env.example` defaults as false so unreviewed environments remain fail-closed.
- Keep the change limited to the release contract, Azure configuration, focused tests, and production-operations documentation.
- Follow strict red-green TDD: add a failing behavioral release-validation test before changing `scripts/check-release-env.mjs`; add failing Azure configuration contract assertions before changing workflows or Bicep.
- Do not deploy, promote, or push from a subagent. The primary agent owns all external release actions and exact-SHA verification.

## Task 1: Enforce and configure the flashcard production release contract

**Files:**

- Modify: `tests/release-scripts.spec.ts`
- Modify: `scripts/check-release-env.mjs`
- Modify: `tests/azure-infrastructure.spec.ts`
- Modify: `.github/workflows/azure-qa.yml`
- Modify: `.github/workflows/azure-staging.yml`
- Modify: `infra/azure/qa.bicep`
- Modify: `infra/azure/main.bicep`
- Modify: `docs/PRODUCTION_OPERATIONS.md`

**Acceptance criteria:**

1. `check-release-env.mjs` fails a production release unless both flashcard flags are explicitly `true`, with a distinct actionable error for each flag.
2. Existing closed-billing validation remains unchanged and requires `BILLING_ENABLED=false`.
3. The isolated QA workflow and QA Bicep set both flashcard flags to `true`.
4. The production staging workflow and production Bicep set both flashcard flags to `true`.
5. The operations runbook documents both required production flags and keeps the separate billing prohibition.
6. `.env.example` remains fail-closed with both flashcard flags set to `false`.
7. Focused release and Azure contract tests pass after showing the expected red failures first.
8. Both Bicep files compile successfully.
9. The implementation is committed on the isolated branch with no unrelated changes.

**Implementation sequence:**

1. Add the release-script test cases for missing/false flashcard flags and update the valid fixture to use both `true` values.
2. Run only the release-script test and confirm it fails because the validator does not yet enforce the flags.
3. Add the smallest validation to `check-release-env.mjs`; rerun and confirm green.
4. Add Azure contract assertions covering the two workflows and two Bicep files.
5. Run only the Azure infrastructure contract and confirm it fails because the deployment paths omit the flags.
6. Add the two flags to each deployment path without changing billing or unrelated settings; rerun and confirm green.
7. Update the operations runbook.
8. Run the combined focused contract suite and both Bicep compilation commands.
9. Review the diff for scope, verify `.env.example` remains false, and commit.
