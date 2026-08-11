# Operations

Machine event source: `src/lib/course-pipeline/observability.ts`.

Current call sites cover pipeline/stage lifecycle, validation decisions, repair plan/completion/exhaustion, publication, and failure. Payloads support correlation ID, privacy-safe actor hash, rule codes, versions, model/retry/repair counts, snapshot hash, and flag cohort. Lesson prose and source notes are not written to pipeline events. The schema reserves lab, visual, rollback, and duration fields, but dedicated emitters and measured dashboards for those signals are still required before cohort expansion.

Events are persisted to `coursePipelineEvents`. Authorized owners can query a course timeline at `GET /api/admin/courses/[courseId]/pipeline-events`. Shadow publication records the V1 decision, V2 decision, and disagreement flag.

## Required dashboards

- technical completion and stage latency;
- first-pass pass and denial by stable rule;
- false-denial report and abandonment;
- repair success/attempts by rule;
- manual review;
- provider failure/refusal/rate limit;
- quota/capacity release failure;
- broken lab/visual;
- publish failure/stale rejection/edit conflict.

Alert thresholds and a rendered admin dashboard remain pending and must be based on the first shadow baseline rather than arbitrary values. Existing operational webhook/backup configuration remains unchanged.
