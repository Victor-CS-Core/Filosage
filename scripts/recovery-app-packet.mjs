import { isIPv4 } from 'node:net';
import { readReleaseManifest } from './release-manifest.mjs';
import { releaseEnvironment } from '../src/lib/release-capabilities.ts';

export const prefix = '/subscriptions/bfc8f890-2681-43dc-8eac-51644341ae12/resourceGroups/filosage-staging-central-rg';
export const appName = 'filosage-recovery-app-20260912';
export const appOrigin = `https://${appName}.salmontree-eb10220f.centralus.azurecontainerapps.io`;
export const identityId = `${prefix}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/filosage-recovery-identity-20260912-b`;
export const image = 'filosagestp4ujucgnxq3gsacr.azurecr.io/filosage@sha256:95cc9529e6abcfdef5918f39996cfed55703e5b29b82d75304a69765c844b344';
export const googleClientId = '557534798515-f1419k6iqqb0ptk6b1a4f8qs20uqd1hv.apps.googleusercontent.com';

export function recoveryAuthPacket() {
  return { properties: { platform: { enabled: true }, httpSettings: { requireHttps: true },
    globalValidation: { unauthenticatedClientAction: 'Return401', excludedPaths: ['/api/health'] },
    identityProviders: { google: { enabled: true,
      registration: { clientId: googleClientId, clientSecretSettingName: 'google-oauth-secret' },
      validation: { allowedAudiences: [googleClientId] } } },
    login: { preserveUrlFragmentsForLogins: true, tokenStore: { enabled: false } } } };
}

export function verifyRecoveryAuth(value) {
  const props = value?.properties;
  const google = props?.identityProviders?.google;
  const otherEnabled = Object.entries(props?.identityProviders ?? {}).some(([key, provider]) => key !== 'google'
    && (provider?.enabled === true || (key === 'customOpenIdConnectProviders' && Object.values(provider ?? {}).some(v => v?.enabled === true))));
  if (props?.platform?.enabled !== true || props?.httpSettings?.requireHttps !== true
    || props?.globalValidation?.unauthenticatedClientAction !== 'Return401'
    || JSON.stringify(props?.globalValidation?.excludedPaths) !== JSON.stringify(['/api/health'])
    || google?.enabled !== true || google?.registration?.clientId !== googleClientId
    || google?.registration?.clientSecretSettingName !== 'google-oauth-secret'
    || JSON.stringify(google?.validation?.allowedAudiences) !== JSON.stringify([googleClientId])
    || props?.login?.tokenStore?.enabled !== false || otherEnabled) throw new Error('Recovery authentication readback mismatch.');
}

/** Private ARM body only. Caller must never log it: dedicated credentials are present. */
export function recoveryAppPacket(input) {
  const fail = () => { throw new Error('Invalid isolated recovery configuration.'); };
  if (process.env.RELEASE_CAPABILITIES_JSON) fail();
  if (input.location !== 'centralus' || input.origin !== appOrigin || input.identityId !== identityId
    || !new RegExp(`^${prefix}/providers/Microsoft.App/managedEnvironments/[a-z0-9-]+$`, 'i').test(input.environmentId)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.identityClientId)) fail();
  const [ip, mask] = String(input.operatorCidr).split('/');
  if (!isIPv4(ip) || mask !== '32' || String(input.operatorCidr).split('/').length !== 2 || ip === '0.0.0.0') fail();
  const required = ['recovery-database-url', 'recovery-activity-receipt', 'recovery-identity-link', 'google-oauth-secret'];
  if (Object.keys(input.secrets ?? {}).sort().join() !== required.sort().join()) fail();
  const db = new URL(input.secrets['recovery-database-url']);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.hostname !== 'filosage-recovery-20260912-b.postgres.database.azure.com'
    || db.port !== '5432' || db.pathname !== '/filosage' || db.username !== 'filosage_recovery_runtime' || !db.password
    || db.search !== '?sslmode=verify-full' || db.hash) fail();
  if (['recovery-activity-receipt', 'recovery-identity-link'].some(name => typeof input.secrets[name] !== 'string' || input.secrets[name].length < 32)) fail();
  if (typeof input.secrets['google-oauth-secret'] !== 'string' || input.secrets['google-oauth-secret'].length < 16) fail();
  const values = { ...releaseEnvironment(readReleaseManifest()), NODE_ENV: 'production', DATABASE_SSL: 'verify-full', DATABASE_POOL_MAX: '2',
    // Frozen runtime requires these fields; the sentinel is not a provider credential.
    // The SDK routes model requests to loopback and cannot provide real AI availability.
    OPENAI_API_KEY: 'recovery-disabled-not-a-real-key', OPENAI_BASE_URL: 'http://127.0.0.1:9/v1',
    OWNER_EMAIL: 'recovery-owner@invalid.example', AZURE_POSTGRES_SERVER_NAME: 'filosage-recovery-20260912-b',
    AZURE_RESOURCE_GROUP: 'filosage-staging-central-rg',
    AZURE_CLIENT_ID: input.identityClientId, AZURE_STORAGE_ACCOUNT_URL: 'https://filosagestp4ujucgnxq3gss.blob.core.windows.net',
    AZURE_STORAGE_BANNER_CONTAINER: 'recovery-20260912-assets-b', NEXT_PUBLIC_SITE_URL: appOrigin,
    SITE_VERSION: '7c48bc02ff6623a81fee382b194864f1d04b76c0', RELEASE_IMAGE_DIGEST: image.split('@')[1],
    AZURE_EASY_AUTH_ENABLED: 'true', DIRECT_GOOGLE_AUTH_ENABLED: 'true', EXTERNAL_ID_AUTH_ENABLED: 'false', EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: 'false',
    BILLING_ENABLED: 'false', BILLING_ROLLOUT_MODE: 'closed', STRIPE_TAX_READY: 'false', DEPLOYMENT_ENVIRONMENT: 'qa', OPERATIONS_ENVIRONMENT: 'qa' };
  return { location: 'centralus', tags: { recoveryOwner: 'recovery-20260912-b' }, identity: { type: 'UserAssigned', userAssignedIdentities: { [identityId]: {} } },
    properties: { managedEnvironmentId: input.environmentId, configuration: { activeRevisionsMode: 'Single',
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false,
        ipSecurityRestrictions: [{ name: 'recovery-operator-20260912', action: 'Allow', ipAddressRange: input.operatorCidr }] },
      registries: [{ server: 'filosagestp4ujucgnxq3gsacr.azurecr.io', identity: identityId }],
      secrets: Object.entries(input.secrets).map(([name, value]) => ({ name, value })) },
    template: { revisionSuffix: 'recovery-7c48bc02-1', containers: [{ name: 'web', image, resources: { cpu: 0.5, memory: '1Gi' },
      env: [...Object.entries(values).map(([name, value]) => ({ name, value })),
        { name: 'DATABASE_URL', secretRef: 'recovery-database-url' }, { name: 'ACTIVITY_RECEIPT_SECRET', secretRef: 'recovery-activity-receipt' },
        { name: 'IDENTITY_LINK_HMAC_SECRET', secretRef: 'recovery-identity-link' }] }], scale: { minReplicas: 0, maxReplicas: 1 } } } };
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

export function recoveryIngressMatches(observed, expected) {
  return Array.isArray(observed) && Array.isArray(expected)
    && JSON.stringify(canonical(observed)) === JSON.stringify(canonical(expected));
}
