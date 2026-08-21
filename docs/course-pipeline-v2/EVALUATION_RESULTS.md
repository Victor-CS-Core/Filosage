# Evaluation Results

Date: 2026-08-11.

## Defect reproduction and regression

Before repair, 2 of 2 focused fixtures failed:

- A concise but complete lesson was denied only because it was below the publication-only 1,500-character threshold.
- A schema-v5 lesson with no topic-appropriate Recognition drill was denied even though generation declared that interaction optional.

The current V2 suite passes 34 of 34. It covers both original defects, a valid 400-799-character lesson, content hashes including nested IDs, typed manual/repair decisions, exact executed-rule metadata, stable objective mappings, multilingual routing/applicability, legacy/V2 artifact separation, durable payload-bound lab retry, atomic unpublish, stale user edits, and late lesson generation racing publication. The focused lesson-interaction browser suite passes 7 of 7, including reload hydration of mastered evidence and SHA-256 receipt binding.

## Representative corpus

`evals/course-pipeline/dataset/v1.ts` contains 100 requests across the specified disciplines, levels, scopes, languages, freshness, high-risk, accessibility, lab/visual applicability, and prompt-injection variants. Regular CI asserts deterministic route, review-policy, lab-applicability, and visual-applicability invariants without asserting exact generated prose.

This is not described as a 100-course live model evaluation. The live suite remains opt-in because it consumes quota and requires an authenticated evaluation environment. Production owner acceptance created, inspected, approved, published, and opened one complete real course: 4 modules, 12 lessons, and four activity stages per lesson. Its actual pipeline result is recorded in `RELEASE_EVIDENCE.md`.

## Executed system evidence

- Lint: pass, zero warnings.
- TypeScript: pass.
- Production Next build: pass, 73 generated routes/pages.
- Full Playwright desktop/mobile matrix: 677 passed, 25 intentional skips, 0 failed.
- Axe checks embedded in critical manual-review and targeted-repair journeys: pass.
- Production dependency audit: 0 vulnerabilities at high severity or above.

## Calibration outcome

Deterministic validity is separated from semantic certification. Until a calibrated independent evaluator, claim-support lane, runtime accessibility verification, and asset availability probe execute, V2 returns explicit manual issues and cannot auto-publish. This prevents an unexecuted lane from being reported as passed.

## Still required before cohort expansion

- Scheduled live comparison on the 100-case corpus with pinned model/prompt/contract versions, latency, tokens, cost, false-denial, and repair outcomes.
- Measured V1/V2 shadow disagreements on real candidates.
- Hosted Azure PostgreSQL race scheduling beyond pure transaction-callback tests.
- Production baseline and alert thresholds.
