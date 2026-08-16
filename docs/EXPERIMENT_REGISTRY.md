# Experiment Registry

Every product experiment needs one primary hypothesis, one decision metric, an owner, and a decision date. Do not run overlapping experiments on the same funnel unless interaction effects are part of the design.

## EXP-001 — Work-goal campaign positioning

- Status: active
- Start: July 28, 2026
- Decision date: after 200 qualified landing actors or 20 qualified interviews, whichever is later
- Surface: public home and library entry
- Campaign cohort: product and data professionals with a current 2–8 week learning need; this cohort does not limit the broader product audience
- Previous message: broad public learning and durable understanding
- Active campaign message: learn a difficult capability needed for current work, apply it to a real situation, and inspect the resulting learning evidence
- Primary hypothesis: qualified visitors in this campaign cohort will inspect a relevant published course because its concrete outcome and evidence structure are more useful than generic AI course generation.
- Primary acquisition metric: `course_discovered / landing_viewed` within a consented anonymous session.
- Separate activation metrics: verified-account course start, first-practice completion, demonstrated criteria, and evidence engagement. Anonymous sessions are not joined to account identities to produce a person-level funnel.
- Supporting evidence: qualified interviews, meaningful return after first practice, and acquisition channel.
- Guardrails: factual-content reports, privacy requests, accessibility failures, and owner traffic contamination.
- Instrumentation:
  - `landing_viewed`
  - `course_discovered`
  - `signup_started`
  - `course_started`
  - `lesson_started`
  - `first_practice_completed`
  - `criterion_demonstrated`
  - Experiment ID `EXP-001-professional-outcome`
- Decision:
  - Continue if qualified learning starts and interviews confirm an urgent recurring job.
  - Narrow the role or trigger if interest is broad but commitments are weak.
  - Reject the position if participants do not have a current outcome or use existing substitutes without meaningful pain.
- Result: pending real traffic and interviews.

## EXP-002 — Outcome diagnostic versus course-first onboarding

- Status: queued for Phase 1
- Hypothesis: starting with a real outcome and diagnostic will improve first-practice activation compared with selecting or generating a course first.
- Primary metric: `first_practice_completed / outcome_defined` within 24 hours.
- Guardrail: median time to first practice under ten minutes.
- Result: not started.

## EXP-003 — Immediate practice versus plan preview

- Status: queued for Phase 1
- Hypothesis: a small relevant practice task immediately after diagnosis creates a stronger first win than showing the full plan first.
- Primary metric: first-practice completion and Day 7 retention.
- Result: not started.

## Change log

| Date | Experiment | Change | Reason |
| --- | --- | --- | --- |
| 2026-07-28 | EXP-001 | Started work-goal campaign positioning | Phase 0 market validation |
| 2026-08-16 | EXP-001 | Separated the campaign cohort from product eligibility and split anonymous acquisition from verified activation | Capability-grounded marketing Gauntlet |
