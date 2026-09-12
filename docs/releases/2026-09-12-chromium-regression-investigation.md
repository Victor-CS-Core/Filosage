# Chromium retry investigation — September 12, 2026

Scope: the four owner/learner retries in full regression `34704520499` on source `50c0bfe24cf66195e3a7fb40dc5017b7162c33aa`. This is a bounded local investigation, not full-regression acceptance or production evidence. The coordinator owns shared progress and integration. No provider operation was performed.

## Immutable observations

The coordinator verified artifact `10301961495` (`599071972` bytes; SHA256 `dfa8b5dbbfb7eb79dbce071c8996b801bbdaaa4dbe33bd1cc8c16906f6d1c06a`) and its embedded source identity. This investigation read its complete results, the four first-attempt error contexts, and retained retry traces. `trace: on-first-retry` means the first-attempt network history is absent; a passing retry does not reconstruct that history.

| Test at source 50c0bfe | Recorded failure | Retained evidence and limit |
| --- | --- | --- |
| `tier-consistency-ui.spec.ts:4` | Membership heading absent after five seconds; retry 1 passed | First DOM is the authenticated owner Control Room with disabled Refresh and no overview data. Retry 1 has account HTTP 200 and overview HTTP 200 in 54ms. This establishes data loading in the failed snapshot, not why the initial request was slow. |
| `command-center.spec.ts:470` | First attempt lacks the heading; retry 1 lacks Agent simulation; retry 2 passed | First DOM is session restoration. Retry 1 has authenticated owner heading and disabled Refresh/New ticket. Its account GET returns HTTP 200 in 32ms; the initial command-center GET starts at 54299.655ms and remains pending through the failed assertion at 59558.010ms, at least 5258ms. No denied response or page error is recorded. |
| `course-learning-flow.spec.ts:420` | Course heading absent after clicking the library card; retry 1 passed | Failed DOM remains on the library with the correct course link. Passing retry records the exact course RSC GET HTTP 200 in 208ms and subsequent course fixture responses HTTP 200. The failed attempt has no retained request trace, so an initiated navigation versus a click/hydration race cannot be established. |
| `support-wiki.spec.ts:241` | Owner-handbook heading absent after five seconds; retry 1 passed | Failed DOM is session restoration. Retry succeeds with account HTTP 200 in 34ms. Its later owner page takes 10.6s to return HTML, while private documentation returns HTTP 200 in 116ms. The first-attempt account/request timing is unknown. |

`AppShell.tsx` renders the observed global brand shell while authentication is loading. The admin pages render the observed disabled controls while their initial data requests are pending. The source therefore agrees with the DOM states; the evidence does not show stale assertions, authorization denial, or a persistent product failure in these four cases.

## Local reproduction and scoped correction

Fresh isolated development servers used loopback port 3380, separate build/store directories, Chromium, one worker, traces enabled and zero retries. The unchanged four cases passed 4/4 in 46.5s, then12/12 across three repetitions in 1.5m. In the latter run, server timing attributed cold Command Center API 669ms to Next 632ms/application 36ms, overview 994ms to Next 957ms/application 38ms, and course route 622ms to Next 566ms/proxy 40ms/application 17ms. Warm equivalents were generally below 60ms. These observations demonstrate local development startup overhead; they do not prove the origin of the slower CI requests.

The retained failed Command Center trace justifies synchronizing its initial data dependency before testing data-backed controls. The test now registers an exact-origin/path GET response wait before navigation, asserts that the response succeeded, and then runs every existing heading, draft-only safety, dialog, focus, validation, ticket, filter and intake-control assertion. It retains the existing overall test deadline, assertion timeout and retry policy. Owner terms and session setup are unchanged.

For a controlled reproduction, a temporary local route handler fetched the real initial Command Center snapshot and delayed delivery by 5600ms. The original test failed at Agent simulation, matching the retained CI retry. With the response synchronization, three delayed repetitions passed in 32.2s. This diagnostic delay is absent from the committed test. It proves the setup-wait defect and its correction, not the underlying CI latency source.

The other three tests are unchanged. Their recorded loading states and passing local repetitions do not justify inventing a specific root cause or changing their timing/navigation assertions. A future recurrence needs first-attempt traces and development-server timing to distinguish compilation, request delay and hydration/navigation timing.

## Verification and handoff

Final source verification completed at 17:12 UTC: the four owned cases passed 12/12 across three repetitions in 1.5m, with zero retries and traces enabled. Focused oxlint/ESLint, whitespace and tracked-secret checks passed. Only `tests/command-center.spec.ts` and this report changed. The final Playwright runner exited 0 and its recorded owned server PID 2613263 no longer exists; all earlier owned runs also exited. There is no worker watcher.

Raw local traces and diagnostic logs remain untracked under `.filosage-local/chromium-regression-20260912/` and `/tmp/filosage-qa-*-20260912.log`; they contain controlled local fixtures, not production account content. The coordinator must review/integrate this isolated checkpoint and run fresh required checks/full regression on the corrected exact source. The other three first-attempt causes remain explicitly unresolved. No full workflow, deployment, production verification, or QA retirement is claimed by this investigation.
