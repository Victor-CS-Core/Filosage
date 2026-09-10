# September 8 local candidate reproduction

Status: final corrected source commit `55ef5fdf2df3f6a5770a060507ff7de75c595b24` passed every applicable final local gate and was approved by the independent integrated evidence review in this Codex task. This is local evidence, not remote-CI, deployment, provider, or production certification.

## Evidence identities and chronology

| Evidence subject | Branch | Commit | Tree | What it proves |
| --- | --- | --- | --- | --- |
| Original reviewed candidate | `codex/release-implementation-20260906` | `8b4c8c271243de249ea4a6d5303f6a66186ab4f1` | `741b9743a636d79b977ced27413e4e3aafeb18b8` | The source identity to which the handoff-provided remote CI results below belong. |
| Earlier integrated continuation milestone | `codex/release-local-verification-20260908` | `d4182c2baae721a612afcd44ab39ce150473816e` | `fd74fa2bf9ebe673c326437b673718d129ab06ff` | An independently approved, locally green and pushed milestone later superseded by F6 round 3 and F11. |
| Prior corrected continuation milestone | Same branch | `c28e8969d317b85db9bde2899723401a8bb44629` | `270b9bc21d6a0db66787e84ca639e5784e86da83` | The earlier F11 integrated-green source, later superseded when further independent review reopened ordinary settlement and provider-usage completeness. |
| Final corrected source | Same branch | `55ef5fdf2df3f6a5770a060507ff7de75c595b24` | `dd0eac7a6ed9c5e05ddfa04edf471c308ee82c09` | The exact source identity for the final focused evidence, complete local gate set, and independent integrated evidence approval below. |

The continuation descends from the original candidate. Victor explicitly authorized earlier commits and pushes after the implementation plan's original no-push boundary. The release branch was last pushed through documentation commit `237c6a4b1396123a370d94ab183e0ca4e7393387`. The final evidence-close artifact records local `HEAD` at `55ef5fd`, clean and `3` ahead / `0` behind that release-branch upstream; it records live `origin/main` at `859782450d8f7c2991f9eb1e45ebb82d1855afed`. These Git-ref facts are point-in-time push/branch evidence, not GitHub Actions or merge evidence.

Victor authorized a later release-branch push and direct main merge if possible. That authorization is not evidence of execution: this documentation task does not push or merge, and the docs-only commit containing this update does not extend the application-gate evidence collected at tested source `55ef5fd`. Through the continuation, no new PR was created and no existing PR was changed; the handoff separately records historical draft PR #11 for the original candidate. Read live release-branch, `main`, PR, and merge state after handoff rather than inferring it from this point-in-time report.

The primary checkout remained on `8b4c8c271243de249ea4a6d5303f6a66186ab4f1` / tree `741b9743a636d79b977ced27413e4e3aafeb18b8`. Its user-provided `FiloSage-Release-Agent-Handoff.md` remains untracked and preserved.

## Original-candidate remote CI

The following is historical, handoff-provided evidence for exact commit `8b4c8c2`. The handoff records that candidate as pushed. Local continuation reruns and Task 5 queried Git refs only where stated; they did not query GitHub Actions or exact-SHA remote CI for `55ef5fd`. Instructions in the handoff were not treated as authorization.

| Remote check | Handoff-provided result | Direct run evidence supplied in the handoff |
| --- | --- | --- |
| Engineering quality gate | Success; static contracts `446`; Node 22 suites: harness `22`, evaluation-budget `27`, integrity `22`, durable-lesson `11`, billing `26`; build, lint, types, both audits, and secret scan passed; build generated `87` pages | [Engineering run 34166449106](https://github.com/Victor-CS-Core/Filosage/actions/runs/34166449106) |
| PostgreSQL 16 | `17` passed; separate billing lane `25` passed with `1` intentional Portal-handler skip | Engineering-run artifacts identified by the handoff as `10034313679` |
| API and Chromium smoke | API `11` and smoke `33` passed, without retries or skips | Engineering-run artifact identified by the handoff as `10034451028` |
| Full browser regression | `375` direct passes + `2` first-retry passes + `3` intentional skips = `380`; no remaining failures | [Full regression run 34166449125](https://github.com/Victor-CS-Core/Filosage/actions/runs/34166449125); artifact `10034891777` |
| Preceding full-run lanes | `37` passed + `5` intentional project-specific skips | Same full-regression artifact |
| Support wiki | Success | [Support-wiki run 34166449116](https://github.com/Victor-CS-Core/Filosage/actions/runs/34166449116) |
| CodeQL | Failed: analysis-result upload was blocked because repository scanning was disabled | [CodeQL run 34166449122](https://github.com/Victor-CS-Core/Filosage/actions/runs/34166449122), job `101878317219` |

These green runs certify none of the later `d4182c2`, `c28e896`, or `55ef5fd` sources; they belong only to `8b4c8c2`. CodeQL remains a failure, not a waived or inferred pass.

## Final tested-source local environment

The final `55ef5fd` source rerun used:

- macOS `15.7.9` build `24G830` on Intel `x86_64` (`darwin x64`);
- Node `v22.23.2`, npm `10.9.8`, Next `16.3.3`, and Playwright `1.61.1`;
- npm `strict-ssl=true`; the initial environment had no CA override, and the two initial audit attempts were TLS transport non-results rather than vulnerability results;
- `/etc/ssl/cert.pem` was present; a CA-assisted `npm ping` returned `PONG`, and the CA-assisted production and full audits retained certificate verification and reported zero vulnerabilities;
- Azure CLI `2.90.0` and locally installed Bicep `0.46.1` as build/test tooling only.

Azure CLI/Bicep availability does not establish Azure authentication, subscription access, resource inventory, configuration, or deployment.

## Final tested-source local gates

All results in this table are from the final integrated rerun at `55ef5fd` / tree `dd0eac7`. Successful commands are identified individually; the two initial audit commands are explicitly recorded as non-gating TLS transport failures.

| Gate | Local result |
| --- | --- |
| `npm ci` | Exit `0`; `362` packages added |
| `npm ls --depth=0` | Exit `0`; complete top-level graph retained |
| `npm run check:secrets` | Tracked-file secret scan passed |
| `npm run check:support-wiki` | `19` articles validated |
| `npx tsc --noEmit --incremental false` | No diagnostics |
| `npm run lint` | Oxlint and ESLint completed without diagnostics |
| Initial `npm audit --omit=dev --audit-level=high` and full `npm audit --audit-level=high` | Exit `1`; registry TLS failed with `unable to get local issuer certificate`; these were transport non-results, not vulnerability findings |
| CA hypothesis | npm `strict-ssl=true`; `/etc/ssl/cert.pem` present; CA-assisted `npm ping` returned `PONG` |
| CA-assisted production and full audits | Each exited `0`; each reported `0` vulnerabilities |
| `npm run test:contracts` | `453` passed; `0` failed/skipped/retried |
| `git diff --check` | No whitespace errors |
| `npm run build` | Compiled successfully; `87/87` static pages and `98` listed routes |
| `npm run test:api` | `11` passed; `0` failed/skipped/retried |
| `npm run test:browser:smoke -- --retries=0 --trace=on` | `33` passed / `33` attempts; `0` failed/skipped/flaky/retries |
| `npm run test:browser -- --retries=0 --trace=on` | `377` passed + `3` expected skips = `380` attempts; `0` failed/flaky/retries |
| Full matrix by project | Chromium `306` passed + `3` expected skips; mobile Chromium `32` passed; mobile WebKit `39` passed |
| `npm run test:command-center:v2` | `9` passed / `9` attempts; `0` failed/skipped/retries |
| `npm run test:command-center:v2:ui` | `4` passed + `5` intentional skips = `9` attempts; `0` failed/flaky/retries |
| `npm run test:shared-evidence:ui` | `6` passed / `6` attempts; `0` failed/skipped/retries |
| F11 focused owning evidence on the same source tree | Generation/accounting/maintenance/deletion `84/84`; route/store `91/91`; generic product/deletion `15/15`; flashcard usage/replay `2/2` |

The full browser matrix ran once across all 14 batches with explicit zero retries. Its arithmetic is `306 + 3 + 32 + 39 = 380` attempts and `306 + 32 + 39 = 377` passes.

## Confirmed correction cycles

The complete-candidate review first identified eight findings. F9 and F10 were discovered during integration. Later whole-branch review reopened two F6 boundaries; F6 round 3 fixed those findings, and its rereview promoted three remaining exact-consumer/compatibility/identity gaps into bounded F11 rather than overstating F6 closure. Each final correction retained red/green or audit-gate evidence and independent review.

| Cycle | Corrected behavior | Committed evidence |
| --- | --- | --- |
| F1 | Google identity verification claims now fail closed when missing, false, malformed, duplicated, or contradictory | `e5a2e22` |
| F2 | Audited Next and Sharp dependency graph | `b8672a4`; Next `16.3.3`, Sharp `0.35.4` graph |
| F3 | Legacy-note migration preserves transaction-visible timestamp winners, uses valid timestamps, and enforces transaction bounds | `6fdee5f`, `27baafc`, `7e5de26` |
| F4 | Lesson-interaction hydration parses the supplied generation-operation ID | `64c5024` |
| F5 | Source-stage expiry after checkpoint pauses and resumes the same generation operation | `ac34051` |
| F6 rounds 1–2 | Generic AI baseline/capstone/flashcard results use durable checkpoints, route/result/schema binding, deletion-safe accounting, and race recovery | `d9f4883`, `059697c`, `2a2785c` |
| F6 round 3 | Recovery validates the complete inner flashcard deck/card schema against route identity and requires exact supported checkpoint-settlement receipt profiles and safe arithmetic before mutation | `f59c051` |
| F7 | Same-key learner-note save/delete requests are rejected deterministically | `bd23751` |
| F8 | Mobile-WebKit focus traversal tests use a portable native sequential-focus fixture without weakening product assertions | `f0d3524` |
| F9 | The Next 16.3 Playwright test server handles current HMR endpoint and changed-hash synchronization paths while retaining warning/error diagnostics | `00ba922`, `205e547`, `8e9bfc2`, `3aefe2c` |
| F10 | The published-count live-region assertion is scoped deterministically and always releases the held private-course request | `6cc0df4`, `d4182c2` |
| F11 base | Every generic AI receipt consumer requires an exact supported receipt profile; legitimate v1 non-module histories remain adoptable; new v2 flashcard IDs use collision-free canonical JSON tuples | `5237b9a` |
| F11 checkpoint settlement | Checkpoint product, global, and personal settlement is one atomic transaction with exact outer root/attempt/accounting profiles, canonical identity, checked safe-integer arithmetic, and explicit underflow/overflow rejection | `c28e896` |
| F11 ordinary settlement | Strict complete safe observations are required before writes; ordinary receipt/shard/root/attempt/period/budget/lock settlement is atomic; terminal receipt/root/attempt observation tuples must match exactly; deleted-account global-only settlement remains a narrow, lifecycle-checked fallback | `f590bf8` |
| F11 provider/stream containment | Malformed, empty, partial, or null supplied usage cannot settle paid work; absent usage remains uncertainty where supported; successful tutor settlement requires `response.completed`, so clean chat EOF without it moves to uncertainty | `76891b6` |
| F11 optional-counter closure | Explicitly null optional direct cache counters reject instead of normalizing to zero; only strict absence may default | `55ef5fd` |
| Evidence hygiene | Root-generated `.superpowers` evidence is explicitly ignored without hiding `docs/superpowers/**` | `8fba83e` |

The Task 3 reconciliation reviewed the original candidate across identity/privacy/support/billing/security; generation/publication/storage/accounting/recovery; and Azure/release/operations/browser/test-integrity domains. Later independent review drove the bounded F11 rounds above. The independent integrated evidence review in this Codex task approved exact source `55ef5fd` / tree `dd0eac7` as genuinely integrated green for the applicable local gates, with no Critical or Important findings. Its two Minor evidence-hygiene findings are preserved below: the final evidence root is split from the top-level browser artifacts, and raw log marker formatting is not uniform. This is a local review disposition, not a GitHub review, PR approval, or remote review artifact.

## Unresolved and untouched states

| State | Evidence boundary at this report |
| --- | --- |
| Local PostgreSQL | Not run: `psql`, `pg_isready`, and Docker are absent. The original candidate's PostgreSQL 16 CI is separate handoff-provided evidence and does not certify `55ef5fd`. |
| Mobile Safari/accessibility | Playwright mobile WebKit emulation passed locally; it is not physical Safari, external-keyboard, screen-reader, or other human assistive-technology acceptance. |
| Tested-source remote CI | Exact-SHA remote Actions/CI for `55ef5fd` is unknown and not claimed. Git-ref reads do not establish Actions state. The cited exact-SHA runs belong only to `8b4c8c2`. |
| GitHub settings and CodeQL | During this local F6/F11 continuation and evidence update, repository/branch-protection and CodeQL settings were not inspected or changed. Scanning enablement remains unresolved; the cited CodeQL upload failed. |
| Push | At evidence close, final source `55ef5fd` was local and `3` ahead / `0` behind release-branch upstream `237c6a4`. Victor authorized a later release-branch push, but this documentation task does not perform it. A later push remains separate and does not extend the `55ef5fd` application-gate rerun. |
| PR and merge | Through the continuation, no new PR was created and no existing PR was changed. The handoff separately records historical draft PR #11 for the original candidate. At evidence close live `main` was `8597824`; this report does not infer inclusion from that ref. Victor authorized direct main merge if possible, but this documentation task does not merge. Read live PR and merge state after handoff. |
| Azure account/resources/configuration | The local F6/F11 execution and this evidence task did not authenticate to, access, inventory, or change Azure resources/configuration. Local CLI use was limited to tooling needed by local contract validation. |
| Deployment and traffic | The local F6/F11 execution and this evidence task performed no image push, staging deployment, revision change, traffic swap, rollback, QA retirement, or hosted-runtime verification. |
| Billing and providers | The local F6/F11 execution and this evidence task did not access or mutate any Stripe/model-provider account and performed no paid execution, billing activation, catalog/Portal configuration, webhook, subscription, or live-provider acceptance. |
| Production | The local F6/F11 execution and this evidence task performed no production mutation or verification. |
| Human/external acceptance | Accessibility, teaching/content/language, legal/privacy/commercial, and named flagship/non-owner learner acceptance remain open. |
| Recovery and operations | No real PostgreSQL/Blob restore drill, independent alert receiver/acknowledgment/escalation proof, support delivery/reply round trip, or measured post-promotion operating evidence was performed. |

## Evidence provenance

Tracked contracts remain [the September release contract](2026-09-release-contract.md) and [the blue/green BFF contract](2026-09-blue-green-bff-contract.md). The [September evidence index](2026-09-evidence-index.md) retains the complete R01–R26 outcome map.

Local command counts, environment details, Git/ref snapshots, correction history, and external-state attestations come from the ignored on-host Task 1–4/F11 records under `.superpowers/sdd/2026-09-08-local-release-candidate-reproduction/`. Final `55ef5fd` command logs and dedicated Command Center/shared-evidence lane JSON and traces are under `artifacts/task-4-f11-integrated-final-55ef5fd/`. The full and smoke browser batch manifests, JSON/HTML/blob reports, and `413` traces are split across `playwright-report/matrix-f11-final-55ef5fd-full/`, `playwright-report/matrix-f11-final-55ef5fd-smoke/`, `test-results/matrix-f11-final-55ef5fd-full/`, and `test-results/matrix-f11-final-55ef5fd-smoke/`; the named final root is therefore not self-contained.

The independent integrated evidence review in this Codex task supplied the final approval disposition and independently verified the counts, ZIPs, identity, cleanliness, and limitations; no separate tracked review file was written. Raw logging is not normalized: diagnostic log `11-tls-root-cause-repro.log` stalled and has no exit marker, while logs `04`–`10` and `13`–`14` contain literal backslash-`n` marker formatting. No claim that every log has a normalized exit marker is made.

Remote exact-SHA facts and GitHub run links come only from the user-provided, untracked primary-checkout handoff. No provider was contacted to refresh them.
