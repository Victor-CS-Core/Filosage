import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoveryAppPacket, recoveryAuthPacket, verifyRecoveryAuth, googleClientId, prefix } from '../../scripts/recovery-app-packet.mjs';

const input = () => ({ location: 'centralus', environmentId: `${prefix}/providers/Microsoft.App/managedEnvironments/filosagestg-env`,
  identityId: `${prefix}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/filosage-recovery-identity-20260912-b`,
  identityClientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', origin: 'https://filosage-recovery-app-20260912.salmontree-eb10220f.centralus.azurecontainerapps.io',
  operatorCidr: '198.51.100.17/32',
  secrets: { 'recovery-database-url': 'postgresql://filosage_recovery_runtime:fixture@filosage-recovery-20260912-b.postgres.database.azure.com:5432/filosage?sslmode=verify-full',
    'recovery-activity-receipt': 'a'.repeat(32), 'recovery-identity-link': 'b'.repeat(32), 'google-oauth-secret': 'google-fixture-secret' },
});

test('Google-only managed auth requires exact client/secret and 401 with health exclusion', () => {
  const auth = recoveryAuthPacket();
  assert.equal(auth.properties.identityProviders.google.registration.clientId, googleClientId);
  assert.equal(auth.properties.globalValidation.unauthenticatedClientAction, 'Return401');
  assert.deepEqual(auth.properties.globalValidation.excludedPaths, ['/api/health']);
  verifyRecoveryAuth(auth);
  for (const change of [v => { v.properties.platform.enabled = false; },
    v => { v.properties.globalValidation.unauthenticatedClientAction = 'AllowAnonymous'; },
    v => { v.properties.globalValidation.excludedPaths.push('/'); },
    v => { v.properties.identityProviders.google.registration.clientSecretSettingName = 'other'; },
    v => { v.properties.identityProviders.google.registration.clientId = 'other'; },
    v => { v.properties.identityProviders.customOpenIdConnectProviders = { unknown: { enabled: true } }; }]) {
    const value = recoveryAuthPacket(); change(value); assert.throws(() => verifyRecoveryAuth(value));
  }
  const missing = input(); delete missing.secrets['google-oauth-secret'];
  assert.throws(() => recoveryAppPacket(missing));
});

test('isolated packet has only recovery bindings, scoped ingress and normal image command', () => {
  const packet = recoveryAppPacket(input());
  const config = packet.properties.configuration;
  const container = packet.properties.template.containers[0];
  assert.equal(config.ingress.ipSecurityRestrictions.length, 1);
  assert.equal(config.ingress.ipSecurityRestrictions[0].action, 'Allow');
  assert.equal(container.command, undefined);
  assert.equal(container.args, undefined);
  assert.equal(packet.properties.template.scale.maxReplicas, 1);
  assert.deepEqual(container.env.find(e => e.name === 'DATABASE_URL'), { name: 'DATABASE_URL', secretRef: 'recovery-database-url' });
  assert.equal(container.env.find(e => e.name === 'AZURE_STORAGE_BANNER_CONTAINER').value, 'recovery-20260912-assets-b');
  assert.ok(!container.env.some(e => /STRIPE_SECRET|WEBHOOK|MIGRATED_OWNER/.test(e.name)));
});

test('production credentials, network ranges and arbitrary secret additions cannot enter packet', () => {
  for (const change of [v => { v.operatorCidr = '0.0.0.0/0'; }, v => { v.secrets['openai-api-key'] = 'fixture'; },
    v => { v.secrets['recovery-database-url'] = v.secrets['recovery-database-url'].replace('filosage-recovery-20260912-b', 'filosagestg-production'); },
    v => { v.identityId = v.identityId.replace('filosage-recovery-identity-20260912-b', 'filosagestg-app-identity'); }]) {
    const value = input(); change(value); assert.throws(() => recoveryAppPacket(value));
  }
});
