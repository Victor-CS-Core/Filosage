# Filosage base-release implementation evidence

**Date:** August 13, 2026

**Result:** Local release candidate complete; production deployment and paid activation are not authorized

**Baseline:** `aad1116dd1a73c923d7bc3128cfb7cb7eefb7ce1` (`main` and `origin/main` matched before implementation)

**Working state:** Changes are present but uncommitted on local `main`

## Implemented

### Professional sources and deep-linked citations

- Extended course sources with author, publisher, publication date, access date, and review-state metadata while preserving legacy reads.
- Added per-lesson source assignment so lesson generation receives only the sources planned for that lesson.
- Replaced free-form generated references with structured citations tied to an existing source ID, an exact visible lesson claim, a lesson section, and an optional locator.
- Added deterministic validation for invented IDs, unsafe URLs, unassigned sources, unsupported claims, malformed dates, and missing source evidence notes.
- Added learner-facing citation cards with descriptive external links, publisher/date metadata, exact supported claims, snapshot review state, and the existing report-content route.
- Added publication review gates that require every planned or cited source to be verified and require an authoritative primary or official source for high-stakes topics.
- Kept private author evidence notes out of learner DTOs and kept legacy lessons valid when structured citations are absent.

This is a conservative attribution and review implementation. It does not fetch, copy, scrape, mirror, or make an automatic fair-use determination about third-party works. Independent legal review remains a paid-launch gate.

### Guided Day learner home

- Reworked the signed-in home around one real next action and a code-native Recall -> Learn -> Reflect path.
- Added an always-visible, three-row Today plan and a compact evidence band explaining the review signal, course position, and weekly goal.
- Reduced the new-account default density while retaining Focused, Progress, Discover, and custom views.
- Added desktop drag reordering plus touch pointer reordering, keyboard arrow reordering, explicit Move up/Move down buttons, and an `aria-live` confirmation.
- Preserved the validated authenticated dashboard-preference contract and kept the primary learning path outside the hideable card registry.
- Generated three concept compositions with the built-in image generator, selected Guided Day option C under the owner's delegated creative direction, and recorded the production literalization boundary in `.impeccable/surfaces/learner-home.md`.
- Captured and reviewed authenticated desktop and phone screenshots. The required independent finish review returned `SHIP` after the Today plan, evidence band, semantic labeling, and elevation corrections were applied.

### Release and billing foundation

- Updated the lockfile from vulnerable `nanoid` 3.3.17 to 3.3.18 without changing the application dependency contract.
- Updated the deterministic local lesson generator to satisfy the strict citation schema with an empty citation list when no sources are assigned.
- Preserved the existing Free, Plus, and Pro offer, entitlement, portal, lifecycle, and historical-price behavior.
- Did not create Stripe objects, change provider configuration, modify hosted secrets, enable checkout, push, commit, deploy, or publish a course.

## Validation evidence

| Gate | Result |
| --- | --- |
| Lint | Pass: `npm.cmd run lint` |
| Production build and TypeScript | Pass: `npm.cmd run build`; Next.js 16.2.12 compiled and generated all 73 routes |
| Production dependency audit | Pass: 0 vulnerabilities from `npm.cmd audit --omit=dev --json` |
| Patch hygiene | Pass: `git diff --check` returned no whitespace errors |
| Strict source/citation and generation profiles | Pass: 13 focused checks |
| Learner citation flow | Pass: 7 focused checks, including descriptive deep links |
| Course pipeline and publication review | Pass: 48 focused checks |
| Dashboard desktop/mobile and accessible reorder | Pass, plus authenticated visual review |
| Billing lifecycle and offer matrix | Pass: 81/81 across desktop Chromium, mobile Chromium, and mobile WebKit |
| Complete repository matrix | Pass: all 816 collected cases completed; 789 passed and 27 intentional skips |
| Tracked-file secret-pattern review | No credential retained: matches were test-only placeholder keys, documented private-key placeholders, and coincidental strings inside embedded base64 brand assets |
| Impeccable finish review | `SHIP` |

The first complete run exposed one stale test label and one parallel-only Command Center timeout. The test label was updated to the intentional `Today's plan` name. The exact Command Center case passed unchanged in its mobile Chromium project. A second complete run passed.

## Release configuration result

`npm.cmd run check:release` correctly fails in this local shell because the deployment environment is not populated. It reports these required names as missing:

- `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, and `AZURE_EASY_AUTH_ENABLED`;
- Azure storage, PostgreSQL, and resource-group identifiers;
- `OPENAI_API_KEY`, `OWNER_EMAIL`, `MIGRATED_OWNER_UID`, and `ACTIVITY_RECEIPT_SECRET`;
- the monitored operations webhook URL and secret;
- the exact 40-character `SITE_VERSION`.

`.env.example` keeps `BILLING_PROVIDER=none` and `BILLING_ENABLED=false`. The local `.env.local` does not currently declare `BILLING_ENABLED`; the release check requires it to be explicitly `false` for a closed-billing deployment. Do not infer hosted configuration from the local shell. Populate and verify release variables only in the approved deployment environment and rerun the closed-billing release check there.

## Remaining no-go gates

The application code is locally release-candidate ready, but the repository's own commercial runbook still blocks any claim of operational or paid-launch readiness until external evidence closes these items:

1. Configure managed backup and complete a restore rehearsal in a separate non-production target.
2. Deliver and acknowledge signed operational alerts at an independently monitored receiver and configure external health monitoring.
3. Prove transactional lifecycle email delivery, bounce handling, unsubscribe/suppression, renewals, failures, refunds, and cancellations.
4. Complete a real signed-in Filosage account-deletion exercise against Stripe Test mode.
5. Complete production-like private-course acceptance for the new source/citation schema without exposing private source notes.
6. Resolve open high-risk safety, privacy, copyright, account-access, and content reports.
7. Obtain independent Florida counsel review of the exact hosted legal, refund, age, analytics, and source/copyright practices.
8. Review Stripe Live products, four price mappings, webhook, portal, tax behavior, statement descriptor, refund handling, and historical prices.
9. Commit an intentional candidate, deploy only with separate authorization, and prove `HEAD`, `origin/main`, the deployed `SITE_VERSION`, and production health all identify the same full SHA.
10. Change `BILLING_ENABLED=true` only after every paid gate passes and the owner gives a separate explicit activation instruction.

## Rollback boundary

- Citation generation can be returned to no-source operation without deleting stored source or citation metadata; legacy lessons remain readable.
- The learner home can return to its prior composition while retaining backward-compatible dashboard preferences.
- New checkout remains stopped by the billing lock; existing-subscriber portal and signed webhook lifecycle handling must remain available.
- No external system changed during this implementation, so there is no provider or production rollback to perform.
