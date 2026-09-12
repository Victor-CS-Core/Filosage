import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeSecretStatusProbe, verifyRetainedRuntimeCredential } from '../../scripts/runtime-secret-status-probe.mjs';
const sha = '93f60f24afe59b19b6a592f455a09e8e813f1f84';
const env = { SITE_VERSION: sha, IDENTITY_ENDPOINT: 'http://localhost:9999/token', IDENTITY_HEADER: 'fixture-header' };
const version = 'a'.repeat(32);
test('status probe pins identity/version, rejects redirects and never reads secret bodies', async () => {
  const calls = []; let cancelled = false;
  const request = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return { ok: true, async json() { return { access_token: 'fixture-token' }; } };
    return { status: 200, body: { async cancel() { cancelled = true; } }, async json() { throw new Error('secret-body-read'); }, async text() { throw new Error('secret-body-read'); } };
  };
  const result = await runtimeSecretStatusProbe({ target: 'production', version }, env, request);
  assert.equal(result.passed, true); assert.equal(cancelled, true);
  assert(calls.every(call => call.options.redirect === 'error'));
  assert(calls[0].url.includes('client_id=fc8fec59-9873-4502-80e2-21f4dacc301c'));
  assert(calls[1].url.endsWith(`/database-url-runtime-v1/${version}?api-version=7.4`));
  assert(!JSON.stringify(result).includes('fixture-token'));
});
test('QA denial remains a real 403 result; successful unauthorized read cannot pass', async () => {
  for (const status of [403, 200]) {
    let calls = 0;
    const request = async () => ++calls === 1 ? { ok: true, async json() { return { access_token: 'fixture-token' }; } } : { status, body: { async cancel() {} } };
    const result = await runtimeSecretStatusProbe({ target: 'qa', version }, { ...env, SITE_VERSION: 'c7d9c2c274bfcaee805332a83d94a208af32b09a76bf14' }, request).catch(() => null);
    assert.equal(result, null); // Wrong QA SHA must fail before requesting any token.
    assert.equal(calls, 0);
    const valid = await runtimeSecretStatusProbe({ target: 'qa', version }, { ...env, SITE_VERSION: 'c7d9c2c274bfcaee805332a83d94a208af32f09e' }, request);
    assert.equal(valid.passed, status === 403);
  }
});
test('wrong target, version, external identity endpoint or source SHA cannot fetch', async () => {
  const request = async () => { throw new Error('unexpected-fetch'); };
  for (const options of [{ target: 'other', version }, { target: 'production', version: version + '?evil' }]) await assert.rejects(runtimeSecretStatusProbe(options, env, request));
  await assert.rejects(runtimeSecretStatusProbe({ target: 'production', version }, { ...env, IDENTITY_ENDPOINT: 'https://evil.test/' }, request));
});
test('retained credential login is read-only, role-bound and fails the wrong password', async () => {
  for (const badPassword of [false, true]) {
    const queries = []; let closed = false;
    const factory = options => {
      assert.equal(options.ssl.rejectUnauthorized, true); assert.equal(options.user, 'filosage_runtime'); assert.equal(options.database, 'filosage');
      return { async connect() { if (badPassword) throw new Error('private-password-failure'); }, async query(sql) { queries.push(sql); return { rows: [{ verified: true }] }; }, async end() { closed = true; } };
    };
    const operation = verifyRetainedRuntimeCredential('a'.repeat(64), env, factory);
    if (badPassword) await assert.rejects(operation); else { const result = await operation; assert.equal(result.loginVerified, true); assert.equal(queries.at(-1), 'ROLLBACK'); }
    assert.equal(closed, true); assert(!queries.some(sql => /^(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT)/.test(sql)));
  }
});
