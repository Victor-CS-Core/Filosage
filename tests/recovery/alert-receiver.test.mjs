import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createOperationalAlertEnvelope, operationalAlertSignature } from '../../src/lib/operational-alert-core.ts';
import { validateAlert, createBlobStore, createReceiver, createManagedIdentityToken } from '../../scripts/operations-alert-receiver.mjs';

const secret = 'synthetic-test-only-alert-secret-32-characters';
const now = Date.parse('2026-09-13T01:00:00Z');
async function signed() {
  const envelope = await createOperationalAlertEnvelope({ severity: 'critical', code: 'test.receiver', message: 'Synthetic test' }, { name: 'production', version: '7'.repeat(40) }, new Date(now));
  const raw = Buffer.from(JSON.stringify(envelope));
  return { raw, envelope, headers: { 'content-type': 'application/json', 'x-filosage-signature': await operationalAlertSignature(raw.toString(), secret), 'x-filosage-signature-version': 'v1', 'x-filosage-alert-id': envelope.id, 'idempotency-key': envelope.id, 'x-filosage-alert-timestamp': envelope.occurredAt } };
}
test('actual sender envelope verifies; tampering, stale events and mismatched headers fail closed', async () => {
  const s = await signed();
  assert.deepEqual(validateAlert(s.raw, s.headers, secret, now), s.envelope);
  assert.throws(() => validateAlert(Buffer.from(s.raw.toString().replace('Synthetic', 'Changed')), s.headers, secret, now));
  assert.throws(() => validateAlert(s.raw, s.headers, secret, now + 300001));
  assert.throws(() => validateAlert(s.raw, s.headers, secret, now - 60001));
  assert.throws(() => validateAlert(s.raw, { ...s.headers, 'idempotency-key': 'other' }, secret, now));
  assert.throws(() => validateAlert(s.raw, { ...s.headers, 'x-filosage-signature': 'a'.repeat(63) }, secret, now));
  assert.throws(() => validateAlert(Buffer.alloc(16385), s.headers, secret, now));
});
test('managed identity stays on loopback, coalesces concurrent token calls and rejects expired tokens', async () => {
  const env = { IDENTITY_ENDPOINT: 'http://127.0.0.1:42356/msi/token', IDENTITY_HEADER: 'synthetic-header', AZURE_CLIENT_ID: 'synthetic-client' };
  let calls = 0;
  const token = createManagedIdentityToken(env, async (url, options) => {
    calls++;
    assert.equal(url.searchParams.get('resource'), 'https://storage.azure.com/');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-IDENTITY-HEADER'], env.IDENTITY_HEADER);
    return Response.json({ access_token: 'synthetic-token', expires_on: Math.floor(Date.now() / 1000) + 3600 });
  });
  assert.deepEqual(await Promise.all([token(), token(), token()]), Array(3).fill('synthetic-token'));
  await token(); assert.equal(calls, 1);
  assert.throws(() => createManagedIdentityToken({ ...env, IDENTITY_ENDPOINT: 'https://example.com/token' }));
  const expired = createManagedIdentityToken(env, async () => Response.json({ access_token: 'synthetic-token', expires_on: 1 }));
  await assert.rejects(expired());
});
test('signed invalid schema or non-finite context cannot reach persistence', async () => {
  const s = await signed();
  for (const changed of [{ ...s.envelope, extra: true }, { ...s.envelope, context: { nested: {} } }, { ...s.envelope, severity: 'unsupported' }]) {
    const raw = Buffer.from(JSON.stringify(changed));
    const headers = { ...s.headers, 'x-filosage-signature': await operationalAlertSignature(raw.toString(), secret) };
    assert.throws(() => validateAlert(raw, headers, secret, now));
  }
});
test('durable store uses conditional create and verifies an existing receipt before duplicate acknowledgment', async () => {
  const s = await signed(); const calls = []; let duplicate = false;
  const store = createBlobStore({ accountUrl: 'https://filosagestp4ujucgnxq3gss.blob.core.windows.net', container: 'operations-alerts', token: async () => 'synthetic-token', request: async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'PUT') return new Response(null, { status: duplicate ? 412 : 201 });
    return new Response(null, { status: 200, headers: { 'x-ms-meta-alertid': s.envelope.id, 'x-ms-meta-schemaversion': '1', 'content-length': String(s.raw.length) } });
  } });
  assert.deepEqual(await store.persist(s.envelope, s.raw), { duplicate: false });
  assert.equal(calls[0].options.headers['If-None-Match'], '*');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-token');
  duplicate = true;
  assert.deepEqual(await store.persist(s.envelope, s.raw), { duplicate: true });
  assert.equal(calls.at(-1).options.method, 'HEAD');
  const failed = createBlobStore({ accountUrl: 'https://filosagestp4ujucgnxq3gss.blob.core.windows.net', container: 'operations-alerts', token: async () => 'synthetic-token', request: async () => new Response(null, { status: 412 }) });
  await assert.rejects(failed.persist(s.envelope, s.raw));
  assert.throws(() => createBlobStore({ accountUrl: 'https://example.com', container: 'operations-alerts' }));
});
test('HTTP acknowledgment waits for storage; invalid signatures never write; storage failure returns503', async () => {
  const s = await signed(); let writes = 0; let fail = false; const logs = [];
  const server = createServer(createReceiver({ secret, now: () => now, log: v => logs.push(v), store: { ready: async () => true, persist: async () => { writes++; if (fail) throw Error('private-provider-detail'); return { duplicate: false }; } } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/alerts`;
  try {
    let response = await fetch(url, { method: 'POST', headers: s.headers, body: s.raw });
    assert.equal(response.status, 202); assert.equal(writes, 1);
    response = await fetch(url, { method: 'POST', headers: { ...s.headers, 'x-filosage-signature': '0'.repeat(64) }, body: s.raw });
    assert.equal(response.status, 401); assert.equal(writes, 1);
    fail = true; response = await fetch(url, { method: 'POST', headers: s.headers, body: s.raw });
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(logs).includes('private-provider-detail'), false);
    assert.equal(JSON.stringify(logs).includes('Synthetic test'), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
