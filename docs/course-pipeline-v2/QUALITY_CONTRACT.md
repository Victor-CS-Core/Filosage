# Course Quality Contract V2

Machine source: `src/lib/course-pipeline/contract.ts`, `rules.ts`, `schemas.ts`, and `validation.ts`.

Current contract: `course-quality-v2.0.0`.

## Decision rules

- `blocker` and `error` findings prevent automatic publication.
- Explicit policy uncertainty sets `requiresManualReview` and produces `manual_review`.
- `warning` and `info` findings never silently block publication.
- Every diagnostic contains a stable rule code, path, severity, source, repairability, suggested action, and contract version.
- Publication uses the aggregate V2 snapshot hash and transactionally rechecks every course and lesson fingerprint.
- `passedRuleCodes` includes only rules actually executed; skipped lanes are recorded in evaluator metadata.
- Latin-script language identity is not a deterministic hard gate because a marker list creates false denials. Non-Latin script conformance remains deterministic; exact language quality is reviewed in the semantic/manual lane.
- A substantive lesson may be concise when it still contains aligned explanation, action, feedback, and assessment; the shared lower content boundary is 400 characters, two takeaways, one guided step, one transfer criterion, and one valid quiz.

## Current stable codes

| Code | Class | Default effect |
|---|---|---|
| `CQ_SCHEMA_001` | Course schema | Blocker |
| `CQ_SCHEMA_002` | Lesson schema | Blocker |
| `CQ_SCHEMA_003` | Supported legacy adapter | Warning |
| `CQ_SCHEMA_004` | Legacy metadata insufficient to self-certify | Manual review/error |
| `CQ_STRUCTURE_001` | Missing lesson | Blocker, generation required |
| `CQ_ALIGNMENT_001` | Missing/nonobservable objective | Blocker |
| `CQ_ALIGNMENT_002` | Planned mode activity absent/misaligned | Blocker |
| `CQ_ALIGNMENT_003` | Objective-to-lesson mapping broken | Blocker |
| `CQ_ALIGNMENT_004` | Substantive lesson connection missing | Blocker |
| `CQ_ALIGNMENT_005` | Course artifact/milestone/capstone incoherent | Blocker |
| `CQ_ASSESSMENT_001` | Required assessment/feedback absent | Blocker |
| `CQ_ASSESSMENT_002` | Objective-to-assessment mapping broken | Blocker |
| `CQ_RELATIONSHIP_001` | Invalid prerequisite reference | Blocker |
| `CQ_COMPLETENESS_001` | Duplicate lesson | Blocker |
| `CQ_COMPLETENESS_002` | Required substantive lesson element absent | Blocker |
| `CQ_ENRICHMENT_001` | Concise explanation opportunity | Warning |
| `CQ_ENRICHMENT_002` | Teaching-mode/activity variety | Warning |
| `CQ_LAB_001` | Unsupported lab | Blocker |
| `CQ_LAB_002` | Recommended lab missing | Warning |
| `CQ_LAB_003` | Explicitly required lab missing | Blocker |
| `CQ_LAB_004` | Invalid lab applicability plan | Blocker |
| `CQ_VISUAL_001` | Essential visual and fallback absent | Blocker |
| `CQ_VISUAL_002` | Helpful visual absent/failed | Warning |
| `CQ_VISUAL_003` | Unsupported visual | Blocker |
| `CQ_VISUAL_004` | Invalid visual applicability/fallback plan | Blocker |
| `CQ_SOURCE_001` | Unsafe source URL | Blocker |
| `CQ_SOURCE_002` | Evidence needs human verification | Manual review/error |
| `CQ_SEMANTIC_001` | Calibrated semantic/claim review not executed | Manual review/error |
| `CQ_ACCESSIBILITY_001` | Runtime accessibility verification not executed | Manual review/error |
| `CQ_ASSET_001` | Runtime asset availability verification not executed | Manual review/error |
| `CQ_SECURITY_001` | Unsafe or contaminated content | Blocker |
| `CQ_LANGUAGE_001` | Requested instruction language not satisfied | Blocker |
| `CQ_PUBLICATION_001` | Stale snapshot | Blocker |

## Contract limitations before cohort expansion

The deterministic contract now persists stable objective/assessment IDs, explicit lab/visual plans, declared non-substantive lesson kinds, legacy compatibility warnings, and exact manual-review decisions. Some legacy quality helpers still emit strings before the V2 adapter assigns a code. Claim-level provenance/support and the calibrated semantic critic remain explicitly skipped lanes; neither is falsely listed as passed.
