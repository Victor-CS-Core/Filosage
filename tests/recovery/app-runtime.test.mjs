import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoveryAppPacket, appOrigin, identityId, prefix } from '../../scripts/recovery-app-packet.mjs';
import { missingRuntimeConfiguration, authenticationMode } from '../../src/lib/runtime-config.ts';
import { aiClient } from '../../src/lib/local-ai.ts';

test('generated recovery environment passes real runtime validation with contained AI and no real owner', async () => {
  const secrets = { 'recovery-database-url': 'postgresql://filosage_recovery_runtime:fixture@filosage-recovery-20260912-b.postgres.database.azure.com:5432/filosage?sslmode=verify-full',
    'recovery-activity-receipt': 'a'.repeat(32), 'recovery-identity-link': 'b'.repeat(32), 'google-oauth-secret': 'google-fixture-secret' };
  const packet = recoveryAppPacket({ location: 'centralus', environmentId: `${prefix}/providers/Microsoft.App/managedEnvironments/filosagestg-environment`,
    identityId, identityClientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', origin: appOrigin, operatorCidr: '198.51.100.17/32', secrets });
  const environment = Object.fromEntries(packet.properties.template.containers[0].env.map(entry => [entry.name, entry.value ?? secrets[entry.secretRef]]));
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, environment);
    assert.equal(process.env.NODE_ENV, 'production');
    assert.deepEqual(missingRuntimeConfiguration(), []);
    assert.equal(authenticationMode(), 'direct-google');
    assert.equal(process.env.DEPLOYMENT_ENVIRONMENT, 'qa');
    assert.equal(process.env.OPERATIONS_ENVIRONMENT, 'qa');
    assert.equal(process.env.OWNER_EMAIL, 'recovery-owner@invalid.example');
    assert.equal(process.env.OPENAI_API_KEY, 'recovery-disabled-not-a-real-key');
    const requestedOrigins = [];
    globalThis.fetch = async request => {
      const url = new URL(typeof request === 'string' ? request : request.url);
      requestedOrigins.push(url.origin);
      throw new Error('Fixture denies transport; no network request made.');
    };
    const client = aiClient();
    assert.equal(client.baseURL, 'http://127.0.0.1:9/v1');
    await assert.rejects(client.models.list({ maxRetries: 0 }));
    assert.deepEqual(requestedOrigins, ['http://127.0.0.1:9']);
    process.env.DEPLOYMENT_ENVIRONMENT = 'recovery';
    assert.ok(missingRuntimeConfiguration().includes('DEPLOYMENT_ENVIRONMENT must be qa or production'));
    process.env.DEPLOYMENT_ENVIRONMENT = 'qa';
    delete process.env.OPENAI_API_KEY;
    assert.ok(missingRuntimeConfiguration().includes('OPENAI_API_KEY'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
