# Filosage mobile-first application audit

Date: 2026-08-23
Scope: every application route, grouped by the shared surface that renders it
Evidence: repository inspection plus the full `mobile-chromium` and `mobile-webkit` Playwright projects

## Executive summary

Filosage already behaves responsively across its core learner experience. Both device-sensitive browser projects pass in full, the root viewport opts into safe-area rendering, the learner shell has dedicated mobile navigation, the Course Deck now contains pathological titles, and the course, lesson, create, progress, support, legal, and authentication experiences already have substantial narrow-screen rules.

The application is not yet demonstrably mobile-first across its complete route inventory. The remaining problem is not a broken global layout; it is incomplete route-accounted evidence plus a small set of interactive controls whose mobile hit areas remain below the 44px floor used elsewhere in the design system. A wholesale rewrite of roughly 5,000 lines of responsive CSS would add regression risk without improving verified behavior. The appropriate correction is to strengthen shared mobile contracts, fix the verified touch-target exceptions at their narrow breakpoints, and prove each route family at 320px and 390px while preserving tablet and desktop behavior.

## Route accounting

| Surface family | Routes | Current responsive evidence | Follow-up |
| --- | --- | --- | --- |
| Landing and public marketing | `/`, `/pricing` | Landing motion, auth gating, analytics consent, and pricing tests run in mobile projects | Retain; include in the route contract |
| Legal and privacy | `/terms`, `/privacy`, `/acceptable-use`, `/copyright`, `/privacy-center` | Dedicated narrow layouts and footer targets; legal nav is horizontally scrollable | Raise mobile legal-nav hit areas and cover the family at 320px |
| Learner shell | `/library`, `/create`, `/progress`, `/profile`, `/review`, `/standard` | Shared `AppShell`; desktop loop covers all six, mobile loop covers only four | Expand the mobile loop to the same representative set |
| Course and lesson | `/course/[topic]`, `/course/[topic]/lesson/[lessonId]` | Extensive 320/360/390 tests, WebKit coverage, Course Deck overflow regression | Retain; raise the lesson section navigator's phone hit area |
| Study tools | `/review/flashcards` | Populated workspace visual test; responsive CSS exists | Add explicit 390px containment/action-reachability assertions |
| Evidence | `/evidence-example`, `/evidence/[courseId]`, `/evidence/shared/[token]` | Shared evidence already asserts no overflow and accessibility; signed-in evidence has route tests | Exercise the shared report explicitly at 390px |
| Support | `/support`, `/support/articles/[slug]`, `/support/owner` | Support home and 390px article coverage; owner docs collapse to one column | Raise phone support/owner-document link hit areas |
| Authentication | `/auth/complete-link` | Mobile auth accessibility and linking tests | Retain existing coverage |
| Operations | `/admin`, `/admin/command-center` | Command Center tests include 375px; admin research layout only verifies 1024px | Add 390px admin containment and touch-target checks |

Every one of the 25 route templates is accounted for directly or through the shared shell/template that controls its responsive layout.

## Findings

### P2 — mobile route evidence is uneven

The signed-in desktop route loop covers `/library`, `/create`, `/progress`, `/profile`, `/review`, `/pricing`, `/support`, and `/standard`, while the mobile equivalent covers only `/create`, `/progress`, `/pricing`, and `/support`. Admin research is tested only from 1024px upward, and the flashcard workspace does not set a phone viewport. This makes the current “mobile-first across the application” claim stronger than the available regression evidence.

Recommendation: expand existing owner-shell coverage rather than create a parallel mock stack; add narrow, surface-specific assertions for admin, flashcards, and shared evidence.

### P2 — several phone controls use 34–40px minimum heights

The global phone rules correctly raise `.button`, `.button-small`, and `.icon-button` to 44px. The following purpose-built controls bypass that shared primitive:

- `.legal-local-nav a` — 38px
- `.support-article-nav li a` — 40px
- `.owner-docs-links a` — 38px
- `.admin-tabs button` — 40px
- `.admin-header-actions select` and `.admin-pro-controls select` — 40px
- `.admin-account-controls .button` and `.admin-launch-actions .button` — 36px overrides
- `.lesson-section-navigator button` — 34px

These are visible, primary navigation or action controls on narrow screens. They should follow the same 44px mobile interaction floor without changing desktop density.

### P3 — responsive source is predominantly desktop-first syntactically

Most component rules are desktop defaults followed by `max-width` overrides. The rendered behavior is responsive, but new work should prefer narrow base styles plus content-driven `min-width` enhancements when a component is touched substantially. Converting the entire stylesheet mechanically is not recommended: it would be a high-risk source rewrite with no user-visible acceptance gain. Existing legacy rules can remain when 320px, 390px, tablet, and desktop behavior is proven.

### Informational — automated design-detector warnings are contextual

The Impeccable detector reported three side-border patterns and one `Inter` font declaration. Inspection shows the borders are semantic evidence/preview callouts, while `Inter` is an approved Filosage UI font. None is a responsive defect, so no production change is justified by these warnings.

## What is already strong

- Full `mobile-chromium`: 24 passed.
- Full `mobile-webkit`: 31 passed.
- Root layout declares `viewportFit: "cover"`.
- The learner shell replaces the desktop sidebar with mobile top and bottom navigation.
- Course and lesson experiences already have direct 320–390px tests and reduced-motion checks.
- Shared evidence already enforces readable type, no horizontal overflow, privacy boundaries, and axe coverage.
- Light/dark theme variables and reduced-motion behavior are centralized rather than duplicated per page.
- The Course Deck's topic, lesson title, body copy, and action area are now contained for pathological text.

## Health score

| Dimension | Score | Notes |
| --- | ---: | --- |
| Responsive behavior | 3/4 | Core surfaces pass on Chromium/WebKit; route evidence needs completion |
| Accessibility | 3/4 | Strong axe/keyboard foundation; identified phone hit-area exceptions |
| Theming | 4/4 | Shared light/dark token system with themed test coverage |
| Content integrity | 4/4 | No clipping/overflow failures in current mobile projects; long-title regression added |
| Performance and motion | 3/4 | Reduced-motion support is strong; this pass does not include field-performance instrumentation |
| **Total** | **17/20 — good, targeted hardening required** | |

## Acceptance evidence required after implementation

1. Red-to-green browser tests for phone hit areas and route containment.
2. 320px and 390px horizontal-overflow checks across every surface family.
3. Mobile Chromium and Mobile WebKit full suites.
4. Desktop regression suite for every test file touched.
5. Lint, TypeScript, production build, and a final diff review.
6. Separate reporting for local edits, commit, push, deployment, and production verification.

## Post-implementation evidence

- Red-to-green rendered target sizes: legal 38→44px, lesson navigator 34→44px, admin 40→44px, owner resources 38→44px, and support category links 40→44px.
- Full mobile Chromium: 25 passed.
- Full mobile WebKit: 32 passed.
- Signed-in route matrix: passes in mobile Chromium and mobile WebKit across library, create, progress, profile, review, pricing, support, and the learning standard.
- App shell isolated desktop Chromium: 30 passed, 1 expected skip.
- Application/content isolated desktop Chromium: 75 passed.
- Support isolated desktop Chromium: 9 passed, 1 expected mobile-project skip; the skipped phone contract passed in mobile WebKit.
- Shared evidence dedicated matrix: 6 passed across desktop Chromium, mobile Chromium, and mobile WebKit.
- Admin phone contract: passed; flashcard desktop capture plus 390×844 containment contract: passed.
- Lint: passed with warnings denied.
- TypeScript: `tsc --noEmit` passed.
- Next.js 16.2.12 production build: passed, including all 85 generated static pages.
- `git diff --check`: passed; unrelated worktree changes were preserved.

The monolithic 292-test desktop project was intentionally treated as incomplete after its owned Next server exhausted the approximately 4GB Node heap following 172 successful tests. The resulting connection-refused failures were infrastructure fallout, not assertion failures. The affected application/content, app-shell, support, admin, and flashcard suites were rerun in fresh isolated server processes and passed.
