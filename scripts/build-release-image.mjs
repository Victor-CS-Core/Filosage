import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { constants } from 'node:os';
const registryPath = 'victor-cs-core/filosage';
const repository = `ghcr.io/${registryPath}`;
const manifestTypes = ['application/vnd.oci.image.index.v1+json', 'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json', 'application/vnd.docker.distribution.manifest.v2+json'];

/** Build once on the runner; the workflow GITHUB_TOKEN is the only registry credential. */
export function buildOnRunner(env, execute) {
  const sha = env.EXPECTED_SHA;
  const token = env.GITHUB_TOKEN;
  if (!/^[a-f0-9]{40}$/.test(sha || '') || sha !== env.GITHUB_SHA || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_REPOSITORY !== 'Victor-CS-Core/Filosage' || env.PUBLIC_SITE_URL !== 'https://filosage.com'
    // The token is interpolated into curl configuration; reject anything that could add directives.
    || !/^[A-Za-z0-9_]+$/.test(token || '') || !/^[A-Za-z0-9][A-Za-z0-9-]*(?:\[bot\])?$/.test(env.GITHUB_ACTOR || '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || '')) throw Error('Invalid build identity.');
  if (execute('git', ['rev-parse', 'HEAD']).trim() !== sha) throw Error('Checkout source mismatch.');
  const tag = `${sha}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const image = `${repository}:${tag}`;
  const curl = (args, config) => execute('curl', ['--disable', '--silent', '--show-error', '--proto', '=https', '--max-time', '60', '--config', '-', ...args], config);
  const registryToken = (scope, config) => {
    const response = JSON.parse(curl(['--fail', `https://ghcr.io/token?service=ghcr.io&scope=repository:${registryPath}:${scope}`], config));
    if (typeof response?.token !== 'string' || !/^[A-Za-z0-9._~+/=-]+$/.test(response.token)) throw Error('Registry token mismatch.');
    return `header = "Authorization: Bearer ${response.token}"\n`;
  };
  const writer = () => registryToken('pull,push', `user = "x-access-token:${token}"\n`);
  const manifest = (reference, config, args) => curl([...args, '--header', `Accept: ${manifestTypes.join(', ')}`,
    `https://ghcr.io/v2/${registryPath}/manifests/${reference}`], config);
  const readDigest = (reference, config) => {
    const headers = manifest(reference, config, ['--fail', '--output', '/dev/null', '--dump-header', '-']);
    const digests = [...headers.matchAll(/^docker-content-digest:[ \t]*(sha256:[a-f0-9]{64})[ \t]*\r?$/gim)].map(match => match[1]);
    if (digests.length !== 1) throw Error('Registry did not return one manifest digest.');
    return digests[0];
  };
  const status = manifest(tag, writer(), ['--output', '/dev/null', '--write-out', '%{http_code}']).trim();
  if (status !== '404') throw Error('Image tag exists or could not be verified absent.');
  execute('docker', ['login', 'ghcr.io', '--username', env.GITHUB_ACTOR, '--password-stdin'], token);
  const capabilities = execute('node', ['scripts/release-capabilities.mjs', 'environment']).trim().split('\n');
  if (!capabilities.length || capabilities.some(line => !/^[A-Z][A-Z0-9_]*=(?:true|false|[0-9]+)$/.test(line))) throw Error('Invalid build capabilities.');
  const args = ['build', '--platform', 'linux/amd64', '--target', 'runtime', '--file', 'Dockerfile', '--tag', image];
  for (const value of [`SITE_VERSION=${sha}`, `NEXT_PUBLIC_SITE_URL=${env.PUBLIC_SITE_URL}`, ...capabilities]) args.push('--build-arg', value);
  execute('docker', [...args, '.']);
  const pushed = execute('docker', ['push', image]);
  const digests = [...pushed.matchAll(/digest: (sha256:[a-f0-9]{64}) size:/g)].map(match => match[1]);
  if (digests.length !== 1) throw Error('Push did not return one immutable digest.');
  if (readDigest(tag, writer()) !== digests[0]) throw Error('Registry digest readback mismatch.');
  // Container Apps pulls without a registry credential, so the package must already be public.
  if (readDigest(digests[0], registryToken('pull', '')) !== digests[0]) throw Error('Public registry digest mismatch.');
  return digests[0];
}

const curlStage = args => {
  const url = args.at(-1);
  if (url.includes('/token?')) return url.endsWith(':pull') ? 'registry-public-token' : 'registry-token';
  if (args.includes('--write-out')) return 'registry-tag-check';
  return url.includes('/manifests/sha256:') ? 'registry-public-check' : 'registry-digest';
};

export function createExecutor(env, spawn = spawnSync, report = value => console.log(JSON.stringify(value))) {
  return (command, args, input) => {
    const stage = command === 'git' ? 'checkout-source' : command === 'node' ? 'manifest' : command === 'docker'
      ? ({login:'docker-login',build:'docker-build',push:'docker-push'}[args[0]] || 'unknown')
      : command === 'curl' ? curlStage(args) : 'unknown';
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
  const env = { ...process.env, DOCKER_CONFIG: directory };
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
