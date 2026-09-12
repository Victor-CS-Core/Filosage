import { createHash } from 'node:crypto';
import { isIPv4 } from 'node:net';

export const sourceSha = 'c7d9c2c274bfcaee805332a83d94a208af32f09e';
export const origin = 'https://filosage-recovery-app-20260912.salmontree-eb10220f.centralus.azurecontainerapps.io';

export async function recoveryDeniedVantage(operatorIpv4Sha256, env = process.env, request = fetch) {
  if (env.SITE_VERSION !== sourceSha || !/^[a-f0-9]{64}$/.test(operatorIpv4Sha256)) throw new Error('vantage-context');
  const startedAt = new Date().toISOString();
  const ipResponse = await request('https://api.ipify.org', { method: 'GET', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!ipResponse.ok || !ipResponse.body) throw new Error('egress-response');
  const reader = ipResponse.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 15) throw new Error('egress-size');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const ipv4 = Buffer.concat(chunks).toString('ascii');
  if (!isIPv4(ipv4)) throw new Error('egress-ipv4');
  const egressIpv4Sha256 = createHash('sha256').update(ipv4).digest('hex');
  const checks = [];
  for (const path of ['/api/health', '/', '/.auth/login/google', '/api/account']) {
    for (const method of ['HEAD', 'GET']) {
      try {
        const response = await request(origin + path, { method, credentials: 'omit', redirect: 'manual', signal: AbortSignal.timeout(8000) });
        const status = response.status;
        await response.body?.cancel();
        if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('status');
        checks.push({ origin, path, method, status, requestFailed: false });
      } catch { checks.push({ origin, path, method, status: null, requestFailed: true }); }
    }
  }
  return { schemaVersion: 1, operation: 'recovery-denied-vantage', sourceSha, startedAt, finishedAt: new Date().toISOString(),
    egressIpv4Sha256, differentFromOperator: egressIpv4Sha256 !== operatorIpv4Sha256, checks,
    fenceVerified: egressIpv4Sha256 !== operatorIpv4Sha256 && checks.length === 8 && checks.every(check => check.status === 403 && !check.requestFailed), drainVerified: false };
}
