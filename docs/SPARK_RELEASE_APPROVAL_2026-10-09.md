# Spark delegated release review

Date: 2026-10-09

Reviewer: GitHub Copilot acting as the owner's explicitly delegated AI engineering reviewer. This record does not represent the reviewer as a human, lawyer, instructor, or child-safety specialist.

## Decision

**Approved:** the local source candidate for deterministic preparation, saved practice, practice-only degradation, and further disabled staging work.

**Not approved:** live provider activation, remote D1 mutation, staging deployment, production deployment, or public enablement. No OpenAI credential is configured locally, so no metered provider-quality evidence exists. The commit containing this record freezes the reviewed source candidate; hosted evidence must bind to that exact source identity or a later separately reviewed candidate.

## Evidence reviewed

| Gate | Outcome | Evidence |
| --- | --- | --- |
| D1 migration rehearsal | Approved locally | Wrangler `4.86.0` applied 12 commands to an isolated `--local` staging-named state. Readback: 4 tables, 3 indexes, 8 triggers; untouched month mode `practice_only`, live AI `0`, preparation `0`, concurrency `4`. No remote database was contacted. |
| Fail-closed admission | Approved | Fresh months require an explicit audited operator enablement. Spark tests prove default denial, one-cent/100-way monetary conservation, unknown containment, session/global concurrency, kill switch, and overrun halt. |
| Provider pricing | Approved through 2026-11-09 | The official GPT-4.1 mini page confirms snapshot `gpt-4.1-mini-2025-04-14` and $0.40 input, $0.10 cached input, and $1.60 output per million tokens. Local ceilings remain stricter than provider limits. |
| Assigned budget | Approved for the Spark ledger only | $30 total assignment, including $17 AI with $12 tutoring, $3 preparation, and $2 assessment. Existing application and shared infrastructure costs remain outside this ledger. Checkout and published 5/40/100 tutor allowances are unchanged. |
| Quality catalog | Approved for bounded staging | 40 cases, balanced 8 per domain, with explicit `live_tutor`, `prepared_activity`, and `saved_fallback` surfaces; 5 return cases; 3 budget-unavailable cases; 5 separate system invariants. The disclosed review identifier is `2026-10-09-owner-delegated-v1`. |
| Product-policy alignment | Implemented; counsel review pending | Privacy, Terms, and Acceptable Use versions `2026-10-09` identify Cloudflare's infrastructure role; disclose the written response, rubric, and lesson excerpt sent to OpenAI for AI-assisted assessment; distinguish deterministic, self-checked, AI-assessed, and uncertain results; and prohibit assessment manipulation and evidence tampering. Existing accounts must accept the revised Terms and Privacy Notice after deployment. This is factual product review, not legal advice. |
| Two-account isolation | Approved locally | The real local Next server allows the private-course author to read state/session history and returns `SPARK_COURSE_FORBIDDEN` and `SPARK_SESSION_FORBIDDEN` to a second accepted account. Repository tests also cover stale versions, idempotency, and exactly one evidence record. |
| Metered provider evaluation | Blocked, no evidence invented | `OPENAI_API_KEY` is absent from the process environment and `.env.local`. Provider calls: 0. A future run must use a directly configured secret, an immutable candidate, the D1 ledger, and a written call/cost ceiling. |
| Hosted deployment | Not performed | All production and staging Spark flags remain false. No secret, external resource, remote database, Worker, or public traffic was changed. |

## Required next release actions

1. Obtain qualified counsel review for intended launch markets and confirm the Cloudflare and OpenAI data-processing terms and transfer safeguards. Keep Spark out of school-controlled use and do not use its evidence for grades, admissions, placement, or credentials without a separate student-privacy and high-risk AI review.
2. Confirm the commit containing this record is pushed and CI passes at that exact source identity.
3. Configure an OpenAI staging credential directly in the deployment secret store; never provide it through chat or commit it.
4. Apply the reviewed migration remotely to staging, deploy with learner/public/live flags still false, and retain schema readback.
5. Run a small ledger-admitted provider evaluation with an explicit call and microUSD ceiling; review transcripts for grounding, language, grading, and injection behavior.
6. Repeat two-account acceptance against hosted staging, including export, account/course deletion, stale versions, downgrade retention, and kill-switch behavior.
7. Only then request a separate production enablement decision. Enable server, UI, deterministic preparation, and live AI as distinct reversible steps.