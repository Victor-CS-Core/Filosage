import "server-only";

import type { AiQuotaSummary } from "@/lib/course-types";
import type { ServerAccount } from "@/lib/account-server";
import {
  getStoredDocument,
  runStoredDocumentTransaction,
} from "@/lib/firebase-server";

export type AiFeature = "course_outline" | "lesson_generation" | "tutor";

interface AiPolicy {
  limit: number | null;
  periodKey: string;
  resetAt: string;
  maxPerMinute: number;
  reserveCostMicros: number;
  lockMs: number;
}

export interface AiReservation {
  uid: string;
  feature: AiFeature;
  requestId: string;
  periodPath: string;
  globalPath: string;
  requestPath: string;
  reserveCostMicros: number;
}

export class AiQuotaError extends Error {
  constructor(
    public readonly status: 409 | 429 | 503,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function monthWindow(now: Date) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    resetAt: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

function dayWindow(now: Date) {
  return {
    key: now.toISOString().slice(0, 10),
    resetAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(),
  };
}

function policyFor(account: ServerAccount, feature: AiFeature, now = new Date()): AiPolicy {
  const monthly = monthWindow(now);
  if (account.isOwner) {
    return {
      limit: null,
      periodKey: monthly.key,
      resetAt: monthly.resetAt,
      maxPerMinute: 20,
      reserveCostMicros: feature === "tutor" ? 50_000 : 350_000,
      lockMs: feature === "tutor" ? 45_000 : 180_000,
    };
  }

  if (feature === "tutor" && account.plan === "free") {
    const daily = dayWindow(now);
    return {
      limit: 3,
      periodKey: daily.key,
      resetAt: daily.resetAt,
      maxPerMinute: 2,
      reserveCostMicros: 50_000,
      lockMs: 45_000,
    };
  }

  const limits: Record<AiFeature, number> = {
    course_outline: account.plan === "pro" ? 3 : 0,
    lesson_generation: account.plan === "pro" ? 30 : 0,
    tutor: account.plan === "pro" ? 100 : 0,
  };
  return {
    limit: limits[feature],
    periodKey: monthly.key,
    resetAt: monthly.resetAt,
    maxPerMinute: feature === "tutor" ? 6 : 2,
    reserveCostMicros: feature === "tutor" ? 50_000 : 350_000,
    lockMs: feature === "tutor" ? 45_000 : 180_000,
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function monthlyBudgetMicros() {
  const dollars = Number(process.env.OPENAI_MONTHLY_BUDGET_USD ?? "50");
  return Math.max(1, Number.isFinite(dollars) ? dollars : 50) * 1_000_000;
}

export async function reserveAiUsage(
  account: ServerAccount,
  feature: AiFeature,
  rawIdempotencyKey: string | null,
) {
  if (!rawIdempotencyKey || rawIdempotencyKey.length < 12 || rawIdempotencyKey.length > 200) {
    throw new AiQuotaError(409, "IDEMPOTENCY_KEY_REQUIRED", "Retry-safe generation could not be started. Please try again.");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const policy = policyFor(account, feature, now);
  if (policy.limit === 0) {
    throw new AiQuotaError(429, "PLAN_LIMIT", "Teach Pro is required for this AI feature.", {
      limit: 0,
      remaining: 0,
      resetAt: policy.resetAt,
    });
  }

  const requestId = await sha256(`${account.uid}:${feature}:${rawIdempotencyKey}`);
  const periodPath = `usagePeriods/${account.uid}__${feature}__${policy.periodKey}`;
  const requestPath = `aiRequests/${requestId}`;
  const globalPeriod = monthWindow(now);
  const globalPath = `systemUsage/${globalPeriod.key}`;
  const minuteKey = nowIso.slice(0, 16);

  await runStoredDocumentTransaction(
    [periodPath, requestPath, globalPath],
    (documents) => {
      const period = documents[periodPath];
      const previousRequest = documents[requestPath];
      const global = documents[globalPath];
      if (previousRequest) {
        throw new AiQuotaError(409, "DUPLICATE_REQUEST", "This request is already being processed.");
      }

      const used = numberValue(period?.requestCount);
      if (policy.limit !== null && used >= policy.limit) {
        throw new AiQuotaError(429, "QUOTA_EXHAUSTED", "Your AI allowance has been used for this period.", {
          limit: policy.limit,
          remaining: 0,
          resetAt: policy.resetAt,
        });
      }

      const minuteCount = period?.minuteKey === minuteKey ? numberValue(period?.minuteCount) : 0;
      if (minuteCount >= policy.maxPerMinute) {
        throw new AiQuotaError(429, "RATE_LIMITED", "Please wait a moment before starting another AI request.", {
          resetAt: new Date(now.getTime() + 60_000).toISOString(),
        });
      }

      const activeUntil = typeof period?.activeUntil === "string" ? Date.parse(period.activeUntil) : 0;
      if (activeUntil > now.getTime()) {
        throw new AiQuotaError(429, "GENERATION_IN_PROGRESS", "Another AI request is already in progress for this feature.", {
          resetAt: new Date(activeUntil).toISOString(),
        });
      }

      const globalActual = numberValue(global?.actualCostMicros);
      const globalReserved = numberValue(global?.reservedCostMicros);
      const projected = globalActual + globalReserved + policy.reserveCostMicros;
      const budget = monthlyBudgetMicros();
      if (!account.isOwner && projected >= budget) {
        throw new AiQuotaError(503, "GLOBAL_BUDGET_REACHED", "AI generation is paused until the monthly budget resets.", {
          resetAt: globalPeriod.resetAt,
        });
      }
      if (!account.isOwner && account.plan === "free" && projected >= budget * 0.85) {
        throw new AiQuotaError(503, "TRIAL_BUDGET_PAUSED", "Free tutor trials are paused while capacity is limited.", {
          resetAt: globalPeriod.resetAt,
        });
      }

      return {
        writes: [
          {
            path: periodPath,
            data: {
              ...(period ?? {}),
              uid: account.uid,
              feature,
              periodKey: policy.periodKey,
              requestCount: used + 1,
              minuteKey,
              minuteCount: minuteCount + 1,
              reservedCostMicros: numberValue(period?.reservedCostMicros) + policy.reserveCostMicros,
              inputTokens: numberValue(period?.inputTokens),
              outputTokens: numberValue(period?.outputTokens),
              actualCostMicros: numberValue(period?.actualCostMicros),
              activeRequestId: requestId,
              activeUntil: new Date(now.getTime() + policy.lockMs).toISOString(),
              resetAt: policy.resetAt,
              updatedAt: nowIso,
            },
          },
          {
            path: requestPath,
            data: {
              uid: account.uid,
              feature,
              status: "reserved",
              reservedCostMicros: policy.reserveCostMicros,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          },
          {
            path: globalPath,
            data: {
              ...(global ?? {}),
              periodKey: globalPeriod.key,
              reservedCostMicros: globalReserved + policy.reserveCostMicros,
              actualCostMicros: globalActual,
              updatedAt: nowIso,
            },
          },
        ],
        result: undefined,
      };
    },
  );

  return { uid: account.uid, feature, requestId, periodPath, requestPath, globalPath, reserveCostMicros: policy.reserveCostMicros } satisfies AiReservation;
}

export function extractOpenAiUsage(value: unknown) {
  const usage = value && typeof value === "object" && "usage" in value
    ? (value as { usage?: { input_tokens?: number; output_tokens?: number } }).usage
    : undefined;
  return {
    inputTokens: numberValue(usage?.input_tokens),
    outputTokens: numberValue(usage?.output_tokens),
  };
}

export async function finalizeAiUsage(
  reservation: AiReservation,
  result: { inputTokens?: number; outputTokens?: number; responseId?: string; failed?: boolean },
) {
  const nowIso = new Date().toISOString();
  const inputTokens = numberValue(result.inputTokens);
  const outputTokens = numberValue(result.outputTokens);
  const inputRate = Number(process.env.OPENAI_INPUT_COST_PER_MILLION ?? "5");
  const outputRate = Number(process.env.OPENAI_OUTPUT_COST_PER_MILLION ?? "30");
  const actualCostMicros = Math.max(0, Math.round(inputTokens * inputRate + outputTokens * outputRate));

  await runStoredDocumentTransaction(
    [reservation.periodPath, reservation.requestPath, reservation.globalPath],
    (documents) => {
      const period: Record<string, unknown> = documents[reservation.periodPath] ?? {};
      const request: Record<string, unknown> = documents[reservation.requestPath] ?? {};
      const global: Record<string, unknown> = documents[reservation.globalPath] ?? {};
      return {
        writes: [
          {
            path: reservation.periodPath,
            data: {
              ...period,
              reservedCostMicros: Math.max(0, numberValue(period.reservedCostMicros) - reservation.reserveCostMicros),
              inputTokens: numberValue(period.inputTokens) + inputTokens,
              outputTokens: numberValue(period.outputTokens) + outputTokens,
              actualCostMicros: numberValue(period.actualCostMicros) + actualCostMicros,
              activeRequestId: null,
              activeUntil: null,
              updatedAt: nowIso,
            },
          },
          {
            path: reservation.requestPath,
            data: {
              ...request,
              status: result.failed ? "failed" : "completed",
              inputTokens,
              outputTokens,
              actualCostMicros,
              responseId: result.responseId ?? null,
              updatedAt: nowIso,
            },
          },
          {
            path: reservation.globalPath,
            data: {
              ...global,
              reservedCostMicros: Math.max(0, numberValue(global.reservedCostMicros) - reservation.reserveCostMicros),
              actualCostMicros: numberValue(global.actualCostMicros) + actualCostMicros,
              updatedAt: nowIso,
            },
          },
        ],
        result: undefined,
      };
    },
  );
}

export async function getAiQuotaSummaries(account: ServerAccount): Promise<AiQuotaSummary[]> {
  const now = new Date();
  const features: AiFeature[] = ["course_outline", "lesson_generation", "tutor"];
  return Promise.all(features.map(async (feature) => {
    const policy = policyFor(account, feature, now);
    const path = `usagePeriods/${account.uid}__${feature}__${policy.periodKey}`;
    const period = await getStoredDocument(path);
    const used = numberValue(period?.requestCount);
    return {
      feature,
      limit: policy.limit,
      used,
      remaining: policy.limit === null ? null : Math.max(0, policy.limit - used),
      resetAt: policy.resetAt,
    };
  }));
}

export function aiQuotaResponse(error: unknown) {
  if (!(error instanceof AiQuotaError)) return null;
  return Response.json(
    { error: error.message, code: error.code, ...error.details },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}
