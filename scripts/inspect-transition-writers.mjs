import { createRequire } from 'node:module';
import { runtimeDatabaseOptions } from './inspect-runtime-database.mjs';

// Observation only: no row payloads, identities, client IPs or SQL text leave PostgreSQL.
export async function collectTransitionWriters(client) {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout='15000'; SET LOCAL lock_timeout='3000'");
    const sessions = await client.query(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE state='active')::int AS active,
      count(*) FILTER (WHERE state='idle in transaction')::int AS idle_in_transaction,
      count(*) FILTER (WHERE usename='filosageadmin')::int AS administrator,
      count(*) FILTER (WHERE usename='filosage_runtime')::int AS modern_runtime,
      count(*) FILTER (WHERE usename='filosageqa_runtime')::int AS qa_runtime,
      count(*) FILTER (WHERE datname='filosage')::int AS production_database,
      count(*) FILTER (WHERE usename NOT IN ('filosageadmin','filosage_runtime','filosageqa_runtime'))::int AS other_roles
      FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()`);
    const work = await client.query(`SELECT
      count(*)::int AS documents,
      count(*) FILTER (WHERE collection_id='generationOperations')::int AS generation_operations,
      count(*) FILTER (WHERE collection_id='generationOperations' AND data->>'status' IN ('running','pending'))::int AS unfinished_generation,
      count(*) FILTER (WHERE collection_id='generationStages' AND data->>'status' NOT IN ('completed','not_started'))::int AS unconfirmed_generation_stages,
      count(*) FILTER (WHERE collection_id='accountDeletionJobs' AND data->>'activeDataRemoved' IS DISTINCT FROM 'true')::int AS unfinished_deletion,
      count(*) FILTER (WHERE collection_id='aiRequests' AND data->>'status' IN ('reserved','accounting_reserved','in_flight','uncertain'))::int AS unresolved_ai_requests,
      count(*) FILTER (WHERE collection_id='courseBannerAssets' AND data->>'status'='uploading')::int AS uploading_assets,
      count(*) FILTER (WHERE data ? 'leaseUntil' OR data ? 'activeUntil')::int AS documents_with_lease_fields,
      count(*) FILTER (WHERE collection_id IN ('billingCheckout','billingReconciliation','billingTransitions'))::int AS billing_work_documents,
      count(*) FILTER (WHERE collection_id IN ('courseManualReviewMutations','coursePublicationMutations'))::int AS publication_mutation_documents
      FROM public.filosage_documents`);
    const cron = await client.query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS installed");
    const leaseRows = await client.query(`SELECT data->>'leaseUntil' AS lease_until, data->>'activeUntil' AS active_until
      FROM public.filosage_documents WHERE data ? 'leaseUntil' OR data ? 'activeUntil' LIMIT 1001`);
    const leaseFields = { future: 0, expired: 0, malformed: 0, null: 0, truncated: leaseRows.rows.length > 1000 };
    for (const row of leaseRows.rows.slice(0, 1000)) {
      for (const value of [row.lease_until, row.active_until]) {
        if (value === null) leaseFields.null += 1;
        else if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) leaseFields.malformed += 1;
        else if (Date.parse(value) > Date.now()) leaseFields.future += 1;
        else leaseFields.expired += 1;
      }
    }
    for (const row of [sessions.rows[0], work.rows[0]]) {
      if (!row || Object.values(row).some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error('invalid-counts');
    }
    if (typeof cron.rows[0]?.installed !== 'boolean') throw new Error('invalid-cron');
    return { schemaVersion: 1, operation: 'transition-writer-observation', observedAt: new Date().toISOString(),
      sessions: sessions.rows[0], work: work.rows[0], topLevelLeaseFields: leaseFields, cronInstalledInProductionDatabase: cron.rows[0].installed,
      drainVerified: false, externalWriterInventoryComplete: false,
      limitations: ['Counts precede maintenance and cannot prove drain.', 'Shared administrator sessions are not attributed to a revision.',
        'Lease classification covers only top-level fields; nested locks and unknown work states are not certified completed.',
        'No user records, work items or provider outcomes were changed.'] };
  } finally { await client.query('ROLLBACK'); }
}

export async function runTransitionWriters(expectedSha) {
  if (expectedSha !== '93f60f24afe59b19b6a592f455a09e8e813f1f84' || process.env.SITE_VERSION !== expectedSha) throw new Error('wrong-runtime');
  const options = runtimeDatabaseOptions(process.env.DATABASE_URL, process.env.DATABASE_SSL);
  options.application_name = 'filosage-readonly-transition-inventory';
  const require = createRequire(`${process.cwd()}/package.json`);
  const client = new (require('pg').Client)(options);
  try { await client.connect(); return { ...await collectTransitionWriters(client), sourceSha: expectedSha }; }
  finally { await client.end().catch(() => undefined); }
}
