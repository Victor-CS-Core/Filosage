# Filosage audit and visitor experience handoff

Last updated: 2026-09-11. Owner: Codex coordinator. Status: active, initial audit.
Branch: `codex/visitor-experience-20260911`. Starting commit: `96559246b89b81f5b3cebcc36147932400c8cc4c`.

## Read first

Every agent starting or continuing work must read this file and the current `AGENTS.md`, inspect Git status, and verify referenced evidence before relying on it. Do not silently narrow this checklist. The coordinator updates this file at milestones, at least every ten minutes during sustained work, before checkpoint commits/pushes, and before handoffs. Keep credentials, tokens, private user data, and environment values out of this log.

## Requested outcome and finite endpoint

Victor requested an app audit with fixes; a redesigned public landing page; a short, clean, working visitor-to-signup-to-first-use flow; Azure customer authentication branding that preserves the visitor's chosen light/dark appearance; measured performance improvements; regular commits/pushes; and a frequently updated agent handoff log.

Complete one baseline audit and fix the recorded in-scope findings, including regressions discovered while verifying fixes. Finish only when the full journey and themes work on desktop/mobile, relevant quality/security/accessibility checks and before/after performance evidence are recorded, intended changes are committed/pushed, and this log contains a final requirement-by-requirement status. Do not expand into unrelated features or indefinite optimization. An external dependency is a blocker, not successful completion.

## Outcome checklist

- [ ] A. Inventory and baseline the main app and public visitor journey; record reproducible findings and severity.
- [ ] B. Inspect current brand/assets and rendered landing page; design and implement a substantially clearer public landing page.
- [ ] C. Verify exploration, course selection, authentication, cancellation/error recovery, return destination, and first meaningful use; fix broken or unnecessarily long transitions.
- Access invariant (Victor reiterated): anonymous visitors may inspect public catalog/course outlines only. Lesson bodies and actual course participation require a registered, signed-in account and the existing verification/authorization checks. Test UI and server enforcement; never introduce anonymous lesson access to shorten the journey.
- [ ] D. Diagnose Azure sign-up/sign-in branding and selected/system light/dark continuity; implement supported behavior and verify the hosted boundary.
- [ ] E. Measure representative page performance before/after with repeatable conditions; fix observed bottlenecks.
- [ ] F. Resolve in-scope responsive, keyboard/accessibility, loading/error, and navigation findings; verify desktop/mobile in both themes.
- [ ] G. Run relevant tests and quality/security checks, review changes, and resolve regressions.
- [ ] H. Commit/push validated checkpoints regularly and integrate final work through the normal repository process.
- [x] I. Establish this progress log and mandatory agent read/update instructions; maintain them throughout.
- [ ] J. Public-release subscription readiness: verify checkout, upgrades/downgrades, cancel-at-period-end, access until expiry, renewals/payment failures, webhook delivery/retries/idempotency, and configured plans/capability gates. Fix gaps; report hosted/configuration blockers immediately. Victor states Stripe tax information is approved; validate integration without repeating onboarding or changing tax settings.

## Work ownership and next actions

- Coordinator: shared log, landing design/implementation, integration and final browser verification.
- Authentication agent: isolated worktree; trace Azure auth/theme boundary and recommend/prove a supported fix before changing shared auth contracts.
- Billing agent: isolated worktree; trace Stripe lifecycle, entitlement behavior, existing tests and release readiness; implement and test discovered gaps.
- Coordinator also owns performance measurement; delegate focused follow-up once an agent slot becomes available.
- Next: finish source tracing and run an isolated local baseline; inspect public deployed auth read-only if available. Reuse existing local fixtures and avoid production accounts or writes.

## Findings register

| ID | Finding | Evidence | State |
| --- | --- | --- | --- |
| UX-01 | Landing repeats six teaching stages, three illustrative fragments and an evidence dossier before the FAQ; featured anchor has no target on loading/empty/error | Local browser baseline and MarketingHero/PublicCourseProof source | Implemented shorter composition; working library action, retry and responsive/theme checks pass |
| AUTH-01 | Hosted CSS follows OS theme, not explicit app selection; app also incorrectly saves system-derived theme as explicit and does not listen for OS changes | Agent traced deployed customer-tenant stylesheet and ThemeProvider | App fix in progress; supported hosted parity solution under investigation |
| PERF-01 | AppShell hides all public content while session request resolves; static public content is absent from initial response | AppShell.tsx authLoading branch; live session-restoring screen observed | Public-only opt-in rendering and learner-code split implemented; private loading gates retained |
| BILL-01 | Paid access can survive paid-through expiry when terminal webhook is delayed | Agent reproduced with failing account-resolution regression test | Fixed and integrated at eb3871d; live webhook delivery remains unverified |
| BILL-02 | Archived/legacy prices can prevent cancellation; scheduled cancellation is not shown clearly in account UI | Agent reproduced cancellation and summary tests | Fixed and integrated at eb3871d; future cancellation boundaries and old-client compatibility reviewed |
| RELEASE-01 | Live Stripe portal subscription changes disabled; deployed billing flag false; tax-ready/portal config IDs absent from current container template | Read-only Stripe portal and Azure template inspection | Configuration blocker; no live settings changed |
| RELEASE-02 | Live Stripe Tax API returns no active registrations although user reports tax information approved | Read-only live GetTaxRegistrations, empty and has_more=false | Needs verified tax-readiness evidence; no tax settings changed |

## Verification and risks

- Starting working tree clean; local main matched origin/main at 9655924 in the preceding synchronization.
- Previous main engineering/browser success is historical evidence, not validation of this work.
- Application fixes are in progress in isolated worktrees. Production deployment, account creation, and production verification have not been performed.
- Azure may impose hosted-page capabilities or require tenant configuration; inspect official documentation and actual configured flow before claiming preservation of theme.
- Multica tool and CLI unavailable in this session at initial discovery. No external item was created. Stable intended sync key: `filosage-visitor-audit-20260911`; do not create duplicate tracking items if tooling becomes available.

## Activity / checkpoints

- 2026-09-11: Goal established with finite acceptance criteria. Read current product and design contract. Created persistent outcome checklist and mandatory handoff instructions. Application audit and measurements are starting.
- 2026-09-11: Tracking checkpoint `9c4e018` committed and pushed. Victor selected "Explore a real course first" as the primary landing action.
- 2026-09-11: Victor expanded the endpoint to public-release readiness including subscriptions, explicitly downgrade/cancel flows. Acceptance item J is mandatory and must not be omitted across continuations. Stripe tax information is reported approved; no account onboarding is needed.
- 2026-09-11: Victor explicitly requires no AI slop in copy or design. Use plain specific language, real course content and product truth, purposeful hierarchy, and existing brand assets; avoid inflated claims, invented proof, generic card grids and decorative complexity.
- 2026-09-11: Authentication work assigned to `audit_local_work` in `.worktrees/visitor-auth` / `codex/visitor-auth-20260911`; subscription work will use `.worktrees/visitor-billing` / `codex/visitor-billing-20260911`. Root dependency installation is running before baseline tests. The unused `.worktrees/visitor-performance` has no edits.
- 2026-09-11: Root npm ci failed with EBUSY at node_modules/micromark-core-commonmark. Investigating owning processes before retrying; no user processes stopped. Billing assigned to `subscription_readiness`, root owns hosted Stripe read-only inspection. Anonymous course-access invariant reiterated and added explicitly above.
- 2026-09-11: Dependency retry succeeded (359 packages); no processes stopped. Isolated seeded development server PID recorded by `.filosage-local-test/visitor-audit-3510/server`, tool session 35391, http://127.0.0.1:3510. Baseline screenshot/AX shows empty course preview with a broken featured anchor and excessive page length. Live browser is signed into Victor's account; leave it intact.
- 2026-09-11: Read-only production template SITE_VERSION is 93f60f24afe59b19b6a592f455a09e8e813f1f84, older than repository main. BILLING_ENABLED=false; Google and External ID enabled. Hosted deployment must be verified separately from Git completion. Stripe configuration discrepancies and paid-expiry bug reported to Victor promptly.
- 2026-09-11: Billing agent reproduced then fixed four regression groups: paid-through expiry, archived-price cancellation, archived-price lifecycle webhooks, and scheduled cancellation visibility. Broader billing/browser validation in progress; no live writes.
- 2026-09-11: Auth platform constraint confirmed: deployed custom CSS already matches repository, but only follows OS preference. App-specific light/dark branding requires additional clients; `sub` differs per client, risking account/entitlement duplication. Native web auth requires a new managed-session bridge. No tenant clients/secrets/providers changed. Safe app theme fix proceeds; hosted solution needs a reviewed identity-compatible approach.
- 2026-09-11: Optimized baseline compiled in 28.9s but type check hit stale pre-task `.next/types/validator.ts` reference to removed banner route. Regenerating route types and rebuilding; no application failure inferred. Added initial regressions for public render during held session and empty-catalog exploration. Baseline test runner currently owns 3100-3102 because first invocation used the wrong external-server value; future external invocations must use PLAYWRIGHT_EXTERNAL_SERVER=1 and PLAYWRIGHT_PORT=3510.

## Commit / push / deployment state

- 2026-09-11 milestone: Integrated pushed auth and billing checkpoints as `6217e5a` and `eb3871d`. The shorter landing page preserves public outlines and signed-in course participation. Learner-only home code and conditional account dialogs now load separately. Initial desktop 4/4 and mobile 8/8 visitor/motion checks pass; retry and light/dark accessibility/menu checks pass 6/6 across Chromium, mobile Chromium and mobile WebKit. Fixed a light-theme step-number contrast finding and duplicate development preview loads found by these checks.
- 2026-09-11 milestone: Optimized integrated build and full lint pass. Controlled after samples record 203,818 transferred script bytes (38% below baseline), median 683ms observed public-ready time (49% below baseline), and shorter page height. The after artifact precedes the subsequent tiny preview abort/contrast/copy fixes; final candidate verification still required. Actual hosted signup, Stripe lifecycle and production deployment are not covered by these results.
- 2026-09-11 finding: Anonymous production catalog and outline GETs return 200; lesson, progress and practice GETs return 401. Local anonymous protected requests return 401 and verified-but-unregistered identities return 403. Guest lesson selection is discarded by the signup return path; auth agent now owns this bounded fix. Existing full course-flow test exhausted a 5s local navigation assertion, so optimized candidate rerun remains pending.
- 2026-09-11 finding: Main PostgreSQL pool lacks bounded lock/statement execution; existing transaction TTL excludes lock acquisition and final commit. Billing agent owns a narrow resilience investigation/fix and guarded transaction tests. No local PostgreSQL runtime was found; actual transaction evidence must come from a disposable database or exact candidate CI.

- 2026-09-11 milestone: Auth checkpoint `01cee697` pushed to `origin/codex/visitor-auth-20260911`: system-theme following and explicit-preference preservation; 19 Chromium, 3 mobile Chromium and 3 mobile WebKit checks pass. Hosted manual-theme parity remains blocked on an identity-compatible platform configuration.
- 2026-09-11 milestone: Billing candidate passes 32 lifecycle tests, 4 pricing mobile checks, 25 existing billing browser/API checks, 51 contracts, TypeScript and focused lint. Includes negotiated optional account cancellation field for compatibility with already-open older clients. Peer review precedes its checkpoint; no live Stripe writes.
- 2026-09-11 milestone: Optimized baseline succeeded after stale route types were regenerated. Three controlled mobile samples recorded in `docs/research/artifacts/visitor-release-2026-09-11/baseline-performance.json`; 329,318 transferred script bytes and median 1,333ms observed public-ready time under a 750ms session delay. This is local laboratory evidence, not field Core Web Vitals. Visitor regression tests reproduce both hidden public content and the missing primary exploration action.

- Commit/push: `9c4e018` pushed to `origin/codex/visitor-experience-20260911`; next checkpoint pending.
- Deployment: none in this goal.
- Production verification: none in this goal.
- Approval: Victor authorized audit, fixes, landing redesign, theme continuity work, and regular commits/pushes. No unrelated external communications or production data changes authorized.
