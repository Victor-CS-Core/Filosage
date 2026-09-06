# Full-course evaluation and acceptance evidence

`npm run eval:model-quality -- --dry-run` prints the twelve named cases, request hashes, reviewer packets and blockers without contacting an app or provider. `--list --cases systems-thinking,reading-metrics` selects a bounded subset. The existing 100-case routing/invariant corpus remains a separate deterministic test set.

The selected coverage is **8 English, 2 Spanish, 1 Japanese and 1 English/Spanish** complete courses. This distribution was explicitly approved for evaluation during September 6 implementation; it was not a previously prescribed language distribution and does not expand launch-supported language claims. Titles and reviewer expertise come from `docs/LAUNCH_CATALOG.md`. Stressors cover scarce sources, freshness, uncertainty/safety, STEM notation, quoted AI controls, accessibility and language/transfer. These are prompts for coverage, not claims that a provider will actually produce a scarce-source or safety failure. Record observed conditions in the review packet.

## Live execution is currently blocked

**No real-provider run or spend is authorized by this implementation.** Current R08 operation receipts improve cost recovery but do not prove a hard upper bound on a call's final input/search spend. R09 durable lesson operation support is also required. The tool therefore fails before mutation when these capabilities are absent; setting an environment variable cannot bypass this check.

The real HTTP adapter uses existing app routes:

- `POST /api/generate-course` and `POST /api/generate-lesson` with a persisted, stable idempotency key.
- `GET /api/generation-operations/:operationId` for the durable owner-only status/usage receipt.
- `POST /api/generation-operations/:operationId` for an explicitly resumable stage.
- Authenticated course and lesson reads for the complete saved content.

It never publishes, grants credits, overrides product models, invokes the provider independently, or deletes courses. The local exact-candidate deterministic validator consumes the collected complete course; no length-based quality score or first-lesson proxy remains.

Before a future approved live run, the owner-only `GET /api/generation-operations` response must implement and truthfully return this capability contract:

```json
{
  "evaluationCapabilities": {
    "version": 1,
    "provider": "openai",
    "stub": false,
    "buildSha": "exact approved 40-character SHA",
    "profile": "reviewed campaign profile label",
    "operationUsage": true,
    "lessonOperations": true,
    "enforcedOperationCeilingMicros": 0
  }
}
```

The zero above is deliberately non-runnable. The advertised enforced ceiling must exactly equal the operator-approved per-operation ceiling; a larger server ceiling cannot justify the smaller client reservation. The implemented backend must enforce a reviewed positive ceiling across the **whole operation, including every resumed research/generation/verifier/fallback call**, using `X-Filosage-Evaluation-Max-Cost-Micros` on start/resume. An admission estimate, a configured key, a client-side timer, or a self-attested capability value is not evidence that enforcement works. Add real service/provider-boundary cap tests before enabling this capability. Do not advertise it in production merely to satisfy the harness.

R08's separate `evaluation` receipt supplies `actualCostMicros`, `uncertainCostMicros`, `remainingReserveMicros`, bounded calls with samples, and runtime configuration/profiles. The adapter retains model, prompt, token/cache and profile metadata; it excludes provider prompts, authentication credentials and raw error payloads. The application's `actualCostMicros` is its token/pricing estimate, **not a provider invoice**. Pricing and search-cost coverage must be reviewed for the selected models; unknown cost halts execution. No Astra price is invented.

## Approved operator setup, once the backend gate exists

Use `--help` for the required explicit arguments. A run needs:

- `--live`, `MODEL_QUALITY_EVAL_LIVE=1`, and `--authorization approve-live-<run-id>` for the exact approved run.
- A separately approved total `--budget-usd` and whole-operation `--operation-ceiling-usd`.
- Exact `--expected-sha`, reviewed `--profile`, approved candidate `--origin`, and explicit `--output` directory.
- A short-lived `MODEL_QUALITY_EVAL_AUTH_TOKEN` and explicit `OPENAI_API_KEY` configuration. Keys are never logged or saved and the CLI does not send the provider key to the app; the actual server identity/receipts remain mandatory.

The checkout SHA must match the target health version. HTTP is allowed only on literal loopback; other targets require HTTPS. Known production domains are rejected and redirects cannot move the credential to another origin. The operator must select the approved inactive candidate origin; a hostname alone does not prove environment isolation.

## Checkpoints, deadlines and interruption

Each operation's stable key, payload hash and full cost reservation are atomically saved and fsynced **before** mutation. Every observed operation ID, stage transition, cumulative receipt and saved artifact is checkpointed. The checkpoint includes course/release IDs (release remains null for unpublished drafts), all planned lesson IDs, content hashes, usage samples, prompt versions, returned source/policy metadata, deterministic diagnostics and a blank human review packet. Private course DTOs are retained for review; they are not public output or raw provider transcripts.

Only one process may own a directory. `checkpoint.json` is replaced atomically with a checksum; artifact hashes are checked on load. An existing directory requires `--resume` with the original candidate, origin, profile, selection, budget and deadlines. Keep the checkpoint directory private and durable, outside tracked source or in the ignored `test-results` tree; copy the complete packet into approved durable evidence storage before cleaning transient runners. Do not commit learner content or credentials.

Defaults are 150 seconds per HTTP request and two hours per case. The case's absolute deadline persists across resumes. A client abort does not cancel server work or guarantee no charge. A known operation is first read and reconciled; only `pending` plus `resumable:true` can trigger a resume. `running` is boundedly polled. Completed steps and receipts are reused without another creation or duplicate cost.

If the initial response is lost before its operation ID is retained, the persisted intent keeps its entire reservation and **does not automatically repeat creation**. Inspect the owner's operation list and server records using the stable idempotency key. There is no unsafe manual checkpoint-edit or blind retry command. Terminal failed cases require a separately approved new experiment. Uncertain cost or unresolved operation stops the whole run. A stale `run.lock` likewise requires operator reconciliation that the previous runner and operation are inactive before removal; the tool does not guess.

A later-lesson failure leaves the case blocked with all earlier lessons and cost intact. Early research/verifier receipts survive outline failure. Counters separate generation attempts/retries from research, verifier, fallback and recovery calls; several samples alone do not imply retries.

## Human acceptance and profile comparison

Every case starts `not_reviewed`, with null scores and fields for reviewer expertise, language competence, date, next review, per-dimension evidence, critical feedback, translation equivalence, every-lesson inspection, solvable practice, capstone alignment, source freshness and browser accessibility. Copy this template into a separate signed review record bound to the retained hashes; do not edit the checksummed runner state. Apply the catalog's eight dimensions, at least **13/16**, no zero accuracy/source quality/accessibility, and no unresolved critical feedback. A completed generation only becomes `awaiting_review`; the harness never self-attests fluent teaching or publication approval. Deterministic blockers remain blocked even when all lessons were generated. The local validator does not execute publication or its transactional research-proof check; those remain separate release gates.

Compare the same case IDs and requests across independently approved exact profile/build campaigns. Retain each campaign separately and compare complete-course outcomes, stage latency, operation attempts, recovery, observed token/cost estimates and human judgments. Selective Astra evaluation requires an explicit separate profile/budget decision and verified pricing; this tool does not change the product's Luna/Terra/Sol profiles. Twelve courses provide coverage evidence, not a statistically established reliability rate.

`npm run test:eval-harness` exercises the runner with explicitly marked **offline fixtures**: complete lesson traversal, later failures, failed-outline cost, resume/no-double-spend, uncertain accounting, deadlines, missing/stub evidence, checkpoint locks and corruption. These tests never call a provider, and fixture completion is `fixture_complete`, never real-course quality or a live pass.
