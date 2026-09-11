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
- [ ] D. Diagnose Azure sign-up/sign-in branding and selected/system light/dark continuity; implement supported behavior and verify the hosted boundary.
- [ ] E. Measure representative page performance before/after with repeatable conditions; fix observed bottlenecks.
- [ ] F. Resolve in-scope responsive, keyboard/accessibility, loading/error, and navigation findings; verify desktop/mobile in both themes.
- [ ] G. Run relevant tests and quality/security checks, review changes, and resolve regressions.
- [ ] H. Commit/push validated checkpoints regularly and integrate final work through the normal repository process.
- [x] I. Establish this progress log and mandatory agent read/update instructions; maintain them throughout.

## Work ownership and next actions

- Coordinator: shared log, landing design/implementation, integration and final browser verification.
- Authentication agent: isolated worktree; trace Azure auth/theme boundary and recommend/prove a supported fix before changing shared auth contracts.
- Performance agent: isolated worktree; inspect request/render dependencies and existing performance tests; provide measurable baseline and targeted fixes.
- Next: finish source tracing and run an isolated local baseline; inspect public deployed auth read-only if available. Reuse existing local fixtures and avoid production accounts or writes.

## Findings register

| ID | Finding | Evidence | State |
| --- | --- | --- | --- |
| UX-01 | Visitor journey and landing hierarchy need baseline audit/redesign | User report; reproduction pending | Investigating |
| AUTH-01 | Azure authentication appearance does not match chosen app theme | User report; source and hosted reproduction pending | Investigating |
| PERF-01 | Representative app performance needs measured baseline | Requested audit; no measurement yet | Investigating |

## Verification and risks

- Starting working tree clean; local main matched origin/main at 9655924 in the preceding synchronization.
- Previous main engineering/browser success is historical evidence, not validation of this work.
- No application code changed yet. Production deployment, account creation, and production verification have not been performed.
- Azure may impose hosted-page capabilities or require tenant configuration; inspect official documentation and actual configured flow before claiming preservation of theme.
- Multica tool and CLI unavailable in this session at initial discovery. No external item was created. Stable intended sync key: `filosage-visitor-audit-20260911`; do not create duplicate tracking items if tooling becomes available.

## Activity / checkpoints

- 2026-09-11: Goal established with finite acceptance criteria. Read current product and design contract. Created persistent outcome checklist and mandatory handoff instructions. Application audit and measurements are starting.

## Commit / push / deployment state

- Commit/push: initial tracking checkpoint pending.
- Deployment: none in this goal.
- Production verification: none in this goal.
- Approval: Victor authorized audit, fixes, landing redesign, theme continuity work, and regular commits/pushes. No unrelated external communications or production data changes authorized.
