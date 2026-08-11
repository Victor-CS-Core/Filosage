# Evaluation Plan

Dataset source: `evals/course-pipeline/dataset/v1.ts` generates 100 stable cases from 20 required topic classes and five learner/scope profiles.

Stable CI uses recorded artifacts and asserts schemas, relationships, exact rule codes, warning/block separation, snapshot behavior, security, state transitions, and repair isolation. Live model evaluation is on-demand with pinned contract, prompt, dataset, and model versions; it never asserts exact prose.

Required comparisons:

- technical completion and first-pass hard-gate pass;
- false denial and unexplained acceptance against gold invariants;
- repair invocation/success by rule and unrelated-path change rate;
- manual-review routing;
- stage latency, model attempts, tokens, and cost;
- lab/visual applicability and runtime failures;
- stale validation/edit conflicts and quota release failures.

Current release floor remains: every deterministic test green, zero unexplained gold false denials, no P0/P1, no user-edit loss, stale publication impossible, supported capabilities green, critical security/accessibility green, production and Sites builds green, and two full critic passes without a new blocker.
