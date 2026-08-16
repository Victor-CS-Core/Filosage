# Marketing Gauntlet acceptance — 2026-08-16

## Scope and release boundary

- Worktree: `C:\Users\vitic\Documents\Codex\worktrees\Teach-marketing-gauntlet`
- Branch: `codex/marketing-gauntlet`
- Runtime-validated application checkpoint: `6d3d8bf6508a65c492d7de4ab270bee826a7a00f`
- No push or deployment was performed.
- `BILLING_ENABLED=false` remained unchanged. The acceptance run did not open checkout or change membership state.

## Production-mode setup

The app was built into an isolated Next.js output directory (`.next/marketing-acceptance`) and served on `127.0.0.1:3401` with:

- `SITE_VERSION=6d3d8bf6508a65c492d7de4ab270bee826a7a00f`
- `NEXT_PUBLIC_MARKETING_FLAGSHIP_COURSE_ID=alpha-course`
- `BILLING_ENABLED=false`

`/api/health` reported the exact checkpoint version. It returned `503` because this credential-free local run intentionally did not include the production datastore and service configuration. This is optimized-runtime UI acceptance, not deployed-production or live-datastore verification.

## Automated gates

| Gate | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript (`tsc --noEmit`) | Passed |
| Next.js production build | Passed; 79 routes, including `/evidence-example` |
| Primary affected Playwright suites | 76 passed |
| Shared evidence desktop/mobile suite | 6 passed across desktop Chromium, mobile Chromium, and mobile WebKit |
| Production-mode marketing acceptance | 1 passed in Chromium |

The production-mode acceptance test uses fixed browser fixtures and network mocks so signed-in, entitlement, due-review, and course-result states are deterministic without production credentials. It verifies the optimized client and server-rendered UI contracts; it does not claim that a production datastore or deployment was exercised.

## Visual acceptance matrix

All captures are stored under `docs/research/artifacts/marketing-gauntlet-2026-08-16/`.

| Surface or state | Desktop, 1440×1000, light | Mobile, 390×844, dark, reduced motion |
| --- | --- | --- |
| Landing with published flagship course | `desktop-landing-flagship-light.jpg` | `mobile-landing-flagship-dark-reduced-motion.jpg` |
| Library: coursework/exam job start | `desktop-library-study-goal-light.jpg` | `mobile-library-study-dark-reduced-motion.jpg` |
| Library: personal project job start | `desktop-library-personal-project-light.jpg` | — |
| Library: career transition/interview job start | `desktop-library-career-goal-light.jpg` | — |
| Library: current work challenge job start | `desktop-library-work-goal-light.jpg` | — |
| Library: no match, Free learner | `desktop-library-no-match-free-light.jpg` | — |
| Library: no match, eligible creator | `desktop-library-no-match-creator-light.jpg` | — |
| Fixed fictional evidence example | `desktop-evidence-example-light.jpg` | `mobile-evidence-example-dark-reduced-motion.jpg` |
| Free learner evidence with contextual Pro path | `desktop-free-evidence-pro-prompt-light.jpg` | — |
| Home with a due review | `desktop-home-due-review-light.jpg` | — |
| Pricing with Plus context | `desktop-pricing-plus-context-light.jpg` | — |
| Pricing with Pro context | `desktop-pricing-pro-context-light.jpg` | `mobile-pricing-pro-dark-reduced-motion.jpg` |

## Acceptance assertions

- The product is framed as a self-directed learning and course-creation workspace for eligible independent students, self-taught learners, career changers, working professionals, and adjacent knowledge workers—not as an English-learning product or a narrow professional-only product.
- The interface is described as English today while eligible course creation supports requested non-English and bilingual content.
- Evidence is called portable learning evidence. The fixed public example is prominently labeled fictional demonstration data and explicitly disclaims credentials, certification, transcripts, and claims about a real person.
- Job-start controls create editable searches and say they are not personalized recommendations.
- Course language is visible and searchable. Telemetry records only coarse allowlisted job and language modes, not raw learner goals or requested course text.
- Contextual Plus and Pro paths preserve the learner's current task. Query parameters select an explanatory pricing context only; they do not change membership or initiate billing.
- Return recommendations remain navigable when analytics consent is declined or telemetry fails.
- No disabled, flag-gated, or unverified feature is presented as generally available.

## Rollback

No external state changed. The work can be rolled back by deleting the isolated worktree or reverting the five implementation commits on `codex/marketing-gauntlet`. The original checkout and its unrelated changes were not modified.
