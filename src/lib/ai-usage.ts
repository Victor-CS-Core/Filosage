import "server-only";

import { randomUUID } from "node:crypto";
import { currentAccountGeneration, runWithAccountGeneration, runWithGlobalUsageAccounting } from "@/lib/account-lifecycle";
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
} from "@/lib/document-store";
import { serverEnvironment } from "@/lib/runtime-environment";
import { MEMBERSHIP_PLANS } from "@/lib/membership-plans";
import {
  COURSE_OUTLINE_RESERVATION_LOCK_MS,
  COURSE_OUTLINE_RESERVE_COST_MICROS,
} from "@/lib/ai-usage-policy";

export type AiFeature = "course_outline" | "course_banner" | "lesson_generation" | "tutor" | "flashcard_generation" | "command_center_draft";
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
  attemptToken?: string;
  accountGeneration?: string;
  periodPath: string;
  globalPath: string;
  userBudgetPath: string;
  budgetPool: AiBudgetPool;
  requestPath: string;
  reserveCostMicros: number;
  recovered: boolean;
  recoveredResultId?: string;
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
      reserveCostMicros: isBanner ? 20_000 : feature === "tutor" ? 50_000 : feature === "flashcard_generation" ? 100_000 : feature === "command_center_draft" ? 100_000 : feature === "course_outline" ? COURSE_OUTLINE_RESERVE_COST_MICROS : 350_000,
      lockMs: isBanner ? 90_000 : feature === "tutor" ? 45_000 : feature === "flashcard_generation" ? 90_000 : feature === "command_center_draft" ? 90_000 : feature === "lesson_generation" ? 75_000 : COURSE_OUTLINE_RESERVATION_LOCK_MS,
    };
  }

  const planLimits = MEMBERSHIP_PLANS[account.plan].limits;
  const limits: Record<AiFeature, number | null> = {
    course_outline: account.plan === "free" ? 0 : null,
    course_banner: null,
    lesson_generation: null,
    tutor: planLimits.tutorQuestions,
    flashcard_generation: planLimits.flashcardDeckGenerationsPerMonth,
    command_center_draft: 0,
  };
  return {
    limit: limits[feature],
    periodKey: monthly.key,
    resetAt: monthly.resetAt,
    maxPerMinute: feature === "tutor" ? (account.plan === "free" ? 2 : 6) : feature === "flashcard_generation" ? 3 : 2,
    reserveCostMicros: isBanner ? 20_000 : feature === "tutor" ? 50_000 : feature === "flashcard_generation" ? 100_000 : feature === "command_center_draft" ? 100_000 : feature === "course_outline" ? COURSE_OUTLINE_RESERVE_COST_MICROS : 350_000,
    lockMs: isBanner ? 90_000 : feature === "tutor" ? 45_000 : feature === "flashcard_generation" ? 90_000 : feature === "command_center_draft" ? 90_000 : feature === "lesson_generation" ? 75_000 : COURSE_OUTLINE_RESERVATION_LOCK_MS,
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
  if (account.plan === "plus") {
    return positiveDollars(serverEnvironment.OPENAI_PLUS_USER_MONTHLY_BUDGET_USD, 3) * 1_000_000;
  }
  return positiveDollars(serverEnvironment.OPENAI_FREE_USER_MONTHLY_BUDGET_USD, 0.15) * 1_000_000;
}

function budgetPoolFor(account: ServerAccount): AiBudgetPool {
  if (account.isOwner) return "owner";
  return account.plan === "free" ? "free" : "paid";
}

function budgetShardFor(requestId: string) {
  return Number.parseInt(requestId.slice(0, 8), 16) % BUDGET_SHARDS;
}

export async function reserveAiUsage(
  account: ServerAccount,
  feature: AiFeature,
  rawIdempotencyKey: string | null,
  payloadFingerprint?: string,
  options: { allowCompletedReplay?: boolean } = {},
) {
  if (!rawIdempotencyKey || rawIdempotencyKey.length < 12 || rawIdempotencyKey.length > 200) {
    throw new AiQuotaError(409, "IDEMPOTENCY_KEY_REQUIRED", "Retry-safe generation could not be started. Please try again.");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const policy = policyFor(account, feature, now);
  if (policy.limit === 0) {
    throw new AiQuotaError(429, "PLAN_LIMIT", "Your current plan does not include this AI feature.", {
      limit: 0,
      remaining: 0,
      resetAt: policy.resetAt,
    });
  }

  const requestId = await sha256(`${account.uid}:${feature}:${rawIdempotencyKey}`);
  let periodPath = `usagePeriods/${account.uid}__${feature}__${policy.periodKey}`;
  const requestPath = `aiRequests/${requestId}`;
  const globalPeriod = monthWindow(now);
  const budgetPool = budgetPoolFor(account);
  const budgetShard = budgetShardFor(requestId);
  let globalPath = `systemUsageShards/${budgetPool}__${globalPeriod.key}__${budgetShard}`;
  let userBudgetPath = `userAiBudgets/${account.uid}__${globalPeriod.key}`;
  const original = await getStoredDocument(requestPath);
  // A retry retains the paths acquired by the original reservation, including
  // across month rollover. Legacy records without paths fail closed on reclaim.
  if (original && typeof original.periodPath === "string" && typeof original.globalPath === "string" && typeof original.userBudgetPath === "string") {
    periodPath = original.periodPath; globalPath = original.globalPath; userBudgetPath = original.userBudgetPath;
    policy.periodKey = String(original.accountingPeriodKey ?? periodPath.split("__").at(-1));
    globalPeriod.key = policy.periodKey;
    if (typeof original.accountingResetAt === "string") {
      policy.resetAt = original.accountingResetAt; globalPeriod.resetAt = original.accountingResetAt;
    }
  }
  const attemptToken = randomUUID();
  const accountGeneration = currentAccountGeneration()?.generation;
  const minuteKey = nowIso.slice(0, 16);

  const reservationState = await runStoredDocumentTransaction(
    [periodPath, requestPath, userBudgetPath, globalPath, aiUsageAttemptPath({ requestId, attemptToken })],
    (documents) => {
      const period = documents[periodPath];
      const previousRequest = documents[requestPath];
      const userBudget = documents[userBudgetPath];
      const global = documents[globalPath];
      const activeUntil = typeof period?.activeUntil === "string" ? Date.parse(period.activeUntil) : 0;
      if (previousRequest?.operationId) throw new AiQuotaError(409, "DURABLE_OPERATION_REQUIRED", "Resume this request through its durable course operation.");
      const requestActiveUntil = typeof previousRequest?.leaseUntil === "string" ? Date.parse(previousRequest.leaseUntil) : activeUntil;
      const staleReservedRequest = previousRequest?.status === "reserved" && requestActiveUntil <= now.getTime();
      if (staleReservedRequest) throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "An earlier provider result is unconfirmed and must be reconciled before another paid attempt.");
      const reserveDeltaMicros = staleReservedRequest ? 0 : policy.reserveCostMicros;
      if (
        previousRequest
        && payloadFingerprint
        && typeof previousRequest.payloadFingerprint === "string"
        && previousRequest.payloadFingerprint !== payloadFingerprint
      ) {
        throw new AiQuotaError(409, "IDEMPOTENCY_CONFLICT", "This retry key was already used for a different request.");
      }
      if (previousRequest?.status === "completed" && !staleReservedRequest) {
        if (!options.allowCompletedReplay) {
          throw new AiQuotaError(409, "DUPLICATE_REQUEST", "This request was already completed.", {
            requestStatus: previousRequest.status,
            resultId: previousRequest.resultId,
          });
        }
        return {
          writes: [],
          result: {
            recovered: true,
            resultId: typeof previousRequest.resultId === "string" ? previousRequest.resultId : undefined,
          },
        };
      }
      if (previousRequest && previousRequest.status !== "failed" && !staleReservedRequest) {
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

      if (activeUntil > now.getTime()) {
        throw new AiQuotaError(429, "GENERATION_IN_PROGRESS", "Another AI request is already in progress for this feature.", {
          resetAt: new Date(activeUntil).toISOString(),
        });
      }

      const userActual = numberValue(userBudget?.actualCostMicros) + numberValue(userBudget?.uncertainCostMicros);
      const userReserved = numberValue(userBudget?.reservedCostMicros);
      if (userActual + userReserved + reserveDeltaMicros > userBudgetLimitMicros(account)) {
        throw new AiQuotaError(429, "USER_BUDGET_REACHED", "Your monthly AI cost allowance has been reached.", {
          resetAt: globalPeriod.resetAt,
        });
      }

      const globalActual = numberValue(global?.actualCostMicros) + numberValue(global?.uncertainCostMicros);
      const globalReserved = numberValue(global?.reservedCostMicros);
      const poolBudgetMicros = aiBudgetLimitsUsd()[budgetPool] * 1_000_000;
      const shardBudgetMicros = poolBudgetMicros / BUDGET_SHARDS;
      if (globalActual + globalReserved + reserveDeltaMicros > shardBudgetMicros) {
        throw new AiQuotaError(503, budgetPool === "free" ? "TRIAL_BUDGET_PAUSED" : "POOL_BUDGET_REACHED", budgetPool === "free"
          ? "Free tutor trials are paused while capacity is limited."
          : "AI generation is temporarily paused for this plan.", {
          resetAt: globalPeriod.resetAt,
        });
      }

      return {
        writes: [
          { path: aiUsageAttemptPath({ requestId, attemptToken }), data: {
            kind: "ai-usage-attempt", uid: account.uid, accountGeneration, requestId, attemptToken, feature,
            periodPath, userBudgetPath, globalPath, requestPath, reservedCostMicros: policy.reserveCostMicros,
            status: "accounting_reserved", createdAt: nowIso,
          } },
          {
            path: periodPath,
            data: {
              ...(period ?? {}),
              uid: account.uid,
              feature,
              periodKey: policy.periodKey,
              requestCount: used + (staleReservedRequest ? 0 : 1),
              minuteKey,
              minuteCount: minuteCount + 1,
              reservedCostMicros: numberValue(period?.reservedCostMicros) + reserveDeltaMicros,
              inputTokens: numberValue(period?.inputTokens),
              cachedInputTokens: numberValue(period?.cachedInputTokens),
              cacheWriteTokens: numberValue(period?.cacheWriteTokens),
              outputTokens: numberValue(period?.outputTokens),
              actualCostMicros: numberValue(period?.actualCostMicros),
              activeRequestId: requestId,
              activeAttemptToken: attemptToken,
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
              attemptToken, accountGeneration,
              periodPath, globalPath, userBudgetPath, accountingPeriodKey: policy.periodKey, accountingResetAt: policy.resetAt,
              leaseUntil: new Date(now.getTime() + policy.lockMs).toISOString(),
              status: "reserved",
              payloadFingerprint: payloadFingerprint ?? previousRequest?.payloadFingerprint ?? null,
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
              reservedCostMicros: userReserved + reserveDeltaMicros,
              actualCostMicros: numberValue(userBudget?.actualCostMicros),
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
              reservedCostMicros: globalReserved + reserveDeltaMicros,
              actualCostMicros: numberValue(global?.actualCostMicros),
              updatedAt: nowIso,
            },
          },
        ],
        result: { recovered: false, resultId: undefined },
      };
    },
  );

  return {
    uid: account.uid,
    feature,
    requestId,
    attemptToken, accountGeneration,
    periodPath,
    requestPath,
    globalPath,
    userBudgetPath,
    budgetPool,
    reserveCostMicros: policy.reserveCostMicros,
    recovered: reservationState.recovered,
    recoveredResultId: reservationState.resultId,
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
  if (reservation.recovered) return;
  const nowIso = new Date().toISOString();
  const defaultModel = reservation.feature === "command_center_draft"
    ? serverEnvironment.OPENAI_COMMAND_CENTER_MODEL || serverEnvironment.OPENAI_MODEL || "gpt-5.6-terra"
    : reservation.feature === "tutor" || reservation.feature === "flashcard_generation"
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
  // A failed call with no observed response cannot certify zero provider spend.
  // Preserve uncertainty until a late actual response or operator reconciliation.
  if (result.failed && actualCostMicros === 0 && !result.responseId && !samples.some((sample) => sample.responseId)) {
    const expired = await runStoredDocumentTransaction([reservation.requestPath], (documents) => {
      const request = documents[reservation.requestPath];
      if (!request || request.status !== "reserved" || request.attemptToken !== reservation.attemptToken) return { writes: [], result: false };
      return { writes: [{ path: reservation.requestPath, data: { ...request, leaseUntil: nowIso } }], result: true };
    });
    if (expired) await reconcileExpiredAiUsage(reservation.requestId, true, new Date(nowIso));
    return;
  }
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

  const receiptPath = `generationUsageReceipts/legacy-${reservation.requestId}-${reservation.attemptToken ?? "v0"}`;
  const lateUsage = () => runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([receiptPath, reservation.globalPath], (documents) => {
    const receipt = documents[receiptPath];
    if (receipt && receipt.status !== "uncertain") return { writes: [], result: undefined };
    const global: Record<string, unknown> = documents[reservation.globalPath] ?? {};
    return { writes: [
      { path: receiptPath, data: { version: 1, kind: "legacy-ai-completion", status: "observed", actualCostMicros, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, failed: result.failed === true, globalPath: reservation.globalPath, updatedAt: nowIso } },
      { path: reservation.globalPath, data: { ...global, reservedCostMicros: Math.max(0, numberValue(global.reservedCostMicros) - (receipt ? 0 : reservation.reserveCostMicros)), uncertainCostMicros: Math.max(0, numberValue(global.uncertainCostMicros) - numberValue(receipt?.uncertainCostMicros)), actualCostMicros: numberValue(global.actualCostMicros) + actualCostMicros, updatedAt: nowIso } },
    ], result: undefined };
  }));
  await lateUsage();
  await settleAiUsageAttempt(reservation, {
    status: "observed", actualCostMicros, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens,
    failed: result.failed === true,
  }, {
    model: models.join(" -> "), models, promptVersion: promptVersions.at(-1) ?? null, promptVersions,
    profile: profiles.at(-1) ?? null, profiles, reasoningEfforts, promptCacheKeys, attemptCount: attempts.length,
    recoveryUsed: samples.some((sample) => sample.profile?.endsWith(".recovery") === true), attempts,
    responseId: result.responseId ?? responseIds.at(-1) ?? null, responseIds, resultId: result.resultId ?? null,
  });
}

/** Personal accounting is addressed by immutable attempt, not the replaceable retry key. */
export function aiUsageAttemptPath(value: { requestId: string; attemptToken?: string }) {
  return `aiRequests/${value.requestId}__attempt__${value.attemptToken ?? "v0"}`;
}

async function settleAiUsageAttempt(
  reservation: Pick<AiReservation, "uid" | "accountGeneration" | "requestId" | "attemptToken" | "requestPath" | "periodPath" | "userBudgetPath" | "reserveCostMicros">,
  observed: Record<string, unknown>, details: Record<string, unknown> = {},
) {
  const attemptPath = aiUsageAttemptPath(reservation);
  const settle = () => runStoredDocumentTransaction([attemptPath, reservation.requestPath, reservation.periodPath, reservation.userBudgetPath], (documents) => {
    const request = documents[reservation.requestPath];
    const period = documents[reservation.periodPath];
    const budget = documents[reservation.userBudgetPath];
    const sameRequest = Boolean(request) && request?.attemptToken === reservation.attemptToken;
    // Additive migration supports attempts admitted just before this schema. An
    // absent/deleted account or an overwritten old attempt is never recreated.
    const attempt = documents[attemptPath] ?? (sameRequest ? request : undefined);
    if (!attempt || !period || !budget || attempt.uid !== reservation.uid
      || (reservation.accountGeneration && attempt.accountGeneration !== reservation.accountGeneration)
      || ["completed", "accounting_observed"].includes(String(attempt.status))
      || (attempt.status === "failed" && attempt.terminalReason !== "provider_outcome_unknown")) return { writes: [], result: false };
    const uncertain = numberValue(attempt.uncertainCostMicros);
    const wasReserved = ["reserved", "accounting_reserved"].includes(String(attempt.status));
    const actual = numberValue(observed.actualCostMicros);
    const tokens = Object.fromEntries(["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"].map((key) => [key, numberValue(period[key]) + numberValue(observed[key])]));
    const ownsPeriod = period.activeRequestId === reservation.requestId && period.activeAttemptToken === reservation.attemptToken;
    const now = new Date().toISOString();
    return { writes: [
      { path: attemptPath, data: { ...attempt, kind: "ai-usage-attempt", requestPath: reservation.requestPath, requestId: reservation.requestId,
        ...observed, status: "accounting_observed", uncertainCostMicros: 0, updatedAt: now } },
      { path: reservation.periodPath, data: { ...period, ...tokens,
        requestCount: Math.max(0, numberValue(period.requestCount) - (wasReserved && observed.failed ? 1 : 0)),
        reservedCostMicros: Math.max(0, numberValue(period.reservedCostMicros) - (wasReserved ? reservation.reserveCostMicros : 0)),
        uncertainCostMicros: Math.max(0, numberValue(period.uncertainCostMicros) - uncertain), actualCostMicros: numberValue(period.actualCostMicros) + actual,
        ...(ownsPeriod ? { activeRequestId: null, activeAttemptToken: null, activeUntil: null } : {}), updatedAt: now } },
      { path: reservation.userBudgetPath, data: { ...budget,
        reservedCostMicros: Math.max(0, numberValue(budget.reservedCostMicros) - (wasReserved ? reservation.reserveCostMicros : 0)),
        uncertainCostMicros: Math.max(0, numberValue(budget.uncertainCostMicros) - uncertain), actualCostMicros: numberValue(budget.actualCostMicros) + actual, updatedAt: now } },
      ...(sameRequest ? [{ path: reservation.requestPath, data: { ...request, ...observed, ...details,
        status: wasReserved ? (observed.failed ? "failed" : "completed") : request?.status,
        uncertainCostMicros: 0, updatedAt: now } }] : []),
    ], result: true };
  });
  return reservation.accountGeneration
    ? runWithAccountGeneration({ uid: reservation.uid, generation: reservation.accountGeneration }, settle)
    : settle();
}

export async function getAiQuotaSummaries(account: ServerAccount): Promise<AiQuotaSummary[]> {
  const now = new Date();
  const features: AiQuotaSummary["feature"][] = ["tutor", "flashcard_generation"];
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

/** Shared admission policy for the atomic, durable course operation. */
export function courseOutlineAccountingContext(account: ServerAccount, requestId: string, now = new Date()) {
  const policy = policyFor(account, "course_outline", now);
  const budgetPool = budgetPoolFor(account);
  const shard = budgetShardFor(requestId);
  return {
    ...policy, budgetPool, shard,
    userLimitMicros: userBudgetLimitMicros(account),
    poolLimitMicros: aiBudgetLimitsUsd()[budgetPool] * 1_000_000 / BUDGET_SHARDS,
    periodPath: `usagePeriods/${account.uid}__course_outline__${policy.periodKey}`,
    requestPath: `aiRequests/${requestId}`,
    userBudgetPath: `userAiBudgets/${account.uid}__${policy.periodKey}`,
    globalPath: `systemUsageShards/${budgetPool}__${policy.periodKey}__${shard}`,
  };
}


/** Expired non-operation reservations are contained without repeating paid work. */
export async function reconcileExpiredAiUsage(requestId: string, apply: boolean, now = new Date()) {
  const requestPath = `aiRequests/${requestId}`;
  const initial = await getStoredDocument(requestPath);
  if (initial?.kind === "ai-usage-attempt") {
    if (initial.status === "accounting_observed") return "none";
    const receipt = await getStoredDocument(`generationUsageReceipts/legacy-${initial.requestId}-${initial.attemptToken}`);
    if (receipt?.status !== "observed") return "none";
    if (!apply) return "would_reconcile_observed_attempt";
    const repaired = await settleAiUsageAttempt({
      uid: String(initial.uid), accountGeneration: String(initial.accountGeneration), requestId: String(initial.requestId),
      attemptToken: String(initial.attemptToken), requestPath: String(initial.requestPath), periodPath: String(initial.periodPath),
      userBudgetPath: String(initial.userBudgetPath), reserveCostMicros: numberValue(initial.reservedCostMicros),
    }, receipt);
    return repaired ? "reconciled_observed_attempt" : "none";
  }
  if (!initial || initial.operationId || initial.status !== "reserved" || Date.parse(String(initial.leaseUntil)) > now.getTime()) return "none";
  if (![initial.uid, initial.attemptToken, initial.accountGeneration, initial.periodPath, initial.userBudgetPath, initial.globalPath].every((value) => typeof value === "string" && value.length > 0)) return "manual_reconciliation_required";
  if (!apply) return "would_contain_unknown_outcome";
  const uid = String(initial.uid);
  const generation = String(initial.accountGeneration);
  const token = String(initial.attemptToken);
  const periodPath = String(initial.periodPath);
  const userBudgetPath = String(initial.userBudgetPath);
  const globalPath = String(initial.globalPath);
  const receiptPath = `generationUsageReceipts/legacy-${requestId}-${token}`;
  const attemptPath = aiUsageAttemptPath({ requestId, attemptToken: token });
  return runWithAccountGeneration({ uid, generation }, () => runStoredDocumentTransaction([requestPath, periodPath, userBudgetPath, globalPath, receiptPath, attemptPath], (documents) => {
    const request = documents[requestPath];
    if (!request || request.status !== "reserved" || request.attemptToken !== token || Date.parse(String(request.leaseUntil)) > now.getTime()) return { writes: [], result: "none" };
    const receipt = documents[receiptPath];
    const reserved = numberValue(request.reservedCostMicros);
    const uncertain = receipt ? 0 : reserved;
    const actual = numberValue(receipt?.actualCostMicros);
    const period: Record<string, unknown> = documents[periodPath] ?? {};
    const budget: Record<string, unknown> = documents[userBudgetPath] ?? {};
    const global: Record<string, unknown> = documents[globalPath] ?? {};
    const ownsPeriod = period.activeRequestId === requestId && period.activeAttemptToken === token;
    return { writes: [
      { path: attemptPath, data: { ...request, ...documents[attemptPath], kind: "ai-usage-attempt", requestPath, requestId,
        status: receipt ? "accounting_observed" : "accounting_uncertain", actualCostMicros: actual, uncertainCostMicros: uncertain } },
      { path: requestPath, data: { ...request, status: "failed", terminalReason: receipt ? "completion_accounting_recovered" : "provider_outcome_unknown", actualCostMicros: actual, uncertainCostMicros: uncertain, updatedAt: now.toISOString() } },
      { path: periodPath, data: { ...period, requestCount: Math.max(0, numberValue(period.requestCount) - 1), reservedCostMicros: Math.max(0, numberValue(period.reservedCostMicros) - reserved), actualCostMicros: numberValue(period.actualCostMicros) + actual, uncertainCostMicros: numberValue(period.uncertainCostMicros) + uncertain, ...(ownsPeriod ? { activeRequestId: null, activeAttemptToken: null, activeUntil: null } : {}) } },
      { path: userBudgetPath, data: { ...budget, reservedCostMicros: Math.max(0, numberValue(budget.reservedCostMicros) - reserved), actualCostMicros: numberValue(budget.actualCostMicros) + actual, uncertainCostMicros: numberValue(budget.uncertainCostMicros) + uncertain } },
      ...(!receipt ? [
        { path: receiptPath, data: { version: 1, kind: "legacy-ai-completion", status: "uncertain", actualCostMicros: 0, uncertainCostMicros: uncertain, globalPath } },
        { path: globalPath, data: { ...global, reservedCostMicros: Math.max(0, numberValue(global.reservedCostMicros) - reserved), uncertainCostMicros: numberValue(global.uncertainCostMicros) + uncertain } },
      ] : []),
    ], result: "contained_unknown_outcome" };
  }));
}

/** Called before account-owned request records are removed. No personal write. */
export async function abandonAiUsage(requestId: string): Promise<void> {
  const request = await getStoredDocument(`aiRequests/${requestId}`);
  if (!request || request.kind === "ai-usage-attempt" || request.operationId || request.status !== "reserved") return;
  if (![request.attemptToken, request.globalPath].every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
  }
  const globalPath = String(request.globalPath);
  const receiptPath = `generationUsageReceipts/legacy-${requestId}-${request.attemptToken}`;
  await runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([receiptPath, globalPath], (documents) => {
    if (documents[receiptPath]) return { writes: [], result: undefined };
    const global = documents[globalPath];
    if (!global) throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    const uncertain = numberValue(request.reservedCostMicros);
    return { writes: [
      { path: receiptPath, data: { version: 1, kind: "legacy-ai-completion", status: "uncertain", actualCostMicros: 0, uncertainCostMicros: uncertain, globalPath } },
      { path: globalPath, data: { ...global, reservedCostMicros: Math.max(0, numberValue(global.reservedCostMicros) - uncertain), uncertainCostMicros: numberValue(global.uncertainCostMicros) + uncertain } },
    ], result: undefined };
  }));
}
