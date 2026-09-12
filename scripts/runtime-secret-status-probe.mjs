/** Fixed production/QA status-only checks. Secret response bodies are never consumed. */
export async function runtimeSecretStatusProbe({ target, version }, env = process.env, request = fetch) {
  const targets = {
    production: { sha: '93f60f24afe59b19b6a592f455a09e8e813f1f84', client: 'fc8fec59-9873-4502-80e2-21f4dacc301c', expected: 200 },
    qa: { sha: 'c7d9c2c274bfcaee805332a83d94a208af32f09e', client: 'aa4f7188-36bc-49dd-a4eb-a6f296b81094', expected: 403 },
  };
  const selected = Object.hasOwn(targets, target) ? targets[target] : null;
  if (!selected || env.SITE_VERSION !== selected.sha || !/^[a-f0-9]{32}$/.test(version)) throw new Error('runtime-target');
  const endpoint = new URL(env.IDENTITY_ENDPOINT);
  if (!['http:', 'https:'].includes(endpoint.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
    || endpoint.username || endpoint.password || endpoint.hash) throw new Error('identity-endpoint');
  endpoint.searchParams.set('api-version', '2019-08-01');
  endpoint.searchParams.set('resource', 'https://vault.azure.net');
  endpoint.searchParams.set('client_id', selected.client);
  const response = await request(endpoint, { redirect: 'error', headers: { 'X-IDENTITY-HEADER': env.IDENTITY_HEADER }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('identity-response');
  const token = (await response.json()).access_token;
  if (typeof token !== 'string' || !token) throw new Error('identity-token');
  const secret = await request(`https://filosagestg-p4ujucgnxq3g.vault.azure.net/secrets/database-url-runtime-v1/${version}?api-version=7.4`, {
    redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
  });
  const status = secret.status;
  await secret.body?.cancel();
  return { operation: 'runtime-secret-status', target, sourceSha: selected.sha, version, status, expected: selected.expected, passed: status === selected.expected };
}

/** Bind the retained private password to an actual runtime login before persisting it. */
export async function verifyRetainedRuntimeCredential(password, env = process.env, factory) {
  const sourceSha = '93f60f24afe59b19b6a592f455a09e8e813f1f84';
  if (env.SITE_VERSION !== sourceSha || !/^[a-f0-9]{64}$/.test(password)) throw new Error('credential-context');
  if (!factory) {
    const { createRequire } = await import('node:module');
    const require = createRequire(`${process.cwd()}/package.json`);
    const pg = require('pg');
    factory = options => new pg.Client(options);
  }
  const client = factory({ host: 'filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com', port: 5432, database: 'filosage',
    user: 'filosage_runtime', password, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000, query_timeout: 15000,
    application_name: 'filosage-runtime-secret-login-verification', options: '-c default_transaction_read_only=on -c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    try {
      const result = await client.query("SELECT current_user='filosage_runtime' AND current_database()='filosage' AND (SELECT rolconnlimit=18 FROM pg_roles WHERE rolname=current_user) AS verified");
      if (result.rows[0]?.verified !== true) throw new Error('credential-identity');
    } finally { await client.query('ROLLBACK'); }
    return { operation: 'runtime-secret-login', sourceSha, loginVerified: true };
  } finally { await client.end().catch(() => undefined); }
}
