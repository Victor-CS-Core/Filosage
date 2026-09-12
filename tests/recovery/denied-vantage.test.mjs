import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoveryDeniedVantage, origin, sourceSha } from '../../scripts/recovery-denied-vantage.mjs';

const env = { SITE_VERSION: sourceSha };
const hash = 'a'.repeat(64);
const ip = '198.51.100.17';
test('only fixed recovery target receives eight bodyless credential-free nonredirecting probes', async () => {
  const calls = [];
  const result = await recoveryDeniedVantage(hash, env, async (url, options) => {
    if (url === 'https://api.ipify.org') return new Response(ip);
    calls.push({ url, options });
    return { status: 403, body: { cancel: async () => {} }, text: () => { throw Error('private body'); } };
  });
  assert.equal(result.fenceVerified, true);
  assert.equal(calls.length, 8);
  assert.deepEqual(calls.map(c => [c.url, c.options.method]), ['/api/health', '/', '/.auth/login/google', '/api/account'].flatMap(path => ['HEAD', 'GET'].map(method => [origin + path, method])));
  for (const { options } of calls) {
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'manual');
    assert.equal(options.headers, undefined); assert.equal(options.body, undefined);
  }
  assert.ok(!JSON.stringify(result).includes(ip));
});
test('timeouts, auth redirects and non403 statuses never count as denied ingress', async () => {
  for (const status of [200, 401, 302, null]) {
    const result = await recoveryDeniedVantage(hash, env, async url => {
      if (url === 'https://api.ipify.org') return new Response(ip);
      if (status === null) throw Error('private network detail');
      return { status, body: { cancel: async () => {} } };
    });
    assert.equal(result.fenceVerified, false);
    assert.ok(!JSON.stringify(result).includes('private network detail'));
  }
});
test('invalid context fails before fetch; same source egress cannot prove distinct vantage', async () => {
  const fail = () => { throw Error('must not fetch'); };
  await assert.rejects(recoveryDeniedVantage('bad', env, fail), /vantage-context/);
  await assert.rejects(recoveryDeniedVantage(hash, { SITE_VERSION: 'wrong' }, fail), /vantage-context/);
  const { createHash } = await import('node:crypto');
  const result = await recoveryDeniedVantage(createHash('sha256').update(ip).digest('hex'), env, async url => url === 'https://api.ipify.org' ? new Response(ip) : { status: 403 });
  assert.equal(result.fenceVerified, false);
});
