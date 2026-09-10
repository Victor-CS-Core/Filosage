# September 2026 implementation evidence

Status: implementation and local correction work are recorded. This is not release certification.

Baseline: `be16cd6810d8135d0a2f8de45650db2f73e3191b`. The original reviewed candidate and its locally corrected continuation are separate evidence subjects. [Scope and authorization](2026-09-release-contract.md).

A complete final record will list implemented tasks, commits, actual local/CI tests and unresolved hosted/provider gates. Unknown and blocked states must remain explicit.

## Candidate snapshots

| Subject | Git identity | Evidence state |
| --- | --- | --- |
| Original reviewed candidate | Branch `codex/release-implementation-20260906`; commit `8b4c8c271243de249ea4a6d5303f6a66186ab4f1`; tree `741b9743a636d79b977ced27413e4e3aafeb18b8` | The user-provided handoff records successful exact-SHA engineering, PostgreSQL 16, support-wiki, Chromium smoke, and full-browser workflows. CodeQL failed because analysis-result upload was blocked while repository scanning was disabled. The local continuation reruns and Task 5 did not query GitHub Actions to refresh these historical results. |
| Earlier integrated continuation milestone | Branch `codex/release-local-verification-20260908`; commit `d4182c2baae721a612afcd44ab39ce150473816e`; tree `fd74fa2bf9ebe673c326437b673718d129ab06ff` | This independently approved, locally green milestone was pushed after Victor's explicit authorization. Later whole-branch review reopened F6 recovery boundaries, so it is retained as history rather than the current tested source. |
| Current corrected continuation | Same branch; tested source commit `c28e8969d317b85db9bde2899723401a8bb44629`; tree `270b9bc21d6a0db66787e84ca639e5784e86da83` | F6 round 3 and F11 were independently reviewed, and the complete current-source local gate set was independently approved as integrated green. After the authorized push, Task 5 verified local `HEAD`, remote-tracking upstream, and the live remote release branch all at `c28e896`, with ahead/behind `0/0`. No exact-SHA remote Actions/CI result for `c28e896` is claimed. |

[Local reproduction, correction, and evidence-boundary report](2026-09-08-local-candidate-reproduction.md).

## Recovery checkpoint

[September 7 restoration, reviewed fixes, verification and remaining source work](2026-09-07-recovery-checkpoint.md). Its earlier local counts did not certify reconstructed source. The later user-provided handoff supplies exact-SHA remote CI only for original candidate `8b4c8c2`.

[Current generation, evaluation, authentication and browser recovery](2026-09-07-generation-recovery.md) supersedes the earlier source omissions. The corrected `c28e896` continuation has final local evidence but still lacks exact-SHA remote Actions/CI. Commit and push do not establish deployment or production behavior.

## Complete outcome map

The original 26 requirements remain in scope. “Source present” identifies implementation and regression coverage; it does not mean the external acceptance gate passed.

| Requirement | Source state | Remaining acceptance |
| --- | --- | --- |
| R01 candidate integrity | Original candidate SHA/tree preserved; current continuation `c28e896` / tree `270b9bc` independently reviewed, locally verified, and pushed with `0/0` upstream divergence | Exact-SHA remote Actions/CI for `c28e896`, continuation PR disposition, and live merge state remain explicit separate gates |
| R02 engineering checks | Handoff-provided exact-SHA CI exists for `8b4c8c2`; Node 22 static/build/API/browser gates are locally green at tested source commit `c28e896` | No local PostgreSQL; no exact-SHA remote Actions/CI for `c28e896`; CodeQL repository enablement/result upload remains unresolved |
| R03 private learner state | UID/session ownership and delayed-effect guards | Hosted identity switching and privacy journey |
| R04 deletion | Lifecycle fencing, bounded inventory and late-usage containment | Retention decision, actual provider cleanup and old-writer cutover |
| R05 abuse limits | Durable UID/global admission and failure closure | Trusted ingress identity and replica contention evidence |
| R06 runtime isolation | One-app BFF with separate bootstrap privileges | Effective permission readback and approved legacy QA retirement |
| R07 publication proof | Immutable snapshot, edit/publication and proof guards | Real provider proof, content review and hosted publication journey |
| R08 durable generation | Course/lesson checkpoints, resume and accounting | Actual PG races, deployed recovery and unknown-provider reconciliation |
| R09 lesson integrity | Universal guarded atomic lesson/result/accounting commit | Prior/new production binary compatibility and rollback proof |
| R10 research | Saved research/bibliography/verification stages | Current sources, provider limits and freshness acceptance |
| R11 teaching quality | Objective and evidence preservation; explicit replan | Every-lesson practice and capstone review |
| R12 language | Field-aware safeguards and language-preserving recovery | Competent language/RTL review |
| R13 evaluation | Full-course runner, SDK budget and capability integration | Exact-SHA remote Actions/CI for `c28e896`; approved live 12-course campaign and expert review |
| R14 learner recovery | Required-source error/stale/empty state and retry | Hosted failure/recovery and complete learner journey |
| R15 accessibility | Blocking legal dialogs and registered keyboard/axe cases | Exact-SHA remote browser CI for `c28e896` and human assistive-use acceptance |
| R16 support | Capability gating, private history and recovery paths | Named support coverage and actual delivery/reply round trip |
| R17 runtime identity | Build/manifest/origin/auth capability contract | Exact hosted image and runtime equality |
| R18 backup/restore | Scoped observation and private restore tooling | Actual PG/Blob restore with measured approved objectives |
| R19 operations | Signed sender, probes and retry/reporting | Independent receiver/monitoring service and durable acknowledgment remain unfulfilled |
| R20 authentication | Shared one-app authentication contract | Real provider/linking/logout/recent-auth/header-forgery evidence |
| R21 flagship | Catalog, deterministic checks and reviewer packet | Named complete flagship and non-owner learner acceptance |
| R22 subscription lifecycle | Current-provider reconciliation and immutable transition audit | Payment-policy decision and real signed Test lifecycle |
| R23 payment containment | Separate checkout/API/webhook/Portal gates | Existing subscriber obligations and all Test purchase/recovery scenarios |
| R24 commercial readiness | Legal, notices and commercial evidence templates | Qualified legal/privacy review and real account/catalog/delivery evidence |
| R25 release | Blue/green zero-traffic staging and approved swap workflow | Seven candidate proof packets, operator approval and actual rollout |
| R26 operations handoff | Bounded observation and ownership templates | Named operating owners and post-promotion measurements |

## Current external gates

- This local F6/F11 execution and evidence update did not read Azure effective permissions, production authentication, or a deployed version.
- This local F6/F11 execution and evidence update did not verify Stripe subscription obligations or a complete hosted lifecycle.
- During this local F6/F11 continuation and evidence update, GitHub repository/branch-protection and CodeQL settings were not inspected or changed. CodeQL scanning enablement remains unresolved, and exact-SHA remote Actions/CI for `c28e896` was not queried or claimed.
- This local F6/F11 execution and evidence update did not perform a database/Blob restore, alert delivery, or rollout/rollback rehearsal.
- Real provider course evaluation, specialist content/legal review and flagship learner acceptance remain evidence gates.
- The continuation branch was pushed through `c28e896` after Victor's explicit authorization. Through this evidence update, the F6/F11 continuation had created no new PR and changed no existing PR; the handoff separately records existing draft PR #11 for the original candidate. This documentation task does not merge. Merge was separately authorized but remained pending at this task's pre-commit checkpoint; read live PR and merge state after handoff. This local evidence work performed no deployment, production mutation, or billing/provider activation.

## Tooling reference

[AppCreator retained for future native-app work](../APP_CREATOR_REFERENCE.md).
