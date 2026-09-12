import { createHash } from 'node:crypto';
import { isIPv4 } from 'node:net';

export const sourceSha = 'c7d9c2c274bfcaee805332a83d94a208af32f09e';
export const origins = Object.freeze([
  'https://filosage.com',
  'https://filosagestg-app---blue.salmontree-eb10220f.centralus.azurecontainerapps.io',
  'https://filosagestg-app---green.salmontree-eb10220f.centralus.azurecontainerapps.io',
  'https://filosagestg-app--blue-7abae96f-1.salmontree-eb10220f.centralus.azurecontainerapps.io',
  'https://filosagestg-app--green-93f60f24-1.salmontree-eb10220f.centralus.azurecontainerapps.io',
  'https://filosagestg-app.salmontree-eb10220f.centralus.azurecontainerapps.io',
  'https://www.filosage.com',
]);

export async function qaVantageBaseline(operatorIpv4Sha256, env = process.env, request = fetch) {
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
  for (const origin of origins) {
    for (const path of origin.includes('blue') ? ['/.auth/me'] : ['/api/health', '/.auth/me']) {
      try {
        const response = await request(origin + path, { method: 'GET', credentials: 'omit', redirect: 'manual', signal: AbortSignal.timeout(8000) });
        const status = response.status;
        await response.body?.cancel();
        if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('status');
        checks.push({ origin, path, status, requestFailed: false });
      } catch { checks.push({ origin, path, status: null, requestFailed: true }); }
    }
  }
  return { schemaVersion: 1, operation: 'qa-vantage-baseline', sourceSha, startedAt, finishedAt: new Date().toISOString(),
    egressIpv4Sha256, differentFromOperator: egressIpv4Sha256 !== operatorIpv4Sha256, checks,
    blueHealthOmitted: true, fenceVerified: false, drainVerified: false };
}
