import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const migration = readFileSync(resolve("infra/cloudflare/d1/002_spark_budget.sql"), "utf8");

function ledger(aiCap = 10_000, tutoringCap = 10_000, concurrency = 4) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(migration);
  const now = "2026-10-09T00:00:00.000Z";
  database.prepare(`INSERT INTO spark_month_budget (
    month_key, configuration_version, total_cap_microusd, fixed_reserve_microusd,
    ai_cap_microusd, infrastructure_reserve_microusd, uncertainty_reserve_microusd,
    mode, live_ai_enabled, preparation_enabled, concurrency_limit, created_at, updated_at
  ) VALUES ('2026-10', 1, 30000000, 5000000, ?, 3000000, 5000000, 'live', 1, 1, ?, ?, ?)`)
    .run(aiCap, concurrency, now, now);
  for (const [category, cap] of Object.entries({ tutoring: tutoringCap, preparation: 0, assessment: 0, summary: 0, embedding: 0 })) {
    database.prepare(`INSERT INTO spark_budget_category
      (month_key, category, cap_microusd, committed_microusd, reserved_microusd, unknown_microusd, updated_at)
      VALUES ('2026-10', ?, ?, 0, 0, 0, ?)`)
      .run(category, cap, now);
  }
  return database;
}

test("new budget rows fail closed until an operator enables them", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(migration);
  database.prepare(`INSERT INTO spark_month_budget (
    month_key, total_cap_microusd, fixed_reserve_microusd, ai_cap_microusd,
    infrastructure_reserve_microusd, uncertainty_reserve_microusd, created_at, updated_at
  ) VALUES ('2026-10', 30000000, 5000000, 17000000, 3000000, 5000000, ?, ?)`)
    .run("2026-10-09T00:00:00.000Z", "2026-10-09T00:00:00.000Z");
  const control = database.prepare("SELECT mode, live_ai_enabled, preparation_enabled FROM spark_month_budget").get();
  assert.equal(control?.mode, "practice_only");
  assert.equal(control?.live_ai_enabled, 0);
  assert.equal(control?.preparation_enabled, 0);
});

function reserve(database: DatabaseSync, index: number, sessionId: string | null = null, amount = 3_040) {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  database.prepare(`INSERT INTO spark_usage_reservation (
    request_id, attempt_number, month_key, category, owner_pseudonym, session_id,
    payload_hash, provider, model, price_version, reserved_microusd, status, created_at, updated_at
  ) VALUES (?, 1, '2026-10', 'tutoring', 'owner', ?, ?, 'openai', 'gpt-4.1-mini-2025-04-14', 'price-v1', ?, 'reserved', ?, ?)`)
    .run(id, sessionId, `payload-${index}`, amount, "2026-10-09T00:00:00.000Z", "2026-10-09T00:00:00.000Z");
  return id;
}

test("one cent remaining cannot admit one hundred reservations above one cent", async () => {
  const database = ledger();
  const results = await Promise.allSettled(Array.from({ length: 100 }, (_, index) => Promise.resolve().then(() => reserve(database, index))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 3);
  const budget = database.prepare("SELECT reserved_microusd, committed_microusd, unknown_microusd FROM spark_month_budget").get() as Record<string, number>;
  assert.equal(budget.reserved_microusd, 9_120);
  assert.ok(budget.reserved_microusd + budget.committed_microusd + budget.unknown_microusd <= 10_000);
  assert.equal(database.prepare("SELECT count(*) AS total FROM spark_usage_reservation WHERE status = 'dispatched'").get()?.total, 0);
});

test("unknown outcomes retain the full reservation until evidence settles them", () => {
  const database = ledger(20_000, 20_000);
  const requestId = reserve(database, 1);
  database.prepare("UPDATE spark_usage_reservation SET status = 'dispatched', dispatched_at = ?, updated_at = ? WHERE request_id = ?")
    .run("2026-10-09T00:01:00.000Z", "2026-10-09T00:01:00.000Z", requestId);
  database.prepare("UPDATE spark_usage_reservation SET status = 'unknown', settled_at = ?, updated_at = ? WHERE request_id = ?")
    .run("2026-10-09T00:02:00.000Z", "2026-10-09T00:02:00.000Z", requestId);
  const unknown = database.prepare("SELECT reserved_microusd, unknown_microusd FROM spark_month_budget").get() as Record<string, number>;
  assert.equal(unknown.reserved_microusd, 0);
  assert.equal(unknown.unknown_microusd, 3_040);
  assert.throws(() => database.prepare("UPDATE spark_usage_reservation SET status = 'released', settled_at = ?, updated_at = ? WHERE request_id = ?")
    .run("2026-10-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z", requestId), /SPARK_INVALID_TRANSITION/);
  database.prepare(`UPDATE spark_usage_reservation SET status = 'committed', actual_microusd = 2000,
    input_tokens = 1000, cached_input_tokens = 0, output_tokens = 100, settled_at = ?, updated_at = ? WHERE request_id = ?`)
    .run("2026-10-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z", requestId);
  const settled = database.prepare("SELECT committed_microusd, reserved_microusd, unknown_microusd FROM spark_month_budget").get() as Record<string, number>;
  assert.equal(settled.committed_microusd, 2_000);
  assert.equal(settled.reserved_microusd, 0);
  assert.equal(settled.unknown_microusd, 0);
});

test("dispatch enforces global concurrency and one in-flight request per session", () => {
  const database = ledger(100_000, 100_000, 2);
  const first = reserve(database, 1, "session-1");
  assert.throws(() => reserve(database, 2, "session-1"), /SPARK_SESSION_BUSY/);
  const second = reserve(database, 3, "session-2");
  const third = reserve(database, 4, "session-3");
  for (const requestId of [first, second]) {
    database.prepare("UPDATE spark_usage_reservation SET status = 'dispatched', dispatched_at = ?, updated_at = ? WHERE request_id = ?")
      .run("2026-10-09T00:01:00.000Z", "2026-10-09T00:01:00.000Z", requestId);
  }
  assert.throws(() => database.prepare("UPDATE spark_usage_reservation SET status = 'dispatched', dispatched_at = ?, updated_at = ? WHERE request_id = ?")
    .run("2026-10-09T00:01:00.000Z", "2026-10-09T00:01:00.000Z", third), /SPARK_CONCURRENCY_LIMIT/);
});

test("a provider overrun is recorded and halts further admission", () => {
  const database = ledger(100_000, 100_000);
  const requestId = reserve(database, 1);
  database.prepare("UPDATE spark_usage_reservation SET status = 'dispatched', dispatched_at = ?, updated_at = ? WHERE request_id = ?")
    .run("2026-10-09T00:01:00.000Z", "2026-10-09T00:01:00.000Z", requestId);
  database.prepare(`UPDATE spark_usage_reservation SET status = 'committed', actual_microusd = 4000,
    input_tokens = 4000, cached_input_tokens = 0, output_tokens = 900, settled_at = ?, updated_at = ? WHERE request_id = ?`)
    .run("2026-10-09T00:02:00.000Z", "2026-10-09T00:02:00.000Z", requestId);
  assert.equal(database.prepare("SELECT mode FROM spark_month_budget").get()?.mode, "halted");
  assert.throws(() => reserve(database, 2), /SPARK_BUDGET_UNAVAILABLE/);
});

test("operator live-AI kill switch prevents reservation before dispatch", () => {
  const database = ledger(100_000, 100_000);
  database.prepare("UPDATE spark_month_budget SET live_ai_enabled = 0").run();
  assert.throws(() => reserve(database, 1), /SPARK_BUDGET_UNAVAILABLE/);
  assert.equal(database.prepare("SELECT count(*) AS total FROM spark_usage_reservation").get()?.total, 0);
});