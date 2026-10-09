# FiloSage Spark — Implementation Plan

**Version:** 1.0 · **Prepared:** 2026-10-08 · **Owner:** FiloSage · **Status:** approved for phased implementation

> **Owner's build-order decision (2026-10-08):** Build the smallest slice first that proves the thesis — explain-differently + one deterministic activity on real lessons, metered against the existing tutor allowance — then let real usage justify investment in the full budget-authority machinery. The $30/mo envelope is a starting circuit breaker for the pilot phase, not a permanent ceiling; usage-based costs may scale once real users exist. Fixed infrastructure baseline stays near the ~$7-8/mo comfort zone.

---

## 1. Mission and Non-Negotiable Decisions

Make FiloSage Spark the central learning workspace for an existing course. Spark teaches from that course, presents interactive activities, responds to learner attempts, recommends targeted revision, and carries verified learning evidence forward. This is a learning experience with a contextual tutor, not a chat window placed beside generated articles.

Deliver the complete feature described here, integrated with the current FiloSage codebase and Cloudflare deployment. Reuse the existing authentication, course generator, subscriptions, database, activity system, design tokens, moderation, evidence records, and review scheduler. Inspect the repository before naming concrete files or choosing replacements. Do not migrate infrastructure or rebuild billing just to add Spark.

### Operating Budget

USD $30 per calendar month for Spark's assigned operating envelope (initial small-volume configuration):

| Bucket | Monthly |
|--------|---------|
| Cloudflare Workers account baseline attributed to Spark | $5 |
| All Spark AI calls | $17 |
| Incremental infrastructure | $3 |
| Uncertainty, taxes, reconciliation reserve | $5 |
| **Total** | **$30** |

Reserve $5 for the Cloudflare Workers account baseline even if already paid. This is an initial small-volume configuration, not unlimited live AI for unlimited learners. Existing unrelated FiloSage expenses, domain renewal, payment fees, existing course/image generation, development labor, and subscription taxes are outside this feature envelope.

**Elasticity rule:** stateless compute, durable state, queue backpressure, reusable artifacts, configurable capacity. Traffic may scale automatically; spending authorization must not. Increased AI capacity requires an explicit operator budget change. At the cap, previously saved lessons, deterministic activities, notes, and review continue within measured infrastructure limits; new billable AI work stops.

---

## 2. Approach Selection

| Approach | Decision |
|----------|----------|
| Course-bound structured UI with reusable activities | **Implement this** — predictable cost, consistent teaching, accessible, secure |
| Generate arbitrary HTML/JavaScript for every lesson | Do not use in production — execution risks, fragile grading |
| Autonomous multi-agent tutor that browses and runs code | Outside this release — unbounded cost, complex trust boundaries |

Use one bounded orchestration request for most tutor turns. The model selects approved components and supplies validated content/configuration. The frontend renders trusted code from a registry.

---

## 3. Product Surface

### Spark-Centered Home
- "Continue with Spark" — the next useful action from the learner's active course
- Course cards: topic, current capability, honest activity status, Continue
- Review due items only when the scheduler provides them
- Keep Library, My learning, Create course in app chrome

### Central Course Workspace
- **Desktop:** narrow course outline (left) · Spark learning canvas (center) · evidence/notes pane (on demand)
- **Mobile:** compact header, outline disclosure, stacked content, thumb-accessible Explain/Practice/Review nav
- Tutor composer below the current activity; "Read lesson" view remains for independent reading

### Six Stages (Capability Cycle)
1. **Define:** observable capability + evidence the lesson will ask for
2. **Activate:** retrieve relevant prerequisite (opening lessons don't invent prerequisites)
3. **Practice:** concise explanation, worked example, named misconception, one central interactive task
4. **Feedback:** committed attempt before answer-specific feedback; targeted revision
5. **Transfer:** same capability in a meaningfully changed situation
6. **Return:** spaced/interleaved retrieval via existing review system

### Tutor Behavior Rules
- Explain differently, give concrete examples, identify misconceptions after submission
- Ask one focused teaching question at a time; keep answers concise
- Label outside-course context as AI general knowledge explicitly
- Never invent citations; never pretend optional references prove claims
- Model does not advance mastery, charge credits, grant entitlements, or modify course content — server verifies every action

---

## 4. Learning-Component Registry

All components: keyboard/touch support, text equivalents, explicit schema versions, server evaluation rules where applicable.

| Component | Evidence Treatment |
|-----------|-------------------|
| Explanation + worked example | Exposure only |
| Single/multiple choice | Deterministic verification when criteria allow |
| Numeric task | Server tolerance/unit validation |
| Ordering | Server sequence validation |
| Matching | Server mapping validation |
| Flashcard/retrieval | Self-check unless independently graded |
| Short response | AI-assessed, labeled with uncertainty |
| Diagram/step-through | Interaction alone gives no verified credit |
| Parameter explorer | Exploration only; related committed task graded separately |
| Guided project checkpoint | Separate project assessment, entitlement-aware |

**Three concrete parameter explorers:** neuron explorer (z = x₁w₁ + x₂w₂ + b, sigmoid output), linear-function explorer, compound-growth explorer (illustrative math, not financial advice). Expressions from named trusted formulas only — no `eval`, `Function`, or arbitrary expression strings.

---

## 5. Cloudflare Architecture

- **Workers:** same-origin API, auth/access checks, orchestration, output validation, grading, usage settlement
- **Database:** D1 (post-migration) — canonical sessions, attempts, evidence, entitlement consumption, manifests, jobs
- **Budget authority:** SQLite-backed Durable Object serializing monthly reservations and per-user quotas (KV not acceptable — eventual consistency permits overspending)
- **R2:** versioned lesson artifacts, larger manifests; authorization on private assets
- **Queues:** idempotent preparation/embedding jobs, bounded retry, dead-letter handling
- **AI Gateway:** optional routing/metrics/rate limiting; BYOK; payload logging disabled
- **Retrieval:** lesson-scoped chunks + lexical retrieval; Vectorize adapter behind feature flag
- **Provider:** configurable text-only model; initial benchmark GPT-4.1 mini ($0.40/M in, $1.60/M out)

---

## 6. Data Model (Conceptual Additions)

| Entity | Key Fields |
|--------|-----------|
| `spark_manifest` | id, course_id, lesson_id, lesson_version, locale, schema_version, blocks, evidence_status, content_hash; unique on version+locale+registry+hash |
| `spark_session` | id, owner_user_id, course_id, lesson_version, stage, context_summary |
| `spark_turn` | id, session_id, request_id (unique per owner), payload, usage_reservation_id |
| `spark_attempt` | id, owner, task_id, task_version, committed_answer, rubric_version, grading_method, result; immutable |
| `spark_evidence` | attempt_id, criterion_id, evidence_type, assessor/model_version, uncertainty |
| `spark_preparation_job` | id, course/lesson version, content_hash, state, attempts; idempotent |
| `spark_usage` | request_id, category, provider/model, price_version, tokens, reserved/actual microUSD, month_key |
| `spark_month_budget` | month_key, cap, reserves, committed/reserved/unknown microUSD, mode |

Monetary amounts as integer microUSD; round reservations upward; never floating-point for enforcement.

---

## 7. API Contracts (Logical)

| Route | Behavior |
|-------|----------|
| `GET /api/spark/courses/:courseId/state` | Accessible course, current lesson/stage, manifest, evidence, due review, entitlement |
| `POST /api/spark/sessions` | Create/resume session; no AI call necessary |
| `POST /api/spark/sessions/:id/turns` | Bounded question → retrieval → budget admission → one inference → validated response |
| `POST /api/spark/attempts` | Commit answer, server-side or bounded-AI grading, atomic evidence |
| `POST /api/spark/attempts/:id/revisions` | New immutable attempt linked to original |
| `POST /api/spark/lessons/:id/prepare` | Enqueue preparation idempotently |
| `GET/PATCH /api/admin/spark/budget` | Operator budget state/config; audited changes |

**Response constraints:** max 8 blocks, 64KB, bounded strings, known template IDs. Never send answer keys before commitment. Standard errors: 401/403, 409 stale version, 413, 422, 429, 503, typed `budget_limited`/`allowance_exhausted`.

---

## 8. Spend Admission Algorithm

1. Load versioned server-owned price sheet; missing/stale pricing fails closed
2. Check authorization, per-user quota, rate limit, request size, idempotency before allocating
3. Compute conservative upper bound, round up to microUSD, atomically reserve; reject if over cap
4. One reservation per request_id; mark dispatch before provider call; max 4 global concurrent calls
5. Enforced output cap + deadline; abort on disconnect (dispatched work may still bill)
6. Settle on provider-reported usage; retain full reservation on unknown outcomes until reconciled
7. Retry at most once for transient errors with new reservation; no silent retries
8. On pricing anomaly: stop new AI work immediately, record, reconcile
9. Reconcile daily against provider metrics
10. Month boundary: new ledger; pending requests stay on original admission month

**Degradation thresholds:** 70% → stop bulk enrichment; 85% → prefer saved activities; 100% → practice-only mode.

---

## 9. Cost Model

**Benchmark:** GPT-4.1 mini at $0.40/M input, $1.60/M output. A 3,000-in + 700-out turn costs ~$0.00232. At $12 tutoring allocation: ~3,947 max-sized turns/month.

**Illustrative month:** 2,000 typical turns ($4.64) + 500 prep calls ($1.52) + 500 assessments ($1.52) = $7.68 AI + $5 baseline + ~$3 infra = ~$15.68 of $30.

**Scaling warning:** 100 Pro learners × 100 max turns = $30.40 in tutoring alone. The envelope cannot fund unrestricted growth. Suggested first pilot: ≤20 Pro-equivalent entitlements (2,000 tutor questions).

---

## 10. Implementation Sequence

1. **Integration inventory:** route/type/service map, baseline costs, allowance semantics, reuse decisions
2. **Schemas and migrations:** manifests, attempts, budget ledger, idempotency, feature flags
3. **Budget-first provider layer:** price sheet, admission, settlement, reconciliation; prove no-overspend before live inference
4. **Course preparation/retrieval:** lesson-save hook, chunking, lexical adapter, queue dedup
5. **Trusted activities:** registry families + 3 explorers, accessibility, server grading
6. **Orchestration/assessment:** grounded prompts, validated blocks, deterministic/AI grading, evidence
7. **Product integration:** Spark home, course player, mobile, creator preview, operator controls
8. **Quality and release:** evaluation suite (≥30 tasks), budget attack tests, load test, staging demo, runbook

**Feature flags:** `spark_enabled`, `spark_live_ai_enabled`, `spark_prepare_enabled`, `spark_semantic_retrieval_enabled`. Rollback disables live AI; retains evidence.

---

## 11. Acceptance Criteria

- $0.01 remaining + 100 concurrent admissions cannot reserve >$0.01; rejected requests dispatch nothing
- Kill switch blocks all billable paths including queue consumers
- Cross-user private courses, stale versions, invalid task IDs denied before retrieval
- Client-forged results never create evidence; correct answers stay server-side until commitment
- Prompt-injection fixtures cannot change policy, expose secrets, or bypass the ledger
- 30-task evaluation suite across subjects; human review of grading samples before production
- WCAG 2.2 AA; keyboard/touch at 320/390/768/1024px; sliders work without AI calls

---

## 12. Failure States

| Trigger | User Sees | System Does |
|---------|-----------|-------------|
| AI budget exhausted | "Spark live tutoring is paused. Saved lessons and practice available." | No inference; preserve work |
| Allowance exhausted | Actual allowance/renewal from billing system | Deterministic activities continue |
| Provider error | Save question; retry if permitted | Retain reservation; no invented answer |
| Malformed blocks | Saved text fallback | Log validation failure, no private payload |
| AI grade unavailable | "Attempt saved · feedback pending" | No demonstrated criterion issued |
| Revised course | Explain earlier version, reload | Keep old snapshot; no stale grade |

---

*Source: owner-provided specification v1.0 (2026-10-08), preserved verbatim in intent with formatting adapted for the repo. The accompanying mockup is a standalone demo (fictional content, no network calls) — not connected to FiloSage.*
