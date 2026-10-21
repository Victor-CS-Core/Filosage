const BODY_LIMIT = 16_384;
const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60_000;
const reply = (status, result) => Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
const configured = (env) => env.DB?.prepare && env.EMAIL?.send
  && env.ALERT_SIGNING_SECRET?.length >= 32
  && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.ALERT_TO ?? "")
  && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.ALERT_FROM ?? "");
const hex = (bytes) => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");

async function boundedBody(request) {
  if (Number(request.headers.get("Content-Length")) > BODY_LIMIT) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("body_timeout")), 5_000); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) { void reader.cancel(); return null; }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return body;
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
function validEnvelope(event, request, now) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const occurred = Date.parse(event.occurredAt);
  return event.schemaVersion === 1 && event.service === "filosage"
    && /^fa_[a-f0-9]{32}$/.test(event.id ?? "")
    && /^[A-Za-z0-9_.-]{1,80}$/.test(event.code ?? "")
    && /^[A-Za-z0-9_-]{1,40}$/.test(event.environment ?? "")
    && ["info", "warning", "critical", "recovery"].includes(event.severity)
    && (event.version === null || (typeof event.version === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(event.version)))
    && typeof event.message === "string" && event.message.length <= 300
    && event.context !== null && typeof event.context === "object" && !Array.isArray(event.context)
    && Object.keys(event.context).length <= 20
    && Object.entries(event.context).every(([key, value]) => /^[A-Za-z0-9_.-]{1,60}$/.test(key)
      && (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= 240)))
    && Object.keys(event).every(key => ["schemaVersion", "id", "service", "environment", "version", "occurredAt", "severity", "code", "message", "context"].includes(key))
    && Number.isFinite(occurred) && now - occurred <= 300_000 && occurred - now <= 30_000
    && request.headers.get("X-Filosage-Alert-Id") === event.id
    && request.headers.get("Idempotency-Key") === event.id
    && request.headers.get("X-Filosage-Alert-Timestamp") === event.occurredAt;
}

export async function receiveAlert(request, env, now = Date.now()) {
  if (!configured(env)) return reply(503, { error: "receiver_unavailable" });
  if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return reply(415, { error: "json_required" });
  let body;
  try { body = await boundedBody(request); } catch { return reply(408, { error: "body_timeout" }); }
  if (!body) return reply(413, { error: "body_too_large" });
  const signature = request.headers.get("X-Filosage-Signature") ?? "";
  if (request.headers.get("X-Filosage-Signature-Version") !== "v1" || !/^[a-f0-9]{64}$/.test(signature)) return reply(401, { error: "invalid_signature" });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ALERT_SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(signature.match(/../g), byte => Number.parseInt(byte, 16)), body);
  if (!valid) return reply(401, { error: "invalid_signature" });
  const occurred = Date.parse(request.headers.get("X-Filosage-Alert-Timestamp") ?? "");
  if (!Number.isFinite(occurred) || now - occurred > 300_000 || occurred - now > 30_000) return reply(401, { error: "stale_alert" });
  let event;
  try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); } catch { return reply(400, { error: "invalid_envelope" }); }
  if (!validEnvelope(event, request, now)) return reply(400, { error: "invalid_envelope" });
  // Sender IDs intentionally coalesce repeated events in a five-minute bucket.
  // Authenticate exact bytes above, but exclude the fresh occurrence timestamp
  // from duplicate identity. A changed payload still conflicts with the same ID.
  const identity = { schemaVersion: 1, id: event.id, service: event.service, environment: event.environment, version: event.version, severity: event.severity, code: event.code, message: event.message, context: Object.fromEntries(Object.entries(event.context).sort(([a], [b]) => a.localeCompare(b))) };
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(identity))));
  try {
    const inserted = await env.DB.prepare(`INSERT INTO operational_alerts
      (id, body_hash, code, severity, environment, version, occurred_at, received_at, next_attempt_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
      .bind(event.id, bodyHash, event.code, event.severity, event.environment, event.version, event.occurredAt, now, now).run();
    const persisted = await env.DB.prepare("SELECT body_hash FROM operational_alerts WHERE id = ?").bind(event.id).first();
    if (!persisted) return reply(503, { error: "storage_unavailable" });
    if (persisted.body_hash !== bodyHash) return reply(409, { error: "alert_identity_conflict" });
    return reply(inserted.meta.changes ? 202 : 200, { accepted: true, id: event.id });
  } catch {
    console.error(JSON.stringify({ code: "operations_receiver.storage_unavailable" }));
    return reply(503, { error: "storage_unavailable" });
  }
}

export async function dispatchPending(env, send, clock = Date.now) {
  const now = clock();
  const due = await env.DB.prepare(`SELECT id FROM operational_alerts
    WHERE state IN ('pending','sending') AND next_attempt_at <= ? AND lease_until <= ? AND attempts < ?
    ORDER BY received_at LIMIT 10`).bind(now, now, MAX_ATTEMPTS).all();
  for (const { id } of due.results) {
    const claimedAt = clock();
    const leaseUntil = claimedAt + LEASE_MS;
    const row = await env.DB.prepare(`UPDATE operational_alerts SET state='sending', lease_until=?, attempts=attempts+1
      WHERE id=? AND state IN ('pending','sending') AND lease_until <= ? AND next_attempt_at <= ? AND attempts < ? RETURNING *`)
      .bind(leaseUntil, id, claimedAt, claimedAt, MAX_ATTEMPTS).first();
    if (!row) continue;
    let timer;
    let timedOut = false;
    try {
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error("send_deadline")); }, 60_000); });
      await Promise.race([send(row), deadline]);
      await env.DB.prepare(`UPDATE operational_alerts SET state='accepted', accepted_at=?, lease_until=0, last_error=NULL
        WHERE id=? AND state='sending' AND lease_until=? AND attempts=?`).bind(clock(), id, leaseUntil, row.attempts).run();
      console.log(JSON.stringify({ code: "operations_receiver.email_transport_accepted", alertId: id }));
    } catch {
      await env.DB.prepare(`UPDATE operational_alerts SET state=?, next_attempt_at=?, lease_until=0, last_error=?
        WHERE id=? AND state='sending' AND lease_until=? AND attempts=?`)
        .bind(row.attempts >= MAX_ATTEMPTS ? "failed" : "pending", Math.max(clock() + Math.min(3_600_000, 120_000 * 2 ** (row.attempts - 1)), timedOut ? leaseUntil : 0), timedOut ? "email_outcome_unknown" : "email_send_failed", id, leaseUntil, row.attempts).run();
      console.error(JSON.stringify({ code: "operations_receiver.email_send_failed", alertId: id, attempt: row.attempts }));
    } finally { clearTimeout(timer); }
  }
  // A crashed final attempt must become visible as failed after its lease expires.
  await env.DB.prepare("UPDATE operational_alerts SET state='failed', last_error='delivery_lease_expired' WHERE state='sending' AND attempts >= ? AND lease_until <= ?").bind(MAX_ATTEMPTS, clock()).run();
  // Retire only completed notification metadata; pending/failed evidence is preserved.
  await env.DB.prepare("DELETE FROM operational_alerts WHERE id IN (SELECT id FROM operational_alerts WHERE state='accepted' AND received_at < ? LIMIT 100)").bind(clock() - 30 * 86_400_000).run();
}

export async function receiverHealth(env, now = Date.now()) {
  if (!configured(env)) return reply(503, { ok: false });
  try {
    const failures = await env.DB.prepare("SELECT COUNT(*) AS count FROM operational_alerts WHERE state='failed' OR (state IN ('pending','sending') AND received_at < ?)").bind(now - 15 * 60_000).first();
    return reply(failures.count ? 503 : 200, { ok: failures.count === 0 });
  } catch { return reply(503, { ok: false }); }
}
