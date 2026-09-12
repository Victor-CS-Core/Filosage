import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRecoveryDatabase, recoveryOptions, recoveryHost, compareRecoverySnapshots } from '../../scripts/inspect-service-recovery-database.mjs';
const key = 'a'.repeat(64);
// fake-credential: isolated parser fixture, never sent to a server.
const dsn = 'postgresql://fixture:fixture@filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com/filosage?sslmode=require';
function client({ database = 'postgres', installed = false, visibility = true, fail = false, count = '0', preloaded = true, cronDatabase = 'postgres' } = {}) {
  const queries = []; let fetched = false;
  return { queries, async query(sql) {
    queries.push(sql);
    if (sql.startsWith('SELECT current_database')) return { rows: [{ database, snapshot_at: '2026-09-12T20:00:00Z', read_only: true, cron_database: cronDatabase, cron_launch: preloaded ? 'on' : null, cron_preloaded: preloaded, cron_installed: installed, extension_count: '1', extensions: '[["plpgsql","1.0"]]' }] };
    if (sql.includes('has_table_privilege')) return { rows: [{ can_select: true, all_rows: visibility }] };
    if (sql.includes('FROM cron.job')) { if (fail) throw new Error('private failure'); return { rows: [{ total: count, active: count }] }; }
    if (sql.includes('AS columns_ok')) return { rows: [{ columns_ok: true, primary_key_ok: true, columns: 'schema fixture' }] };
    if (sql.includes('AS documents')) return { rows: [{ documents: '1', courses: '0' }] };
    if (sql.startsWith('FETCH')) { const rows = fetched ? [] : [{ payload: '{"private":"fixture"}' }]; fetched = true; return { rows }; }
    return { rows: [] };
  } };
}
test('only exact target hosts/databases with explicit verified TLS; URL overrides rejected', () => {
  const options = recoveryOptions(dsn, undefined, 'restore', 'postgres');
  assert.equal(recoveryHost, 'filosage-recovery-20260912-b.postgres.database.azure.com'); assert.equal(options.host, recoveryHost); assert.equal(options.database, 'postgres');
  assert.equal(options.ssl.rejectUnauthorized, true); assert.equal(options.connectionString, undefined);
  for (const suffix of ['&host=other', '&sslmode=disable', '&database=postgres', '&options=-c%20role=admin']) assert.throws(() => recoveryOptions(dsn + suffix, undefined, 'restore', 'postgres'));
  for (const [target, database] of [['other','postgres'], ['restore','filosageqa']]) assert.throws(() => recoveryOptions(dsn, undefined, target, database));
  assert.throws(() => recoveryOptions(dsn.replace('filosagestg-p4ujucgnxq3gs-pg', 'unapproved'), undefined, 'restore', 'postgres'));
  assert.throws(() => recoveryOptions(dsn, 'disable', 'source', 'filosage'));
});
test('cron extension absence is explicit and no job SQL or content is read', async () => {
  const c = client(); const result = await inspectRecoveryDatabase(c, 'postgres', key);
  assert.equal(result.cronInstalled, false); assert.equal(result.cronJobs, null); assert.equal(result.cronVisibilityVerified, true);
  assert.equal(c.queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); assert.equal(c.queries.at(-1), 'ROLLBACK');
  assert(!c.queries.some(q => q.includes('FROM cron.job')));
});
test('RLS or failed job reads cannot be accepted as zero; always roll back', async () => {
  for (const config of [{ installed: true, visibility: false }, { installed: true, fail: true }, { installed: true, count: '-1' }]) {
    const c = client(config); await assert.rejects(inspectRecoveryDatabase(c, 'postgres', key)); assert.equal(c.queries.at(-1), 'ROLLBACK');
  }
  const result = await inspectRecoveryDatabase(client({ installed: true, count: '2' }), 'postgres', key);
  assert.equal(result.cronJobs, 2); assert.equal(result.activeCronJobs, 2);
});
test('data stays internal and snapshot fingerprints require the same private key', async () => {
  const a = await inspectRecoveryDatabase(client({ database: 'filosage' }), 'filosage', key);
  const b = await inspectRecoveryDatabase(client({ database: 'filosage' }), 'filosage', 'b'.repeat(64));
  assert.equal(a.documents, 1); assert.match(a.documentsHmac, /^[a-f0-9]{64}$/);
  assert.notEqual(a.documentsHmac, b.documentsHmac); assert(!JSON.stringify(a).includes('fixture')); assert(!JSON.stringify(a).includes(key));
});
test('snapshot equality cannot assert RPO or service recovery and mismatch remains visible', async () => {
  const databases = [await inspectRecoveryDatabase(client({ database: 'filosage' }), 'filosage', key), await inspectRecoveryDatabase(client(), 'postgres', key)];
  const source = { operation: 'read-only-recovery-database', target: 'source', databases };
  const restored = { ...source, target: 'restore', databases: structuredClone(databases) };
  assert.deepEqual(compareRecoverySnapshots(source, restored), { snapshotEquality: true, checks: [{ database: 'filosage', matches: true }, { database: 'postgres', matches: true }], rpoVerified: false, serviceRecoveryVerified: false });
  restored.databases[0].documentsHmac = 'c'.repeat(64); assert.equal(compareRecoverySnapshots(source, restored).snapshotEquality, false);
  restored.databases[1].cronVisibilityVerified = false; assert.throws(() => compareRecoverySnapshots(source, restored));
});

test('clone without loaded cron accepts absent cron settings but loaded cron cannot hide them', async () => {
  const c = client({ preloaded: false, cronDatabase: null });
  const result = await inspectRecoveryDatabase(c, 'postgres', key);
  assert.equal(result.cronPreloaded, false); assert.equal(result.cronLaunchEnabled, null);
  await assert.rejects(inspectRecoveryDatabase(client({ preloaded: true, cronDatabase: null }), 'postgres', key));
});

test('banner proof runs only when requested and inside the read-only transaction', async () => {
  const baseline = client({ database: 'filosage' });
  await inspectRecoveryDatabase(baseline, 'filosage', key);
  assert.ok(!baseline.queries.some(sql => sql.includes('LIMIT 1001')));
  const restored = client({ database: 'filosage' });
  const result = await inspectRecoveryDatabase(restored, 'filosage', key, true);
  assert.equal(result.bannerReferences.references, 0);
  assert.equal(restored.queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.ok(restored.queries.some(sql => sql.includes('LIMIT 1001')));
  assert.equal(restored.queries.at(-1), 'ROLLBACK');
});
