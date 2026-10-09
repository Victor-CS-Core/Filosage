import "server-only";

import { createHash } from "node:crypto";
import {
  SPARK_BUDGET_MICROS,
  SPARK_PRICE_VERSION,
  sparkFeaturePolicy,
  sparkMaximumReservationMicros,
  sparkPrice,
  sparkRuntimeLimits,
} from "@/lib/spark/config";
import { sparkBudgetCategorySchema, type SparkBudgetCategory } from "@/lib/spark/contracts";
import { sparkD1, type SparkD1Database } from "@/lib/spark/d1";

export type SparkReservationStatus = "reserved" | "dispatched" | "committed" | "unknown" | "released";

export interface SparkBudgetReservation {
  requestId: string;
  monthKey: string;
  category: SparkBudgetCategory;
  sessionId: string | null;
  reservedMicros: number;
  status: SparkReservationStatus;
  model: string;
  priceVersion: string;
  recovered: boolean;
}

export class SparkBudgetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 409 | 429 | 503 = 503,
  ) {
    super(message);
  }
}

function monthKey(now: Date) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function database() {
  try {
    return await sparkD1();
  } catch {
    throw new SparkBudgetError(
      "SPARK_BUDGET_UNAVAILABLE",
      "Spark live tutoring is unavailable until its budget ledger is configured.",
    );
  }
}

function budgetError(error: unknown): SparkBudgetError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("SPARK_CATEGORY_LIMIT")) {
    return new SparkBudgetError("budget_limited", "This Spark activity category has reached its monthly limit.", 429);
  }
  if (message.includes("SPARK_AI_LIMIT") || message.includes("SPARK_BUDGET_UNAVAILABLE")) {
    return new SparkBudgetError("budget_limited", "Spark live tutoring is paused. Your saved lessons and practice are available.");
  }
  if (message.includes("SPARK_SESSION_BUSY")) {
    return new SparkBudgetError("SPARK_SESSION_BUSY", "Wait for the current Spark response before sending another.", 409);
  }
  if (message.includes("SPARK_CONCURRENCY_LIMIT")) {
    return new SparkBudgetError("SPARK_CAPACITY_BUSY", "Spark is at its current live capacity. Try again shortly.", 429);
  }
  if (message.includes("SPARK_INVALID_TRANSITION") || message.includes("SPARK_RESERVATION_IMMUTABLE")) {
    return new SparkBudgetError("SPARK_RECONCILIATION_REQUIRED", "Spark usage requires operator reconciliation.", 409);
  }
  return error instanceof SparkBudgetError
    ? error
    : new SparkBudgetError("SPARK_BUDGET_UNAVAILABLE", "Spark budget admission is unavailable.");
}

async function ensureMonth(db: SparkD1Database, key: string, now: string) {
  const statements = [db.prepare(
    `INSERT OR IGNORE INTO spark_month_budget (
      month_key, configuration_version, total_cap_microusd, fixed_reserve_microusd,
      ai_cap_microusd, infrastructure_reserve_microusd, uncertainty_reserve_microusd,
      mode, live_ai_enabled, preparation_enabled, concurrency_limit, created_at, updated_at
    ) VALUES (?, 1, ?, ?, ?, ?, ?, 'practice_only', 0, 0, ?, ?, ?)`,
  ).bind(
    key,
    SPARK_BUDGET_MICROS.total,
    SPARK_BUDGET_MICROS.fixed,
    SPARK_BUDGET_MICROS.ai,
    SPARK_BUDGET_MICROS.infrastructure,
    SPARK_BUDGET_MICROS.uncertainty,
    sparkRuntimeLimits().globalConcurrency,
    now,
    now,
  )];
  for (const [category, cap] of Object.entries(SPARK_BUDGET_MICROS.categories)) {
    statements.push(db.prepare(
      `INSERT OR IGNORE INTO spark_budget_category
        (month_key, category, cap_microusd, committed_microusd, reserved_microusd, unknown_microusd, updated_at)
       VALUES (?, ?, ?, 0, 0, 0, ?)`,
    ).bind(key, category, cap, now));
  }
  await db.batch(statements);
}

interface ReservationRow {
  request_id: string;
  month_key: string;
  category: SparkBudgetCategory;
  session_id: string | null;
  reserved_microusd: number;
  status: SparkReservationStatus;
  model: string;
  price_version: string;
  payload_hash: string;
  owner_pseudonym: string;
}

function reservationFromRow(row: ReservationRow, recovered: boolean): SparkBudgetReservation {
  return {
    requestId: row.request_id,
    monthKey: row.month_key,
    category: row.category,
    sessionId: row.session_id,
    reservedMicros: row.reserved_microusd,
    status: row.status,
    model: row.model,
    priceVersion: row.price_version,
    recovered,
  };
}

function matchesReservation(
  row: ReservationRow,
  ownerPseudonym: string,
  payloadHash: string,
  category: SparkBudgetCategory,
  sessionId: string | null,
) {
  return row.owner_pseudonym === ownerPseudonym
    && row.payload_hash === payloadHash
    && row.category === category
    && row.session_id === sessionId;
}

async function readReservation(db: SparkD1Database, requestId: string) {
  return db.prepare("SELECT * FROM spark_usage_reservation WHERE request_id = ?")
    .bind(requestId).first<ReservationRow>();
}

export async function reserveSparkBudget(input: {
  requestId: string;
  attemptNumber?: number;
  category: SparkBudgetCategory;
  uid: string;
  sessionId?: string;
  payloadFingerprint: string;
  now?: Date;
}) {
  if (!sparkFeaturePolicy().liveAiEnabled) {
    throw new SparkBudgetError("SPARK_LIVE_AI_DISABLED", "Spark live tutoring is not enabled.");
  }
  const parsedCategory = sparkBudgetCategorySchema.parse(input.category);
  const db = await database();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const key = monthKey(now);
  const price = sparkPrice(now);
  const ownerPseudonym = sha256(input.uid);
  const payloadHash = sha256(input.payloadFingerprint);
  const sessionId = input.sessionId ?? null;
  const existing = await readReservation(db, input.requestId);
  if (existing) {
    if (!matchesReservation(existing, ownerPseudonym, payloadHash, parsedCategory, sessionId)) {
      throw new SparkBudgetError("IDEMPOTENCY_CONFLICT", "This Spark request ID belongs to a different request.", 409);
    }
    return reservationFromRow(existing, true);
  }
  await ensureMonth(db, key, nowIso);
  try {
    await db.prepare(
      `INSERT INTO spark_usage_reservation (
        request_id, attempt_number, month_key, category, owner_pseudonym, session_id,
        payload_hash, provider, model, price_version, reserved_microusd, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`,
    ).bind(
      input.requestId,
      input.attemptNumber ?? 1,
      key,
      parsedCategory,
      ownerPseudonym,
      sessionId,
      payloadHash,
      price.provider,
      price.model,
      price.version,
      sparkMaximumReservationMicros(price),
      nowIso,
      nowIso,
    ).run();
  } catch (error) {
    const raced = await readReservation(db, input.requestId);
    if (raced && matchesReservation(raced, ownerPseudonym, payloadHash, parsedCategory, sessionId)) {
      return reservationFromRow(raced, true);
    }
    throw budgetError(error);
  }
  const created = await readReservation(db, input.requestId);
  if (!created) {
    throw new SparkBudgetError("SPARK_BUDGET_UNAVAILABLE", "Spark could not confirm its usage reservation.");
  }
  return reservationFromRow(created, false);
}

async function transition(
  requestId: string,
  sql: string,
  values: unknown[],
  expected: SparkReservationStatus,
) {
  const db = await database();
  try {
    const result = await db.prepare(sql).bind(...values).run();
    if ((result.meta?.changes ?? 0) !== 1) {
      const current = await readReservation(db, requestId);
      if (current?.status === expected) return reservationFromRow(current, true);
      throw new SparkBudgetError("SPARK_RECONCILIATION_REQUIRED", "Spark usage requires operator reconciliation.", 409);
    }
    const current = await readReservation(db, requestId);
    if (!current) {
      throw new SparkBudgetError("SPARK_RECONCILIATION_REQUIRED", "Spark usage record disappeared during settlement.", 409);
    }
    return reservationFromRow(current, false);
  } catch (error) {
    throw budgetError(error);
  }
}

export function markSparkBudgetDispatched(requestId: string, now = new Date()) {
  const timestamp = now.toISOString();
  return transition(
    requestId,
    "UPDATE spark_usage_reservation SET status = 'dispatched', dispatched_at = ?, updated_at = ? WHERE request_id = ? AND status = 'reserved'",
    [timestamp, timestamp, requestId],
    "dispatched",
  );
}

export function settleSparkBudgetObserved(input: {
  requestId: string;
  actualMicros: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  responseId?: string;
  now?: Date;
}) {
  for (const value of [input.actualMicros, input.inputTokens, input.cachedInputTokens, input.outputTokens]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SparkBudgetError("SPARK_RECONCILIATION_REQUIRED", "Spark usage evidence is invalid.", 409);
    }
  }
  if (input.cachedInputTokens > input.inputTokens) {
    throw new SparkBudgetError("SPARK_RECONCILIATION_REQUIRED", "Cached input exceeds observed input usage.", 409);
  }
  const timestamp = (input.now ?? new Date()).toISOString();
  return transition(
    input.requestId,
    `UPDATE spark_usage_reservation SET status = 'committed', actual_microusd = ?, input_tokens = ?,
      cached_input_tokens = ?, output_tokens = ?, response_id = ?, settled_at = ?, updated_at = ?
     WHERE request_id = ? AND status IN ('dispatched', 'unknown')`,
    [input.actualMicros, input.inputTokens, input.cachedInputTokens, input.outputTokens, input.responseId ?? null, timestamp, timestamp, input.requestId],
    "committed",
  );
}

export function markSparkBudgetUnknown(requestId: string, now = new Date()) {
  const timestamp = now.toISOString();
  return transition(
    requestId,
    "UPDATE spark_usage_reservation SET status = 'unknown', settled_at = ?, updated_at = ? WHERE request_id = ? AND status = 'dispatched'",
    [timestamp, timestamp, requestId],
    "unknown",
  );
}

export function releaseUndispatchedSparkBudget(requestId: string, now = new Date()) {
  const timestamp = now.toISOString();
  return transition(
    requestId,
    "UPDATE spark_usage_reservation SET status = 'released', settled_at = ?, updated_at = ? WHERE request_id = ? AND status = 'reserved'",
    [timestamp, timestamp, requestId],
    "released",
  );
}

export async function readSparkBudgetState(now = new Date()) {
  const db = await database();
  const key = monthKey(now);
  await ensureMonth(db, key, now.toISOString());
  const month = await db.prepare("SELECT * FROM spark_month_budget WHERE month_key = ?")
    .bind(key).first<Record<string, unknown>>();
  const categories = await db.prepare("SELECT * FROM spark_budget_category WHERE month_key = ? ORDER BY category")
    .bind(key).all<Record<string, unknown>>();
  const usage = await db.prepare(
    "SELECT request_id, category, owner_pseudonym, model, status, reserved_microusd, actual_microusd, input_tokens, cached_input_tokens, output_tokens, created_at, updated_at FROM spark_usage_reservation WHERE month_key = ? ORDER BY created_at DESC LIMIT 100",
  ).bind(key).all<Record<string, unknown>>();
  return { month, categories: categories.results, usage: usage.results, priceVersion: SPARK_PRICE_VERSION };
}

export async function sparkPreparationAdmissionEnabled(now = new Date()) {
  return (await readSparkOperationalControl(now)).preparationEnabled;
}

export async function readSparkOperationalControl(now = new Date()) {
  const db = await database();
  const key = monthKey(now);
  await ensureMonth(db, key, now.toISOString());
  const row = await db.prepare("SELECT mode, live_ai_enabled, preparation_enabled FROM spark_month_budget WHERE month_key = ?")
    .bind(key).first<{ mode: "live" | "conserve" | "practice_only" | "halted"; live_ai_enabled: number; preparation_enabled: number }>();
  const admitsAi = row?.mode === "live" || row?.mode === "conserve";
  return {
    mode: row?.mode ?? "halted",
    liveAiEnabled: admitsAi && row?.live_ai_enabled === 1,
    preparationEnabled: row?.preparation_enabled === 1,
  } as const;
}

export async function configureSparkBudget(input: {
  actorUid: string;
  mode: "live" | "conserve" | "practice_only" | "halted";
  liveAiEnabled: boolean;
  preparationEnabled: boolean;
  concurrencyLimit: number;
  aiCapMicros: number;
  categoryCaps: Record<SparkBudgetCategory, number>;
  reason: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const db = await database();
  const key = monthKey(now);
  await ensureMonth(db, key, timestamp);
  if (!Number.isSafeInteger(input.concurrencyLimit) || input.concurrencyLimit < 1 || input.concurrencyLimit > 16
    || !Number.isSafeInteger(input.aiCapMicros) || input.aiCapMicros < 0 || input.aiCapMicros > SPARK_BUDGET_MICROS.ai
    || input.reason.trim().length < 8 || input.reason.trim().length > 500) {
    throw new SparkBudgetError("SPARK_BUDGET_CONFIGURATION_INVALID", "The Spark budget configuration is invalid.", 409);
  }
  const caps = Object.entries(input.categoryCaps);
  if (caps.length !== 5 || caps.some(([category, cap]) => !sparkBudgetCategorySchema.safeParse(category).success
    || !Number.isSafeInteger(cap) || cap < 0) || caps.reduce((sum, [, cap]) => sum + cap, 0) > input.aiCapMicros) {
    throw new SparkBudgetError("SPARK_BUDGET_CONFIGURATION_INVALID", "Spark category caps must fit inside the AI envelope.", 409);
  }
  const before = await readSparkBudgetState(now);
  const after = {
    monthKey: key,
    mode: input.mode,
    liveAiEnabled: input.liveAiEnabled,
    preparationEnabled: input.preparationEnabled,
    concurrencyLimit: input.concurrencyLimit,
    aiCapMicros: input.aiCapMicros,
    categoryCaps: input.categoryCaps,
  };
  const auditId = `audit-${sha256(`${input.actorUid}:${timestamp}:${JSON.stringify(after)}`).slice(0, 32)}`;
  try {
    await db.batch([
      db.prepare(`UPDATE spark_month_budget
        SET mode = ?, live_ai_enabled = ?, preparation_enabled = ?, concurrency_limit = ?, ai_cap_microusd = ?, configuration_version = configuration_version + 1, updated_at = ?
        WHERE month_key = ?`).bind(input.mode, input.liveAiEnabled ? 1 : 0, input.preparationEnabled ? 1 : 0, input.concurrencyLimit, input.aiCapMicros, timestamp, key),
      ...caps.map(([category, cap]) => db.prepare(
        "UPDATE spark_budget_category SET cap_microusd = ?, updated_at = ? WHERE month_key = ? AND category = ?",
      ).bind(cap, timestamp, key, category)),
      db.prepare(`INSERT INTO spark_budget_audit
        (id, month_key, actor_pseudonym, before_json, after_json, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        auditId,
        key,
        sha256(input.actorUid),
        JSON.stringify(before),
        JSON.stringify(after),
        input.reason.trim(),
        timestamp,
      ),
    ]);
  } catch (error) {
    throw budgetError(error);
  }
  return readSparkBudgetState(now);
}

export function sparkBudgetErrorResponse(error: unknown) {
  if (!(error instanceof SparkBudgetError)) return null;
  return Response.json(
    { error: error.message, code: error.code, availability: "practice_only" },
    { status: error.status, headers: { "Cache-Control": "private, no-store" } },
  );
}