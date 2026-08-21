# Command Center v2 local gauntlet evidence

Date: 2026-08-16

Disposition: **Local-only GO; inactive and uncommitted**

## Scope and identity

- Isolated worktree: `C:\Users\vitic\Documents\Codex\2026-08-16\filosage-command-center-v2`
- Branch: `codex/command-center-v2-gauntlet-20260816`
- Base and current uncommitted `HEAD`: `0ab5b3de30143b02f5519d10b6a0979c0b593918`
- UI direction: **The Owner's Evidence Desk**, A-led synthesis, seed `ddbdcffa`
- The original mixed Filosage worktree was not used for implementation.
- No commit, push, pull request, deployment, hosted configuration, feature
  activation, provider setup, live-model call, or live-model spend occurred.

This document is local implementation evidence. It is not immutable release
evidence and does not claim production health.

## Frozen safety contracts

| Contract | Local result |
| --- | --- |
| Server-side verified-owner authorization | Preserved on every Command Center route. |
| Independent intake and draft gates | `COMMAND_CENTER_ENABLED=false` and `COMMAND_CENTER_DRAFTS_ENABLED=false` remain the documented defaults. |
| UI v2 rollout gate | `NEXT_PUBLIC_COMMAND_CENTER_V2=false` remains the documented default. Test servers opt in only inside their isolated process. |
| Simulation | Locked on; draft and approval records remain non-executing. |
| External executor | Not introduced and reported as unavailable. |
| Billing | `BILLING_ENABLED=false` remains unchanged. |
| Learner publication | Remains the explicit external-effect exception with preview, recent owner proof, optimistic version, payload-bound idempotency, exact replay, and correlated audit evidence. |
| Internal privacy | Learner DTOs omit notes, staff identity, risk/workflow state, drafts, approvals, and audit data. |
| Historical evidence | No ticket, approval, draft, audit, or content-report migration, rewrite, or deletion was performed. |

## Implemented passes

### Pass 1 — additive data and API hardening

- Added a v2 best-effort snapshot with canonical ID cursor traversal, aggregate
  counts, loaded/total/inspected/malformed metadata, explicit completeness,
  stable presentation tie-breaks, retrieval time, and bounded warnings.
- Added strict runtime schemas, legacy compatibility normalizers, canonical
  storage-path identity, allowlisted output, and fail-closed malformed controls.
- Added direct normalized ticket lookup so work loaded after record 500 remains
  draftable without relying on the capped v1 snapshot.
- Added a pure protected-output eligibility policy. High/critical and protected
  categories produce internal summaries only; response copy is null.
- Added complete, bounded founder-queue traversal, deterministic ordering,
  revision checks, persisted source manifests, canonical fingerprints, prompt
  selection disclosure, and stale/tampered acceptance rejection.
- Hardened learner publication and approval review with recent-owner proof,
  deterministic operation records, payload fingerprints, same-transaction
  result/audit writes, changed-payload conflicts, and lost-response recovery.

### Passes 2–4 — Owner's Evidence Desk and bounded workflows

- Added a default-off v2 route shell with Work, Reviews, Activity, and System.
- Work is a ruled ledger plus full evidence dossier, transparently sorted by
  overdue state, due time, then risk tie. Collection truth never presents loaded
  values as global totals.
- Reviews are pending-first and retain version, evidence, provenance, cautions,
  stale-source blocking, expiry blocking, and explicit non-execution language.
- Activity is described as a bounded application audit ledger, not immutable
  infrastructure.
- System separates intake, simulation, kill-switch impact, and individual agent
  contracts. It exposes no bulk enable and keeps future agents visibly locked.
- Publication is visually distinct from internal notes and review acceptance.
  Both publication and approval review preserve exact pending payloads across a
  reauthentication or reconciliation attempt.
- Desktop uses a ledger/dossier workspace; narrow screens use labeled
  list-to-detail navigation with Back and a fixed action dock above native
  navigation. Dark, reduced-motion, forced-colors, focus, and 44px target rules
  are included.

### Pass 5 — adversarial, accessibility, and independent review

- The protected-output dry manifest expanded from seven to twelve cases,
  including delimiter breakout, fake nested XML, Unicode/encoded injection,
  sensitive security data, abuse, payment/secret handling, and evaluator
  evasion. The run remained dry and made no model call.
- A 501-valid-ticket plus malformed-record fixture proves traversal, quarantine,
  canonical warning IDs, unknown-field stripping, page-two draft generation,
  public-reply replay, approval replay, protected output, founder staleness, and
  cross-ticket form isolation.
- Desktop Chromium, mobile Chromium, and mobile WebKit cover labeled
  navigation, keyboard tab behavior, list-to-detail, publication boundary,
  pagination, dark/reduced-motion state, horizontal overflow, and Axe
  serious/critical findings.
- Impeccable detector: `[]` on its single permitted post-redesign run.
- Impeccable finish review: `disposition: ship`; no visible regressions and no
  remaining fixes.
- Independent final test critic: no P0 or P1.
- Independent final security critic: no P0 or P1 after the incomplete-controls
  safety envelope was made explicitly fail closed.

## Exact local validation

| Command or gate | Result |
| --- | --- |
| `npm.cmd run lint` | Passed Oxlint and ESLint with warnings denied. |
| `npx.cmd tsc --noEmit --incremental false --pretty false` | Passed. |
| `npm.cmd run test:command-center:v2` | **9/9 passed** on the final tree. |
| `npm.cmd run test:command-center:v2:ui` | **3 passed, 3 intentional project-selection skips**: desktop Chromium, mobile Chromium, mobile WebKit. |
| `npx.cmd playwright test tests/command-center.spec.ts --project=chromium --workers=1` with port 3500 | **12/12 passed**. |
| Independent full legacy Command Center run with one worker | **36/36 passed** across desktop Chromium, mobile Chromium, and mobile WebKit. |
| `npm.cmd run eval:command-center -- --dry-run` | Passed manifest construction: `live:false`, model profile `gpt-5.6-terra`, prompt v6, 12 cases, 2 declared repetitions, zero calls/spend. |
| `npm.cmd run build -- --webpack` | Passed optimized Next.js 16.2.12 compile, TypeScript, and generation of 74 pages. |
| `npm.cmd audit --omit=dev --offline` | 0 vulnerabilities found from the locally available audit data. |
| `git diff --check` | Passed; only Git line-ending notices were emitted. |
| Scoped secret-pattern scan | No production-looking private key, OpenAI live/prod key, Google key, GitHub token, or Slack token found. Deliberate evaluation canaries/stubs were excluded. |

The default Turbopack build was not used as the production-style evidence gate
because this isolated worktree shares `node_modules` through a directory link
outside its root, which Turbopack rejects. The same source passed the explicit
Webpack production build. No Sites build applies because the repository has no
`.openai/hosting.json` or Sites build script.

## Visual evidence

- `.impeccable/review/command-center-v2-desktop.png`
- `.impeccable/review/command-center-v2-publication.png`
- `.impeccable/review/command-center-v2-dark-system.png`
- `.impeccable/review/command-center-v2-mobile-chromium.png`
- `.impeccable/review/command-center-v2-mobile-webkit.png`
- Durable surface record:
  `.impeccable/surfaces/src-app-admin-command-center-page-tsx.md`

The captures are reviewed evidence, not pixel-baseline assertions.

## External and deferred proof

The complete exclusion contract is in
`tests/fixtures/command-center-v2-exclusions.md`. Local passing evidence does
not prove:

- hosted Azure PostgreSQL ordering, counts, cursor, transaction,
  concurrent mutation, or multi-instance behavior;
- real Easy Auth/Google `auth_time` and browser redirect/resume behavior;
- mixed-version application instances sharing records;
- live OpenAI output quality or the separately approval-gated two-repetition
  evaluation;
- deployment, hosted environment values, runtime activation, or production
  health;
- NVDA/manual screen-reader acceptance or screenshot-baseline stability.

These are excluded gates, not passing tests.

## Rollback and containment

1. Keep `NEXT_PUBLIC_COMMAND_CENTER_V2=false` to retain the legacy UI.
2. If generation safety is in question, keep or set
   `COMMAND_CENTER_DRAFTS_ENABLED=false`.
3. If intake containment is required, keep or set
   `COMMAND_CENTER_ENABLED=false`.
4. Keep `BILLING_ENABLED=false` independently of all Command Center decisions.
5. Preserve all recorded tickets, drafts, approvals, requests, audit events,
   and founder manifests; rollback does not delete or rewrite evidence.
6. Release or activation requires a separate exact-SHA approval and the
   external gates above.
