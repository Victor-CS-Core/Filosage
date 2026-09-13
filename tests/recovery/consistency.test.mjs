import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeConsistency, inspectConsistency } from '../../scripts/inspect-recovery-consistency.mjs';
const row = (path, data) => ({ path, data });
test('legacy missing lifecycle, retained links and frozen credit balances are observations, not corruption', () => {
  const value = summarizeConsistency([row('users/legacy', {}), row('identityLinks/x', { canonicalUid: 'gone' }),
    row('accountLifecycles/gone', { uid: 'gone', generation: 'g', state: 'deleted' }),
    row('users/legacy/courseCredits/current', { schemaVersion: 'course-credits-v2', balance: 8, balanceCap: 0, monthlyAllocation: 0, periodGranted: 2 })]);
  assert.equal(value.usersWithoutLifecycle, 1); assert.equal(value.retainedLinksToDeletedLifecycle, 1);
  assert.equal(value.malformedCurrentCreditLedgers, 0); assert.equal(value.consistencyVerified, false);
});
test('exact modern relationships distinguish malformed, missing and legacy categories without identifiers', () => {
  const value = summarizeConsistency([row('accountLifecycles/a', { uid: 'a', generation: 'g', state: 'active' }),
    row('accountDeletionJobs/job', { uid: 'a', generation: 'g', jobId: 'job', stage: 'verify', status: 'running' }),
    row('courses/c', { authorId: 'a' }), row('courses/missing/lessons/0-0', {}),
    row('generationOperations/o', { operationId: 'o', uid: 'a', accountGeneration: 'old', status: 'running', accounting: { requestPath: 'aiRequests/o' } }),
    row('generationUsageReceipts/o', { remainingReserveMicros: -1, actualCostMicros: 0, uncertainCostMicros: 0 }),
    row('users/a/courseCreditClaims/k', { uid: 'a', claimId: 'k', status: 'completed', courseId: 'missing' })]);
  assert.equal(value.lessonDocumentsWithoutCourse, 1); assert.equal(value.generationLifecycleMismatch, 1);
  assert.equal(value.generationMissingAccountingRequest, 1); assert.equal(value.malformedUsageAmounts, 1);
  assert.equal(value.completedCreditClaimsWithoutCourse, 1); assert.equal(value.deletionJobs, 1);
  assert.ok(Object.values(value).every(v => typeof v === 'number' || typeof v === 'boolean'));
});
test('transaction checks source identity and read-only mode, bounds rows, and rolls back on failure', async () => {
  for (const invalid of [false, true]) {
    const queries = [];
    const client = { query: async sql => { queries.push(sql);
      if (sql.includes('current_database()')) return { rows: [{ correct_database: true, read_only: !invalid, snapshot_at: '2026-09-12T23:00:00Z' }] };
      if (sql.includes('count(*)')) return { rows: [{ total: '0' }] };
      return { rows: [] }; } };
    if (invalid) await assert.rejects(inspectConsistency(client)); else assert.equal((await inspectConsistency(client)).counts.documents, 0);
    assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); assert.equal(queries.at(-1), 'ROLLBACK');
  }
  assert.throws(() => summarizeConsistency(Array(10001).fill(row('x', {}))));
});
