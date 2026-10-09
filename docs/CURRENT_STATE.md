# Filosage current state

Last materially updated: October 9, 2026

This is the canonical living snapshot for the repository. Read it before starting or resuming work. The source identity for this snapshot is the commit that contains this file; verify `git status --short --branch` and `git log -1 --oneline` before relying on it.

## Maintenance contract

- Update this file in the same checkpoint whenever application behavior, deployment state, feature flags, release gates, blockers, or next actions change.
- Replace stale statements instead of appending a chronological diary. Put detailed evidence in a dated document and link it here.
- Distinguish local implementation, committed source, pushed source, deployed source, and production verification. One does not prove another.
- Do not put credentials, private logs, personal data, or secret values here.
- `docs/AGENT_PROGRESS.md` is a historical execution log, not the current source of truth.

## Repository and deployment

- Primary branch: `main`, tracked at `origin/main`. The Spark checkpoint is the commit containing this document; confirm local and remote SHAs before release work.
- Production application: Cloudflare Worker at `https://filosage.com`, with Cloudflare D1 and R2 and direct Google authentication.
- Observed October 9, 2026: `/` returns 200 and `/api/health/live` returns 200 with `status: live`.
- Observed October 9, 2026: `/api/health/ready` and `/api/health` return 503. Their public payload reports `configuration: false` and `datastore: false`. The cause is not established. Treat production readiness as an active operational blocker and investigate read-only before proposing a change.
- Billing remains disabled and closed: `BILLING_ENABLED=false`, `BILLING_ROLLOUT_MODE=closed`.
- Production and staging Spark flags remain false in `wrangler.jsonc`. No Spark migration, deployment, provider call, secret change, or public enablement is part of this source checkpoint.

## Current application state

### Existing production service

- The application serves public discovery and authenticated learning on Cloudflare.
- Direct Google authentication is selected; Microsoft Entra External ID flags are disabled in the Cloudflare environments.
- The current production health payload reports flashcard decks/generation and the selected course pipeline, validation, repair, and publication capabilities enabled. This is runtime evidence for the deployed version, not proof that the source checkpoint is deployed.
- External homepage and liveness monitoring are configured. Readiness must not be treated as passing while the endpoint returns 503.

### Spark source checkpoint

- End-to-end Spark source is implemented behind disabled flags: sessions, turns, attempts, revisions, deterministic grading, AI rubric assessment, saved preparation, lexical retrieval, retention, deletion/export handling, creator status, learner workspace, and command-center budget controls.
- D1 is authoritative for Spark budget admission and settlement. Existing document storage remains authoritative for learning records.
- Fresh budget months fail closed. Live tutoring, preparation, and semantic retrieval require separate explicit controls. Semantic retrieval remains disabled.
- Raw stored Spark tutor turns expire after 30 days by default. Committed attempts and educational evidence remain learning records and follow account/course deletion behavior.
- AI short-response assessment sends a bounded lesson excerpt, rubric criteria, and the committed response to OpenAI with application state storage disabled. An uncertain result creates no mastery evidence and does not imply human review.
- Terms, Privacy, and Acceptable Use versions are `2026-10-09`. The policies identify Cloudflare and OpenAI roles, disclose Spark assessment processing, distinguish formative evidence, and prohibit assessment manipulation.
- Spark is not approved for school-controlled use, grades, admissions, placement, credentials, or other legally significant decisions.

## Verification evidence

Verified locally on October 9, 2026:

- `npm run test:spark`: 21/21 passing.
- `npm run eval:spark-quality`: 40 fixed reviewed cases and 5 system assertions; zero provider calls.
- `npm run test:spark:ui`: 5 relevant server/browser checks passing, with 3 intentional project skips.
- Account privacy/export/deletion API tests: 9/9 passing.
- Course-deletion contracts: 3/3 passing.
- Isolated local D1 migration rehearsal: 12 commands, 4 tables, 3 indexes, 8 triggers, controls disabled.
- Focused legal-policy contracts: passing.
- Broad contracts: all change-relevant checks passed after rerunning one interrupted child-process wrapper in isolation. Two Azure CLI-dependent suites were unavailable locally, and one repository-wide retired-name assertion still fails only on files unchanged from `origin/main`.
- Legal pages rendered successfully in Chromium against the production build. WebKit was not installed locally, so that one browser-specific rerun was unavailable.
- `npm run build`: 93/93 pages generated.
- `npm run build:cloudflare`: OpenNext worker bundle generated successfully and temporary source/config swaps restored.
- TypeScript, tracked-secret scan, and `git diff --check`: passing.
- Lint: zero errors and four pre-existing Next.js internal-navigation warnings.

Detailed evidence:

- `docs/SPARK_INTEGRATION_MAP.md`
- `docs/SPARK_OPERATIONS_RUNBOOK.md`
- `docs/SPARK_RELEASE_APPROVAL_2026-10-09.md`
- `evals/spark-quality/catalog.ts`

## Pending items, in order

1. **Production readiness:** diagnose why configuration and datastore checks return false. Do not infer the cause from older Azure-era notes and do not mutate production without explicit approval.
2. **Legal/provider gate:** obtain qualified launch-market counsel review and confirm Cloudflare/OpenAI data-processing terms and transfer safeguards.
3. **Immutable candidate verification:** confirm the commit containing this file is pushed and CI passes at that exact SHA. A later code change creates a new candidate.
4. **Disabled staging deployment:** with explicit approval, configure the OpenAI staging secret directly in the provider store, apply the reviewed Spark D1 migration remotely, and deploy with all learner/public/live Spark flags still false.
5. **Metered staging evaluation:** run a ledger-admitted evaluation with an explicit call and microUSD ceiling; review grounding, grading, language, safety, and injection behavior. Revalidate pricing by November 9, 2026.
6. **Hosted acceptance:** repeat two-account isolation and test export, account/course deletion, retention, stale lesson versions, downgrade behavior, fallback modes, and the kill switch.
7. **Production decision:** request a separate explicit approval. Enable server, UI, deterministic preparation, and live AI as distinct reversible steps.

## Standing constraints

- Keep billing closed and all Spark flags false until their separate gates and approvals are complete.
- Never commit secrets or route them through chat. Do not expose internal budget controls as contractual user promises.
- Do not promise human assessment review; no Spark human-review workflow exists.
- Do not deploy, mutate remote D1, change secrets, activate billing, or enable public Spark access without explicit owner approval.
- Preserve existing course, publication, tutor allowance, evidence, account deletion, and privacy behavior.