import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { receiveAlert, dispatchPending, receiverHealth } from "../../infra/cloudflare/operations/receiver.mjs";

const secret = "test-only-operations-signing-key-01234567890123456789";
const timestamp = Date.parse("2026-10-21T18:00:00Z");
const envelope = () => ({ schemaVersion: 1, id: "fa_" + "a".repeat(32), service: "filosage", environment: "production", version: "b".repeat(40), occurredAt: new Date(timestamp).toISOString(), severity: "critical", code: "health.datastore_unavailable", message: "Private diagnostic omitted from notifications", context: { private: "not retained" } });
async function request(value = envelope(), overrides = {}) {
  const body = JSON.stringify(value);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
  return new Request("https://receiver.example/alerts", { method: "POST", headers: { "Content-Type": "application/json", "X-Filosage-Signature-Version": "v1", "X-Filosage-Signature": signature, "X-Filosage-Alert-Id": value.id, "Idempotency-Key": value.id, "X-Filosage-Alert-Timestamp": value.occurredAt, ...overrides }, body });
}
function fixture(t) {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../../infra/cloudflare/operations/schema.sql", import.meta.url), "utf8"));
  t.after(() => sql.close());
  const DB = { prepare(query) {
    let values = [];
    return { bind(...args) { values = args; return this; }, async first() { return sql.prepare(query).get(...values) ?? null; }, async all() { return { results: sql.prepare(query).all(...values) }; }, async run() { const info = sql.prepare(query).run(...values); return { success: true, meta: { changes: Number(info.changes) } }; } };
  } };
  return { sql, env: { DB, ALERT_SIGNING_SECRET: secret, ALERT_TO: "recipient@example.com", ALERT_FROM: "operations@alerts.filosage.com", EMAIL: { send() {} } } };
}

test("signed acceptance persists only bounded operational metadata before acknowledgement", async (t) => {
  const { sql, env } = fixture(t);
  const response = await receiveAlert(await request(), env, timestamp);
  assert.equal(response.status, 202);
  const row = sql.prepare("SELECT * FROM operational_alerts").get();
  assert.equal(row.state, "pending");
  assert.equal(row.code, envelope().code);
  assert.ok(!JSON.stringify(row).includes("Private diagnostic"));
  assert.ok(!JSON.stringify(row).includes("not retained"));
});
test("invalid signatures and replay timestamps never write", async (t) => {
  const { sql, env } = fixture(t);
  assert.equal((await receiveAlert(await request(envelope(), { "X-Filosage-Signature": "0".repeat(64) }), env, timestamp)).status, 401);
  assert.equal((await receiveAlert(await request(), env, timestamp + 301_000)).status, 401);
  assert.equal((await receiveAlert(await request(), env, timestamp - 31_000)).status, 401);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM operational_alerts").get().n, 0);
});
test("identity headers, schema and bounded body are enforced", async (t) => {
  const { env } = fixture(t);
  assert.equal((await receiveAlert(await request(envelope(), { "Idempotency-Key": "different" }), env, timestamp)).status, 400);
  assert.equal((await receiveAlert(await request({ ...envelope(), severity: "unknown" }), env, timestamp)).status, 400);
  assert.equal((await receiveAlert(await request({ ...envelope(), message: "x".repeat(20_000) }), env, timestamp)).status, 413);
  const chunks = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9000)); controller.enqueue(new Uint8Array(9000)); controller.close(); } });
  assert.equal((await receiveAlert(new Request("https://receiver.example/alerts", { method: "POST", body: chunks, duplex: "half", headers: { "Content-Type": "application/json" } }), env, timestamp)).status, 413);
});
test("durable duplicates are acknowledged; changed bodies with the same id conflict", async (t) => {
  const { sql, env } = fixture(t);
  assert.equal((await receiveAlert(await request(), env, timestamp)).status, 202);
  assert.equal((await receiveAlert(await request(), env, timestamp)).status, 200);
  assert.equal((await receiveAlert(await request({ ...envelope(), code: "different.code" }), env, timestamp)).status, 409);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM operational_alerts").get().n, 1);
});
test("a failed database never yields successful acceptance", async (t) => {
  const { env } = fixture(t);
  env.DB = { prepare() { throw new Error("sensitive internal failure"); } };
  const r = await receiveAlert(await request(), env, timestamp);
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes("sensitive"));
});
test("delivery leases prevent concurrent duplicate sends and completed notifications are not resent", async (t) => {
  const { sql, env } = fixture(t);
  await receiveAlert(await request(), env, timestamp);
  const sent = [];
  const send = async (row) => { sent.push(row); await new Promise(resolve => setTimeout(resolve, 5)); };
  await Promise.all([dispatchPending(env, send, () => timestamp), dispatchPending(env, send, () => timestamp)]);
  await dispatchPending(env, send, () => timestamp + 60_000);
  assert.equal(sent.length, 1);
  assert.equal(sql.prepare("SELECT state FROM operational_alerts").get().state, "accepted");
});
test("notification failures persist retry state and recover without losing accepted alerts", async (t) => {
  const { sql, env } = fixture(t);
  await receiveAlert(await request(), env, timestamp);
  await dispatchPending(env, async () => { throw new Error("do not expose this private provider response"); }, () => timestamp);
  const pending = sql.prepare("SELECT * FROM operational_alerts").get();
  assert.equal(pending.state, "pending");
  assert.equal(pending.last_error, "email_send_failed");
  let count = 0;
  await dispatchPending(env, async () => { count++; }, () => timestamp + 1000);
  assert.equal(count, 0);
  await dispatchPending(env, async () => { count++; }, () => timestamp + 121_000);
  assert.equal(count, 1);
  assert.equal(sql.prepare("SELECT state FROM operational_alerts").get().state, "accepted");
});
test("expired delivery leases recover, bounded attempts dead-letter and health detects failed delivery", async (t) => {
  const { sql, env } = fixture(t);
  await receiveAlert(await request(), env, timestamp);
  sql.prepare("UPDATE operational_alerts SET state='sending', lease_until=?, attempts=7").run(timestamp - 1);
  await dispatchPending(env, async () => { throw new Error("failure"); }, () => timestamp);
  assert.equal(sql.prepare("SELECT state FROM operational_alerts").get().state, "failed");
  assert.equal((await receiverHealth(env, timestamp)).status, 503);
});
test("receiver readiness fails closed for incomplete configuration or inaccessible storage", async (t) => {
  const { env } = fixture(t);
  assert.equal((await receiverHealth(env, timestamp)).status, 200);
  assert.equal((await receiverHealth({ ...env, ALERT_SIGNING_SECRET: "short" }, timestamp)).status, 503);
  assert.equal((await receiverHealth({ ...env, DB: null }, timestamp)).status, 503);
});

test("separately generated sender envelopes deduplicate despite fresh timestamps", async (t) => {
  const { createOperationalAlertEnvelope } = await import("../../src/lib/operational-alert-core.ts");
  const { sql, env } = fixture(t);
  const event = { severity: "critical", code: "health.datastore_unavailable", message: "Storage unavailable", context: { component: "d1" } };
  const first = await createOperationalAlertEnvelope(event, { name: "production", version: "b".repeat(40) }, new Date(timestamp));
  const repeated = await createOperationalAlertEnvelope(event, { name: "production", version: "b".repeat(40) }, new Date(timestamp + 1000));
  assert.equal(first.id, repeated.id);
  assert.equal((await receiveAlert(await request(first), env, timestamp)).status, 202);
  assert.equal((await receiveAlert(await request(repeated), env, timestamp + 1000)).status, 200);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM operational_alerts").get().n, 1);
});

test("each lease and retry delay starts at the actual claim or failure time", async (t) => {
  const { sql, env } = fixture(t);
  await receiveAlert(await request(), env, timestamp);
  await receiveAlert(await request({ ...envelope(), id: "fa_" + "c".repeat(32) }), env, timestamp);
  let now = timestamp;
  let concurrentCount = 0;
  let count = 0;
  await dispatchPending(env, async () => {
    count++;
    if (count === 1) { now += 360_000; return; }
    await dispatchPending(env, async () => { concurrentCount++; }, () => now);
    now += 30_000;
    throw new Error("temporary failure");
  }, () => now);
  assert.equal(concurrentCount, 0);
  const pending = sql.prepare("SELECT * FROM operational_alerts WHERE state='pending'").get();
  assert.equal(pending.next_attempt_at, now + 120_000);
});

test("a hung email call leaves durable unknown-outcome retry state until its lease expires", async (t) => {
  const { sql, env } = fixture(t);
  await receiveAlert(await request(), env, timestamp);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const dispatch = dispatchPending(env, () => new Promise(() => {}), () => timestamp);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(60_001);
  await dispatch;
  const row = sql.prepare("SELECT * FROM operational_alerts").get();
  assert.equal(row.last_error, "email_outcome_unknown");
  assert.equal(row.next_attempt_at, timestamp + 300_000);
});
