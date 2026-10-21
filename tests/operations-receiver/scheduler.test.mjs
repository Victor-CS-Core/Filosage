import assert from "node:assert/strict";
import { test } from "node:test";
import { armRetryAlarm, runRetryAlarm, scheduleAcceptance } from "../../infra/cloudflare/operations/scheduler.mjs";

test("alarm scheduling never postpones an existing earlier wakeup", async () => {
  let alarm = 1000;
  const storage = { async getAlarm() { return alarm; }, async setAlarm(value) { alarm = value; } };
  await armRetryAlarm(storage, 500);
  assert.equal(alarm, 1000);
  alarm = null;
  await armRetryAlarm(storage, 500);
  assert.equal(alarm, 120500);
});
test("the next durable alarm is persisted before retry work, including failures", async () => {
  const order = [];
  const storage = { async setAlarm(value) { order.push(value); } };
  await assert.rejects(runRetryAlarm(storage, async () => { order.push("work"); throw new Error("temporary outage"); }, 500));
  assert.deepEqual(order, [120500, "work"]);
});
test("acceptance is refused until durable retry scheduling succeeds", async () => {
  const accepted = () => Response.json({ accepted: true }, { status: 202 });
  assert.equal((await scheduleAcceptance(accepted(), { async ensureAlarm() { throw new Error("private scheduling failure"); } })).status, 503);
  assert.equal((await scheduleAcceptance(accepted(), { async ensureAlarm() {} })).status, 202);
  let called = false;
  assert.equal((await scheduleAcceptance(new Response(null, { status: 401 }), { async ensureAlarm() { called = true; } })).status, 401);
  assert.equal(called, false);
});
