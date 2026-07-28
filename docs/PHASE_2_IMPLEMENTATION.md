# Phase 2 Implementation

Status: engineering release candidate complete on 2026-07-28. Live retention and commercial gates remain unproven.

## Product outcome

Phase 2 turns the Phase 1 outcome path into a returnable learning system. A learner now receives a finite daily mission, a visible weekly milestone, adaptive review timing, confidence feedback, and delayed evidence checks without creating punitive catch-up debt.

This release does not activate billing, claim product-market fit, or satisfy the Day 7 and Day 28 gates without live learner evidence.

## Implemented learning loop

1. The dashboard pairs at most one priority review with one forward learning action.
2. Missed days do not accumulate into an unbounded backlog.
3. Review timing adapts to first-attempt accuracy, retries, performance, and confidence calibration.
4. Overconfidence and fragile performance shorten the next interval; strong calibrated performance lengthens it.
5. Completed lessons schedule separate 7-day and 28-day delayed checks.
6. The review queue prioritizes overdue delayed checks and fragile evidence ahead of routine reviews.
7. Weekly milestones show finite progress against a learner-selected target.
8. In-app learning prompts are opt-in. Learners can choose cadence and time or download a recurring calendar reminder.
9. Outcome plans can be paused, resumed, and rescheduled with history preserved.
10. Capstone revisions are retained as evidence history rather than replacing the previous attempt.
11. Completed evidence reports point learners to a next public outcome and measure second-outcome starts.

## Structured practice rendering

Guided and transfer practice now render through the same safe GitHub-Flavored Markdown path as lesson content. Tables, lists, headings, emphasis, and code are presented semantically and remain horizontally contained on narrow screens.

Three safeguards prevent the transaction-table failure shown in the reported lesson:

1. Legacy lesson content is normalized when it crosses the course API boundary.
2. A collapsed one-line Markdown table is repaired into real rows before visual rendering or speech output.
3. Lesson generation uses the `2026-07-28-structured-practice` contract and the `didactic-v2` quality gate, which rejects collapsed structured tables and regenerates or repairs the lesson.

The regression fixture intentionally includes a collapsed transaction table and verifies that the page contains a semantic table, does not expose raw pipe syntax, and remains contained on mobile.

## Data and measurement

The learner record now stores:

- Performance band and confidence calibration.
- Review history and review kind.
- Adaptive interval stage and next review.
- Delayed-check due dates, completion state, and score.
- Reminder preferences.
- Outcome pause, resume, and schedule history.
- Capstone revision history.

The admin retention view reports:

- Day 7 and Day 28 retained learner rates.
- Due-review completion.
- Daily-mission starts.
- Delayed-check completions.
- Confidence-calibrated sessions and overconfidence signals.
- Activated learners who demonstrate an applied criterion.

These metrics are measurement infrastructure. They only become business evidence after qualified learners use the product over the required time windows.

## Deleted-course hygiene

Course deletion cleanup remains a release invariant. Deleted or inaccessible courses are removed from local and synchronized progress, bookmarks, notes, review schedules, goals, recent searches, and continue-learning surfaces. Anonymous review data is purged as well.

## Security and browser behavior

HTTPS deployments keep HSTS and `upgrade-insecure-requests`. Local production validation is protocol-aware so WebKit does not rewrite local HTTP JavaScript and CSS requests to an unavailable HTTPS origin.

## Validation

- Lint: passed.
- Next.js production build: passed.
- Playwright: 122 passed, 1 skipped across desktop Chromium, mobile Chromium, and mobile WebKit.
- Exact guided-practice table fixture: passed in all three browser projects.

## Operational work before monetization

- Recruit qualified learners and observe the full Day 7 and Day 28 windows.
- Interview retained and churned learners to separate outcome-driven return behavior from reminder-driven behavior.
- Expand the flagship catalog only at the pace supported by subject-matter review.
- Configure a transactional email provider before offering email reminders; this release does not imply email delivery.
- Complete legal-operator, support, refund, tax, and subscription-lifecycle readiness.
- Keep `BILLING_ENABLED=false` until the owner separately approves paid activation after the Phase 2 evidence gate.

