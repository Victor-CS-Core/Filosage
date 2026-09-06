# R12 requested-language and sanitation implementation

Status: local implementation and focused verification ready for parent review. Human catalog-language/RTL acceptance remains open.

## Changes

- Replace concatenated metadata/script quotas with field-aware instruction checks: conservative English/Spanish cues, proportional non-Latin evidence, alternative Japanese scripts, and explicit bilingual distribution for substantial fields.
- Exclude source metadata, IDs, citations, quoted/fenced examples and example-only fields from instruction-language evidence. Keep concise valid material without requiring padding.
- Preserve ordinary AI/API teaching, inert literal control examples, Greek STEM notation, Markdown and citation claims. Keep operative unquoted control-fragment and malformed-character defenses.
- Keep URL masking offsets stable so a later control fragment cannot truncate preceding legitimate prose.
- Report course DTO display repair only when sanitization changes the stored value; an untranslated language mismatch is not a repair.
- Correct existing V2 language expectations that accepted monolingual content for bilingual requests. A Greek body remains valid but cannot translate surrounding English course/practice fields.
- Document the tested language boundary without certifying arbitrary languages or actual catalog quality in `docs/releases/2026-09-language-support.md`.

## Verification

Node 22 activated via `/workspace/scratch/735f0a2ac981/release-audit/verification-environment/activate.sh`.

Meaningful red evidence against unchanged base `6b3ce0d`: four targeted regressions failed on bilingual monolingual acceptance, tiny Japanese padding, legitimate tool/API text rejection, and actual lesson DTO truncation. Preserved source changes were restored after the temporary baseline run. Local transcript: `/workspace/scratch/735f0a2ac981/release-implementation/R12-baseline-red.txt`.

Two additional regressions failed before follow-up fixes: experience/interaction feedback fields were omitted from evidence, and URL masking moved the later control-fragment boundary.

Green: 83 tests passed with `node_modules/.bin/playwright test --config=.r12-contracts.config.ts`: 16 new content-language tests plus the existing course-pipeline V2, source-citation and lesson-pedagogy suites. The temporary runner remains untracked; root owns shared suite manifest registration for new `tests/content-language.spec.ts`.

Focused Oxlint and ESLint passed for both changed library files and both affected test files. Full `tsc --noEmit --incremental false` passed. No framework behavior was changed, no provider calls were made, and no browser/production result is claimed. Existing 15-second parse-artifact evidence was not changed.

## Independent review follow-up

Review of `121660e` requested four corrections. All four were reproduced as failing regressions before the follow-up implementation:

- A substantial body wrapped entirely in quotes, a blockquote or code cannot erase all requested-language evidence and pass. Genuine examples embedded in requested-language explanations remain valid.
- English/Spanish evidence belongs to bounded sentences and phrases, using distinct cues and distinct word evidence. Repeating `el la y` (including repetition padded with a noun) cannot claim the surrounding English body's letters for Spanish.
- Fenced-code ranges honor marker type and opening length, including four-backtick examples containing triple backticks. Deliberate ASCII/curly single-quoted literals remain inert, and inline parsing cannot cross a code-fence boundary.
- Short unaccented adjacent Greek variables such as `αβ` and `Δθ` survive in explicit STEM context. Unexpected Greek sentences still fail the script defense.

The follow-up focused suite passes **87 tests**, including 20 content-language tests. Focused Oxlint/ESLint and full `tsc --noEmit --incremental false` passed. The parent reviewer must accept the follow-up before integration; no independent approval or external language-quality acceptance is inferred from these tests.

The second independent review found two residual P1 cases: a tiny `Read:` preface before a long English quotation passed Japanese, and natural repeated English prose diluted the distinct-word numerator with a raw-letter denominator. Both were reproduced before correction. Quoted/code body checks now require enough surrounding instructional evidence to evaluate, so tiny prefaces and labels do not certify a substantial example-only body. Latin-script ratios now use the same sentence-local distinct-letter accounting for both numerator and denominator. Standalone concise valid instructions remain accepted. The isolated language/V2/citation verification passes **84 tests**, including 21 content-language tests; R11 pedagogy work is intentionally excluded from this follow-up commit.

## Remaining acceptance and operational state

The subsequent positive review cases exposed a false denial for short real English/Japanese instructions before long examples. Those cases were reproduced and corrected: a complete concise instruction with confident requested-language evidence can introduce an example without reaching 40 prose letters. Neutral `Read:` labels, wrong-language prefaces, quoted-only bodies, cue repetition and natural repeated-English mismatches retain their negative outcomes. This follow-up modifies only R12 files; ongoing R11 work remains separate.

- Competent review of actual English/non-English/bilingual catalog teaching, translation equivalence and Arabic/RTL browser/accessibility presentation is still required. Heuristics detect clear mismatches; they do not certify language quality.
- The sequence interaction's fixed English curation prompt needs R11/integration review as application guidance versus translated instruction; it is documented, not silently changed.
- R11 semantic pedagogy changes, generation/lesson routes, shared manifests, provider operations and interface translation are outside this commit.
- Multica: parent owns the existing release/R12 item and lifecycle delivery; no item ID was supplied to this worker, and no separate or queued event is claimed. Owner: delegated language-quality worker; status: review-ready locally, external acceptance open.
- Authorization: implementation and local commits authorized; root handles integration/push. Merge, deployment, production changes, billing, credentials and accounts were not performed.
- Commit: this report accompanies the R12 local implementation commit. Push: not performed by this worker. Deployment: not performed. Production verification: not performed. External language reviewers and browser/catalog evidence remain blockers to full R12 acceptance.
