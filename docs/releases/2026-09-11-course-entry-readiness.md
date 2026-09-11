# Course entry verification, September 11, 2026

Guests could choose a lesson or choose to begin a course, but authentication returned them to the outline. The course page now passes the chosen lesson URL to the existing account-entry flow. The begin action passes the first unfinished lesson. Signed-in navigation uses the same destination.

The change is confined to the course page and regression tests. It does not change managed providers, canonical account identity, consent, return-path validation, session security, or lesson authorization. Anonymous visitors still receive only the catalog and outline; lesson reading, practice, and progress require the existing registered-account checks.

## Verification

- Three new browser regressions failed before the fix: selected lesson, begin action, and signup all returned to the outline instead of the lesson.
- All six focused Chromium checks passed after the fix. These cover the three regressions, encoded return-path safety, provider-aware entry, and saving pending signup acceptance without a duplicate prompt.
- The selected-lesson and begin-action regressions exercise the managed sign-in URL, reject an unrelated external `next` parameter, observe zero guest lesson requests, and simulate return using the same canonical identity. Existing-account return does not submit new legal consent.
- The signup regression uses the local authentication fixture. Continue remains disabled before agreement, the existing versioned consent payload is submitted exactly once, and the first lesson request occurs after acceptance. Lesson endpoints are mocked with a bounded response; these tests do not prove hosted Azure login or complete lesson participation.
- TypeScript, focused Oxlint/ESLint, and Git whitespace checks passed.

## Read-only boundary audit

Before this change, anonymous production GET requests returned 200 for the catalog (eight courses) and a sampled outline, and 401 for that course's lesson, progress, and practice endpoints. Local HTTP checks returned 401 for anonymous lesson, progress GET/POST, practice GET/POST, activity, and generation requests. Three verified-but-unregistered local GET requests returned 403. No production account or content was changed.

Five existing focused browser checks passed during that audit. The complete published-course browser flow failed its five-second route-heading assertions, including a retry. The retry trace recorded a 3.94-second lesson-route response followed by a successful lesson API response; this does not establish a navigation defect or a passing full flow. The coordinator will rerun the complete flow against the optimized integrated candidate.

Coordinator owns the shared progress log, Multica synchronization, integration, deployment, and production verification. This checkpoint does not deploy the change or verify hosted signup.
