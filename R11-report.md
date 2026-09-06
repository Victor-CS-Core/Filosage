# R11 capability-preserving lessons and recovery

Status: bounded repository implementation ready for independent review after local verification. Actual pedagogical acceptance remains dependent on R13/full-course and competent catalog evaluation.

## Implemented

- Replaced the sourced lesson's exactly-one-factual-sentence/source-fidelity-only instructions with a shared capability-preserving prompt. Several atomic facts can teach the saved capability within the unchanged eight-citation schema; each exact sentence/source/evidence/section binding and independent whole-lesson verifier remains required.
- Removed instructions to silently narrow/reframe the objective and the sourced 450–750-word target. New generation copies the saved single-win objective label. Its output gate rejects label drift with `LD_REPLAN_001`; a final drift failure returns actionable `LEARNING_DESIGN_REPLAN_REQUIRED` / 422 without saving a lesson. Existing compatibility callers retain their prior objective wording policy.
- Added `assertLearningDesignReady` and typed `LearningDesignReplanRequiredError` around the existing real contract validator. R08 owner integrated the course route: replace log-only invalid-plan handling, save operation failure with issues/recovery, refund once, require a deliberate revised Course Studio request. That route and journal commit belong to R08, not this commit.
- Preserved authored sequence prompts including Spanish through repeated curation/derivation; retained neutralization of the explicit English first/then/finally order giveaway. English interface/accessibility controls remain unchanged.
- Set the unimplemented semantic repair allowance to zero. Existing allowlisted structural repair, snapshot protection and author-content preservation remain unchanged; no semantic proof is fabricated.
- Bumped only lesson prompt versions for provenance. No provider/cache limit, course prompt or billing policy changed.

## Evidence

Read R11 brief/full plan/global constraints and installed Next client/server guidance; parent explicitly approved the focused lesson-route prompt/import/quality-gate hunks. Coordinated course-route helper integration with generation_durability.

Meaningful red cases: a generated source-fidelity objective was accepted despite a planned classification capability; Spanish sequence guidance was replaced with English. Both were reproduced before their fixes. Added actual contract/error tests and multiple-factual-sentence atomic citation checks: both claims require separate evaluation, combined sentence bindings fail, and an unsupported second claim cannot borrow the first claim's proof.

Node 22 focused verification: **117 non-browser tests passed** across content-language, V2, learning-design, source-citations, lesson-pedagogy and interaction contracts. The existing browser-only recognition test was initially discovered by the temporary combined runner and could not execute; it is excluded from the non-browser count. The eight generation-profile tests also passed after the lesson prompt-version bumps. Focused Oxlint/ESLint and full TypeScript verification passed. No provider calls were made. Existing 15-second parse artifact evidence was preserved.

## Boundaries and integration

- R08 must include the new learning-design helper before typecheck; its private operation failure/persistence/refund proof is owned by that work package. R09 must retain the new objective/prompt gate and add durable lesson-operation failure replay.
- No new shared suite manifest entries: existing specs gained tests. Temporary `.r11-contracts.config.ts` remains untracked and is only a local runner.
- Structural objective-label identity does not establish semantic alignment. The independent semantic/manual gate must still assess whether every released practice is solvable and advances the promised capability. Exact citations do not prove comprehension or transfer quality.
- Available user recovery is revised Course Studio brief plus deliberate new course request. No in-place semantic subtree replan editor, paid generation acceptance, browser/accessibility pass, hosted deployment or catalog-language certification is claimed.
- Multica: existing parent-owned R11/release item; worker owner language_quality; local status review-ready. No new ID, queued event or external lifecycle delivery was invented.
- Authorization: implementation and local commit authorized. Push/integration belongs to root. No merge, deployment, production verification, paid provider call, billing activation, credential/account administration or external mutation was performed.
