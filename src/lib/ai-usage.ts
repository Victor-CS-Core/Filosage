import { aiUsageLockWrite, aiUsageReleaseLock, aiUsageConflictingUntil } from "@/lib/ai-usage-lock";
import "server-only";

import { createHash, randomUUID } from "node:crypto";
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
  type StoredDocument,
} from "@/lib/document-store";
import { serverEnvironment } from "@/lib/runtime-environment";
import { MEMBERSHIP_PLANS } from "@/lib/membership-plans";
import {
  COURSE_OUTLINE_RESERVATION_LOCK_MS,
  COURSE_OUTLINE_RESERVE_COST_MICROS,
} from "@/lib/ai-usage-policy";
import { publicationContentFingerprint } from "@/lib/publication-content";

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
  operationId?: string;
  attemptToken?: string;
  lockKey?: string;
  accountGeneration?: string;
  periodPath: string;
  globalPath: string;
  userBudgetPath: string;
  budgetPool: AiBudgetPool;
  requestPath: string;
  reserveCostMicros: number;
  payloadFingerprint?: string;
  recovered: boolean;
  recoveredResultId?: string;
  recoveredStatus?: "result_checkpointed" | "completed";
  recoveredCheckpoint?: boolean;
}

export type AiProductKind = "baseline_assessment" | "capstone_assessment" | "flashcard_deck";

export interface AiUsageFinalization {
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
  /** Only use when no provider request was dispatched. */
  providerOutcome?: "not_started";
}

export interface AiResultCheckpoint<Result = unknown> {
  version: 1;
  kind: AiProductKind;
  uid: string;
  accountGeneration: string;
  feature: AiFeature;
  requestId: string;
  attemptToken: string;
  payloadFingerprint: string;
  resourceId: string;
  resultId: string;
  productGuard: string;
  resultFingerprint: string;
  checkpointFingerprint: string;
  result: Result;
  usageSamples: AiUsageSample[];
  responseId: string;
  accountingStatus: "accounting_reserved" | "accounting_uncertain";
  observed: {
    status: "observed";
    actualCostMicros: number;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    failed: false;
  };
  details: Record<string, unknown>;
  checkpointedAt: string;
}

export interface AiProductMutation<Result> {
  writes: Array<{ path: string; data: Record<string, unknown> }>;
  deletes?: string[];
  result: Result;
}

const RESULT_CHECKPOINT_MAX_BYTES = 256_000;
const RESULT_CHECKPOINT_DETAILS_MAX_BYTES = 64_000;
const RESULT_CHECKPOINT_MAX_SAMPLES = 8;
const RESULT_CHECKPOINT_MAX_TEXT_BYTES = 512;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function contentHash(value: unknown) {
  return createHash("sha256").update(publicationContentFingerprint(value)).digest("hex");
}

export function aiUsageProductGuard(value: unknown) {
  return contentHash(value);
}

function checkpointIdentity(value: Omit<AiResultCheckpoint, "checkpointFingerprint">) {
  return contentHash(value);
}

function serializedByteLength(value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return serialized ? Buffer.byteLength(serialized, "utf8") : null;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maximum = RESULT_CHECKPOINT_MAX_TEXT_BYTES): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim()
    && Buffer.byteLength(value, "utf8") <= maximum;
}

function optionalBoundedText(value: unknown, maximum = RESULT_CHECKPOINT_MAX_TEXT_BYTES) {
  return value === undefined || boundedText(value, maximum);
}

function safeCheckpointId(value: unknown) {
  return boundedText(value, 250) && !value.includes("/")
    && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function canonicalIsoDate(value: unknown): value is string {
  return boundedText(value, 40) && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
}

function parsedUsageSamples(value: unknown): AiUsageSample[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > RESULT_CHECKPOINT_MAX_SAMPLES) return null;
  const samples: AiUsageSample[] = [];
  for (const raw of value) {
    const sample = recordValue(raw);
    if (!sample || !hasOnlyKeys(sample, ["model", "inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens",
      "fixedCostMicros", "responseId", "promptVersion", "profile", "reasoningEffort", "promptCacheKey"])
      || !boundedText(sample.model, 200)
      || ![sample.inputTokens, sample.cachedInputTokens, sample.cacheWriteTokens, sample.outputTokens].every(nonnegativeInteger)
      || (sample.fixedCostMicros !== undefined && !nonnegativeInteger(sample.fixedCostMicros))
      || !optionalBoundedText(sample.responseId) || !optionalBoundedText(sample.promptVersion)
      || !optionalBoundedText(sample.profile) || !optionalBoundedText(sample.reasoningEffort)
      || !optionalBoundedText(sample.promptCacheKey)) return null;
    samples.push(sample as unknown as AiUsageSample);
  }
  return samples;
}

function usageDetailsFor(samples: AiUsageSample[], responseId: string, resultId: string) {
  const models = Array.from(new Set(samples.map((sample) => sample.model)));
  const responseIds = samples.flatMap((sample) => sample.responseId ? [sample.responseId] : []);
  const promptVersions = Array.from(new Set(samples.flatMap((sample) => sample.promptVersion ? [sample.promptVersion] : [])));
  const profiles = Array.from(new Set(samples.flatMap((sample) => sample.profile ? [sample.profile] : [])));
  const reasoningEfforts = Array.from(new Set(samples.flatMap((sample) => sample.reasoningEffort ? [sample.reasoningEffort] : [])));
  const promptCacheKeys = Array.from(new Set(samples.flatMap((sample) => sample.promptCacheKey ? [sample.promptCacheKey] : [])));
  return {
    model: models.join(" -> "),
    models,
    promptVersion: promptVersions.at(-1) ?? null,
    promptVersions,
    profile: profiles.at(-1) ?? null,
    profiles,
    reasoningEfforts,
    promptCacheKeys,
    attemptCount: samples.length,
    recoveryUsed: samples.some((sample) => sample.profile?.endsWith(".recovery") === true),
    attempts: samples.map((sample) => ({
      model: sample.model,
      promptVersion: sample.promptVersion ?? null,
      profile: sample.profile ?? null,
      reasoningEffort: sample.reasoningEffort ?? null,
      promptCacheKey: sample.promptCacheKey ?? null,
      responseId: sample.responseId ?? null,
      inputTokens: sample.inputTokens,
      cachedInputTokens: sample.cachedInputTokens,
      cacheWriteTokens: sample.cacheWriteTokens,
      outputTokens: sample.outputTokens,
      costMicros: estimateAiUsageCostMicros(sample),
    })),
    responseId,
    responseIds,
    resultId,
  };
}

function parsedResultCheckpoint(value: unknown): AiResultCheckpoint | null {
  const checkpoint = recordValue(value);
  const observed = recordValue(checkpoint?.observed);
  const samples = parsedUsageSamples(checkpoint?.usageSamples);
  const details = recordValue(checkpoint?.details);
  const checkpointBytes = serializedByteLength(checkpoint);
  const detailsBytes = serializedByteLength(details);
  if (!checkpoint || checkpointBytes === null || checkpointBytes > RESULT_CHECKPOINT_MAX_BYTES
    || detailsBytes === null || detailsBytes > RESULT_CHECKPOINT_DETAILS_MAX_BYTES
    || !hasOnlyKeys(checkpoint, ["version", "kind", "uid", "accountGeneration", "feature", "requestId", "attemptToken",
      "payloadFingerprint", "resourceId", "resultId", "productGuard", "resultFingerprint", "checkpointFingerprint",
      "result", "usageSamples", "responseId", "accountingStatus", "observed", "details", "checkpointedAt"])
    || checkpoint.version !== 1
    || !["baseline_assessment", "capstone_assessment", "flashcard_deck"].includes(String(checkpoint.kind))
    || !boundedText(checkpoint.uid, 256) || checkpoint.uid.includes("/")
    || !boundedText(checkpoint.accountGeneration, 64) || !UUID_PATTERN.test(checkpoint.accountGeneration)
    || !["course_outline", "course_banner", "lesson_generation", "tutor", "flashcard_generation", "command_center_draft"].includes(String(checkpoint.feature))
    || typeof checkpoint.requestId !== "string" || !SHA256_PATTERN.test(checkpoint.requestId)
    || typeof checkpoint.attemptToken !== "string" || !UUID_PATTERN.test(checkpoint.attemptToken)
    || !boundedText(checkpoint.payloadFingerprint, 512)
    || !safeCheckpointId(checkpoint.resourceId) || !safeCheckpointId(checkpoint.resultId)
    || typeof checkpoint.productGuard !== "string" || !SHA256_PATTERN.test(checkpoint.productGuard)
    || typeof checkpoint.resultFingerprint !== "string" || !SHA256_PATTERN.test(checkpoint.resultFingerprint)
    || typeof checkpoint.checkpointFingerprint !== "string" || !SHA256_PATTERN.test(checkpoint.checkpointFingerprint)
    || !boundedText(checkpoint.responseId) || !canonicalIsoDate(checkpoint.checkpointedAt)
    || !["accounting_reserved", "accounting_uncertain"].includes(String(checkpoint.accountingStatus))
    || !samples || !details
    || !observed || !hasOnlyKeys(observed, ["status", "actualCostMicros", "inputTokens", "cachedInputTokens",
      "cacheWriteTokens", "outputTokens", "failed"])
    || observed.status !== "observed" || observed.failed !== false
    || ![observed.actualCostMicros, observed.inputTokens, observed.cachedInputTokens,
      observed.cacheWriteTokens, observed.outputTokens].every(nonnegativeInteger)) return null;
  const usage = summarizeAiUsage(samples);
  const inputTokens = usage.inputTokens;
  const cachedInputTokens = Math.min(inputTokens, usage.cachedInputTokens);
  const cacheWriteTokens = Math.min(inputTokens - cachedInputTokens, usage.cacheWriteTokens);
  if (observed.actualCostMicros !== usage.actualCostMicros || observed.inputTokens !== inputTokens
    || observed.cachedInputTokens !== cachedInputTokens || observed.cacheWriteTokens !== cacheWriteTokens
    || observed.outputTokens !== usage.outputTokens
    || contentHash(details) !== contentHash(usageDetailsFor(samples, checkpoint.responseId as string, checkpoint.resultId as string))) return null;
  const identity: Partial<AiResultCheckpoint> = { ...checkpoint };
  delete identity.checkpointFingerprint;
  if (contentHash(checkpoint.result) !== checkpoint.resultFingerprint
    || checkpointIdentity(identity as Omit<AiResultCheckpoint, "checkpointFingerprint">) !== checkpoint.checkpointFingerprint) return null;
  return checkpoint as unknown as AiResultCheckpoint;
}

function checkpointMatchesReservation(checkpoint: AiResultCheckpoint, reservation: AiReservation) {
  return checkpoint.uid === reservation.uid
    && checkpoint.accountGeneration === reservation.accountGeneration
    && checkpoint.feature === reservation.feature
    && checkpoint.requestId === reservation.requestId
    && checkpoint.attemptToken === reservation.attemptToken
    && checkpoint.payloadFingerprint === reservation.payloadFingerprint;
}

function checkpointMatchesDocuments(
  checkpoint: AiResultCheckpoint,
  request: StoredDocument | null,
  attempt: StoredDocument | null,
) {
  const statusesMatch = (request?.status === "result_checkpointed" && attempt?.status === "result_checkpointed")
    || (request?.status === "completed" && attempt?.status === "accounting_observed");
  return statusesMatch
    && request?.uid === checkpoint.uid && request.feature === checkpoint.feature
    && request.attemptToken === checkpoint.attemptToken && request.accountGeneration === checkpoint.accountGeneration
    && request.payloadFingerprint === checkpoint.payloadFingerprint && request.resultId === checkpoint.resultId
    && attempt?.uid === checkpoint.uid && attempt.feature === checkpoint.feature && attempt.requestId === checkpoint.requestId
    && attempt.attemptToken === checkpoint.attemptToken && attempt.accountGeneration === checkpoint.accountGeneration
    && attempt.resultId === checkpoint.resultId;
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

export async function aiUsageRequestId(uid: string, feature: AiFeature, key: string) {
  return sha256(`${uid}:${feature}:${key}`);
}

export async function reserveAiUsage(
  account: ServerAccount,
  feature: AiFeature,
  rawIdempotencyKey: string | null,
  payloadFingerprint?: string,
  options: {
    allowCompletedReplay?: boolean;
    resourceKey?: string;
    legacyReplay?: { profile: string; resultId: string };
  } = {},
) {
  if (!rawIdempotencyKey || rawIdempotencyKey.length < 12 || rawIdempotencyKey.length > 200) {
    throw new AiQuotaError(409, "IDEMPOTENCY_KEY_REQUIRED", "Retry-safe generation could not be started. Please try again.");
  }
  if (options.legacyReplay && (!boundedText(options.legacyReplay.profile)
    || !safeCheckpointId(options.legacyReplay.resultId))) {
    throw new AiQuotaError(409, "IDEMPOTENCY_CONFLICT", "The legacy replay identity is invalid.");
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

  const requestId = await aiUsageRequestId(account.uid, feature, rawIdempotencyKey);
  let periodPath = `usagePeriods/${account.uid}__${feature}__${policy.periodKey}`;
  const requestPath = `aiRequests/${requestId}`;
  const globalPeriod = monthWindow(now);
  const budgetPool = budgetPoolFor(account);
  const budgetShard = budgetShardFor(requestId);
  let globalPath = `systemUsageShards/${budgetPool}__${globalPeriod.key}__${budgetShard}`;
  let userBudgetPath = `userAiBudgets/${account.uid}__${globalPeriod.key}`;
  if (options.resourceKey && (feature !== "lesson_generation" || options.resourceKey.length > 250)) throw new AiQuotaError(409, "IDEMPOTENCY_CONFLICT", "Invalid lesson resource scope.");
  const lockKey = options.resourceKey ? await sha256(options.resourceKey) : undefined;
  const original = await getStoredDocument(requestPath);
  if (original && original.lockKey !== lockKey) throw new AiQuotaError(409, "IDEMPOTENCY_CONFLICT", "The request belongs to another resource lock or an older writer.");
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
  const originalAttemptPath = typeof original?.attemptToken === "string"
    ? aiUsageAttemptPath({ requestId, attemptToken: original.attemptToken })
    : null;
  const minuteKey = nowIso.slice(0, 16);

  const reservationState = await runStoredDocumentTransaction<{
    recovered: boolean;
    resultId: string | undefined;
    status: "result_checkpointed" | "completed" | undefined;
    attemptToken: string;
    accountGeneration: string | undefined;
    reserveCostMicros: number;
    recoveredCheckpoint: boolean;
  }>(
    [...new Set([
      periodPath,
      requestPath,
      userBudgetPath,
      globalPath,
      aiUsageAttemptPath({ requestId, attemptToken }),
      ...(originalAttemptPath ? [originalAttemptPath] : []),
    ])],
    (documents) => {
      const period = documents[periodPath];
      const previousRequest = documents[requestPath];
      if (previousRequest && previousRequest.lockKey !== lockKey) throw new AiQuotaError(409, "IDEMPOTENCY_CONFLICT", "The request belongs to another resource lock or an older writer.");
      if (previousRequest && (previousRequest.uid !== account.uid || previousRequest.feature !== feature
        || (typeof previousRequest.accountGeneration === "string" && previousRequest.accountGeneration !== accountGeneration))) {
        throw new AiQuotaError(409, "IDEMPOTENCY_CONFLICT", "This retry belongs to another account generation or feature.");
      }
      const userBudget = documents[userBudgetPath];
      const global = documents[globalPath];
      const activeUntil = aiUsageConflictingUntil(period, lockKey);
      if (previousRequest?.operationId) throw new AiQuotaError(409, "DURABLE_OPERATION_REQUIRED", "Resume this request through its durable course operation.");
      const requestActiveUntil = typeof previousRequest?.leaseUntil === "string" ? Date.parse(previousRequest.leaseUntil) : activeUntil;
      const staleReservedRequest = previousRequest?.status === "reserved" && requestActiveUntil <= now.getTime();
      if (
        previousRequest
        && payloadFingerprint
        && typeof previousRequest.payloadFingerprint === "string"
        && previousRequest.payloadFingerprint !== payloadFingerprint
      ) {
        throw new AiQuotaError(409, "IDEMPOTENCY_CONFLICT", "This retry key was already used for a different request.");
      }
      if (staleReservedRequest) throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "An earlier provider result is unconfirmed and must be reconciled before another paid attempt.");
      if (previousRequest?.status === "failed" && previousRequest.terminalReason !== "pre_provider_failure") {
        throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "An earlier provider result is unconfirmed and must be reconciled before another paid attempt.");
      }
      const reserveDeltaMicros = staleReservedRequest ? 0 : policy.reserveCostMicros;
      if (previousRequest && ["result_checkpointed", "completed"].includes(String(previousRequest.status)) && !staleReservedRequest) {
        if (!options.allowCompletedReplay) {
          throw new AiQuotaError(409, "DUPLICATE_REQUEST", "This request was already completed.", {
            requestStatus: previousRequest.status,
            resultId: previousRequest.resultId,
          });
        }
        const checkpoint = parsedResultCheckpoint(previousRequest.resultCheckpoint);
        const previousToken = typeof previousRequest.attemptToken === "string" ? previousRequest.attemptToken : "";
        const previousAttempt = previousToken
          ? documents[aiUsageAttemptPath({ requestId, attemptToken: previousToken })]
          : null;
        const attemptCheckpoint = parsedResultCheckpoint(previousAttempt?.resultCheckpoint);
        const hasCheckpointState = previousRequest.resultCheckpoint !== undefined
          || previousAttempt?.resultCheckpoint !== undefined || previousRequest.status === "result_checkpointed"
          || previousAttempt?.status === "result_checkpointed";
        if (hasCheckpointState && (!checkpoint || !attemptCheckpoint
          || checkpoint.checkpointFingerprint !== attemptCheckpoint.checkpointFingerprint
          || !checkpointMatchesDocuments(checkpoint, previousRequest, previousAttempt)
          || checkpoint.uid !== account.uid || checkpoint.accountGeneration !== accountGeneration
          || checkpoint.feature !== feature || checkpoint.requestId !== requestId
          || checkpoint.attemptToken !== previousToken
          || (payloadFingerprint !== undefined && checkpoint.payloadFingerprint !== payloadFingerprint))) {
          throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The saved provider result cannot be safely recovered.");
        }
        if (previousRequest.status === "result_checkpointed" && !checkpoint) {
          throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The saved provider result cannot be safely recovered.");
        }
        if (!checkpoint && (!options.legacyReplay
          || previousRequest.profile !== options.legacyReplay.profile
          || !safeCheckpointId(previousRequest.resultId)
          || previousRequest.resultId !== options.legacyReplay.resultId)) {
          throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The completed result is not safely bound to this product and resource.");
        }
        return {
          writes: [],
          result: {
            recovered: true,
            resultId: typeof previousRequest.resultId === "string" ? previousRequest.resultId : undefined,
            status: previousRequest.status as "result_checkpointed" | "completed",
            attemptToken: previousToken,
            accountGeneration: typeof previousRequest.accountGeneration === "string" ? previousRequest.accountGeneration : undefined,
            reserveCostMicros: numberValue(previousRequest.reservedCostMicros) || policy.reserveCostMicros,
            recoveredCheckpoint: Boolean(checkpoint),
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
            kind: "ai-usage-attempt", uid: account.uid, accountGeneration, requestId, attemptToken, lockKey, feature,
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
              ...aiUsageLockWrite(period, lockKey, requestId, attemptToken, new Date(now.getTime() + policy.lockMs).toISOString()),
              resetAt: policy.resetAt,
              updatedAt: nowIso,
            },
          },
          {
            path: requestPath,
            data: {
              uid: account.uid,
              feature,
              attemptToken, accountGeneration, lockKey,
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
        result: {
          recovered: false,
          resultId: undefined,
          status: undefined,
          attemptToken,
          accountGeneration,
          reserveCostMicros: policy.reserveCostMicros,
          recoveredCheckpoint: false,
        },
      };
    },
  );

  return {
    uid: account.uid,
    feature,
    requestId,
    attemptToken: reservationState.attemptToken,
    accountGeneration: reservationState.accountGeneration,
    lockKey,
    periodPath,
    requestPath,
    globalPath,
    userBudgetPath,
    budgetPool,
    reserveCostMicros: reservationState.reserveCostMicros,
    payloadFingerprint,
    recovered: reservationState.recovered,
    recoveredResultId: reservationState.resultId,
    recoveredStatus: reservationState.status,
    recoveredCheckpoint: reservationState.recoveredCheckpoint,
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

function defaultModelFor(feature: AiFeature) {
  if (feature === "command_center_draft") return serverEnvironment.OPENAI_COMMAND_CENTER_MODEL || serverEnvironment.OPENAI_MODEL || "gpt-5.6-terra";
  if (feature === "tutor" || feature === "flashcard_generation") return serverEnvironment.OPENAI_TUTOR_MODEL || "gpt-5.6-luna";
  if (feature === "course_banner") return serverEnvironment.OPENAI_COURSE_IMAGE_MODEL || "gpt-image-1-mini";
  if (feature === "lesson_generation") return serverEnvironment.OPENAI_LESSON_MODEL || "gpt-5.6-luna";
  return serverEnvironment.OPENAI_COURSE_MODEL || serverEnvironment.OPENAI_MODEL || "gpt-5.6-terra";
}

function observedUsageFor(reservation: Pick<AiReservation, "feature">, result: AiUsageFinalization, resultId: string) {
  const rawSamples = result.usageSamples?.length
    ? result.usageSamples
    : [{
        model: result.model || defaultModelFor(reservation.feature),
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
  const samples: AiUsageSample[] = rawSamples.map((sample) => ({
    model: sample.model || defaultModelFor(reservation.feature),
    inputTokens: Math.max(0, numberValue(sample.inputTokens)),
    cachedInputTokens: Math.max(0, numberValue(sample.cachedInputTokens)),
    cacheWriteTokens: Math.max(0, numberValue(sample.cacheWriteTokens)),
    outputTokens: Math.max(0, numberValue(sample.outputTokens)),
    ...(typeof sample.fixedCostMicros === "number" ? { fixedCostMicros: Math.max(0, sample.fixedCostMicros) } : {}),
    ...(sample.responseId ? { responseId: sample.responseId } : {}),
    ...(sample.promptVersion ? { promptVersion: sample.promptVersion } : {}),
    ...(sample.profile ? { profile: sample.profile } : {}),
    ...(sample.reasoningEffort ? { reasoningEffort: sample.reasoningEffort } : {}),
    ...(sample.promptCacheKey ? { promptCacheKey: sample.promptCacheKey } : {}),
  }));
  const usage = summarizeAiUsage(samples);
  const inputTokens = usage.inputTokens;
  const cachedInputTokens = Math.min(inputTokens, usage.cachedInputTokens);
  const cacheWriteTokens = Math.min(inputTokens - cachedInputTokens, usage.cacheWriteTokens);
  const responseIds = samples.flatMap((sample) => sample.responseId ? [sample.responseId] : []);
  const responseId = result.responseId ?? responseIds.at(-1);
  return {
    samples,
    responseId,
    observed: {
      status: "observed" as const,
      actualCostMicros: usage.actualCostMicros,
      inputTokens,
      cachedInputTokens,
      cacheWriteTokens,
      outputTokens: usage.outputTokens,
      failed: result.failed === true,
    },
    details: responseId ? usageDetailsFor(samples, responseId, resultId) : {},
  };
}

function checkpointReceiptPath(value: Pick<AiReservation, "requestId" | "attemptToken">) {
  return `generationUsageReceipts/legacy-${value.requestId}-${value.attemptToken ?? "v0"}`;
}

export async function checkpointAiUsageResult<Result>(
  reservation: AiReservation,
  input: {
    kind: AiProductKind;
    resourceId: string;
    resultId: string;
    productGuard: string;
    result: Result;
    usage: AiUsageFinalization;
  },
): Promise<AiResultCheckpoint<Result>> {
  if (reservation.operationId || !reservation.attemptToken || !reservation.accountGeneration
    || !reservation.payloadFingerprint || !safeCheckpointId(input.resourceId) || !safeCheckpointId(input.resultId)
    || !SHA256_PATTERN.test(input.productGuard)) {
    throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The provider result is missing immutable recovery identity.");
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input.result);
  } catch {
    serialized = undefined;
  }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > RESULT_CHECKPOINT_MAX_BYTES) {
    throw new AiQuotaError(409, "AI_RESULT_CHECKPOINT_INVALID", "The provider result is too large to recover safely.");
  }
  const result = JSON.parse(serialized) as Result;
  const usage = observedUsageFor(reservation, input.usage, input.resultId);
  if (usage.observed.failed || !usage.responseId) {
    throw new AiQuotaError(409, "AI_RESULT_CHECKPOINT_INVALID", "An observed provider response is required before checkpointing its result.");
  }
  const attemptToken = reservation.attemptToken;
  const accountGeneration = reservation.accountGeneration;
  const payloadFingerprint = reservation.payloadFingerprint;
  const responseId = usage.responseId;
  const attemptPath = aiUsageAttemptPath(reservation);
  const now = new Date().toISOString();
  return runWithAccountGeneration({ uid: reservation.uid, generation: accountGeneration }, () =>
    runStoredDocumentTransaction([reservation.requestPath, attemptPath], (documents) => {
      const request = documents[reservation.requestPath];
      const attempt = documents[attemptPath];
      const existing = parsedResultCheckpoint(request?.resultCheckpoint);
      const existingAttempt = parsedResultCheckpoint(attempt?.resultCheckpoint);
      if (existing || existingAttempt) {
        if (!existing || !existingAttempt || existing.checkpointFingerprint !== existingAttempt.checkpointFingerprint
          || !checkpointMatchesReservation(existing, reservation) || !checkpointMatchesDocuments(existing, request, attempt)
          || existing.kind !== input.kind || existing.resourceId !== input.resourceId || existing.resultId !== input.resultId
          || existing.productGuard !== input.productGuard || existing.resultFingerprint !== contentHash(result)
          || existing.responseId !== usage.responseId || contentHash(existing.usageSamples) !== contentHash(usage.samples)) {
          throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "A different provider result is already bound to this attempt.");
        }
        return { writes: [], result: existing as AiResultCheckpoint<Result> };
      }
      const identityMatches = request?.uid === reservation.uid && request.feature === reservation.feature
        && request.attemptToken === reservation.attemptToken && request.accountGeneration === reservation.accountGeneration
        && request.payloadFingerprint === reservation.payloadFingerprint
        && attempt?.uid === reservation.uid && attempt.feature === reservation.feature
        && attempt.requestId === reservation.requestId && attempt.attemptToken === reservation.attemptToken
        && attempt.accountGeneration === reservation.accountGeneration;
      const reserved = request?.status === "reserved" && attempt?.status === "accounting_reserved";
      const uncertain = request?.status === "failed" && request.terminalReason === "provider_outcome_unknown"
        && attempt?.status === "accounting_uncertain";
      if (!identityMatches || (!reserved && !uncertain)) {
        throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The provider result no longer belongs to an active recoverable attempt.");
      }
      const identity: Omit<AiResultCheckpoint<Result>, "checkpointFingerprint"> = {
        version: 1,
        kind: input.kind,
        uid: reservation.uid,
        accountGeneration,
        feature: reservation.feature,
        requestId: reservation.requestId,
        attemptToken,
        payloadFingerprint,
        resourceId: input.resourceId,
        resultId: input.resultId,
        productGuard: input.productGuard,
        resultFingerprint: contentHash(result),
        result,
        usageSamples: usage.samples,
        responseId,
        accountingStatus: uncertain ? "accounting_uncertain" : "accounting_reserved",
        observed: { ...usage.observed, failed: false },
        details: usage.details,
        checkpointedAt: now,
      };
      const checkpoint: AiResultCheckpoint<Result> = {
        ...identity,
        checkpointFingerprint: checkpointIdentity(identity as Omit<AiResultCheckpoint, "checkpointFingerprint">),
      };
      if (!parsedResultCheckpoint(checkpoint)) {
        throw new AiQuotaError(409, "AI_RESULT_CHECKPOINT_INVALID", "The provider result checkpoint exceeds its safe recovery bounds.");
      }
      return {
        writes: [
          { path: reservation.requestPath, data: { ...request, status: "result_checkpointed", terminalReason: null,
            resultId: input.resultId, resultCheckpoint: checkpoint, updatedAt: now } },
          { path: attemptPath, data: { ...attempt, status: "result_checkpointed", resultId: input.resultId,
            resultCheckpoint: checkpoint, updatedAt: now } },
        ],
        result: checkpoint,
      };
    }));
}

export async function recoverAiUsageResult<Result>(
  reservation: AiReservation,
  expected: { kind: AiProductKind; resourceId: string },
): Promise<AiResultCheckpoint<Result>> {
  if (!reservation.attemptToken || !reservation.accountGeneration || !reservation.payloadFingerprint) {
    throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The saved provider result is missing immutable recovery identity.");
  }
  const attemptPath = aiUsageAttemptPath(reservation);
  const [request, attempt] = await Promise.all([
    getStoredDocument(reservation.requestPath),
    getStoredDocument(attemptPath),
  ]);
  const checkpoint = parsedResultCheckpoint(request?.resultCheckpoint);
  const attemptCheckpoint = parsedResultCheckpoint(attempt?.resultCheckpoint);
  if (!checkpoint || !attemptCheckpoint || checkpoint.checkpointFingerprint !== attemptCheckpoint.checkpointFingerprint
    || !checkpointMatchesReservation(checkpoint, reservation)
    || !checkpointMatchesDocuments(checkpoint, request, attempt)
    || checkpoint.kind !== expected.kind || checkpoint.resourceId !== expected.resourceId
    || !["result_checkpointed", "completed"].includes(String(request?.status))
    || !["result_checkpointed", "accounting_observed"].includes(String(attempt?.status))) {
    throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The saved provider result cannot be safely recovered.");
  }
  return checkpoint as AiResultCheckpoint<Result>;
}

async function settleAiUsageCheckpointGlobal(reservation: AiReservation, checkpoint: AiResultCheckpoint) {
  if (!checkpointMatchesReservation(checkpoint, reservation)) {
    throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The observed usage belongs to another attempt.");
  }
  const receiptPath = checkpointReceiptPath(reservation);
  const now = new Date().toISOString();
  await runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([receiptPath, reservation.globalPath], (documents) => {
    const receipt = documents[receiptPath];
    if (receipt?.status === "observed") {
      if (receipt.checkpointFingerprint !== checkpoint.checkpointFingerprint
        || receipt.globalPath !== reservation.globalPath
        || numberValue(receipt.actualCostMicros) !== checkpoint.observed.actualCostMicros) {
        throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "A different observed cost is already bound to this attempt.");
      }
      return { writes: [], result: undefined };
    }
    if (receipt && receipt.status !== "uncertain") {
      throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The global usage receipt cannot be safely settled.");
    }
    const global = documents[reservation.globalPath];
    if (!global || (receipt && checkpoint.accountingStatus !== "accounting_uncertain")
      || (!receipt && checkpoint.accountingStatus !== "accounting_reserved")) {
      throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The global usage reservation cannot be safely settled.");
    }
    return {
      writes: [
        { path: receiptPath, data: { version: 2, kind: "generic-ai-result",
          checkpointFingerprint: checkpoint.checkpointFingerprint, globalPath: reservation.globalPath,
          ...checkpoint.observed, updatedAt: now } },
        { path: reservation.globalPath, data: { ...global,
          reservedCostMicros: Math.max(0, numberValue(global.reservedCostMicros) - (receipt ? 0 : reservation.reserveCostMicros)),
          uncertainCostMicros: Math.max(0, numberValue(global.uncertainCostMicros) - numberValue(receipt?.uncertainCostMicros)),
          actualCostMicros: numberValue(global.actualCostMicros) + checkpoint.observed.actualCostMicros,
          updatedAt: now } },
      ],
      result: undefined,
    };
  }));
}

export async function settleAiUsageProduct<Result>(
  reservation: AiReservation,
  checkpoint: AiResultCheckpoint<Result>,
  productPaths: string[],
  mutateProduct: (documents: Record<string, StoredDocument | null>, checkpoint: AiResultCheckpoint<Result>) => AiProductMutation<Result>,
): Promise<Result> {
  if (!reservation.attemptToken || !reservation.accountGeneration || !parsedResultCheckpoint(checkpoint)
    || !checkpointMatchesReservation(checkpoint, reservation)) {
    throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The saved provider result belongs to another attempt.");
  }
  await settleAiUsageCheckpointGlobal(reservation, checkpoint);
  const attemptPath = aiUsageAttemptPath(reservation);
  const receiptPath = checkpointReceiptPath(reservation);
  const allowedProductPaths = new Set(productPaths);
  const transactionPaths = [...new Set([
    ...productPaths,
    attemptPath,
    reservation.requestPath,
    reservation.periodPath,
    reservation.userBudgetPath,
    receiptPath,
  ])];
  return runWithAccountGeneration({ uid: reservation.uid, generation: reservation.accountGeneration }, () =>
    runStoredDocumentTransaction(transactionPaths, (documents) => {
      const request = documents[reservation.requestPath];
      const attempt = documents[attemptPath];
      const requestCheckpoint = parsedResultCheckpoint(request?.resultCheckpoint);
      const attemptCheckpoint = parsedResultCheckpoint(attempt?.resultCheckpoint);
      if (request?.status === "completed" && attempt?.status === "accounting_observed"
        && checkpointMatchesDocuments(checkpoint, request, attempt)
        && requestCheckpoint?.checkpointFingerprint === checkpoint.checkpointFingerprint
        && attemptCheckpoint?.checkpointFingerprint === checkpoint.checkpointFingerprint) {
        return { writes: [], result: checkpoint.result };
      }
      const receipt = documents[receiptPath];
      const period = documents[reservation.periodPath];
      const budget = documents[reservation.userBudgetPath];
      if (request?.status !== "result_checkpointed" || attempt?.status !== "result_checkpointed"
        || !checkpointMatchesDocuments(checkpoint, request, attempt)
        || requestCheckpoint?.checkpointFingerprint !== checkpoint.checkpointFingerprint
        || attemptCheckpoint?.checkpointFingerprint !== checkpoint.checkpointFingerprint
        || receipt?.status !== "observed" || receipt.checkpointFingerprint !== checkpoint.checkpointFingerprint
        || receipt.globalPath !== reservation.globalPath || !period || !budget) {
        throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The checkpoint cannot be atomically settled into the product.");
      }
      const product = mutateProduct(documents, checkpoint);
      const productMutationPaths = [...product.writes.map((write) => write.path), ...(product.deletes ?? [])];
      if (productMutationPaths.some((path) => !allowedProductPaths.has(path))
        || contentHash(product.result) !== checkpoint.resultFingerprint) {
        throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The product mutation does not match the immutable provider result.");
      }
      const now = new Date().toISOString();
      const reserved = checkpoint.accountingStatus === "accounting_reserved";
      const uncertain = checkpoint.accountingStatus === "accounting_uncertain";
      const uncertainCost = uncertain ? numberValue(attempt.uncertainCostMicros) : 0;
      const periodTokens = Object.fromEntries(
        ["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"]
          .map((key) => [key, numberValue(period[key]) + numberValue(checkpoint.observed[key as keyof typeof checkpoint.observed])]),
      );
      return {
        writes: [
          ...product.writes,
          { path: attemptPath, data: { ...attempt, ...checkpoint.observed, status: "accounting_observed",
            uncertainCostMicros: 0, resultId: checkpoint.resultId, resultCheckpoint: checkpoint, updatedAt: now } },
          { path: reservation.periodPath, data: { ...period, ...periodTokens,
            requestCount: numberValue(period.requestCount) + (uncertain ? 1 : 0),
            reservedCostMicros: Math.max(0, numberValue(period.reservedCostMicros) - (reserved ? reservation.reserveCostMicros : 0)),
            uncertainCostMicros: Math.max(0, numberValue(period.uncertainCostMicros) - uncertainCost),
            actualCostMicros: numberValue(period.actualCostMicros) + checkpoint.observed.actualCostMicros,
            ...aiUsageReleaseLock(period, reservation.lockKey, reservation.requestId, reservation.attemptToken),
            updatedAt: now } },
          { path: reservation.userBudgetPath, data: { ...budget,
            reservedCostMicros: Math.max(0, numberValue(budget.reservedCostMicros) - (reserved ? reservation.reserveCostMicros : 0)),
            uncertainCostMicros: Math.max(0, numberValue(budget.uncertainCostMicros) - uncertainCost),
            actualCostMicros: numberValue(budget.actualCostMicros) + checkpoint.observed.actualCostMicros,
            updatedAt: now } },
          { path: reservation.requestPath, data: { ...request, ...checkpoint.observed, ...checkpoint.details,
            status: "completed", terminalReason: null, uncertainCostMicros: 0,
            resultId: checkpoint.resultId, resultCheckpoint: checkpoint, updatedAt: now } },
        ],
        deletes: product.deletes,
        result: product.result,
      };
    }));
}

export async function finalizeAiUsage(
  reservation: AiReservation,
  result: AiUsageFinalization,
) {
  if (reservation.recovered) return;
  if (reservation.operationId) throw new AiQuotaError(409, "DURABLE_OPERATION_REQUIRED", "Durable usage must settle through its operation.");
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
  const confirmedNotStarted = result.failed === true && result.providerOutcome === "not_started";
  if (confirmedNotStarted && (actualCostMicros !== 0 || Boolean(result.responseId) || samples.some((sample) => sample.responseId))) {
    throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "A provider response cannot be marked as not dispatched.");
  }
  // A failed call with no observed response cannot certify zero provider spend.
  // Preserve uncertainty until a late actual response or operator reconciliation.
  if (result.failed && !confirmedNotStarted && actualCostMicros === 0 && !result.responseId && !samples.some((sample) => sample.responseId)) {
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
  const attemptPath = aiUsageAttemptPath(reservation);
  const lateUsage = () => runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([
    receiptPath,
    reservation.globalPath,
    reservation.requestPath,
    attemptPath,
  ], (documents) => {
    const receipt = documents[receiptPath];
    const request = documents[reservation.requestPath];
    const attempt = documents[attemptPath];
    const exactRequest = request?.attemptToken === reservation.attemptToken;
    const exactAttempt = attempt?.requestId === reservation.requestId && attempt.attemptToken === reservation.attemptToken;
    if ((exactRequest && (request?.status === "result_checkpointed" || request?.resultCheckpoint !== undefined))
      || (exactAttempt && (attempt?.status === "result_checkpointed" || attempt?.resultCheckpoint !== undefined))) {
      return { writes: [], result: false };
    }
    if (receipt && receipt.status !== "uncertain") return { writes: [], result: true };
    const global: Record<string, unknown> = documents[reservation.globalPath] ?? {};
    return { writes: [
      { path: receiptPath, data: { version: 1, kind: "legacy-ai-completion", status: "observed", actualCostMicros, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, failed: result.failed === true, globalPath: reservation.globalPath, updatedAt: nowIso } },
      { path: reservation.globalPath, data: { ...global, reservedCostMicros: Math.max(0, numberValue(global.reservedCostMicros) - (receipt ? 0 : reservation.reserveCostMicros)), uncertainCostMicros: Math.max(0, numberValue(global.uncertainCostMicros) - numberValue(receipt?.uncertainCostMicros)), actualCostMicros: numberValue(global.actualCostMicros) + actualCostMicros, updatedAt: nowIso } },
    ], result: true };
  }));
  if (!await lateUsage()) return;
  await settleAiUsageAttempt(reservation, {
    status: "observed", actualCostMicros, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens,
    failed: result.failed === true,
  }, {
    model: models.join(" -> "), models, promptVersion: promptVersions.at(-1) ?? null, promptVersions,
    profile: profiles.at(-1) ?? null, profiles, reasoningEfforts, promptCacheKeys, attemptCount: attempts.length,
    recoveryUsed: samples.some((sample) => sample.profile?.endsWith(".recovery") === true), attempts,
    responseId: result.responseId ?? responseIds.at(-1) ?? null, responseIds, resultId: result.resultId ?? null,
    ...(confirmedNotStarted ? { terminalReason: "pre_provider_failure", providerOutcome: "not_started" } : {}),
  });
}

/** Personal accounting is addressed by immutable attempt, not the replaceable retry key. */
export function aiUsageAttemptPath(value: { requestId: string; attemptToken?: string }) {
  return `aiRequests/${value.requestId}__attempt__${value.attemptToken ?? "v0"}`;
}

async function settleAiUsageAttempt(
  reservation: Pick<AiReservation, "uid" | "accountGeneration" | "requestId" | "attemptToken" | "requestPath" | "periodPath" | "userBudgetPath" | "reserveCostMicros" | "lockKey">,
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
    const storedAttempt = documents[attemptPath];
    const sameAttempt = Boolean(storedAttempt) && storedAttempt?.requestId === reservation.requestId
      && storedAttempt.attemptToken === reservation.attemptToken;
    if ((sameRequest && (request?.status === "result_checkpointed" || request?.resultCheckpoint !== undefined))
      || (sameAttempt && (storedAttempt?.status === "result_checkpointed" || storedAttempt?.resultCheckpoint !== undefined))) {
      return { writes: [], result: false };
    }
    const attempt = storedAttempt ?? (sameRequest ? request : undefined);
    if (!attempt || !period || !budget || attempt.uid !== reservation.uid
      || (reservation.accountGeneration && attempt.accountGeneration !== reservation.accountGeneration)
      || ["completed", "accounting_observed"].includes(String(attempt.status))
      || (attempt.status === "failed" && attempt.terminalReason !== "provider_outcome_unknown")) return { writes: [], result: false };
    const uncertain = numberValue(attempt.uncertainCostMicros);
    const wasReserved = ["reserved", "accounting_reserved"].includes(String(attempt.status));
    const actual = numberValue(observed.actualCostMicros);
    const tokens = Object.fromEntries(["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"].map((key) => [key, numberValue(period[key]) + numberValue(observed[key])]));

    const now = new Date().toISOString();
    return { writes: [
      { path: attemptPath, data: { ...attempt, kind: "ai-usage-attempt", requestPath: reservation.requestPath, requestId: reservation.requestId,
        ...observed, status: "accounting_observed", uncertainCostMicros: 0, updatedAt: now } },
      { path: reservation.periodPath, data: { ...period, ...tokens,
        requestCount: Math.max(0, numberValue(period.requestCount) - (wasReserved && observed.failed ? 1 : 0)),
        reservedCostMicros: Math.max(0, numberValue(period.reservedCostMicros) - (wasReserved ? reservation.reserveCostMicros : 0)),
        uncertainCostMicros: Math.max(0, numberValue(period.uncertainCostMicros) - uncertain), actualCostMicros: numberValue(period.actualCostMicros) + actual,
        ...aiUsageReleaseLock(period, reservation.lockKey, reservation.requestId, reservation.attemptToken), updatedAt: now } },
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

/** Shared original-period policy for both durable generation kinds. */
export function generationAccountingContext(account: ServerAccount, requestId: string, feature: "course_outline" | "lesson_generation", now = new Date(), resourceKey?: string) {
  const policy = policyFor(account, feature, now);
  const budgetPool = budgetPoolFor(account);
  const shard = budgetShardFor(requestId);
  return {
    ...policy, budgetPool, shard,
    lockKey: resourceKey ? createHash("sha256").update(resourceKey).digest("hex") : undefined,
    userLimitMicros: userBudgetLimitMicros(account),
    poolLimitMicros: aiBudgetLimitsUsd()[budgetPool] * 1_000_000 / BUDGET_SHARDS,
    periodPath: `usagePeriods/${account.uid}__${feature}__${policy.periodKey}`,
    requestPath: `aiRequests/${requestId}`,
    userBudgetPath: `userAiBudgets/${account.uid}__${policy.periodKey}`,
    globalPath: `systemUsageShards/${budgetPool}__${policy.periodKey}__${shard}`,
  };
}
export function courseOutlineAccountingContext(account: ServerAccount, requestId: string, now = new Date()) {
  return generationAccountingContext(account, requestId, "course_outline", now);
}


/** Expired non-operation reservations are contained without repeating paid work. */
export async function reconcileExpiredAiUsage(requestId: string, apply: boolean, now = new Date()) {
  const requestPath = `aiRequests/${requestId}`;
  const initial = await getStoredDocument(requestPath);
  if (initial?.kind === "ai-usage-attempt") {
    if (initial.status === "accounting_observed") return "none";
    // A durable product checkpoint must be completed by its owning route so
    // product mutation and personal accounting remain one transaction. Legacy
    // receipt repair has no product mutation context and must not split them.
    if (initial.status === "result_checkpointed" || initial.resultCheckpoint !== undefined) return "none";
    const receipt = await getStoredDocument(`generationUsageReceipts/legacy-${initial.requestId}-${initial.attemptToken}`);
    if (receipt?.status !== "observed") return "none";
    if (!apply) return "would_reconcile_observed_attempt";
    const repaired = await settleAiUsageAttempt({
      uid: String(initial.uid), accountGeneration: String(initial.accountGeneration), requestId: String(initial.requestId),
      attemptToken: String(initial.attemptToken), requestPath: String(initial.requestPath), periodPath: String(initial.periodPath),
      userBudgetPath: String(initial.userBudgetPath), reserveCostMicros: numberValue(initial.reservedCostMicros), lockKey: typeof initial.lockKey === "string" ? initial.lockKey : undefined,
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

    return { writes: [
      { path: attemptPath, data: { ...request, ...documents[attemptPath], kind: "ai-usage-attempt", requestPath, requestId,
        status: receipt ? "accounting_observed" : "accounting_uncertain", actualCostMicros: actual, uncertainCostMicros: uncertain } },
      { path: requestPath, data: { ...request, status: "failed", terminalReason: receipt ? "completion_accounting_recovered" : "provider_outcome_unknown", actualCostMicros: actual, uncertainCostMicros: uncertain, updatedAt: now.toISOString() } },
      { path: periodPath, data: { ...period, requestCount: Math.max(0, numberValue(period.requestCount) - 1), reservedCostMicros: Math.max(0, numberValue(period.reservedCostMicros) - reserved), actualCostMicros: numberValue(period.actualCostMicros) + actual, uncertainCostMicros: numberValue(period.uncertainCostMicros) + uncertain, ...aiUsageReleaseLock(period, typeof request.lockKey === "string" ? request.lockKey : undefined, requestId, token) } },
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
  if (!request || request.kind === "ai-usage-attempt" || request.operationId) return;
  if (request.status === "result_checkpointed") {
    const checkpoint = parsedResultCheckpoint(request.resultCheckpoint);
    if (!checkpoint || checkpoint.requestId !== requestId
      || ![request.uid, request.feature, request.attemptToken, request.accountGeneration, request.periodPath,
        request.userBudgetPath, request.globalPath, request.payloadFingerprint]
        .every((value) => typeof value === "string" && value.length > 0)) {
      throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    await settleAiUsageCheckpointGlobal({
      uid: String(request.uid),
      feature: request.feature as AiFeature,
      requestId,
      attemptToken: String(request.attemptToken),
      accountGeneration: String(request.accountGeneration),
      periodPath: String(request.periodPath),
      globalPath: String(request.globalPath),
      userBudgetPath: String(request.userBudgetPath),
      budgetPool: String(request.globalPath).split("/").at(-1)?.split("__")[0] as AiBudgetPool,
      requestPath: `aiRequests/${requestId}`,
      reserveCostMicros: numberValue(request.reservedCostMicros),
      payloadFingerprint: String(request.payloadFingerprint),
      recovered: true,
      recoveredStatus: "result_checkpointed",
      recoveredCheckpoint: true,
      lockKey: typeof request.lockKey === "string" ? request.lockKey : undefined,
    }, checkpoint);
    return;
  }
  if (request.status !== "reserved") return;
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
