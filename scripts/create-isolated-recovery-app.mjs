#!/usr/bin/env node
import { readFileSync, statSync, lstatSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appName, appOrigin, identityId, image, prefix, recoveryAppPacket, recoveryAuthPacket, verifyRecoveryAuth } from './recovery-app-packet.mjs';

// Coordinator supplies private reviewed recovery credentials. Never echo input/provider output.
const subscription = 'bfc8f890-2681-43dc-8eac-51644341ae12';
const group = 'filosage-staging-central-rg';
const appId = `${prefix}/providers/Microsoft.App/containerApps/${appName}`;
const cliEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('AZURE_STORAGE_')));
Object.assign(cliEnv, { AZURE_LOGGING_ENABLE_LOG_FILE: 'false', AZURE_CORE_COLLECT_TELEMETRY: 'false' });
function az(args, timeout = 30000) {
  const response = spawnSync('az', [...args, '--subscription', subscription, '--only-show-errors', '--output', 'json'], {
    env: cliEnv, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (response.status !== 0 || response.error) throw new Error('Provider call failed; private output suppressed.');
  return JSON.parse(response.stdout || 'null');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
const appFingerprint = app => createHash('sha256').update(JSON.stringify(canonical({ identity: app.identity,
  configuration: app.properties.configuration, template: app.properties.template, environment: app.properties.managedEnvironmentId }))).digest('hex');
let directory;
const result = { operation: 'create-isolated-recovery-app', appId, origin: appOrigin, image, startedAt: new Date().toISOString(),
  passed: false, creationAttempted: false, authenticationConfigured: false, learnerReady: false };
try {
  const [flag, file] = process.argv.slice(2);
  if (flag !== '--execute-reviewed-create' || !file || process.argv.length !== 4) throw new Error('Reviewed private input required.');
  const stat = statSync(file);
  if (lstatSync(file).isSymbolicLink() || !stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 32768) throw new Error('Private input permissions.');
  const input = JSON.parse(readFileSync(file, 'utf8'));
  const packet = recoveryAppPacket(input);
  const environment = az(['containerapp', 'env', 'show', '--ids', input.environmentId]);
  if (environment.id.toLowerCase() !== input.environmentId.toLowerCase() || environment.properties.defaultDomain !== 'salmontree-eb10220f.centralus.azurecontainerapps.io') throw new Error('Environment identity/domain mismatch.');
  const identity = az(['identity', 'show', '--ids', identityId]);
  if (identity.id.toLowerCase() !== identityId.toLowerCase() || identity.clientId !== input.identityClientId) throw new Error('Recovery identity mismatch.');
  const apps = az(['containerapp', 'list', '-g', group, '--query', '[].name']);
  if (!Array.isArray(apps) || apps.some(name => typeof name !== 'string') || apps.includes(appName)) throw new Error('Exact recovery app must be absent; reconcile existing app without overwrite.');
  directory = mkdtempSync(join(tmpdir(), 'filosage-recovery-app-'));
  const body = join(directory, 'body.json');
  writeFileSync(body, JSON.stringify(packet), { mode: 0o600 });
  result.creationAttempted = true;
  az(['rest', '--method', 'put', '--url', `https://management.azure.com${appId}?api-version=2025-01-01`, '--body', `@${body}`], 120000);
  const observed = az(['containerapp', 'show', '-g', group, '-n', appName]);
  if (observed.id.toLowerCase() !== appId.toLowerCase() || observed.properties.configuration.ingress.fqdn !== new URL(appOrigin).hostname
    || observed.properties.template.containers[0].image !== image || JSON.stringify(observed.properties.configuration.ingress.ipSecurityRestrictions) !== JSON.stringify(packet.properties.configuration.ingress.ipSecurityRestrictions)) throw new Error('Created resource identity/configuration needs reconciliation.');
  if (!observed.properties.configuration.secrets.some(secret => secret.name === 'google-oauth-secret')) throw new Error('Google secret reference missing.');
  const beforeAuth = appFingerprint(observed);
  const authBody = join(directory, 'auth.json');
  writeFileSync(authBody, JSON.stringify(recoveryAuthPacket()), { mode: 0o600 });
  result.authenticationWriteAttempted = true;
  const authUrl = `https://management.azure.com${appId}/authConfigs/current?api-version=2025-01-01`;
  az(['rest', '--method', 'put', '--url', authUrl, '--body', `@${authBody}`], 120000);
  verifyRecoveryAuth(az(['rest', '--method', 'get', '--url', authUrl]));
  const afterAuth = az(['containerapp', 'show', '-g', group, '-n', appName]);
  if (appFingerprint(afterAuth) !== beforeAuth) throw new Error('App configuration changed during auth binding.');
  result.authenticationConfigured = true;
  result.appConfigurationUnchangedDuringAuth = true;
  result.appConfigurationSha256 = beforeAuth;
  result.passed = true;
  result.provisioningState = ['Succeeded', 'InProgress', 'Failed'].includes(observed.properties.provisioningState) ? observed.properties.provisioningState : 'unknown';
} catch { result.failed = true; result.reconciliationRequired = result.creationAttempted; }
finally {
  if (directory) rmSync(directory, { recursive: true, force: true });
  result.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(result, null, 2));
}
process.exitCode = result.passed ? 0 : 1;
