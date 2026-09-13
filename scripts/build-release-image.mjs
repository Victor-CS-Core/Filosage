import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { constants } from 'node:os';
const subscription = 'bfc8f890-2681-43dc-8eac-51644341ae12';

/** Build once on the runner; Azure CLI supplies only existing AAD registry credentials. */
export function buildOnRunner(env, execute) {
  const sha = env.EXPECTED_SHA;
  const registry = env.AZURE_ACR_NAME;
  if (!/^[a-f0-9]{40}$/.test(sha || '') || sha !== env.GITHUB_SHA || env.GITHUB_REF !== 'refs/heads/main'
    || registry !== 'filosagestp4ujucgnxq3gsacr' || env.PUBLIC_SITE_URL !== 'https://filosage.com'
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || '')) throw Error('Invalid build identity.');
  if (execute('git', ['rev-parse', 'HEAD']).trim() !== sha) throw Error('Checkout source mismatch.');
  const tag = `${sha}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const image = `${registry}.azurecr.io/filosage:${tag}`;
  if (execute('az', ['account', 'show', '--query', 'id', '--output', 'tsv', '--subscription', subscription, '--only-show-errors']).trim() !== subscription) throw Error('Azure subscription mismatch.');
  const az = args => execute('az', [...args, '--subscription', subscription, '--only-show-errors', '--output', 'json']);
  const existing = JSON.parse(az(['acr', 'repository', 'show-tags', '--name', registry, '--repository', 'filosage', '--query', `[?@=='${tag}']`]));
  if (!Array.isArray(existing) || existing.length) throw Error('Image tag exists or could not be verified absent.');
  const credential = JSON.parse(az(['acr', 'login', '--name', registry, '--expose-token']));
  if (credential.loginServer !== `${registry}.azurecr.io` || typeof credential.accessToken !== 'string' || !credential.accessToken) throw Error('Registry login mismatch.');
  execute('docker', ['login', credential.loginServer, '--username', '00000000-0000-0000-0000-000000000000', '--password-stdin'], credential.accessToken);
  const capabilities = execute('node', ['scripts/release-capabilities.mjs', 'environment']).trim().split('\n');
  if (!capabilities.length || capabilities.some(line => !/^[A-Z][A-Z0-9_]*=(?:true|false|[0-9]+)$/.test(line))) throw Error('Invalid build capabilities.');
  const args = ['build', '--platform', 'linux/amd64', '--target', 'runtime', '--file', 'Dockerfile', '--tag', image];
  for (const value of [`SITE_VERSION=${sha}`, `NEXT_PUBLIC_SITE_URL=${env.PUBLIC_SITE_URL}`, ...capabilities]) args.push('--build-arg', value);
  execute('docker', [...args, '.']);
  const pushed = execute('docker', ['push', image]);
  const digests = [...pushed.matchAll(/digest: (sha256:[a-f0-9]{64}) size:/g)].map(match => match[1]);
  if (digests.length !== 1) throw Error('Push did not return one immutable digest.');
  const digest = execute('az', ['acr', 'repository', 'show', '--name', registry, '--image', `filosage:${tag}`, '--query', 'digest', '--output', 'tsv', '--subscription', subscription, '--only-show-errors']).trim();
  if (digest !== digests[0]) throw Error('Registry digest readback mismatch.');
  return digest;
}

export function createExecutor(env, spawn = spawnSync, report = value => console.log(JSON.stringify(value))) {
  return (command, args, input) => {
    const stage = command === 'git' ? 'checkout-source' : command === 'node' ? 'manifest' : command === 'docker'
      ? ({login:'docker-login',build:'docker-build',push:'docker-push'}[args[0]] || 'unknown')
      : args[0] === 'account' ? 'azure-context' : args.includes('show-tags') ? 'registry-tag-check' : args.includes('login') ? 'registry-login' : 'registry-digest';
    report({operation:stage,status:'started'});
    const result = spawn(command, args, { env, input, encoding:'utf8', timeout:args[0] === 'build' ? 30*60_000 : 5*60_000, maxBuffer:32*1024*1024 });
    if (result.error || result.status !== 0) {
      report({operation:stage,status:'failed',exitCode:Number.isInteger(result.status)?result.status:null,signalNumber:constants.signals[result.signal] || null});
      throw Error('Build command failed; reconcile this run before retrying.');
    }
    report({operation:stage,status:'completed'});
    return result.stdout;
  };
}

function main() {
  if (!process.env.RUNNER_TEMP || !process.env.GITHUB_ENV) throw Error('Missing runner output context.');
  const directory = mkdtempSync(join(process.env.RUNNER_TEMP, 'release-docker-'));
  chmodSync(directory, 0o700);
  const env = { ...process.env, DOCKER_CONFIG: directory, AZURE_LOGGING_ENABLE_LOG_FILE: 'false', AZURE_CORE_COLLECT_TELEMETRY: 'false' };
  const execute = createExecutor(env);
  try {
    const digest = buildOnRunner(env, execute);
    appendFileSync(process.env.GITHUB_ENV, `EXPECTED_IMAGE_DIGEST=${digest}\n`);
    console.log(`Runner build and registry digest verified: ${digest}`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch { console.error('Runner image build failed closed; reconcile build/push state before retrying.'); process.exitCode = 1; }
}
