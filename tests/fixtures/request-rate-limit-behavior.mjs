import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real limiter. Only the durable store and runtime configuration
// boundaries are substituted; two module instances share one serialized store.
const code = ts.transpileModule(readFileSync('src/lib/request-rate-limit.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const documents = new Map();
let tail = Promise.resolve();
let unavailable = false;
async function transaction(paths, update) {
  const task = tail.then(() => {
    if (unavailable) throw new Error('fixture datastore outage');
    const result = update(Object.fromEntries(paths.map(path => [path, documents.get(path) ?? null])));
    for (const write of result.writes) documents.set(write.path, structuredClone(write.data));
    return result.result;
  });
  tail = task.catch(() => {});
  return task;
}
function replica() {
  const exports = {};
  runInNewContext(code, {
    exports, crypto: globalThis.crypto, TextEncoder, Response, Date, console: { error() {} },
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@/lib/document-store') return { runStoredDocumentTransaction: transaction };
      if (name === '@/lib/runtime-environment') return { serverEnvironment: { NODE_ENV: 'production', ACTIVITY_RECEIPT_SECRET: 'fixture-only-not-a-production-secret' } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports.enforceDurableRateLimit;
}
const replicas = [replica(), replica()];
const request = (headers = {}) => new Request('https://filosage.example/api/waitlist', { headers });
async function main() {
  // Client forwarding headers cannot manufacture new production buckets.
  assert.equal(await replicas[0](request(), 'spoof', 1), null);
  for (const name of ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for', 'forwarded', 'x-client-ip']) {
    const response = await replicas[1](request({ [name]: '198.51.100.7' }), 'spoof', 1);
    assert.equal(response?.status, 429, `${name} bypassed the anonymous ceiling`);
  }
  // The verified caller, supplied by the route, survives header changes and
  // separates legitimate accounts independently of proxy attribution.
  assert.equal(await replicas[0](request(), 'accounts', 1, 60000, 'learner-a'), null);
  assert.equal((await replicas[1](request({ 'cf-connecting-ip': '203.0.113.8' }), 'accounts', 1, 60000, 'learner-a'))?.status, 429);
  assert.equal(await replicas[1](request(), 'accounts', 1, 60000, 'learner-b'), null);
  // Requests already rejected for A cannot consume B's accepted-work quota.
  for (let index = 0; index < 120; index++) {
    const result = await replicas[index % 2](request(), 'exports', 3, 3600000, 'export-a');
    assert.equal(result?.status ?? 200, index < 3 ? 200 : 429);
  }
  assert.equal((await replicas[1](request(), 'exports', 3, 3600000, 'export-b'))?.status ?? 200, 200,
    'A rejected caller exhausted the global quota for unrelated accounts');
  // Concurrent replicas share an atomic allowance rather than an in-memory cap.
  const results = await Promise.all(Array.from({ length: 30 }, (_, index) => replicas[index % 2](request(), 'concurrent', 5, 60000, 'learner-c')));
  assert.equal(results.filter(result => result === null).length, 5);
  assert.equal(results.filter(result => result?.status === 429).length, 25);
  // Rotating authenticated accounts still cannot exceed the global ceiling.
  for (let index = 0; index < 40; index++) assert.equal(await replicas[0](request(), 'global', 1, 60000, `user-${index}`), null);
  const globalResponse = await replicas[1](request(), 'global', 1, 60000, 'user-41');
  assert.equal(globalResponse?.status, 429);
  assert.equal(globalResponse.headers.get('Cache-Control'), 'no-store');
  assert(Number(globalResponse.headers.get('Retry-After')) > 0);
  for (const path of documents.keys()) assert(!path.includes('learner-') && !path.includes('198.51.100'));
  unavailable = true;
  assert.equal((await replicas[0](request(), 'outage', 1))?.status, 503);
  console.log('REQUEST_RATE_LIMIT_BEHAVIOR_OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
