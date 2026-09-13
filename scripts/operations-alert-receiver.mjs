import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const MAX_BODY = 16384;
const failure = (status) => Object.assign(new Error('Alert rejected.'), { status });
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateAlert(raw, headers, secret, now = Date.now()) {
  if (!Buffer.isBuffer(raw) || raw.length > MAX_BODY) throw failure(413);
  if (typeof secret !== 'string' || secret.length < 32) throw failure(503);
  if (headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw failure(415);
  const signature = headers['x-filosage-signature'];
  if (headers['x-filosage-signature-version'] !== 'v1' || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) throw failure(401);
  if (!timingSafeEqual(createHmac('sha256', secret).update(raw).digest(), Buffer.from(signature, 'hex'))) throw failure(401);
  let value;
  try { value = JSON.parse(raw.toString('utf8')); } catch { throw failure(400); }
  const keys = ['schemaVersion', 'id', 'service', 'environment', 'version', 'occurredAt', 'severity', 'code', 'message', 'context'];
  if (!plain(value) || Object.keys(value).length !== keys.length || keys.some(k => !(k in value))
    || value.schemaVersion !== 1 || value.service !== 'filosage' || !/^fa_[a-f0-9]{32}$/.test(value.id)
    || typeof value.environment !== 'string' || value.environment.length < 1 || value.environment.length > 40
    || !(value.version === null || typeof value.version === 'string' && value.version.length <= 80)
    || !['info', 'warning', 'critical', 'recovery'].includes(value.severity)
    || typeof value.code !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(value.code)
    || typeof value.message !== 'string' || value.message.length > 300 || !plain(value.context)
    || Object.entries(value.context).length > 20 || Object.entries(value.context).some(([k, v]) => !/^[A-Za-z0-9_.-]{1,60}$/.test(k)
      || !(v === null || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) || typeof v === 'string' && v.length <= 240))) throw failure(400);
  const timestamp = typeof value.occurredAt === 'string' ? Date.parse(value.occurredAt) : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(timestamp) || now - timestamp > 300000 || timestamp - now > 60000) throw failure(401);
  if (headers['x-filosage-alert-id'] !== value.id || headers['idempotency-key'] !== value.id
    || headers['x-filosage-alert-timestamp'] !== value.occurredAt) throw failure(401);
  return value;
}

export function createManagedIdentityToken(env = process.env, request = fetch) {
  const endpoint = new URL(env.IDENTITY_ENDPOINT);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname)
    || endpoint.username || endpoint.password || !env.IDENTITY_HEADER || !env.AZURE_CLIENT_ID) throw Error('Invalid managed identity configuration.');
  endpoint.search = new URLSearchParams({ resource: 'https://storage.azure.com/', 'api-version': '2019-08-01', client_id: env.AZURE_CLIENT_ID }).toString();
  let cached; let pending;
  return async () => {
    if (cached && cached.expires > Date.now() + 60000) return cached.token;
    if (pending) return pending;
    pending = (async () => {
      const response = await request(endpoint, { headers: { 'X-IDENTITY-HEADER': env.IDENTITY_HEADER }, redirect: 'error', signal: AbortSignal.timeout(2000) });
      if (!response.ok) { await response.body?.cancel(); throw Error('Identity unavailable.'); }
      const reader = response.body.getReader(); const chunks = []; let length = 0;
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 16384) throw Error('Identity response bound.'); chunks.push(value); }
      } finally { await reader.cancel(); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const expires = Number(data.expires_on) * 1000;
      if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(expires) || expires <= Date.now() + 60000) throw Error('Identity unavailable.');
      cached = { token: data.access_token, expires }; return cached.token;
    })();
    try { return await pending; } finally { pending = null; }
  };
}

export function createBlobStore({ accountUrl, container, token, request = fetch }) {
  if (accountUrl !== 'https://filosagestp4ujucgnxq3gss.blob.core.windows.net' || container !== 'operations-alerts') throw Error('Unapproved alert storage.');
  const base = `${accountUrl}/${container}`;
  async function send(url, method, extra = {}) {
    return request(url, { method, redirect: 'error', signal: AbortSignal.timeout(2500), ...extra,
      headers: { Authorization: `Bearer ${await token()}`, 'x-ms-version': '2023-11-03', ...extra.headers } });
  }
  return {
    async ready() {
      const response = await send(`${base}?restype=container`, 'HEAD');
      await response.body?.cancel(); if (response.status !== 200) throw Error('Storage unavailable.'); return true;
    },
    async persist(envelope, raw) {
      if (!/^fa_[a-f0-9]{32}$/.test(envelope.id)) throw Error('Invalid storage key.');
      const url = `${base}/alerts/${envelope.id}.json`;
      const response = await send(url, 'PUT', { body: raw, headers: { 'Content-Type': 'application/json', 'x-ms-blob-type': 'BlockBlob',
        'If-None-Match': '*', 'x-ms-meta-alertid': envelope.id, 'x-ms-meta-schemaversion': '1' } });
      await response.body?.cancel();
      if (response.status === 201) return { duplicate: false };
      const alreadyExists = response.status === 409 && response.headers.get('x-ms-error-code') === 'BlobAlreadyExists';
      if (response.status !== 412 && !alreadyExists) throw Error('Storage acceptance failed.');
      const existing = await send(url, 'HEAD'); await existing.body?.cancel();
      const length = Number(existing.headers.get('content-length'));
      if (existing.status !== 200 || existing.headers.get('x-ms-meta-alertid') !== envelope.id
        || existing.headers.get('x-ms-meta-schemaversion') !== '1' || !Number.isSafeInteger(length) || length <= 0 || length > MAX_BODY) throw Error('Stored receipt not verified.');
      return { duplicate: true };
    },
  };
}

export function createReceiver({ secret, store, now = Date.now, log = console.log }) {
  if (typeof secret !== 'string' || secret.length < 32) throw Error('Invalid receiver signing configuration.');
  let inFlight = 0;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const reply = (status, body) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); } };
    if (inFlight >= 8) { reply(503, { accepted: false }); return; }
    inFlight++;
    try {
      if (req.url === '/health' && ['GET', 'HEAD'].includes(req.method)) {
        await store.ready(); reply(200, { ok: true }); return;
      }
      if (req.url !== '/alerts' || req.method !== 'POST') { reply(404, { accepted: false }); return; }
      if (Number(req.headers['content-length']) > MAX_BODY) throw failure(413);
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > MAX_BODY) throw failure(413); chunks.push(chunk); }
      const raw = Buffer.concat(chunks); const envelope = validateAlert(raw, req.headers, secret, now());
      const result = await store.persist(envelope, raw);
      log(JSON.stringify({ component: 'operations-alert-receiver', event: 'accepted', alertId: envelope.id, code: envelope.code, severity: envelope.severity, duplicate: result.duplicate }));
      reply(202, { accepted: true, id: envelope.id, duplicate: result.duplicate });
    } catch (error) {
      const status = [400, 401, 413, 415].includes(error.status) ? error.status : 503;
      if (status === 503) log(JSON.stringify({ component: 'operations-alert-receiver', event: 'dependency-failed' }));
      reply(status, { accepted: false });
    } finally { inFlight--; }
  };
}

export async function startReceiver(env = process.env) {
  const token = createManagedIdentityToken(env);
  const store = createBlobStore({ accountUrl: env.ALERT_STORAGE_ACCOUNT_URL, container: env.ALERT_STORAGE_CONTAINER, token });
  const server = createServer(createReceiver({ secret: env.OPERATIONS_ALERT_WEBHOOK_SECRET, store }));
  server.requestTimeout = 10000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
  // Explicit inactivity deadline also bounds clients that never finish a request body.
  server.setTimeout(10000, socket => socket.destroy());
  await new Promise(resolve => server.listen(8080, '0.0.0.0', resolve));
  let checking = false;
  const heartbeat = async () => {
    if (checking) return; checking = true;
    try { await store.ready(); console.log(JSON.stringify({ component: 'operations-alert-receiver', event: 'heartbeat' })); }
    catch { console.log(JSON.stringify({ component: 'operations-alert-receiver', event: 'dependency-failed' })); }
    finally { checking = false; }
  };
  await heartbeat(); const timer = setInterval(heartbeat, 60000);
  const shutdown = () => { clearInterval(timer); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
  return server;
}
