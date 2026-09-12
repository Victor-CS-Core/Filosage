-- DRAFT FOR INDEPENDENT REVIEW. NOT EXECUTED. No credential-bearing URL here.
-- Execute each numbered query via pg.Client.query separately; do not expose rows
-- outside the fixed aggregate schemas. Never query any account/receipt identifier.
-- $1 for query 4 is the literal proposed month '2026-09', not user input.

-- 0: transaction and target guard. The wrapper must require every boolean true.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL max_parallel_workers_per_gather = 0;
SELECT current_database() = 'filosage' AS correct_database,
       current_user = 'filosageadmin' AS expected_existing_legacy_login,
       current_setting('transaction_read_only') = 'on' AS transaction_read_only;

-- 1: boundedness and array-quality inventory. Require each collection <= 10000,
-- and reject arrays >64 before proceeding; report no partial financial total.
SELECT count(*) FILTER (WHERE collection_path = 'aiRequests') AS request_documents,
       count(*) FILTER (WHERE collection_path = 'systemUsageShards') AS shard_documents,
       count(*) FILTER (WHERE collection_path = 'aiRequests' AND
         CASE WHEN jsonb_typeof(data->'attempts') = 'array'
           THEN jsonb_array_length(data->'attempts') > 64 ELSE false END) AS oversized_attempt_arrays,
       count(*) FILTER (WHERE collection_path = 'aiRequests' AND
         jsonb_typeof(data->'attempts') IS DISTINCT FROM 'array') AS missing_or_invalid_attempt_arrays
FROM public.filosage_documents
WHERE collection_path IN ('aiRequests','systemUsageShards');

-- 2: surviving request snapshots, maximum 7 feature x 4 status = 28 rows.
-- Cost is the app's recorded estimate, not provider billing. Token subsets overlap
-- input_tokens and must not be added to it. NULL sums mean unavailable, not zero.
WITH requests AS (
 SELECT CASE WHEN data->>'feature' IN ('course_outline','course_banner','lesson_generation','tutor','flashcard_generation','command_center_draft') THEN data->>'feature' ELSE 'other' END AS feature, CASE WHEN data->>'status' IN ('reserved','completed','failed') THEN data->>'status' ELSE 'other' END AS status,
    CASE WHEN data->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN data->>'createdAt' END AS recorded_created_at,
    CASE WHEN data->>'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN data->>'updatedAt' END AS recorded_updated_at,
    CASE WHEN jsonb_typeof(data->'inputTokens') = 'number' AND (data->>'inputTokens') ~ '^[0-9]{1,15}$' THEN (data->>'inputTokens')::numeric END AS input_tokens,
    CASE WHEN jsonb_typeof(data->'cachedInputTokens') = 'number' AND (data->>'cachedInputTokens') ~ '^[0-9]{1,15}$' THEN (data->>'cachedInputTokens')::numeric END AS cached_input_tokens,
    CASE WHEN jsonb_typeof(data->'cacheWriteTokens') = 'number' AND (data->>'cacheWriteTokens') ~ '^[0-9]{1,15}$' THEN (data->>'cacheWriteTokens')::numeric END AS cache_write_tokens,
    CASE WHEN jsonb_typeof(data->'outputTokens') = 'number' AND (data->>'outputTokens') ~ '^[0-9]{1,15}$' THEN (data->>'outputTokens')::numeric END AS output_tokens,
    CASE WHEN jsonb_typeof(data->'actualCostMicros') = 'number' AND (data->>'actualCostMicros') ~ '^[0-9]{1,15}$' THEN (data->>'actualCostMicros')::numeric END AS estimated_cost_micros
 FROM public.filosage_documents WHERE collection_path = 'aiRequests'
)
SELECT feature, status, count(*) AS request_snapshots,
  min(recorded_created_at) AS earliest_reservation_recorded_at,
  max(recorded_created_at) AS latest_reservation_recorded_at,
  min(recorded_updated_at) AS earliest_recorded_update_at,
  max(recorded_updated_at) AS latest_recorded_update_at,
  count(*) FILTER (WHERE recorded_created_at IS NULL OR recorded_updated_at IS NULL) AS invalid_or_missing_timestamps,
  SUM(input_tokens) AS input_tokens, COUNT(*) FILTER (WHERE input_tokens IS NULL) AS invalid_or_missing_input_tokens_rows,
  SUM(cached_input_tokens) AS cached_input_tokens, COUNT(*) FILTER (WHERE cached_input_tokens IS NULL) AS invalid_or_missing_cached_input_tokens_rows,
  SUM(cache_write_tokens) AS cache_write_tokens, COUNT(*) FILTER (WHERE cache_write_tokens IS NULL) AS invalid_or_missing_cache_write_tokens_rows,
  SUM(output_tokens) AS output_tokens, COUNT(*) FILTER (WHERE output_tokens IS NULL) AS invalid_or_missing_output_tokens_rows,
  SUM(estimated_cost_micros) AS estimated_cost_micros, COUNT(*) FILTER (WHERE estimated_cost_micros IS NULL) AS invalid_or_missing_estimated_cost_micros_rows
FROM requests GROUP BY feature,status ORDER BY feature,status;

-- 3: attempt detail view of the same finalized snapshots. Never add these totals
-- to query 2 or 4. Only fixed allowlisted model labels leave SQL. 'other' includes
-- unknown models/tool cost samples; it is not necessarily a distinct paid call.
WITH attempts AS (
 SELECT CASE WHEN attempt->>'model' IN ('gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna','gpt-image-1-mini')
   THEN attempt->>'model' ELSE 'other' END AS model_bucket,
   CASE WHEN jsonb_typeof(attempt->'inputTokens') = 'number' AND (attempt->>'inputTokens') ~ '^[0-9]{1,15}$' THEN (attempt->>'inputTokens')::numeric END AS input_tokens,
    CASE WHEN jsonb_typeof(attempt->'cachedInputTokens') = 'number' AND (attempt->>'cachedInputTokens') ~ '^[0-9]{1,15}$' THEN (attempt->>'cachedInputTokens')::numeric END AS cached_input_tokens,
    CASE WHEN jsonb_typeof(attempt->'cacheWriteTokens') = 'number' AND (attempt->>'cacheWriteTokens') ~ '^[0-9]{1,15}$' THEN (attempt->>'cacheWriteTokens')::numeric END AS cache_write_tokens,
    CASE WHEN jsonb_typeof(attempt->'outputTokens') = 'number' AND (attempt->>'outputTokens') ~ '^[0-9]{1,15}$' THEN (attempt->>'outputTokens')::numeric END AS output_tokens,
    CASE WHEN jsonb_typeof(attempt->'costMicros') = 'number' AND (attempt->>'costMicros') ~ '^[0-9]{1,15}$' THEN (attempt->>'costMicros')::numeric END AS estimated_cost_micros
 FROM public.filosage_documents
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(data->'attempts') = 'array' THEN
     CASE WHEN jsonb_array_length(data->'attempts') <= 64 THEN data->'attempts' ELSE '[]'::jsonb END
   ELSE '[]'::jsonb END) AS attempt
 WHERE collection_path = 'aiRequests' AND data->>'status' IN ('completed','failed')
)
SELECT model_bucket, count(*) AS recorded_usage_samples,
  SUM(input_tokens) AS input_tokens, COUNT(*) FILTER (WHERE input_tokens IS NULL) AS invalid_or_missing_input_tokens_rows,
  SUM(cached_input_tokens) AS cached_input_tokens, COUNT(*) FILTER (WHERE cached_input_tokens IS NULL) AS invalid_or_missing_cached_input_tokens_rows,
  SUM(cache_write_tokens) AS cache_write_tokens, COUNT(*) FILTER (WHERE cache_write_tokens IS NULL) AS invalid_or_missing_cache_write_tokens_rows,
  SUM(output_tokens) AS output_tokens, COUNT(*) FILTER (WHERE output_tokens IS NULL) AS invalid_or_missing_output_tokens_rows,
  SUM(estimated_cost_micros) AS estimated_cost_micros, COUNT(*) FILTER (WHERE estimated_cost_micros IS NULL) AS invalid_or_missing_estimated_cost_micros_rows
FROM attempts GROUP BY model_bucket ORDER BY model_bucket;

-- 4: current-month cumulative pool budget view, maximum four rows. Monthly shards
-- are the selected cumulative estimate; requests/attempts are separate diagnostics.
-- Reserved amounts are unsettled reservations, never included in actual-cost sums.
WITH shards AS (
 SELECT CASE WHEN data->>'pool' IN ('free','paid','owner') THEN data->>'pool' ELSE 'other' END AS pool_bucket,
   CASE WHEN jsonb_typeof(data->'actualCostMicros') = 'number' AND (data->>'actualCostMicros') ~ '^[0-9]{1,15}$' THEN (data->>'actualCostMicros')::numeric END AS estimated_cost_micros,
    CASE WHEN jsonb_typeof(data->'reservedCostMicros') = 'number' AND (data->>'reservedCostMicros') ~ '^[0-9]{1,15}$' THEN (data->>'reservedCostMicros')::numeric END AS reserved_cost_micros,
   CASE WHEN data->>'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN data->>'updatedAt' END AS recorded_updated_at
 FROM public.filosage_documents WHERE collection_path = 'systemUsageShards' AND data->>'periodKey' = $1
)
SELECT pool_bucket, count(*) AS monthly_shard_documents,
  min(recorded_updated_at) AS earliest_shard_update_at,
  max(recorded_updated_at) AS latest_shard_update_at,
  count(*) FILTER (WHERE recorded_updated_at IS NULL) AS invalid_or_missing_timestamps,
  SUM(estimated_cost_micros) AS estimated_cost_micros, COUNT(*) FILTER (WHERE estimated_cost_micros IS NULL) AS invalid_or_missing_estimated_cost_micros_rows,
  SUM(reserved_cost_micros) AS reserved_cost_micros, COUNT(*) FILTER (WHERE reserved_cost_micros IS NULL) AS invalid_or_missing_reserved_cost_micros_rows
FROM shards GROUP BY pool_bucket ORDER BY pool_bucket;

-- Always execute in finally; no COMMIT, mutation, EXPLAIN ANALYZE or new function.
ROLLBACK;
