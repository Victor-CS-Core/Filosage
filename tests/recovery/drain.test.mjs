import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyDrainWork, collectDrainSample } from '../../scripts/inspect-transition-drain.mjs';
const now = Date.parse('2026-09-13T01:00:00Z');
test('nested resource locks, numeric billing leases and provider call uncertainty remain visible', () => {
 const v = classifyDrainWork([{ collection: 'usagePeriods', status: null, leases: ['2026-09-13T01:01:00Z'], calls: [], pending: 0 },
  { collection: 'billingReconciliation', status: null, leases: [], billing_expiry: now+5000, calls: [], pending: 0 },
  { collection: 'generationUsageReceipts', status: null, leases: [], calls: ['observed','uncertain','in_flight'], pending: 0 },
  { collection: 'courseBannerKeys', status: 'generating', leases: ['2020-01-01T00:00:00Z'], calls: [], pending: 0 }], now);
 assert.equal(v.futureLeaseFields, 2); assert.equal(v.expiredLeaseFields, 1);
 assert.equal(v.uncertainProviderCalls, 1); assert.equal(v.inFlightProviderCalls, 1); assert.equal(v.generatingBannerKeys, 1);
});
test('terminal rows and expired leases differ from missing, malformed and unknown work state', () => {
 const v = classifyDrainWork([{ collection: 'aiRequests', status: 'completed', leases: [null], calls: [], pending: 0 },
 { collection: 'generationOperations', status: 'future-state', leases: ['broken'], calls: [], pending: 2 }], now);
 assert.equal(v.unresolvedAiRequests, 0); assert.equal(v.unknownWorkStates, 1); assert.equal(v.malformedLeaseFields, 1); assert.equal(v.pendingProviderCalls, 2);
 assert.ok(Object.values(v).every(x => Number.isSafeInteger(x) && x >= 0));
 assert.throws(() => classifyDrainWork(Array(10001).fill({}), now));
});
test('sample excludes only own PID, includes idle clients, stays read-only and never certifies drain', async () => {
 const queries = []; const client = { query: async sql => { queries.push(sql);
 if (sql.includes('pg_stat_activity')) return { rows: [{ clients: 1, active: 0, idle: 1, idle_transaction: 0, unknown_backend: 0, nonclient_backends: 2 }] };
 if (sql.includes('current_database')) return { rows: [{ correct_database: true, read_only: true, observed_at: new Date(now) }] };
 return { rows: [] }; } };
 const result = await collectDrainSample(client);
 assert.equal(result.databaseClientsZero, false); assert.equal(result.drainVerified, false);
 assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); assert.equal(queries.at(-1), 'ROLLBACK');
 const sessions = queries.find(q => q.includes('pg_stat_activity')); assert.match(sessions, /pid<>pg_backend_pid\(\)/); assert.doesNotMatch(sessions, /usename|application_name|client_addr|query\s*,/);
});
