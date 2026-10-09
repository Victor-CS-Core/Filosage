# Spark integration map

Status: local implementation, flags off, not deployed

## Existing systems reused

| Concern | Existing owner | Spark integration |
| --- | --- | --- |
| Authentication and account lifecycle | Existing server auth and account-generation checks | Every route uses verified account identity and account-generation write fencing. |
| Courses and immutable lesson versions | Course artifact and publication services | Access is derived server-side; a content hash becomes the Spark lesson version. Published courses read the exact release artifact. |
| Durable application state | Existing transactional document store | Sessions, turns, attempts, assessments, manifests, chunks, tasks, and preparation jobs use existing documents. No duplicate application tables were introduced. |
| Tutor entitlement | Existing AI-usage service | Conversational turns provisionally consume the existing 5/40/100 tutor allowance. Assessment does not consume tutor questions. |
| Evidence and review | Existing mastery evidence and course progress | Only server-graded deterministic attempts write verified evidence. AI assessment remains explicitly AI-assessed or needs review. |
| Course/account deletion and export | Existing lifecycle services and account data route | Spark owner/course records are inventoried, exported, fenced, and deleted with their owning account or course. |
| Lesson creation | Existing lesson-generation route | A saved lesson is prepared once when Spark and preparation flags are enabled. Failure never rolls back the saved lesson. |
| Learner UI | Existing lesson shell and learner home | Trusted blocks render in the lesson shell; reading remains separate and available during degradation. |
| Creator UI | Existing Course Studio | Course Studio shows generated/prepared/failed lessons, component coverage, exact-version preview, and bounded retry. |
| Operator UI | Existing Command Center | The Spark panel shows monthly/category exposure, unknown reservations, tokens, pseudonymous users, modes, caps, concurrency, and kill switches. |

## Spark-owned controls

`infra/cloudflare/d1/002_spark_budget.sql` is the only dedicated D1 schema. SQLite triggers reserve funds atomically and enforce category/global caps, one request per session, global concurrency, immutable request identity, unknown-outcome containment, and halt-on-overrun behavior. Application records stay in the existing document store because it already provides account fencing, transactions, export, deletion, D1 persistence, and local fixtures.

The provider path is:

1. Authenticate and authorize the exact course, lesson, task, and lesson version.
2. Validate bounded input and idempotency.
3. Provisionally reserve the existing tutor allowance when applicable.
4. Reserve the maximum provider cost in D1.
5. Mark dispatch, make one pinned-model request, validate the complete response, and persist the turn or assessment.
6. Settle observed tokens or retain the full unknown reservation.

No model-authored code, HTML, arbitrary formula, browser tool, web search, file search, image, audio, or autonomous loop is available to Spark.

## Deferred adapters

- Semantic retrieval is intentionally disabled. The release uses bounded lesson/course lexical retrieval; no Vectorize resource or embedding bill is required.
- Preparation is deterministic and runs after lesson save or explicit creator retry. No Queue binding is declared because resource creation was not authorized. The document job identity is ready for a future at-least-once consumer.
- Validated manifests remain below 64 KB in the document store. Existing R2 is not used for small private manifests; an artifact adapter is an optimization, not an authorization requirement.
- AI Gateway is optional. The direct OpenAI adapter still passes through local authorization, allowance, budget, and validation controls.

## Cost boundary

The Spark ledger enforces the assigned $30 envelope: $5 fixed baseline, $17 AI, $3 infrastructure reserve, and $5 uncertainty reserve. AI categories start at $12 tutoring, $3 preparation, and $2 assessment. The current deterministic preparation path spends no preparation inference allocation. Existing course generation, illustrations, subscription processing, shared Cloudflare quota consumption, taxes, and unrelated application costs remain outside this Spark ledger and must be inventoried before anyone treats $30 as a whole-application cap.