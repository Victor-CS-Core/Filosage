import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectTransitionWriters } from '../../scripts/inspect-transition-writers.mjs';

test('writer observation is read-only, aggregate-only and never certifies drain', async () => {
  const statements = [];
  const client = { query: async sql => {
    statements.push(sql);
    if (sql.includes('pg_stat_activity')) return { rows: [{ total: 2, active: 1 }] };
    if (sql.includes("data->>'leaseUntil' AS")) return { rows: [{ lease_until: '2000-01-01T00:00:00Z', active_until: null }, { lease_until: '2999-01-01T00:00:00Z', active_until: 'bad' }] };
    if (sql.includes('FROM public.filosage_documents')) return { rows: [{ documents: 510, unfinished_generation: 0 }] };
    if (sql.includes('pg_extension')) return { rows: [{ installed: false }] };
    return { rows: [] };
  } };
  const result = await collectTransitionWriters(client);
  assert.equal(statements[0], 'BEGIN READ ONLY');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(result.drainVerified, false);
  assert.equal(result.externalWriterInventoryComplete, false);
  assert.deepEqual(result.topLevelLeaseFields, { future: 1, expired: 1, malformed: 1, null: 1, truncated: false });
  assert.ok(statements.every(sql => /^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK)/.test(sql)));
  assert.ok(!statements.some(sql => /SELECT\s+(?:\*|data\s*(?:,|FROM)|query\b|client_addr\b)/i.test(sql)));
});

test('failed or malformed observations roll back without exposing database errors', async () => {
  for (const fail of [true, false]) {
    const statements = [];
    const client = { query: async sql => {
      statements.push(sql);
      if (sql.includes('pg_stat_activity') && fail) throw new Error('query failed');
      if (sql.includes('pg_stat_activity')) return { rows: [{ total: 'not-a-count' }] };
      if (sql.includes('pg_extension')) return { rows: [{ installed: false }] };
      return { rows: [{ documents: 0 }] };
    } };
    await assert.rejects(collectTransitionWriters(client));
    assert.equal(statements.at(-1), 'ROLLBACK');
  }
});
