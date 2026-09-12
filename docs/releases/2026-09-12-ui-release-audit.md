# September 12 release UI audit

Status: review ready; the bounded local UI package is verified. Owner: release UI worker, `codex/release-ui-20260912`, baseline `40f02c7`. Coordinator owns the complete R1–R9 release checklist and hosted acceptance. The committed [evidence JSON](../research/artifacts/release-ui-2026-09-12/ui-audit-evidence.json) identifies the exact built source blobs and Next build ID. No push, merge, deployment, provider mutation or paid activation occurred in this package.

## Outcome checklist and scope

- [x] Build the current optimized application and record runtime conditions.
- [x] Audit public catalog/outline, authentication cancellation and account recovery, keyboard and accessibility.
- [x] Audit controlled learner lesson/profile/progress/pricing/support and owner outline/create/navigation states.
- [x] Measure page/JavaScript loading and local process startup/anonymous API latency.
- [x] Fix reproduced accessibility friction and verify the changed paths.
- [x] Preserve screenshots, measurements, failure explanations and reproducible inputs for coordinator integration.
- [x] Stop all owned browser/server/build processes after bounded checks.

Preserved invariants: existing design and routes, lesson authorization, capability flags, closed new checkout, and provider configuration. Controlled browser DTOs are UI evidence, never real identities, persisted production progress, or provider authorization. Successful owner backend operations, exact-candidate authentication and genuine non-owner sessions remain coordinator-owned release gates.

## Findings and fixes

| Finding | Severity | Reproduction before change | Final behavior/evidence |
| --- | --- | --- | --- |
| Profile dashboard action had native browser styling | P2 | `/profile`, dark theme: contrast 4.46:1 Chromium / 1.52:1 WebKit; 30 px control height | Existing sidebar action styling now also covers the button; 44 px target, no contrast violation |
| Selected Control Room navigation text | P2 | `/admin`, light theme, active tab: 4.31:1 | Existing primary text token supplies sufficient contrast; overview failure still retries |
| Course creation step text | P2 | `/create`, light theme, inactive step labels: 4.41:1 | Existing secondary text token supplies sufficient contrast |
| Dashboard settings lost keyboard focus when closed | P2 | Focus “Change dashboard view”, press Enter then Escape; focus lost in both browser engines | Keep `AppDrawer` mounted for its native close lifecycle; preserve the returned focus when the exiting dialog is shown nonmodally for animation. Normal and reduced motion return focus to the invoking button |

The selected-tab background and all product behavior remain intact. The focus change affects the shared drawer's closing sequence; its normal-motion profile regression and support retry checks passed after that change. The coordinator independently reviewed the five changed source/test files and found no blocking issue.

## Fresh matrix

Each cell is two completed scans, one light and one dark. Surface desktop viewport: 1440×900; mobile Chromium: Playwright Pixel 7 preset, 412×839; mobile WebKit: iPhone 13 preset, 390×664. These are emulated viewports, not physical phones.

| Surface / persona | Desktop Chromium | Mobile Chromium | Desktop WebKit | Mobile WebKit | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Landing / guest | 2 | 2 | 2 | 2 | 8 |
| Catalog / guest | 2 | 2 | 2 | 2 | 8 |
| Public course outline / guest | 2 | 2 | 2 | 2 | 8 |
| Pricing, closed checkout / guest | 2 | 2 | 2 | 2 | 8 |
| Support, submission disabled / guest | 2 | 2 | 2 | 2 | 8 |
| Profile / controlled Free learner | 2 | 2 | 2 | 2 | 8 |
| Progress / controlled Free learner | 2 | 2 | 2 | 2 | 8 |
| Published lesson / controlled Free learner | 2 | 2 | 2 | 2 | 8 |
| Course outline / controlled owner | 2 | 2 | 2 | 2 | 8 |
| Course creation / controlled owner | 2 | 2 | 2 | 2 | 8 |
| Control Room failure/retry / controlled owner | 2 | 2 | 2 | 2 | 8 |
| **Total** | **22** | **22** | **22** | **22** | **88** |

All 88 final states have **zero axe WCAG 2/2.1/2.2 A/AA violations, zero page errors, zero unmatched controlled API requests, and zero document horizontal overflow**. This is an automated audit of these states, not a claim of universal WCAG conformance. The matrix uses reduced motion and includes profile settings open/Escape/focus return plus support search/contact/email/cancel interactions. Private pages use the existing published-course DTO and canonical managed-session DTO. Control Room's unavailable/retry state was audited; no successful real overview or account mutation is implied.

Fresh additional checks:

| Check | Result | Boundary |
| --- | --- | --- |
| Existing visitor/auth accessibility suite on baseline production assets | Chromium 34 passed + 2 perf-only skips (1.3m); WebKit 34 passed + 2 perf-only skips (1.9m), no retries | Guest retries, loading gates, both themes, native keyboard focus, 200% reflow, legal/identity account blocking, appearance return with a simulated provider boundary |
| Final focused profile and owner regressions | **8/8 passed**, no skips/retries, 26.0s | All four browser configurations; profile uses normal motion, both themes; matrix above independently covers reduced motion |
| Existing published-course completion journey with controlled managed session | **2/2 passed**, desktop Chromium and mobile WebKit | Outline → activity/quiz → saved progress DTO → capstone/evidence; provider assessments, activity receipts and persistence are controlled fixtures |
| Support failed submission and asynchronous retry after final shared drawer change | **2/2 passed**, 4.4s | Controlled submission-enabled renderer fixture only; no real ticket sent and no runtime flag changed |
| Optimized build; focused ESLint; whitespace checks | **Passed** | Final source build; coordinator will run full frozen-SHA regression after integration |

Runtime: Node 26.8.1, Next 16.3.4, Playwright 1.63.0, Chromium 153.0.8010.12, WebKit 26.6, `@axe-core/playwright` 4.13.0. Build command: `npm run build -- --webpack`; webpack avoids the shared-dependency symlink restriction in this isolated worktree. Local serving used `next start` on loopback 3217. Next warns that standalone deployments should use their generated server; this was a local asset audit, not a container-startup proof.

WebKit's Ubuntu 24.04 fallback binary ran on Omarchy/Arch through a task-local wrapper using already-present ICU 74/libxml2/flite libraries. This is fresh native WebKit execution, with an unsupported-host caveat. It does not replace the supported Linux runner, real hosted appearance, or physical Safari acceptance.

## Actual screenshots

Representative final captures: [desktop light landing](../research/artifacts/release-ui-2026-09-12/chromium-desktop-light-landing.png), [mobile WebKit outline](../research/artifacts/release-ui-2026-09-12/webkit-mobile-light-outline.png), [dark profile action](../research/artifacts/release-ui-2026-09-12/webkit-desktop-dark-profile-action.png), [dark profile settings](../research/artifacts/release-ui-2026-09-12/webkit-desktop-dark-profile-drawer.png), [light Control Room recovery](../research/artifacts/release-ui-2026-09-12/chromium-desktop-light-admin-retry.png), [mobile course creation](../research/artifacts/release-ui-2026-09-12/webkit-mobile-light-create.png), [dark lesson](../research/artifacts/release-ui-2026-09-12/chromium-desktop-dark-lesson.png), [mobile support panel](../research/artifacts/release-ui-2026-09-12/webkit-mobile-light-support-panel.png). Private-shell captures show the visible internal scroll position.

## Page and JavaScript measurements

Three fresh Chromium contexts per route, 390×844, reduced motion, light theme; CDP CPU slowdown 4× and network settings 150 ms latency / 1.6 Mbps down / 750 Kbps up. Session fixture delayed 750 ms; catalog empty; billing closed. Playwright interception disables browser HTTP cache. Browser audit jobs were stopped before both measurements. These loopback synthetic observations are not field CWV, production API/database latency, or final LCP measurements. “UI ready” means the session gate settled and the empty landing catalog rendered. All timings below are medians in milliseconds; before → final.

| Route | FCP | Observed LCP | UI ready | Final JS requests | Final JS transferred / decoded bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 1816 → 1832 | 1896 → 1936 | 2981 → 3088 | 14 | 198,058 / 631,520 |
| `/library` | 1812 → 1848 | 1888 → 1956 | 3036 → 3141 | 15 | 204,477 / 649,701 |
| `/pricing` | 1844 → 1848 | 1964 → 2024 | 3062 → 3196 | 14 | 201,917 / 644,787 |

The focus fix adds **36 transferred / 94 decoded JavaScript bytes** per sampled route; request counts are unchanged. The three-sample timings do not establish a speed improvement: UI-ready medians rose 105–134 ms, with no evidence that this small code change caused the timing variation. No speculative performance rewrite or scaling change was made. [Baseline samples](../research/artifacts/release-ui-2026-09-12/performance-baseline.json) and [final samples](../research/artifacts/release-ui-2026-09-12/performance-final.json) preserve every measurement and condition.

Three fresh local server processes reached their first successful session response in **633 / 581 / 569 ms**; Next's reported ready times were 143 / 135 / 120 ms. OS caches were not flushed, so these are process starts, not Azure scale-from-zero measurements. Per-process RSS after short API probes was 172.6–186.9 MiB. The final long-running audit server had RSS 209.0 MiB and a lifetime average 5.0% CPU at its final read; this is an observation on this workstation, not a load or capacity estimate. No unexpected owned-server restart was observed.

Fifteen sequential anonymous local reads per endpoint (five after each start): session returned 200, median 6.0 ms; account 401, median 5.9 ms; own-courses 401, median 4.3 ms; private-lesson 401, median 4.9 ms. The server had no database or provider credentials. These denials confirm this local production-mode boundary only. [Startup and API samples](../research/artifacts/release-ui-2026-09-12/startup-final.json) retain statuses and timings. Production CPU/restarts, database connections/query plans, model latency/cost and warm-replica economics remain coordinator-owned measurements.

## Reproduction and retained attempts

Run from the repository root after installing the pinned dependencies and matching browsers. The committed [`performance-probe.mjs`](../research/artifacts/release-ui-2026-09-12/performance-probe.mjs) expects an optimized server on loopback 3217; [`startup-probe.mjs`](../research/artifacts/release-ui-2026-09-12/startup-probe.mjs) expects that port to be free and starts/stops three bounded local processes. Both write to `.filosage-local/release-ui`; create that directory first. Outer command bounds used: 180 seconds for page measurement, 60 seconds for startup.

The exact [surface probe](../research/artifacts/release-ui-2026-09-12/surface-probe.txt), [course fixture](../research/artifacts/release-ui-2026-09-12/course-fixture.txt) and [Playwright configuration](../research/artifacts/release-ui-2026-09-12/playwright-config.txt) are preserved as diagnostic inputs. Copy them to `.filosage-local/release-ui/{surfaces.ts,course-fixture.ts,playwright.config.ts}` to replay; provide a suitable local WebKit executable wrapper as referenced by the surface probe, or use the installed supported binary. The Playwright configuration accepts `FILOSAGE_UI_WEBKIT_EXECUTABLE` when a wrapper is required. Commands used:

```sh
npx playwright test --config .filosage-local/release-ui/playwright.config.ts --grep 'profile name editing|owner navigation stays'
node --import tsx .filosage-local/release-ui/surfaces.ts
node docs/research/artifacts/release-ui-2026-09-12/performance-probe.mjs replay
node docs/research/artifacts/release-ui-2026-09-12/startup-probe.mjs
```

Preserved failures are not passes: missing initial WebKit binary/libraries; two original style regressions; a single-course progress fixture incorrectly supplied an array; omitted generation-operation and public support-article fixtures; a performance readiness selector targeted a hidden desktop control on mobile; a support fixture allowed its follow-up list GET to receive a real local 401; keep-mounted alone fixed reduced-motion focus but exposed the separate animated-exit focus issue. Application defects were fixed at their source; diagnostic defects changed only isolated fixtures. The evidence JSON preserves the baseline and intermediate contrast failures alongside all final clean records. Detailed logs and available failure artifacts remain in the worker's ignored `.filosage-local/release-ui` directory.

## Full-regression follow-up: Command Palette dismissal

Full regression34704520499 on50c0bfe exposed intermittent Command Palette focus/navigation timing. Deferring animation frames over Escape deterministically failed the existing opener-focus assertion in both Chromium and WebKit. `AppShell` now records the dismissal target and restores focus in the effect after the modal leaves the DOM, consuming the target once. Selecting a destination does not set that target. This is a further P2 keyboard-focus correction; the earlier page/JavaScript measurements above predate it and are not a benchmark of this new source.

The header test retains its focus assertion while temporarily withholding animation frames, then restores the original browser function. Support navigation waits for the actual successful RSC response before its existing URL assertion. Holding that real response for six seconds reproduced the old Chromium URL failure; the revised synchronization passed4/4 delayed checks across both engines. The final complete header passed12/12 repetitions, six per engine, without retries and with tracing off as in CI first attempts. An independent source review found no added focus restoration during command navigation and no weakened assertion, deadline, retry or inventory policy.

The [follow-up evidence](../research/artifacts/release-ui-2026-09-12/command-focus-evidence.json) preserves exact source blobs, runtime, commands and all intermediate outcomes. Actual first-attempt CI frame deferral remains inferred; the deterministic frame dependency is proven. Earlier trace-enabled native WebKit runs also failed while the separate course drawer was opening, including one unchanged baseline run. That distinct behavior is not claimed fixed. Fresh combined engineering/full regression on the corrected SHA remains mandatory; local fixtures and unsupported-host WebKit do not establish hosted acceptance.

## Handoff and release limits

Source, tests and evidence are ready for the coordinator's validated checkpoint and integration. Full engineering/security/PostgreSQL/billing/browser regression on the frozen integrated SHA is deliberately not duplicated here. All owned local processes are stopped and port 3217 is free; no indefinite watcher remains.

R1/R2 remain open at the overall release level until the coordinator supplies real non-owner learner sign-in, Azure hosted appearance/return, actual progress persistence and owner operations on the exact candidate, production infrastructure/database/model evidence, and supported-runner confirmation where required. New checkout remains closed. The synthetic submission-enabled and managed-session fixtures never imply real accounts, paid readiness, or enabled production capabilities.
