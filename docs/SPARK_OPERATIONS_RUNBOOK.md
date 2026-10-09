# Spark operations runbook

Status: deterministic/practice-only source approved by delegated AI engineering review; live provider use and hosted release remain blocked. Do not deploy, create resources, set secrets, make paid calls, or enable flags without an immutable candidate and the evidence below.

## Release gates

Gate status on 2026-10-09:

1. **Local migration rehearsal complete.** Apply `infra/cloudflare/d1/002_spark_budget.sql` to remote staging only after freezing the source candidate. Retain remote schema/readback evidence.
2. **Price sheet verified.** The official model page matches `config/spark-pricing.json`; rotate or revalidate it by 2026-11-09. Missing or stale pricing fails closed.
3. **Spark envelope approved.** The $30 assignment does not claim to cap unrelated existing application spend. Checkout remains closed and published 5/40/100 allowances remain authoritative.
4. **Delegated expert catalog review complete.** The 40-case decision is identified as AI owner-delegate review, not independent human-instructor evidence. See `docs/SPARK_RELEASE_APPROVAL_2026-10-09.md`.
5. **Metered staging evaluation blocked.** No local OpenAI credential exists. Do not claim provider quality until a ledger-admitted capped run records actual tokens, cost, grounding, component selection, and grading findings.
6. **Local two-account server acceptance complete; hosted acceptance pending.** Private course and session denial pass locally. Hosted export, deletion, stale-version, downgrade, and kill-switch acceptance remain required.
7. **Privacy change implemented.** Privacy version `2026-10-09` discloses raw-turn and educational-evidence retention. The implementation does not substitute for jurisdiction-specific legal advice.

No Queue, Vectorize, AI Gateway, or new R2 resource is required for the initial lexical/deterministic release. Creating one is a separate infrastructure and budget decision.

## Configuration

All release flags default to false in `.env.example` and both Wrangler environments:

1. `SPARK_ENABLED` exposes server behavior.
2. `NEXT_PUBLIC_SPARK_ENABLED` exposes learner-home, lesson, and creator entry points. It requires a new build.
3. `SPARK_PREPARE_ENABLED` permits saved-lesson preparation, subject to the monthly operator switch.
4. `SPARK_LIVE_AI_ENABLED` permits provider admission, subject to the monthly operator switch, ledger mode, allowance, and caps.
5. `SPARK_SEMANTIC_RETRIEVAL_ENABLED` must remain false until a measured adapter and budget are approved.

Pinned defaults are 4,000 input tokens, 900 output tokens, four globally dispatched calls, one call per session, and six turns per minute per user. Do not increase caps or concurrency without a fresh capacity and cost report.

The safe staging order is server Spark, public UI, deterministic preparation, then live AI for a small cohort. Verify saved-only and practice-only behavior before each later step. Never enable live AI merely because the UI flag is on.

## Budget operation

The Command Center Spark panel reads the current UTC month and is the supported owner control. Every change requires a reason and writes a pseudonymous audit record. Category caps must fit inside the AI cap, and no cap can be lowered below committed, reserved, plus unknown exposure.

Monitor daily during a pilot:

- committed, reserved, and unknown microUSD by month and category;
- unknown reservations and provider response IDs requiring reconciliation;
- actual versus reserved cost and any automatic `halted` mode;
- token counts, validation failures, provider errors, and pseudonymous per-user use;
- preparation ready/failed counts and stale price-sheet expiry;
- shared D1, R2, Workers, and logging usage outside the application ledger.

At 70 percent of the AI envelope, keep optional enrichment off. At 85 percent, switch to `conserve` and prefer saved practice. At category exhaustion or 100 percent, use `practice_only`. Do not borrow from fixed, infrastructure, or uncertainty reserves. Raising the cap is an owner action, not an automated recovery.

Unknown dispatched requests retain their full reservation. Release or settle one only from provider billing evidence. Do not convert timeout, disconnect, TTL expiry, or missing usage into free budget. A provider overrun automatically halts new admissions and requires price/configuration investigation before reopening.

## Kill switches and incidents

For a provider, privacy, grounding, or spend incident:

1. Turn off `Allow live AI admission` in Command Center. This is checked in the same D1 transaction as reservation.
2. Set monthly mode to `practice_only` or `halted` as appropriate.
3. Turn off lesson preparation if job behavior is involved.
4. If control-plane access is uncertain, set `SPARK_LIVE_AI_ENABLED=false` and `SPARK_PREPARE_ENABLED=false` and deploy only after explicit approval.
5. Preserve saved manifests, attempts, evidence, and unknown usage rows. Do not drop tables or delete learner work.
6. Reconcile provider usage, identify duplicate requests/retries or price drift, fix the cause, rerun contracts/evaluations, and require an audited owner change to resume.

Malformed output falls back to saved lesson content and does not create evidence. AI assessment failure leaves the attempt saved as pending or needs review. A database write failure must never be presented as saved or demonstrated.

## Retention and privacy

Raw Spark tutor turns receive a 30-day `expiresAt`. Run a non-writing inventory with:

```bash
npm run maintenance:spark-turns
```

An approved write requires both flags:

```bash
npm run maintenance:spark-turns -- --apply --confirm-30-day-retention
```

The command paginates and deletes only expired `sparkTurns/{id}` records. It does not delete sessions, committed attempts, educational evidence, budget records, or unexpired turns. No automatic schedule is configured. Account and course deletion independently remove owned Spark records, and account export includes sessions, turns, attempts, assessments, and authored preparation artifacts.

This distinction must be reflected in the approved Privacy Notice before learner release: raw tutor text is pruned after 30 days, while committed attempts and educational evidence follow learning-record retention. Updating public legal terms and their accepted version remains an owner/legal approval gate.

## Verification and rollback

Local no-provider checks:

```bash
npm run test:spark
npm run eval:spark-quality
npm run test:spark:ui
npm run lint
npm run build
```

Rollback is flag-first: disable live AI and preparation, then public UI, while retaining application records and the additive D1 ledger. Do not reverse the migration while any reservation, audit, attempt, or evidence can depend on it. A later physical schema removal requires a separate inventory, retention decision, export, backup, and owner-approved migration. Existing lesson reading, tutor entitlements, checkout state, publication, and billing behavior must remain unchanged.