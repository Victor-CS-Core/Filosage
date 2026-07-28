# Experiment Registry

Every product experiment needs one primary hypothesis, one decision metric, an owner, and a decision date. Do not run overlapping experiments on the same funnel unless interaction effects are part of the design.

## EXP-001 — Professional outcome positioning

- Status: active
- Start: July 28, 2026
- Decision date: after 200 qualified landing actors or 20 qualified interviews, whichever is later
- Surface: public home and library entry
- Audience: product and data professionals with a current 2–8 week learning need
- Previous message: broad public learning and durable understanding
- Active message: learn a difficult professional skill, apply it to real work, and produce evidence
- Primary hypothesis: qualified visitors will start a public course because outcome evidence is more valuable than generic AI course generation.
- Primary metric: `course_started / landing_viewed` unique-actor conversion.
- Supporting metrics: lesson-start conversion, first-practice completion, demonstrated criteria, interview commitment, and acquisition channel.
- Guardrails: factual-content reports, privacy requests, accessibility failures, and owner traffic contamination.
- Instrumentation:
  - `landing_viewed`
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
| 2026-07-28 | EXP-001 | Started professional-outcome positioning | Phase 0 market validation |
