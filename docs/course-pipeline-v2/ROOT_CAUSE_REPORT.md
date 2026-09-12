# Root Cause Report

## Evidence boundary

No authenticated private-course records or production log connector were available. Representative fixtures reproduce code-backed defects without personal data. Production rates are therefore unavailable and are not inferred from tests.

## Confirmed causes and repairs

### RC-1: optional Recognition lab became mandatory at publication (P0)

Generation described Recognition v2 as optional and dropped an invalid/inapplicable candidate, but saved every generated lesson as schema v5. Publication then inferred a mandatory Recognition lab from `schemaVersion >= 5`. Full-lesson regeneration used the weaker generation rule, so denial could repeat.

Regression: `tests/course-pipeline-v2-regressions.spec.ts`, inapplicable optional Recognition case.

Repair: schema version no longer implies applicability. Explicit `required`, `recommended`, and `not_applicable` plans drive V2 validation, and only registered runtime types are accepted.

### RC-2: publication alone required 1,500 characters (P1)

Generation/schema/live evaluation accepted shorter structured lessons while publication rejected anything below 1,500 characters, with no legitimate lesson-role exception.

Regression: concise-but-complete lesson and declared non-substantive lesson fixtures.

Repair: the shared substantive boundary is 400 characters plus explicit teaching structure, so concise complete instruction is accepted without allowing empty prose. Introduction, review, glossary, reference, and capstone roles use a compatibility-aware structural contract rather than a uniform prose template.

### RC-3: publication fingerprint ignored nested IDs (P1)

Fingerprint canonicalization recursively removed every property named `id`, so relationship, source, and interaction ID-only changes could evade stale-review invalidation.

Regression: nested relationship/capability ID mutation.

Repair: only root document-store metadata is omitted. Nested IDs participate in the validated and published snapshot.

### RC-4: failures leaked capacity and allowance; finalization was replay-unsafe (P1)

Two direct outline rejection returns failed to release the course-capacity lease. Failed reservations retained a consumed product request, and repeated finalization could mutate totals twice.

Repair: all direct rejections release capacity; failed product events return the allowance while keeping actual provider cost; finalization is a no-op unless the request is still reserved; same-payload completed retries recover the saved result.

### RC-5: repair and publish lacked exact mutation replay semantics (P1)

Legacy repair regenerated a whole lesson with no issue report or base hash. Normal publish and owner override lacked a complete payload/snapshot-bound retry contract.

Repair: the guarded deterministic repair endpoint allows only typed, diagnosed operations, enforces aggregate and per-document fingerprints in a transaction, persists before/after audit data, fully revalidates, and provides stale-safe undo. Publish and override mutations are snapshot/idempotency-bound; immutable release copies preserve the released candidate.

### RC-6: runtime strategy and validators could not prove alignment (P1)

Objectives and assessment mappings were prose strings, lab/visual applicability was implicit, manual-review topics had no resolvable state, and the prose skill/prompt/eval gates drifted independently.

Repair: V2 introduces stable objective and assessment mappings, lab/visual plans and registries, a versioned contract, explicit manual-review resolution with evidence gating, compatibility adapters, persisted stage transitions, and durable diagnostics/shadow events.

## Remaining release blockers after implementation

- Claim-level retrieval, provenance, and automated claim-support validation are not implemented. Manual review can record verified primary/official source selection but cannot prove the generated claims are supported.
- The semantic critic is intentionally skipped until it is calibrated against accepted/rejected fixtures; it cannot block today.
- Semantic repair and a general typed patch language are not implemented. Automatic runtime repair is limited to two safe deterministic capability removals; missing/semantic content returns an explicit author/generation action.
- Hosted Azure PostgreSQL concurrency tests have not yet proven duplicate-finalize, concurrent publish, immutable-release conflict, or stale repair transactions under real transaction scheduling.
- Non-Recognition interactions do not yet provide the same durable mastery/progress semantics.
- No live 100-request full-generation evaluation, screenshot regression baseline, or real shadow/canary traffic baseline has been executed. Automated Axe checks do run on the critical manual-review and targeted-repair journeys.
- The operations timeline exists as an authorized API, but no rendered maintainer dashboard, alert integration, or measured release thresholds exist.

## Hypotheses eliminated or narrowed

- Unsafe learner code execution is absent; no runner is implemented or registered.
- Provider output is strictly parsed before success persistence.
- Retrieval outages cannot currently become course-quality denials because the product does not fetch author URLs.
- Stale publication was not wholly absent; its specific nested-ID hole is fixed and V2 adds immutable release evidence.

## Baseline metrics

Production generation, denial, repair, abandonment, latency, token/cost, lab/visual failure, conflict, and false-denial rates remain unavailable. Durable privacy-safe events now make those metrics collectable, but the first values must come from an authorized shadow run.
