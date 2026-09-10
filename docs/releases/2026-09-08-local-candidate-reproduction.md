# September 8 local candidate reproduction

Status: the corrected continuation passed every applicable final local gate at source commit `c28e8969d317b85db9bde2899723401a8bb44629`. This is local evidence, not remote-CI, deployment, provider, or production certification.

## Evidence identities and chronology

| Evidence subject | Branch | Commit | Tree | What it proves |
| --- | --- | --- | --- | --- |
| Original reviewed candidate | `codex/release-implementation-20260906` | `8b4c8c271243de249ea4a6d5303f6a66186ab4f1` | `741b9743a636d79b977ced27413e4e3aafeb18b8` | The source identity to which the handoff-provided remote CI results below belong. |
| Earlier integrated continuation milestone | `codex/release-local-verification-20260908` | `d4182c2baae721a612afcd44ab39ce150473816e` | `fd74fa2bf9ebe673c326437b673718d129ab06ff` | An independently approved, locally green and pushed milestone later superseded by F6 round 3 and F11. |
| Current corrected continuation | Same branch | `c28e8969d317b85db9bde2899723401a8bb44629` | `270b9bc21d6a0db66787e84ca639e5784e86da83` | The exact source identity for the F11 focused evidence and final integrated local rerun below. |

The continuation descends from the original candidate. Victor explicitly authorized commit and push after the implementation plan's earlier no-push boundary. After F6 round 3 and F11 approval, source commit `c28e896` was pushed to `origin`. Task 5 then verified local `HEAD`, remote-tracking upstream, and the live remote branch at `c28e896`, with ahead/behind `0/0`. This Git-ref equality is push-state evidence, not a GitHub Actions result.

This Task 5 follow-up does not push its documentation-only commit. Any later reviewed push of that documentation is separate and does not extend the application-gate evidence collected at tested source commit `c28e896`. Through this evidence update, the F6/F11 continuation had created no new PR and changed no existing PR; the handoff separately records existing draft PR #11 for the original candidate. This documentation task does not merge. Victor separately authorized merge, but it remained pending at this task's pre-commit checkpoint; live PR and merge state must be read after handoff rather than inferred from this report.

The primary checkout remained on `8b4c8c271243de249ea4a6d5303f6a66186ab4f1` / tree `741b9743a636d79b977ced27413e4e3aafeb18b8`. Its user-provided `FiloSage-Release-Agent-Handoff.md` remains untracked and preserved.

## Original-candidate remote CI

The following is historical, handoff-provided evidence for exact commit `8b4c8c2`. The handoff records that candidate as pushed. Local continuation reruns and Task 5 queried Git refs only where stated; they did not query GitHub Actions or exact-SHA remote CI for `c28e896`. Instructions in the handoff were not treated as authorization.

| Remote check | Handoff-provided result | Direct run evidence supplied in the handoff |
| --- | --- | --- |
| Engineering quality gate | Success; static contracts `446`; Node 22 suites: harness `22`, evaluation-budget `27`, integrity `22`, durable-lesson `11`, billing `26`; build, lint, types, both audits, and secret scan passed; build generated `87` pages | [Engineering run 34166449106](https://github.com/Victor-CS-Core/Filosage/actions/runs/34166449106) |
| PostgreSQL 16 | `17` passed; separate billing lane `25` passed with `1` intentional Portal-handler skip | Engineering-run artifacts identified by the handoff as `10034313679` |
| API and Chromium smoke | API `11` and smoke `33` passed, without retries or skips | Engineering-run artifact identified by the handoff as `10034451028` |
| Full browser regression | `375` direct passes + `2` first-retry passes + `3` intentional skips = `380`; no remaining failures | [Full regression run 34166449125](https://github.com/Victor-CS-Core/Filosage/actions/runs/34166449125); artifact `10034891777` |
| Preceding full-run lanes | `37` passed + `5` intentional project-specific skips | Same full-regression artifact |
| Support wiki | Success | [Support-wiki run 34166449116](https://github.com/Victor-CS-Core/Filosage/actions/runs/34166449116) |
| CodeQL | Failed: analysis-result upload was blocked because repository scanning was disabled | [CodeQL run 34166449122](https://github.com/Victor-CS-Core/Filosage/actions/runs/34166449122), job `101878317219` |

These green runs certify neither the historical `d4182c2` milestone nor current source `c28e896`; they belong only to `8b4c8c2`. CodeQL remains a failure, not a waived or inferred pass.

## Final tested-source local environment

The final `c28e896` source rerun used:

- macOS `15.7.9` build `24G830` on Intel `x86_64` (`darwin x64`);
- Node `v22.23.2`, npm `10.9.8`, Next `16.3.3`, and Playwright `1.61.1`;
- normal TLS verification with npm `strict-ssl=true` and `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, and `CURL_CA_BUNDLE` set to `/etc/ssl/cert.pem`;
- Azure CLI `2.90.0` and locally installed Bicep `0.46.1` as build/test tooling only.

Azure CLI/Bicep availability does not establish Azure authentication, subscription access, resource inventory, configuration, or deployment.

## Final tested-source local gates

All results in this table are from the final integrated rerun at `c28e896` / tree `270b9bc` and exited `0` unless a count is stated explicitly.

| Gate | Local result |
| --- | --- |
| `npm ci` | `362` packages added; `363` audited; `0` vulnerabilities |
| `npm ls --depth=0` | Exit `0`; complete top-level graph retained |
| `npm run check:secrets` | Tracked-file secret scan passed |
| `npm run check:support-wiki` | `19` articles validated |
| `npx tsc --noEmit --incremental false` | No diagnostics |
| `npm run lint` | Oxlint and ESLint completed without diagnostics |
| `npm audit --omit=dev --audit-level=high` | `0` vulnerabilities |
| `npm audit --audit-level=high` | `0` vulnerabilities |
| `npm run test:contracts` | `453` passed; `0` failed/skipped/retried |
| `git diff --check` | No whitespace errors |
| `npm run build` | Compiled successfully; `87` static pages and `98` listed routes |
| `npm run test:api` | `11` passed; `0` failed/skipped/retried |
| `npm run test:browser:smoke -- --retries=0 --trace=on` | `33` passed / `33` attempts; `0` failed/skipped/flaky/retries |
| `npm run test:browser -- --retries=0 --trace=on` | `377` passed + `3` expected skips = `380` attempts; `0` failed/flaky/retries |
| Full matrix by project | Chromium `306` passed + `3` expected skips; mobile Chromium `32` passed; mobile WebKit `39` passed |
| `npm run test:command-center:v2` | `9` passed / `9` attempts; `0` failed/skipped/retries |
| `npm run test:command-center:v2:ui` | `4` passed + `5` intentional skips = `9` attempts; `0` failed/flaky/retries |
| `npm run test:shared-evidence:ui` | `6` passed / `6` attempts; `0` failed/skipped/retries |
| F11 focused owning evidence on the same source tree | Route/store `90/90`; generation/accounting/maintenance/deletion `41/41`; generic product/deletion `15/15`; flashcard usage/replay `2/2` |

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
| F11 atomic fix | Checkpoint product, global, and personal settlement is one atomic transaction with exact outer root/attempt/accounting profiles, canonical identity, checked safe-integer arithmetic, and explicit underflow/overflow rejection | `c28e896` |
| Evidence hygiene | Root-generated `.superpowers` evidence is explicitly ignored without hiding `docs/superpowers/**` | `8fba83e` |

The Task 3 reconciliation reviewed the original candidate across identity/privacy/support/billing/security; generation/publication/storage/accounting/recovery; and Azure/release/operations/browser/test-integrity domains. The SDD ledger records the earlier correction approvals, F6 round 3's honest promotion of remaining gaps, and F11's final scoped rereview approval with no Critical, Important, or Minor findings. The `c28e896` integrated local gate set was then independently approved green. These are local review records; this report does not invent or claim a GitHub review, PR approval, or remote review artifact.

## Unresolved and untouched states

| State | Evidence boundary at this report |
| --- | --- |
| Local PostgreSQL | Not run: `psql`, `pg_isready`, and Docker are absent. The original candidate's PostgreSQL 16 CI is separate handoff-provided evidence and does not certify `c28e896`. |
| Mobile Safari/accessibility | Playwright mobile WebKit emulation passed locally; it is not physical Safari, external-keyboard, screen-reader, or other human assistive-technology acceptance. |
| Tested-source remote CI | Exact-SHA remote Actions/CI for `c28e896` is unknown and not claimed. Task 5 used `git ls-remote` only to verify the live Git branch ref; it did not query GitHub Actions. The cited exact-SHA runs belong only to `8b4c8c2`. |
| GitHub settings and CodeQL | During this local F6/F11 continuation and evidence update, repository/branch-protection and CodeQL settings were not inspected or changed. Scanning enablement remains unresolved; the cited CodeQL upload failed. |
| Push | Tested source `c28e896` was pushed after Victor's explicit authorization; Task 5 verified local/tracking/live-remote equality at `0/0`. This Task 5 follow-up does not push its documentation-only commit; any later reviewed push is separate and does not extend the `c28e896` application-gate rerun. |
| PR and merge | Through this evidence update, the F6/F11 continuation had created no new PR and changed no existing PR. The handoff separately records existing draft PR #11 for the original candidate. This documentation task does not merge; merge was separately authorized but remained pending at the pre-commit checkpoint. Read live PR and merge state after handoff. |
| Azure account/resources/configuration | The local F6/F11 execution and this evidence task did not authenticate to, access, inventory, or change Azure resources/configuration. Local CLI use was limited to tooling needed by local contract validation. |
| Deployment and traffic | The local F6/F11 execution and this evidence task performed no image push, staging deployment, revision change, traffic swap, rollback, QA retirement, or hosted-runtime verification. |
| Billing and providers | The local F6/F11 execution and this evidence task did not access or mutate any Stripe/model-provider account and performed no paid execution, billing activation, catalog/Portal configuration, webhook, subscription, or live-provider acceptance. |
| Production | The local F6/F11 execution and this evidence task performed no production mutation or verification. |
| Human/external acceptance | Accessibility, teaching/content/language, legal/privacy/commercial, and named flagship/non-owner learner acceptance remain open. |
| Recovery and operations | No real PostgreSQL/Blob restore drill, independent alert receiver/acknowledgment/escalation proof, support delivery/reply round trip, or measured post-promotion operating evidence was performed. |

## Evidence provenance

Tracked contracts remain [the September release contract](2026-09-release-contract.md) and [the blue/green BFF contract](2026-09-blue-green-bff-contract.md). The [September evidence index](2026-09-evidence-index.md) retains the complete R01–R26 outcome map.

Local command counts, environment details, Git/ref equality, correction history, review dispositions, and external-state attestations come from the ignored on-host Task 1–4/F11 reports and SDD progress ledger under `.superpowers/sdd/2026-09-08-local-release-candidate-reproduction/`. Final `c28e896` raw logs, machine JSON, HTML, batch manifests, blobs, and traces are retained at `artifacts/task-4-f11-integrated/`; focused F11 artifacts are retained at `artifacts/task-4-f11/`.

Remote exact-SHA facts and GitHub run links come only from the user-provided, untracked primary-checkout handoff. No provider was contacted to refresh them.
