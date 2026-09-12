import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const sha = 'a'.repeat(40);
const path = '.github/workflows/quality-gate.yml';
const fixture = () => ({ workflow_runs: [{id: 123, run_attempt: 2, head_sha: sha, path, status: 'completed', conclusion: 'success', jobs: {total_count: 3, jobs: ['static-and-release-contracts', 'browser-smoke', 'postgres-transactions'].map((name, index) => ({ id: index + 1, run_id: 123, run_attempt: 2, head_sha: sha, name, status: 'completed', conclusion: 'success' }))}}] });
const run = (body) => spawnSync(process.execPath, ['scripts/check-workflow-run-evidence.mjs', sha, path], {input: JSON.stringify(body), encoding:'utf8'});
test('accepts complete quality jobs from the exact attempt', () => assert.equal(run(fixture()).status, 0));
for (const [name, change] of Object.entries({
  skipped: (r) => {r.jobs.jobs[1].conclusion = 'skipped';},
  missing: (r) => {r.jobs.jobs.pop(); r.jobs.total_count--;},
  duplicate: (r) => {r.jobs.jobs.push({...r.jobs.jobs[0], id: 4}); r.jobs.total_count++;},
  incomplete: (r) => {r.jobs.jobs[1].status = 'in_progress';},
  'wrong SHA': (r) => {r.jobs.jobs[1].head_sha = 'b'.repeat(40);},
  'wrong attempt': (r) => {r.jobs.jobs[1].run_attempt = 1;},
  'wrong run': (r) => {r.jobs.jobs[1].run_id = 124;},
  pagination: (r) => {r.jobs.total_count = 101;},
  'no jobs': (r) => {delete r.jobs;},
  'no attempt': (r) => {delete r.run_attempt;},
})) test(`rejects ${name} quality evidence`, () => {const body = fixture(); change(body.workflow_runs[0]); const result = run(body); assert.equal(result.status, 1); assert.equal(result.stderr, 'Required workflow evidence is unavailable.\n');});
