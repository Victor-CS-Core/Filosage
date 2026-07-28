# Phase 1 Outcome Validation

Status: production release candidate  
Release mode: direct production, no beta cohort  
Billing: remains disabled

## Product loop now implemented

1. A learner defines a concrete outcome, application context, proof artifact, pace, and optional target date.
2. A module-level diagnostic chooses the shortest credible starting route.
3. The plan explains why that route was chosen and labels the diagnostic as self-report rather than proof.
4. Lesson completion records separate lesson, retrieval, and transfer evidence without storing private practice responses.
5. A signed-in learner can submit the capstone before study for a criterion-by-criterion baseline.
6. The final capstone uses the same criteria, allowing a comparable improvement measure.
7. The evidence report separates starting estimate, observed mastery, and verified improvement.
8. Every lesson shows a content version, source-pack status, and a content-issue reporting surface.
9. Content reports enter an owner-only queue with resolve and dismiss controls.

## Mastery Graph v1 policy

- Scope is one graph per course, with one objective node per module.
- Self-report can choose a route but cannot demonstrate an objective.
- Lesson completion introduces an objective.
- Successful retrieval or an unassessed transfer attempt moves it into practice.
- A later weak retrieval result marks prior practice as needing review.
- Independent transfer or a passed course capstone can demonstrate an objective.
- Raw learner responses are not copied into the evidence ledger.
- Anonymous plans and evidence stay on the current device. Accepted accounts sync to private user paths.

## Content integrity contract

- Generated lessons store content version, generation date, model, prompt version, and quality-gate version.
- Source references are shown only when they are actually attached.
- Lessons without a source pack say so explicitly.
- Public learners can report accuracy, freshness, source, clarity, or other issues.
- The owner queue preserves the lesson version that was reported.

## Deleted-course hygiene

- Course deletion removes generated lessons, every learner's progress and review schedule, bookmarks, notes, outcome plans, mastery evidence, feedback, and open content reports.
- Device storage is cleared immediately for the person deleting the course.
- Opening a deleted course or loading an anonymous review schedule prunes stale device records.
- Signed-in progress responses omit inaccessible courses and delete orphaned progress records, so stale entries cannot return to Continue Learning.
- Account export and deletion include the Phase 1 outcome and mastery records.

## Measurement

The owner research view now reports:

- Diagnostic-to-first-practice conversion.
- Median time from plan creation to first practice.
- Comparable baseline and final capstones.
- Capstone improvement rate.
- Evidence-report views.
- Open content reports.

The Phase 1 go gate remains:

- At least 50% diagnostic-to-first-practice conversion.
- Median first practice under ten minutes.
- At least 60% of comparable capstones improve.
- At least 70% learner-reported usefulness.
- Critical factual errors below the agreed threshold.

## Work that requires live operation

Engineering readiness does not satisfy the evidence gate by itself. Before Phase 2:

- Send qualified traffic directly to the production experience.
- Complete and expert-review the flagship pathway plus three supporting courses in `docs/LAUNCH_CATALOG.md`.
- Attach authoritative source packs to those courses instead of presenting generated text as grounded.
- Collect usefulness feedback and establish the critical-error threshold.
- Review the Phase 1 dashboard and content-report queue weekly.

No billing or Phase 2 retention expansion should be activated until the outcome gate is supported by live evidence.
