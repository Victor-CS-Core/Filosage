import "server-only";

import type { AiQuotaSummary } from "@/lib/course-types";
import type { ServerAccount } from "@/lib/account-server";
import {
  estimateAiUsageCostMicros,
  summarizeAiUsage,
  type AiUsageSample,
} from "@/lib/ai-pricing";
import {
  getStoredDocument,
  runStoredDocumentTransaction,
} from "@/lib/firebase-server";
import { serverEnvironment } from "@/lib/runtime-environment";

export type AiFeature = "course_outline" | "course_banner" | "lesson_generation" | "tutor";
export type AiBudgetPool = "free" | "paid" | "owner";

const BUDGET_SHARDS = 16;

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
  userBudgetPath: string;
  budgetPool: AiBudgetPool;
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

function policyFor(account: ServerAccount, feature: AiFeature, now = new Date()): AiPolicy {
  const monthly = monthWindow(now);
  const isBanner = feature === "course_banner";
  if (account.isOwner) {
    return {
      limit: null,
      periodKey: monthly.key,
      resetAt: monthly.resetAt,
      maxPerMinute: 20,
      reserveCostMicros: isBanner ? 20_000 : feature === "tutor" ? 50_000 : 350_000,
      lockMs: isBanner ? 90_000 : feature === "tutor" ? 45_000 : 180_000,
    };
  }

  if (feature === "tutor" && account.plan === "free") {
    return {
      limit: 5,
      periodKey: monthly.key,
      resetAt: monthly.resetAt,
      maxPerMinute: 2,
      reserveCostMicros: 50_000,
      lockMs: 45_000,
    };
  }

  const limits: Record<AiFeature, number> = {
    course_outline: account.plan === "pro" ? 3 : 0,
    course_banner: account.plan === "pro" ? 30 : 0,
    lesson_generation: account.plan === "pro" ? 30 : 0,
    tutor: account.plan === "pro" ? 100 : 0,
  };
  return {
    limit: limits[feature],
    periodKey: monthly.key,
    resetAt: monthly.resetAt,
    maxPerMinute: feature === "tutor" ? 6 : 2,
    reserveCostMicros: isBanner ? 20_000 : feature === "tutor" ? 50_000 : 350_000,
    lockMs: isBanner ? 90_000 : feature === "tutor" ? 45_000 : 180_000,
  };
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function openAiSafetyIdentifier(uid: string) {
  return `user_${(await sha256(uid)).slice(0, 48)}`;
}

function positiveDollars(value: string | undefined, fallback: number) {
  const dollars = Number(value ?? fallback);
  return Math.max(0.01, Number.isFinite(dollars) ? dollars : fallback);
}

export function aiBudgetLimitsUsd() {
  return {
    free: positiveDollars(serverEnvironment.OPENAI_FREE_MONTHLY_BUDGET_USD, 25),
    paid: positiveDollars(serverEnvironment.OPENAI_PAID_MONTHLY_BUDGET_USD, 500),
    owner: positiveDollars(
      serverEnvironment.OPENAI_OWNER_MONTHLY_BUDGET_USD ?? serverEnvironment.OPENAI_MONTHLY_BUDGET_USD,
      50,
    ),
  } satisfies Record<AiBudgetPool, number>;
}

function userBudgetLimitMicros(account: ServerAccount) {
  if (account.isOwner) {
    return positiveDollars(serverEnvironment.OPENAI_OWNER_USER_MONTHLY_BUDGET_USD, 50) * 1_000_000;
  }
  if (account.plan === "pro") {
    return positiveDollars(serverEnvironment.OPENAI_PRO_USER_MONTHLY_BUDGET_USD, 6) * 1_000_000;
  }
  return positiveDollars(serverEnvironment.OPENAI_FREE_USER_MONTHLY_BUDGET_USD, 0.15) * 1_000_000;
}

function budgetPoolFor(account: ServerAccount): AiBudgetPool {
  if (account.isOwner) return "owner";
  return account.plan === "pro" ? "paid" : "free";
}

function budgetShardFor(requestId: string) {
  return Number.parseInt(requestId.slice(0, 8), 16) % BUDGET_SHARDS;
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
    throw new AiQuotaError(429, "PLAN_LIMIT", "Erudoza Pro is required for this AI feature.", {
      limit: 0,
      remaining: 0,
      resetAt: policy.resetAt,
    });
  }

  const requestId = await sha256(`${account.uid}:${feature}:${rawIdempotencyKey}`);
  const periodPath = `usagePeriods/${account.uid}__${feature}__${policy.periodKey}`;
  const requestPath = `aiRequests/${requestId}`;
  const globalPeriod = monthWindow(now);
  const budgetPool = budgetPoolFor(account);
  const budgetShard = budgetShardFor(requestId);
  const globalPath = `systemUsageShards/${budgetPool}__${globalPeriod.key}__${budgetShard}`;
  const userBudgetPath = `userAiBudgets/${account.uid}__${globalPeriod.key}`;
  const minuteKey = nowIso.slice(0, 16);

  await runStoredDocumentTransaction(
    [periodPath, requestPath, userBudgetPath, globalPath],
    (documents) => {
      const period = documents[periodPath];
      const previousRequest = documents[requestPath];
      const userBudget = documents[userBudgetPath];
      const global = documents[globalPath];
      if (previousRequest && previousRequest.status !== "failed") {
        throw new AiQuotaError(
          409,
          "DUPLICATE_REQUEST",
          previousRequest.status === "completed"
            ? "This request was already completed."
            : "This request is already being processed.",
          {
            requestStatus: previousRequest.status,
            resultId: previousRequest.resultId,
          },
        );
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

      const userActual = numberValue(userBudget?.actualCostMicros);
      const userReserved = numberValue(userBudget?.reservedCostMicros);
      if (userActual + userReserved + policy.reserveCostMicros > userBudgetLimitMicros(account)) {
        throw new AiQuotaError(429, "USER_BUDGET_REACHED", "Your monthly AI cost allowance has been reached.", {
          resetAt: globalPeriod.resetAt,
        });
      }

      const globalActual = numberValue(global?.actualCostMicros);
      const globalReserved = numberValue(global?.reservedCostMicros);
      const poolBudgetMicros = aiBudgetLimitsUsd()[budgetPool] * 1_000_000;
      const shardBudgetMicros = poolBudgetMicros / BUDGET_SHARDS;
      if (globalActual + globalReserved + policy.reserveCostMicros > shardBudgetMicros) {
        throw new AiQuotaError(503, budgetPool === "free" ? "TRIAL_BUDGET_PAUSED" : "POOL_BUDGET_REACHED", budgetPool === "free"
          ? "Free tutor trials are paused while capacity is limited."
          : "AI generation is temporarily paused for this plan.", {
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
              cachedInputTokens: numberValue(period?.cachedInputTokens),
              cacheWriteTokens: numberValue(period?.cacheWriteTokens),
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
            path: userBudgetPath,
            data: {
              ...(userBudget ?? {}),
              uid: account.uid,
              plan: budgetPool,
              periodKey: globalPeriod.key,
              reservedCostMicros: userReserved + policy.reserveCostMicros,
              actualCostMicros: userActual,
              updatedAt: nowIso,
            },
          },
          {
            path: globalPath,
            data: {
              ...(global ?? {}),
              pool: budgetPool,
              shard: budgetShard,
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

  return {
    uid: account.uid,
    feature,
    requestId,
    periodPath,
    requestPath,
    globalPath,
    userBudgetPath,
    budgetPool,
    reserveCostMicros: policy.reserveCostMicros,
  } satisfies AiReservation;
}

export function extractOpenAiUsage(value: unknown) {
  const usage = value && typeof value === "object" && "usage" in value
    ? (value as {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
        };
      }).usage
    : undefined;
  return {
    inputTokens: numberValue(usage?.input_tokens),
    cachedInputTokens: numberValue(usage?.input_tokens_details?.cached_tokens),
    cacheWriteTokens: numberValue(usage?.input_tokens_details?.cache_write_tokens),
    outputTokens: numberValue(usage?.output_tokens),
  };
}

export async function finalizeAiUsage(
  reservation: AiReservation,
  result: {
    inputTokens?: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    outputTokens?: number;
    model?: string;
    usageSamples?: AiUsageSample[];
    responseId?: string;
    resultId?: string;
    failed?: boolean;
    promptVersion?: string;
    profile?: string;
    reasoningEffort?: string;
    promptCacheKey?: string;
  },
) {
  const nowIso = new Date().toISOString();
  const defaultModel = reservation.feature === "tutor"
    ? serverEnvironment.OPENAI_TUTOR_MODEL || "gpt-5.6-luna"
    : reservation.feature === "course_banner"
      ? serverEnvironment.OPENAI_COURSE_IMAGE_MODEL || "gpt-image-1-mini"
    : reservation.feature === "lesson_generation"
      ? serverEnvironment.OPENAI_LESSON_MODEL || "gpt-5.6-luna"
      : serverEnvironment.OPENAI_COURSE_MODEL || serverEnvironment.OPENAI_MODEL || "gpt-5.6-terra";
  const samples = result.usageSamples?.length
    ? result.usageSamples
    : [{
        model: result.model || defaultModel,
        inputTokens: numberValue(result.inputTokens),
        cachedInputTokens: numberValue(result.cachedInputTokens),
        cacheWriteTokens: numberValue(result.cacheWriteTokens),
        outputTokens: numberValue(result.outputTokens),
        responseId: result.responseId,
        promptVersion: result.promptVersion,
        profile: result.profile,
        reasoningEffort: result.reasoningEffort,
        promptCacheKey: result.promptCacheKey,
      }];
  const usage = summarizeAiUsage(samples);
  const inputTokens = usage.inputTokens;
  const cachedInputTokens = Math.min(inputTokens, usage.cachedInputTokens);
  const cacheWriteTokens = Math.min(inputTokens - cachedInputTokens, usage.cacheWriteTokens);
  const outputTokens = usage.outputTokens;
  const actualCostMicros = samples.length === 1
    ? estimateAiUsageCostMicros({ ...samples[0], cachedInputTokens, cacheWriteTokens })
    : usage.actualCostMicros;
  const models = Array.from(new Set(samples.map((sample) => sample.model)));
  const responseIds = samples.flatMap((sample) => sample.responseId ? [sample.responseId] : []);
  const promptVersions = Array.from(new Set(samples.flatMap((sample) => sample.promptVersion ? [sample.promptVersion] : [])));
  const profiles = Array.from(new Set(samples.flatMap((sample) => sample.profile ? [sample.profile] : [])));
  const reasoningEfforts = Array.from(new Set(samples.flatMap((sample) => sample.reasoningEffort ? [sample.reasoningEffort] : [])));
  const promptCacheKeys = Array.from(new Set(samples.flatMap((sample) => sample.promptCacheKey ? [sample.promptCacheKey] : [])));
  const attempts = samples.map((sample) => ({
    model: sample.model,
    promptVersion: sample.promptVersion ?? null,
    profile: sample.profile ?? null,
    reasoningEffort: sample.reasoningEffort ?? null,
    promptCacheKey: sample.promptCacheKey ?? null,
    responseId: sample.responseId ?? null,
    inputTokens: Math.max(0, sample.inputTokens),
    cachedInputTokens: Math.max(0, sample.cachedInputTokens),
    cacheWriteTokens: Math.max(0, sample.cacheWriteTokens),
    outputTokens: Math.max(0, sample.outputTokens),
    costMicros: estimateAiUsageCostMicros(sample),
  }));

  await runStoredDocumentTransaction(
    [
      reservation.periodPath,
      reservation.requestPath,
      reservation.userBudgetPath,
      reservation.globalPath,
    ],
    (documents) => {
      const period: Record<string, unknown> = documents[reservation.periodPath] ?? {};
      const request: Record<string, unknown> = documents[reservation.requestPath] ?? {};
      const userBudget: Record<string, unknown> = documents[reservation.userBudgetPath] ?? {};
      const global: Record<string, unknown> = documents[reservation.globalPath] ?? {};
      return {
        writes: [
          {
            path: reservation.periodPath,
            data: {
              ...period,
              reservedCostMicros: Math.max(0, numberValue(period.reservedCostMicros) - reservation.reserveCostMicros),
              inputTokens: numberValue(period.inputTokens) + inputTokens,
              cachedInputTokens: numberValue(period.cachedInputTokens) + cachedInputTokens,
              cacheWriteTokens: numberValue(period.cacheWriteTokens) + cacheWriteTokens,
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
              cachedInputTokens,
              cacheWriteTokens,
              outputTokens,
              actualCostMicros,
              model: models.join(" -> "),
              models,
              promptVersion: promptVersions.at(-1) ?? null,
              promptVersions,
              profile: profiles.at(-1) ?? null,
              profiles,
              reasoningEfforts,
              promptCacheKeys,
              attemptCount: attempts.length,
              recoveryUsed: samples.some((sample) => sample.profile?.endsWith(".recovery") === true),
              attempts,
              responseId: result.responseId ?? responseIds.at(-1) ?? null,
              responseIds,
              resultId: result.resultId ?? request.resultId ?? null,
              updatedAt: nowIso,
            },
          },
          {
            path: reservation.userBudgetPath,
            data: {
              ...userBudget,
              reservedCostMicros: Math.max(0, numberValue(userBudget.reservedCostMicros) - reservation.reserveCostMicros),
              actualCostMicros: numberValue(userBudget.actualCostMicros) + actualCostMicros,
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
  const features: AiQuotaSummary["feature"][] = ["course_outline", "lesson_generation", "tutor"];
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
