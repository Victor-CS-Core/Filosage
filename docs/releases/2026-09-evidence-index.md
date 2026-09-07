# September 2026 implementation evidence

Status: implementation in progress. This is not release certification.

Baseline: `be16cd6810d8135d0a2f8de45650db2f73e3191b`; implementation branch `codex/release-implementation-20260906`. [Scope and authorization](2026-09-release-contract.md).

A complete final record will list implemented tasks, commits, actual local/CI tests and unresolved hosted/provider gates. Unknown and blocked states must remain explicit.

## Recovery checkpoint

[September 7 restoration, reviewed fixes, verification and remaining source work](2026-09-07-recovery-checkpoint.md). Previous local test counts do not certify reconstructed source; final exact-commit CI is still required.

[Current generation, evaluation, authentication and browser recovery](2026-09-07-generation-recovery.md) supersedes the earlier source omissions. Local verified changes still require the final committed-head CI result. Commit/push does not establish deployment or production behavior.

## Complete outcome map

The original 26 requirements remain in scope. “Source present” identifies implementation and regression coverage; it does not mean the external acceptance gate passed.

| Requirement | Source state | Remaining acceptance |
| --- | --- | --- |
| R01 candidate integrity | Baseline preserved; reviewed fixes integrated | Final push, whole-branch review and exact candidate evidence |
| R02 engineering checks | Exact-SHA CI and test lanes registered | Final Node22, PG16 and browser runs; CodeQL repository enablement |
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
| R13 evaluation | Full-course runner, SDK budget and capability integration | Final CI; approved live 12-course campaign and expert review |
| R14 learner recovery | Required-source error/stale/empty state and retry | Hosted failure/recovery and complete learner journey |
| R15 accessibility | Blocking legal dialogs and registered keyboard/axe cases | Actual browser CI and human assistive-use acceptance |
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

- Current Azure effective permissions, production authentication and deployed version are not read back.
- Current Stripe subscription obligations and complete hosted lifecycle are not verified.
- Main branch protection and current full exact-SHA CI still require proof.
- Database/Blob restore, alert delivery and rollout/rollback rehearsal are not performed.
- Real provider course evaluation, specialist content/legal review and flagship learner acceptance remain evidence gates.
- No merge, deployment, production mutation or billing activation is part of completed work.

## Tooling reference

[AppCreator retained for future native-app work](../APP_CREATOR_REFERENCE.md).
