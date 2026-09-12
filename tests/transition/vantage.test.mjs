import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { qaVantageBaseline, origins, sourceSha } from '../../scripts/qa-vantage-baseline.mjs';

test('baseline hashes IPv4, omits blue health and never consumes production bodies or credentials', async () => {
  const calls = [];
  const ip = '198.51.100.17';
  const digest = createHash('sha256').update(ip).digest('hex');
  const request = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://api.ipify.org') return new Response(ip);
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers, undefined);
    return { status: 404, body: { cancel: async () => {} }, text: () => { throw new Error('body read'); } };
  };
  const result = await qaVantageBaseline('a'.repeat(64), { SITE_VERSION: sourceSha }, request);
  assert.equal(result.egressIpv4Sha256, digest);
  assert.equal(result.differentFromOperator, true);
  assert.equal(result.fenceVerified, false);
  assert.equal(result.checks.length, 12);
  for (const origin of origins) assert.ok(result.checks.some(row => row.origin === origin && row.path === '/.auth/me'));
  assert.ok(!calls.some(({ url }) => url.includes('blue') && url.endsWith('/api/health')));
  assert.ok(!JSON.stringify(result).includes(ip));
});

test('wrong source or operator hash and malformed IPv4 stop before origin probes', async () => {
  let calls = 0;
  const request = async () => { calls++; return new Response('invalid-ipv4'); };
  await assert.rejects(qaVantageBaseline('x', { SITE_VERSION: sourceSha }, request));
  await assert.rejects(qaVantageBaseline('a'.repeat(64), { SITE_VERSION: 'wrong' }, request));
  assert.equal(calls, 0);
  await assert.rejects(qaVantageBaseline('a'.repeat(64), { SITE_VERSION: sourceSha }, request));
  assert.equal(calls, 1);
});

test('same egress and request failures are explicit and private', async () => {
  const ip = '198.51.100.17';
  const result = await qaVantageBaseline(createHash('sha256').update(ip).digest('hex'), { SITE_VERSION: sourceSha }, async url => {
    if (url === 'https://api.ipify.org') return new Response(ip);
    throw new Error('private network details');
  });
  assert.equal(result.differentFromOperator, false);
  assert.ok(result.checks.every(row => row.status === null && row.requestFailed));
  assert.ok(!JSON.stringify(result).includes('private network details'));
});
