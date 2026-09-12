import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const TARGET_SHA = '93f60f24afe59b19b6a592f455a09e8e813f1f84';
export const SQL_SHA256 = '31229d3b63c439f649adfc3d9eb78709cc9f1f3fdaf7c10a590458e1ff59ff53';
export const QUERIES = Object.freeze([
  "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  "SET LOCAL statement_timeout = '15s'",
  "SET LOCAL lock_timeout = '3s'",
  "SET LOCAL idle_in_transaction_session_timeout = '30s'",
  "SET LOCAL max_parallel_workers_per_gather = 0",
  "SELECT current_database() = 'filosage' AS correct_database,\n       current_user = 'filosageadmin' AS expected_existing_legacy_login,\n       current_setting('transaction_read_only') = 'on' AS transaction_read_only",
  "SELECT count(*) FILTER (WHERE collection_path = 'aiRequests') AS request_documents,\n       count(*) FILTER (WHERE collection_path = 'systemUsageShards') AS shard_documents,\n       count(*) FILTER (WHERE collection_path = 'aiRequests' AND\n         CASE WHEN jsonb_typeof(data->'attempts') = 'array'\n           THEN jsonb_array_length(data->'attempts') > 64 ELSE false END) AS oversized_attempt_arrays,\n       count(*) FILTER (WHERE collection_path = 'aiRequests' AND\n         jsonb_typeof(data->'attempts') IS DISTINCT FROM 'array') AS missing_or_invalid_attempt_arrays\nFROM public.filosage_documents\nWHERE collection_path IN ('aiRequests','systemUsageShards')",
  "WITH requests AS (\n SELECT CASE WHEN data->>'feature' IN ('course_outline','course_banner','lesson_generation','tutor','flashcard_generation','command_center_draft') THEN data->>'feature' ELSE 'other' END AS feature, CASE WHEN data->>'status' IN ('reserved','completed','failed') THEN data->>'status' ELSE 'other' END AS status,\n    CASE WHEN data->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$' THEN data->>'createdAt' END AS recorded_created_at,\n    CASE WHEN data->>'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$' THEN data->>'updatedAt' END AS recorded_updated_at,\n    CASE WHEN jsonb_typeof(data->'inputTokens') = 'number' AND (data->>'inputTokens') ~ '^[0-9]{1,15}$' THEN (data->>'inputTokens')::numeric END AS input_tokens,\n    CASE WHEN jsonb_typeof(data->'cachedInputTokens') = 'number' AND (data->>'cachedInputTokens') ~ '^[0-9]{1,15}$' THEN (data->>'cachedInputTokens')::numeric END AS cached_input_tokens,\n    CASE WHEN jsonb_typeof(data->'cacheWriteTokens') = 'number' AND (data->>'cacheWriteTokens') ~ '^[0-9]{1,15}$' THEN (data->>'cacheWriteTokens')::numeric END AS cache_write_tokens,\n    CASE WHEN jsonb_typeof(data->'outputTokens') = 'number' AND (data->>'outputTokens') ~ '^[0-9]{1,15}$' THEN (data->>'outputTokens')::numeric END AS output_tokens,\n    CASE WHEN jsonb_typeof(data->'actualCostMicros') = 'number' AND (data->>'actualCostMicros') ~ '^[0-9]{1,15}$' THEN (data->>'actualCostMicros')::numeric END AS estimated_cost_micros\n FROM public.filosage_documents WHERE collection_path = 'aiRequests'\n)\nSELECT feature, status, count(*) AS request_snapshots,\n  min(recorded_created_at) AS earliest_reservation_recorded_at,\n  max(recorded_created_at) AS latest_reservation_recorded_at,\n  min(recorded_updated_at) AS earliest_recorded_update_at,\n  max(recorded_updated_at) AS latest_recorded_update_at,\n  count(*) FILTER (WHERE recorded_created_at IS NULL OR recorded_updated_at IS NULL) AS invalid_or_missing_timestamps,\n  SUM(input_tokens) AS input_tokens, COUNT(*) FILTER (WHERE input_tokens IS NULL) AS invalid_or_missing_input_tokens_rows,\n  SUM(cached_input_tokens) AS cached_input_tokens, COUNT(*) FILTER (WHERE cached_input_tokens IS NULL) AS invalid_or_missing_cached_input_tokens_rows,\n  SUM(cache_write_tokens) AS cache_write_tokens, COUNT(*) FILTER (WHERE cache_write_tokens IS NULL) AS invalid_or_missing_cache_write_tokens_rows,\n  SUM(output_tokens) AS output_tokens, COUNT(*) FILTER (WHERE output_tokens IS NULL) AS invalid_or_missing_output_tokens_rows,\n  SUM(estimated_cost_micros) AS estimated_cost_micros, COUNT(*) FILTER (WHERE estimated_cost_micros IS NULL) AS invalid_or_missing_estimated_cost_micros_rows\nFROM requests GROUP BY feature,status ORDER BY feature,status",
  "WITH attempts AS (\n SELECT CASE WHEN attempt->>'model' IN ('gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna','gpt-image-1-mini')\n   THEN attempt->>'model' ELSE 'other' END AS model_bucket,\n   CASE WHEN jsonb_typeof(attempt->'inputTokens') = 'number' AND (attempt->>'inputTokens') ~ '^[0-9]{1,15}$' THEN (attempt->>'inputTokens')::numeric END AS input_tokens,\n    CASE WHEN jsonb_typeof(attempt->'cachedInputTokens') = 'number' AND (attempt->>'cachedInputTokens') ~ '^[0-9]{1,15}$' THEN (attempt->>'cachedInputTokens')::numeric END AS cached_input_tokens,\n    CASE WHEN jsonb_typeof(attempt->'cacheWriteTokens') = 'number' AND (attempt->>'cacheWriteTokens') ~ '^[0-9]{1,15}$' THEN (attempt->>'cacheWriteTokens')::numeric END AS cache_write_tokens,\n    CASE WHEN jsonb_typeof(attempt->'outputTokens') = 'number' AND (attempt->>'outputTokens') ~ '^[0-9]{1,15}$' THEN (attempt->>'outputTokens')::numeric END AS output_tokens,\n    CASE WHEN jsonb_typeof(attempt->'costMicros') = 'number' AND (attempt->>'costMicros') ~ '^[0-9]{1,15}$' THEN (attempt->>'costMicros')::numeric END AS estimated_cost_micros\n FROM public.filosage_documents\n CROSS JOIN LATERAL jsonb_array_elements(\n   CASE WHEN jsonb_typeof(data->'attempts') = 'array' THEN\n     CASE WHEN jsonb_array_length(data->'attempts') <= 64 THEN data->'attempts' ELSE '[]'::jsonb END\n   ELSE '[]'::jsonb END) AS attempt\n WHERE collection_path = 'aiRequests' AND data->>'status' IN ('completed','failed')\n)\nSELECT model_bucket, count(*) AS recorded_usage_samples,\n  SUM(input_tokens) AS input_tokens, COUNT(*) FILTER (WHERE input_tokens IS NULL) AS invalid_or_missing_input_tokens_rows,\n  SUM(cached_input_tokens) AS cached_input_tokens, COUNT(*) FILTER (WHERE cached_input_tokens IS NULL) AS invalid_or_missing_cached_input_tokens_rows,\n  SUM(cache_write_tokens) AS cache_write_tokens, COUNT(*) FILTER (WHERE cache_write_tokens IS NULL) AS invalid_or_missing_cache_write_tokens_rows,\n  SUM(output_tokens) AS output_tokens, COUNT(*) FILTER (WHERE output_tokens IS NULL) AS invalid_or_missing_output_tokens_rows,\n  SUM(estimated_cost_micros) AS estimated_cost_micros, COUNT(*) FILTER (WHERE estimated_cost_micros IS NULL) AS invalid_or_missing_estimated_cost_micros_rows\nFROM attempts GROUP BY model_bucket ORDER BY model_bucket",
  "WITH shards AS (\n SELECT CASE WHEN data->>'pool' IN ('free','paid','owner') THEN data->>'pool' ELSE 'other' END AS pool_bucket,\n   CASE WHEN jsonb_typeof(data->'actualCostMicros') = 'number' AND (data->>'actualCostMicros') ~ '^[0-9]{1,15}$' THEN (data->>'actualCostMicros')::numeric END AS estimated_cost_micros,\n    CASE WHEN jsonb_typeof(data->'reservedCostMicros') = 'number' AND (data->>'reservedCostMicros') ~ '^[0-9]{1,15}$' THEN (data->>'reservedCostMicros')::numeric END AS reserved_cost_micros,\n   CASE WHEN data->>'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$' THEN data->>'updatedAt' END AS recorded_updated_at\n FROM public.filosage_documents WHERE collection_path = 'systemUsageShards' AND data->>'periodKey' = $1\n)\nSELECT pool_bucket, count(*) AS monthly_shard_documents,\n  min(recorded_updated_at) AS earliest_shard_update_at,\n  max(recorded_updated_at) AS latest_shard_update_at,\n  count(*) FILTER (WHERE recorded_updated_at IS NULL) AS invalid_or_missing_timestamps,\n  SUM(estimated_cost_micros) AS estimated_cost_micros, COUNT(*) FILTER (WHERE estimated_cost_micros IS NULL) AS invalid_or_missing_estimated_cost_micros_rows,\n  SUM(reserved_cost_micros) AS reserved_cost_micros, COUNT(*) FILTER (WHERE reserved_cost_micros IS NULL) AS invalid_or_missing_reserved_cost_micros_rows\nFROM shards GROUP BY pool_bucket ORDER BY pool_bucket",
  "ROLLBACK"
]);
export function runtimeDatabaseOptions(connectionString, sslMode) {
  const target = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(target.protocol)
    || target.hostname !== "filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com"
    || target.pathname !== "/filosage" || !target.username || !target.password || target.hash
    || (target.port && target.port !== "5432") || sslMode === "disable") throw new Error("Unapproved database target.");
  const options = [...target.searchParams];
  if (options.length > 1 || options.some(([key, value]) => key !== "sslmode" || !["require", "verify-full"].includes(value))) throw new Error("Unapproved database URL options.");
  // No connectionString reaches pg: it can override host, port, credentials and
  // the explicit SSL object with query parameters after our URL checks.
  return { host: target.hostname, port: 5432, database: "filosage", user: decodeURIComponent(target.username), password: decodeURIComponent(target.password),
    connectionTimeoutMillis: 15000, query_timeout: 20000, ssl: { rejectUnauthorized: true }, application_name: "filosage-readonly-release-inventory" };
}


const fail = () => { throw new Error('Aggregate validation failed.'); };
const features = ['course_outline','course_banner','lesson_generation','tutor','flashcard_generation','command_center_draft','other'];
const statuses = ['reserved','completed','failed','other'];
const models = ['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna','gpt-image-1-mini','other'];
const pools = ['free','paid','owner','other'];
const metrics = ['input_tokens','cached_input_tokens','cache_write_tokens','output_tokens','estimated_cost_micros'];
const requestDates = ['earliest_reservation_recorded_at','latest_reservation_recorded_at','earliest_recorded_update_at','latest_recorded_update_at'];
const shardDates = ['earliest_shard_update_at','latest_shard_update_at'];
function closed(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k=>!Object.hasOwn(value,k))) fail();
}
function integer(value, max=Number.MAX_SAFE_INTEGER) {
  if ((typeof value !== 'number' && !(typeof value === 'string' && /^(0|[1-9][0-9]{0,15})$/.test(value))) || !Number.isSafeInteger(Number(value)) || Number(value)<0 || Number(value)>max) fail();
  return Number(value);
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString()!==value) fail();
  return value;
}
function timePairs(row, names, count) {
  const missing=integer(row.invalid_or_missing_timestamps,count);
  const output={invalid_or_missing_timestamps:missing};
  for(let i=0;i<names.length;i+=2){
    const a=row[names[i]],b=row[names[i+1]];
    if ((a===null)!==(b===null)) fail();
    if(a===null){if(missing!==count)fail();output[names[i]]=null;output[names[i+1]]=null;}
    else {output[names[i]]=timestamp(a);output[names[i+1]]=timestamp(b);if(a>b)fail();}
  }
  return output;
}
const metricFields=names=>names.flatMap(k=>[k,`invalid_or_missing_${k}_rows`]);
function metricValues(row,names,count){
  return Object.fromEntries(names.flatMap(k=>{
    const missing=integer(row[`invalid_or_missing_${k}_rows`],count);
    if((row[k]===null)!==(missing===count)) fail();
    return [[k,row[k]===null?null:integer(row[k])],[`invalid_or_missing_${k}_rows`,missing]];
  }));
}
function inventory(value){
  const keys=['request_documents','shard_documents','oversized_attempt_arrays','missing_or_invalid_attempt_arrays'];closed(value,keys);
  const out=Object.fromEntries(keys.map(k=>[k,integer(value[k],10000)]));
  if(out.oversized_attempt_arrays!==0 || out.missing_or_invalid_attempt_arrays>out.request_documents)fail();return out;
}
function groups(value,max,transform,identity){
  if(!Array.isArray(value)||value.length>max)fail();
  const out=value.map(transform),keys=out.map(identity);if(new Set(keys).size!==keys.length)fail();return out;
}
export function validateEvidence(value){
  closed(value,['schemaVersion','operation','sourceSha','sqlSha256','month','observedAt','modelLatencyMeasured','providerInvoiceVerified','viewsAreAdditive','inventory','requests','usageSamples','monthlyShards']);
  if(value.schemaVersion!==1 || value.operation!=='read-only-legacy-model-accounting-aggregate' || value.sourceSha!==TARGET_SHA || value.sqlSha256!==SQL_SHA256 || value.month!=='2026-09' || value.modelLatencyMeasured!==false || value.providerInvoiceVerified!==false || value.viewsAreAdditive!==false)fail();
  const observedAt=timestamp(value.observedAt),inv=inventory(value.inventory);
  const requests=groups(value.requests,28,row=>{
    closed(row,['feature','status','request_snapshots',...requestDates,'invalid_or_missing_timestamps',...metricFields(metrics)]);
    if(!features.includes(row.feature)||!statuses.includes(row.status))fail();
    const count=integer(row.request_snapshots,10000);if(!count)fail();
    return {feature:row.feature,status:row.status,request_snapshots:count,...timePairs(row,requestDates,count),...metricValues(row,metrics,count)};
  },r=>`${r.feature}:${r.status}`);
  const usageSamples=groups(value.usageSamples,5,row=>{
    closed(row,['model_bucket','recorded_usage_samples',...metricFields(metrics)]);if(!models.includes(row.model_bucket))fail();
    const count=integer(row.recorded_usage_samples,640000);if(!count)fail();
    return {model_bucket:row.model_bucket,recorded_usage_samples:count,...metricValues(row,metrics,count)};
  },r=>r.model_bucket);
  const monthlyShards=groups(value.monthlyShards,4,row=>{
    const names=['estimated_cost_micros','reserved_cost_micros'];
    closed(row,['pool_bucket','monthly_shard_documents',...shardDates,'invalid_or_missing_timestamps',...metricFields(names)]);if(!pools.includes(row.pool_bucket))fail();
    const count=integer(row.monthly_shard_documents,10000);if(!count)fail();
    return {pool_bucket:row.pool_bucket,monthly_shard_documents:count,...timePairs(row,shardDates,count),...metricValues(row,names,count)};
  },r=>r.pool_bucket);
  if(requests.reduce((n,r)=>n+r.request_snapshots,0)!==inv.request_documents || usageSamples.reduce((n,r)=>n+r.recorded_usage_samples,0)>inv.request_documents*64 || monthlyShards.reduce((n,r)=>n+r.monthly_shard_documents,0)>inv.shard_documents)fail();
  return {schemaVersion:1,operation:'read-only-legacy-model-accounting-aggregate',sourceSha:TARGET_SHA,sqlSha256:SQL_SHA256,month:'2026-09',observedAt,modelLatencyMeasured:false,providerInvoiceVerified:false,viewsAreAdditive:false,inventory:inv,requests,usageSamples,monthlyShards};
}
export async function collectLegacyModelAggregate(client,expectedSha){
  if(expectedSha!==TARGET_SHA)fail();
  await client.query(QUERIES[0]);
  try {
    for(let i=1;i<=4;i++)await client.query(QUERIES[i]);
    const guard=await client.query(QUERIES[5]);
    if(guard.rows.length!==1)fail();
    closed(guard.rows[0],['correct_database','expected_existing_legacy_login','transaction_read_only']);
    if(Object.values(guard.rows[0]).some(v=>v!==true))fail();
    const result=await client.query(QUERIES[6]);if(result.rows.length!==1)fail();const inv=inventory(result.rows[0]);
    const requests=await client.query(QUERIES[7]);
    const samples=await client.query(QUERIES[8]);
    const shards=await client.query(QUERIES[9],['2026-09']);
    return validateEvidence({schemaVersion:1,operation:'read-only-legacy-model-accounting-aggregate',sourceSha:TARGET_SHA,sqlSha256:SQL_SHA256,month:'2026-09',observedAt:new Date().toISOString(),modelLatencyMeasured:false,providerInvoiceVerified:false,viewsAreAdditive:false,inventory:inv,requests:requests.rows,usageSamples:samples.rows,monthlyShards:shards.rows});
  } finally {await client.query(QUERIES[10]);}
}
export async function runLegacyModelAggregate(expectedSha){
  if(expectedSha!==TARGET_SHA || process.env.SITE_VERSION!==TARGET_SHA)fail();
  const options=runtimeDatabaseOptions(process.env.DATABASE_URL,process.env.DATABASE_SSL);
  options.application_name='filosage-readonly-legacy-model-aggregate';
  const pg=createRequire(`${process.cwd()}/package.json`)('pg');
  const client=new pg.Client(options);
  try {await client.connect();return await collectLegacyModelAggregate(client,expectedSha);}
  finally {await client.end().catch(()=>undefined);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    if(process.argv.slice(2).join(' ')!=='--validate-json')fail();
    const raw=readFileSync(0,'utf8');if(raw.length>65536)fail();
    process.stdout.write(JSON.stringify(validateEvidence(JSON.parse(raw)))+'\n');
  }catch{process.stderr.write('Aggregate validation failed closed.\n');process.exitCode=1;}
}
