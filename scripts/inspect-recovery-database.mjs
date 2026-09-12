import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { runtimeDatabaseOptions } from './inspect-runtime-database.mjs';

export const recoveryHost = 'filosage-recovery-20260912-a.postgres.database.azure.com';
export function recoveryOptions(dsn, sslMode, target, database) {
  if (!['source', 'restore'].includes(target) || !['filosage', 'postgres'].includes(database)) throw new Error('Unapproved recovery target.');
  const options = runtimeDatabaseOptions(dsn, sslMode);
  return { ...options, host: target === 'restore' ? recoveryHost : options.host, database,
    application_name: 'filosage-readonly-recovery-rehearsal',
    options: '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=15000' };
}
const count = (value) => {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid bounded count.');
  return Number(value);
};
const digest = (key, value) => createHmac('sha256', key).update(value).digest('hex');

export async function inspectRecoveryDatabase(client, database, key) {
  if (!['filosage', 'postgres'].includes(database) || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid inspection context.');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL timezone = 'UTC'");
    // Never allow silent cron row-level filtering to masquerade as a full inventory.
    await client.query('SET LOCAL row_security = off');
    const meta = (await client.query(`SELECT current_database() AS database,
      transaction_timestamp() AS snapshot_at, current_setting('transaction_read_only') = 'on' AS read_only,
      current_setting('cron.database_name', true) AS cron_database,
      current_setting('cron.launch_active_jobs', true) AS cron_launch,
      'pg_cron' = ANY(string_to_array(replace(current_setting('shared_preload_libraries'), ' ', ''), ',')) AS cron_preloaded,
      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS cron_installed,
      (SELECT count(*) FROM pg_extension) AS extension_count,
      (SELECT coalesce(jsonb_agg(jsonb_build_array(extname, extversion) ORDER BY extname)::text, '[]') FROM pg_extension) AS extensions`)).rows[0];
    if (!meta || meta.database !== database || meta.read_only !== true || !['postgres', null].includes(meta.cron_database)
      || ![null, 'on', 'off'].includes(meta.cron_launch) || typeof meta.cron_installed !== 'boolean'
      || typeof meta.cron_preloaded !== 'boolean'
      || (meta.cron_database === null && (meta.cron_installed || meta.cron_preloaded))
      || typeof meta.extensions !== 'string') throw new Error('Incomplete recovery metadata.');
    if (!(meta.snapshot_at instanceof Date) && typeof meta.snapshot_at !== 'string') throw new Error('Invalid snapshot timestamp.');
    const result = { database, snapshotAt: new Date(meta.snapshot_at).toISOString(), readOnly: true,
      extensionCount: count(meta.extension_count), extensionHmac: digest(key, meta.extensions),
      cronDatabaseIsPostgres: meta.cron_database === 'postgres', cronLaunchEnabled: meta.cron_launch === null ? null : meta.cron_launch === 'on',
      cronPreloaded: meta.cron_preloaded, cronInstalled: meta.cron_installed, cronVisibilityVerified: !meta.cron_installed, cronJobs: null, activeCronJobs: null };
    if (meta.cron_installed) {
      if (meta.cron_database !== 'postgres') throw new Error('Unexpected cron database.');
      const visibility = (await client.query(`SELECT has_table_privilege(current_user, 'cron.job', 'SELECT') AS can_select,
        (NOT c.relrowsecurity OR r.rolsuper OR r.rolbypassrls OR (c.relowner = r.oid AND NOT c.relforcerowsecurity)) AS all_rows
        FROM pg_class c CROSS JOIN pg_roles r WHERE c.oid = 'cron.job'::regclass AND r.rolname = current_user`)).rows[0];
      if (visibility?.can_select !== true || visibility?.all_rows !== true) throw new Error('Cron visibility is insufficient.');
      const jobs = (await client.query('SELECT count(*) AS total, count(*) FILTER (WHERE active) AS active FROM cron.job')).rows[0];
      result.cronJobs = count(jobs?.total); result.activeCronJobs = count(jobs?.active); result.cronVisibilityVerified = true;
    }
    if (database === 'filosage') {
      const schema = (await client.query(`SELECT
        (SELECT count(*) = 8 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filosage_documents'
          AND is_nullable = 'NO' AND (column_name, data_type) IN (('path','text'), ('collection_id','text'), ('collection_path','text'), ('document_id','text'), ('data','jsonb'), ('version','bigint'), ('created_at','timestamp with time zone'), ('updated_at','timestamp with time zone'))) AS columns_ok,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.filosage_documents') AND contype = 'p' AND pg_get_constraintdef(oid) = 'PRIMARY KEY (path)') AS primary_key_ok,
        (SELECT coalesce(jsonb_agg(jsonb_build_array(column_name, data_type, is_nullable, column_default) ORDER BY ordinal_position)::text, '[]') FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'filosage_documents') AS columns`)).rows[0];
      if (schema?.columns_ok !== true || schema?.primary_key_ok !== true || typeof schema.columns !== 'string') throw new Error('Recovery schema mismatch.');
      const counts = (await client.query("SELECT count(*) AS documents, count(*) FILTER (WHERE collection_path = 'courses') AS courses FROM public.filosage_documents")).rows[0];
      const documents = count(counts?.documents);
      if (documents > 10000) throw new Error('Snapshot row bound exceeded.');
      const hmac = createHmac('sha256', key); let seen = 0; let bytes = 0;
      // Rows remain inside the selected production container; only the final keyed digest leaves it.
      await client.query('DECLARE recovery_rows NO SCROLL CURSOR FOR SELECT to_jsonb(d)::text AS payload FROM public.filosage_documents d ORDER BY path COLLATE "C"');
      while (true) {
        const rows = (await client.query('FETCH FORWARD 100 FROM recovery_rows')).rows;
        if (!rows.length) break;
        for (const row of rows) {
          if (typeof row.payload !== 'string') throw new Error('Invalid snapshot row.');
          bytes += Buffer.byteLength(row.payload); seen += 1;
          if (bytes > 64 * 1024 * 1024 || seen > documents) throw new Error('Snapshot size bound exceeded.');
          hmac.update(`${Buffer.byteLength(row.payload)}:`).update(row.payload);
        }
      }
      if (seen !== documents) throw new Error('Incomplete snapshot.');
      Object.assign(result, { schemaCompatible: true, schemaHmac: digest(key, schema.columns), documents,
        courses: count(counts.courses), documentsHmac: hmac.digest('hex') });
    }
    return result;
  } finally { await client.query('ROLLBACK'); }
}

export async function runRecoveryInspection(expectedSha, target, key) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || process.env.SITE_VERSION !== expectedSha || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Runtime context mismatch.');
  const require = createRequire(`${process.cwd()}/package.json`);
  const pg = require('pg');
  const databases = [];
  for (const database of ['filosage', 'postgres']) {
    const client = new pg.Client(recoveryOptions(process.env.DATABASE_URL, process.env.DATABASE_SSL, target, database));
    try {
      await client.connect();
      const result = await inspectRecoveryDatabase(client, database, key);
      if (target === 'source' && !result.cronDatabaseIsPostgres) throw new Error('Source cron configuration changed.');
      databases.push(result);
    }
    finally { await client.end().catch(() => undefined); }
  }
  return { schemaVersion: 1, operation: 'read-only-recovery-database', sourceSha: expectedSha, target,
    observedAt: new Date().toISOString(), databases, rpoVerified: false, serviceRecoveryVerified: false };
}

/** Equality is limited to observed snapshots, not a committed-work/RPO or service proof. */
export function compareRecoverySnapshots(source, restored) {
  if (source?.operation !== 'read-only-recovery-database' || restored?.operation !== source.operation
    || source.target !== 'source' || restored.target !== 'restore'
    || !Array.isArray(source.databases) || !Array.isArray(restored.databases)
    || source.databases.length !== 2 || restored.databases.length !== 2) throw new Error('Invalid snapshot pair.');
  const checks = ['filosage', 'postgres'].map((database, i) => {
    const a = source.databases[i]; const b = restored.databases[i];
    if (a.database !== database || b.database !== database || !a.cronVisibilityVerified || !b.cronVisibilityVerified
      || a.readOnly !== true || b.readOnly !== true) throw new Error('Incomplete snapshot visibility.');
    const fields = ['extensionCount', 'extensionHmac', 'cronInstalled', 'cronJobs', 'activeCronJobs',
      ...(database === 'filosage' ? ['schemaHmac', 'documents', 'courses', 'documentsHmac'] : [])];
    return { database, matches: fields.every((field) => a[field] !== undefined && a[field] === b[field]) };
  });
  return { snapshotEquality: checks.every((check) => check.matches), checks, rpoVerified: false, serviceRecoveryVerified: false };
}
