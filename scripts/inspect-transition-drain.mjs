import { createRequire } from 'node:module';
import { runtimeDatabaseOptions } from './inspect-runtime-database.mjs';

// Legacy93f: top-level usage activeUntil, reserved aiRequests, banner generating/leaseUntil.
// Modern7c: ai-usage-lock resourceLocks.*.activeUntil; generation pendingCalls/receipt calls;
// stripe-server billingReconciliation numeric expiresAt; account-deletion leaseUntil.
export function classifyDrainWork(rows, now) {
 if (!Array.isArray(rows) || rows.length > 10000 || !Number.isFinite(now) || Buffer.byteLength(JSON.stringify(rows)) > 2000000) throw Error('Work observation bound.');
 const counts = Object.fromEntries(['documents','futureLeaseFields','expiredLeaseFields','malformedLeaseFields','pendingProviderCalls','inFlightProviderCalls','uncertainProviderCalls','unknownProviderCalls','unfinishedGeneration','unresolvedAiRequests','generatingBannerKeys','uploadingBannerAssets','unfinishedDeletion','unfinishedCheckout','unknownWorkStates','reservedAccountingRows','uncertainAccountingRows'].map(k => [k, 0]));
 counts.documents = rows.length;
 for (const row of rows) {
  if (!Array.isArray(row.leases) || !Array.isArray(row.calls) || !Number.isSafeInteger(row.pending) || row.pending < 0) throw Error('Invalid projected work.');
  for (const lease of row.leases) {
   if (lease === null) continue;
   if (typeof lease !== 'string' || !Number.isFinite(Date.parse(lease))) counts.malformedLeaseFields++;
   else counts[Date.parse(lease) > now ? 'futureLeaseFields' : 'expiredLeaseFields']++;
  }
  if (row.bad_lock_shape) counts.malformedLeaseFields++;
  if (row.billing_expiry !== undefined && row.billing_expiry !== null) {
   if (typeof row.billing_expiry !== 'number' || !Number.isFinite(row.billing_expiry) || row.billing_expiry < 0) counts.malformedLeaseFields++;
   else counts[row.billing_expiry > now ? 'futureLeaseFields' : 'expiredLeaseFields']++;
  }
  if (row.bad_work_shape) counts.unknownWorkStates++;
  if (row.reserved_accounting) counts.reservedAccountingRows++;
  if (row.uncertain_accounting) counts.uncertainAccountingRows++;
  counts.pendingProviderCalls += row.pending;
  for (const status of row.calls) {
   if (status === 'in_flight') counts.inFlightProviderCalls++;
   else if (status === 'uncertain') counts.uncertainProviderCalls++;
   else if (status !== 'observed') counts.unknownProviderCalls++;
  }
  const state = (known, unfinished, key) => { if (!known.includes(row.status)) counts.unknownWorkStates++; else if (unfinished.includes(row.status)) counts[key]++; };
  if (row.collection === 'generationOperations') state(['running','pending','completed','failed'], ['running','pending'], 'unfinishedGeneration');
  if (row.collection === 'aiRequests') state(['reserved','accounting_reserved','accounting_observed','accounting_uncertain','completed','failed','not_admitted','in_flight','uncertain'], ['reserved','accounting_reserved','accounting_uncertain','in_flight','uncertain'], 'unresolvedAiRequests');
  if (row.collection === 'courseBannerKeys') state(['generating','ready','failed'], ['generating'], 'generatingBannerKeys');
  if (row.collection === 'courseBannerAssets' && row.status === 'uploading') counts.uploadingBannerAssets++;
  if (row.collection === 'accountDeletionJobs' && row.active_data_removed !== true) counts.unfinishedDeletion++;
  if (row.collection === 'billingCheckout') state(['creating','replacing','open','completed','canceled','expired','failed'], ['creating','replacing'], 'unfinishedCheckout');
 }
 return counts;
}
export async function collectDrainSample(client) {
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try {
  await client.query("SET LOCAL statement_timeout='15000'; SET LOCAL lock_timeout='3000'; SET LOCAL row_security=off");
  const meta = (await client.query("SELECT current_database()='filosage' AS correct_database, current_setting('transaction_read_only')='on' AS read_only, clock_timestamp() AS observed_at")).rows[0];
  if (meta?.correct_database !== true || meta.read_only !== true) throw Error('Wrong read-only database.');
  const observedAt = new Date(meta.observed_at).toISOString();
  const sessions = (await client.query(`SELECT
   count(*) FILTER (WHERE backend_type='client backend')::int AS clients,
   count(*) FILTER (WHERE backend_type='client backend' AND state='active')::int AS active,
   count(*) FILTER (WHERE backend_type='client backend' AND state='idle')::int AS idle,
   count(*) FILTER (WHERE backend_type='client backend' AND state IN ('idle in transaction','idle in transaction (aborted)'))::int AS idle_transaction,
   count(*) FILTER (WHERE backend_type IS NULL)::int AS unknown_backend,
   count(*) FILTER (WHERE backend_type IS NOT NULL AND backend_type<>'client backend')::int AS nonclient_backends
   FROM pg_stat_activity WHERE datname='filosage' AND pid<>pg_backend_pid()`)).rows[0];
  if (!sessions || Object.values(sessions).some(v => !Number.isSafeInteger(v) || v < 0)) throw Error('Incomplete session observation.');
  const rows = (await client.query(`SELECT collection_id AS collection, data->>'status' AS status,
   jsonb_build_array(data->'leaseUntil',data->'activeUntil') || CASE WHEN jsonb_typeof(data->'resourceLocks')='object'
    THEN (SELECT coalesce(jsonb_agg(value->'activeUntil'),'[]'::jsonb) FROM jsonb_each(data->'resourceLocks')) ELSE '[]'::jsonb END AS leases,
   (data ? 'resourceLocks' AND jsonb_typeof(data->'resourceLocks') IS DISTINCT FROM 'object') AS bad_lock_shape,
   CASE WHEN collection_id='billingReconciliation' THEN data->'expiresAt' ELSE NULL END AS billing_expiry,
   CASE WHEN jsonb_typeof(data->'pendingCalls')='array' THEN jsonb_array_length(data->'pendingCalls') ELSE 0 END AS pending,
   CASE WHEN collection_id='generationUsageReceipts' AND jsonb_typeof(data->'calls')='object'
    THEN (SELECT coalesce(jsonb_agg(value->'status'),'[]'::jsonb) FROM jsonb_each(data->'calls')) ELSE '[]'::jsonb END AS calls,
   ((data ? 'pendingCalls' AND jsonb_typeof(data->'pendingCalls') IS DISTINCT FROM 'array')
     OR (collection_id='generationUsageReceipts' AND data ? 'calls' AND jsonb_typeof(data->'calls') IS DISTINCT FROM 'object')) AS bad_work_shape,
   CASE WHEN jsonb_typeof(data->'reservedCostMicros')='number' THEN (data->>'reservedCostMicros')::numeric > 0 ELSE false END
    OR CASE WHEN jsonb_typeof(data->'remainingReserveMicros')='number' THEN (data->>'remainingReserveMicros')::numeric > 0 ELSE false END AS reserved_accounting,
   CASE WHEN jsonb_typeof(data->'uncertainCostMicros')='number' THEN (data->>'uncertainCostMicros')::numeric > 0 ELSE false END AS uncertain_accounting,
   data->'activeDataRemoved' AS active_data_removed
   FROM public.filosage_documents LIMIT 10001`)).rows;
  const work = classifyDrainWork(rows, Date.parse(observedAt));
  return { schemaVersion: 1, operation: 'transition-drain-sample', observedAt, sessions, work,
   databaseClientsZero: sessions.clients === 0 && sessions.unknown_backend === 0,
   drainVerified: false, oldReplicaShutdownVerified: false, externalWriterFenceVerified: false };
 } finally { await client.query('ROLLBACK'); }
}
/** Job wrapper controls finite repeats; this never starts the app or imports server code. */
export async function runDrainSample() {
 const options = runtimeDatabaseOptions(process.env.DATABASE_URL, process.env.DATABASE_SSL);
 const require = createRequire(`${process.cwd()}/package.json`); const pg = require('pg');
 const client = new pg.Client({ ...options, application_name: 'filosage-readonly-transition-drain',
  options: '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=15000' });
 try { await client.connect(); return await collectDrainSample(client); }
 finally { await client.end().catch(() => undefined); }
}
