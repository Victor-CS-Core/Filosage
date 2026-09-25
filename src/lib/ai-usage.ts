import { aiUsageLockWrite, aiUsageReleaseLock, aiUsageConflictingUntil } from "@/lib/ai-usage-lock";
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { accountLifecyclePath, currentAccountGeneration, runWithAccountGeneration, runWithGlobalUsageAccounting } from "@/lib/account-lifecycle";
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

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  return Object.keys(value).length === expected.length && hasOnlyKeys(value, expected);
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

function usageDetailsFor(samples: AiUsageSample[], responseId: string | null, resultId: string | null) {
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

export class AiUsageObservationError extends AiQuotaError {
  constructor(message = "The provider usage observation is malformed and requires reconciliation.") {
    super(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", message);
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

export function extractOpenAiUsage(
  value: unknown,
  options: { allowMissingUsage?: boolean } = {},
) {
  const response = recordValue(value);
  if (!response) throw new AiUsageObservationError();
  const hasSuppliedUsage = Object.hasOwn(response, "usage");
  if (!hasSuppliedUsage) {
    if (!options.allowMissingUsage) throw new AiUsageObservationError();
    return { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  }
  const usage = recordValue(response.usage);
  if (!usage || !Object.hasOwn(usage, "input_tokens") || !Object.hasOwn(usage, "output_tokens")) {
    throw new AiUsageObservationError();
  }
  const suppliedDetails = usage && Object.hasOwn(usage, "input_tokens_details")
    ? usage.input_tokens_details
    : undefined;
  const details = suppliedDetails === undefined ? null : recordValue(suppliedDetails);
  if (suppliedDetails !== undefined && !details) throw new AiUsageObservationError();
  const counter = (supplied: unknown) => supplied === undefined ? 0 : supplied;
  const inputTokens = usage.input_tokens;
  const cachedInputTokens = counter(details?.cached_tokens);
  const cacheWriteTokens = counter(details?.cache_write_tokens);
  const outputTokens = usage.output_tokens;
  const cachedTotal = nonnegativeInteger(cachedInputTokens) && nonnegativeInteger(cacheWriteTokens)
    ? safeCounterAdd(cachedInputTokens, cacheWriteTokens)
    : null;
  if (!nonnegativeInteger(inputTokens) || !nonnegativeInteger(cachedInputTokens)
    || !nonnegativeInteger(cacheWriteTokens) || !nonnegativeInteger(outputTokens)
    || cachedTotal === null || cachedTotal > inputTokens) {
    throw new AiUsageObservationError();
  }
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
  };
}

function defaultModelFor(feature: AiFeature) {
  if (feature === "command_center_draft") return serverEnvironment.OPENAI_COMMAND_CENTER_MODEL || serverEnvironment.OPENAI_MODEL || "gpt-5.6-terra";
  if (feature === "tutor" || feature === "flashcard_generation") return serverEnvironment.OPENAI_TUTOR_MODEL || "gpt-5.6-luna";
  if (feature === "course_banner") return serverEnvironment.OPENAI_COURSE_IMAGE_MODEL || "gpt-image-2.5-flare";
  if (feature === "lesson_generation") return serverEnvironment.OPENAI_LESSON_MODEL || "gpt-5.6-luna";
  return serverEnvironment.OPENAI_COURSE_MODEL || serverEnvironment.OPENAI_MODEL || "gpt-5.6-terra";
}

type ValidatedObservedUsage = {
  samples: AiUsageSample[];
  responseId: string | null;
  observed: ObservedAiUsage;
};

function validatedObservedUsage(
  reservation: Pick<AiReservation, "feature">,
  result: AiUsageFinalization,
): ValidatedObservedUsage | null {
  const value = recordValue(result);
  if (!value
    || (result.failed !== undefined && typeof result.failed !== "boolean")
    || (result.providerOutcome !== undefined
      && (result.providerOutcome !== "not_started" || result.failed !== true))
    || !optionalBoundedText(result.responseId) || !optionalBoundedText(result.resultId)
    || !optionalBoundedText(result.promptVersion) || !optionalBoundedText(result.profile)
    || !optionalBoundedText(result.reasoningEffort) || !optionalBoundedText(result.promptCacheKey)
    || (result.model !== undefined && !boundedText(result.model, 200))) return null;

  let samples: AiUsageSample[] | null;
  if (Object.hasOwn(value, "usageSamples")) {
    samples = parsedUsageSamples(result.usageSamples);
  } else {
    const directKeys = ["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"] as const;
    const hasDirectUsage = directKeys.some((key) => Object.hasOwn(value, key));
    if (!hasDirectUsage) {
      if (result.failed !== true || result.responseId !== undefined) return null;
      samples = [{
        model: result.model ?? defaultModelFor(reservation.feature),
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        ...(result.promptVersion !== undefined ? { promptVersion: result.promptVersion } : {}),
        ...(result.profile !== undefined ? { profile: result.profile } : {}),
        ...(result.reasoningEffort !== undefined ? { reasoningEffort: result.reasoningEffort } : {}),
        ...(result.promptCacheKey !== undefined ? { promptCacheKey: result.promptCacheKey } : {}),
      }];
    } else {
      if (!Object.hasOwn(value, "inputTokens") || !Object.hasOwn(value, "outputTokens")) return null;
      const counters = [
        result.inputTokens,
        result.cachedInputTokens === undefined ? 0 : result.cachedInputTokens,
        result.cacheWriteTokens === undefined ? 0 : result.cacheWriteTokens,
        result.outputTokens,
      ];
      if (!counters.every(nonnegativeInteger)) return null;
      samples = [{
        model: result.model ?? defaultModelFor(reservation.feature),
        inputTokens: counters[0]!,
        cachedInputTokens: counters[1]!,
        cacheWriteTokens: counters[2]!,
        outputTokens: counters[3]!,
        ...(result.responseId !== undefined ? { responseId: result.responseId } : {}),
        ...(result.promptVersion !== undefined ? { promptVersion: result.promptVersion } : {}),
        ...(result.profile !== undefined ? { profile: result.profile } : {}),
        ...(result.reasoningEffort !== undefined ? { reasoningEffort: result.reasoningEffort } : {}),
        ...(result.promptCacheKey !== undefined ? { promptCacheKey: result.promptCacheKey } : {}),
      }];
    }
  }
  if (!samples) return null;

  let inputTokens = 0;
  let cachedInputTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  let actualCostMicros = 0;
  for (const sample of samples) {
    if (sample.cachedInputTokens > sample.inputTokens
      || sample.cacheWriteTokens > sample.inputTokens - sample.cachedInputTokens) return null;
    const sampleCost = estimateAiUsageCostMicros(sample);
    if (!nonnegativeInteger(sampleCost)) return null;
    const nextInput = safeCounterAdd(inputTokens, sample.inputTokens);
    const nextCached = safeCounterAdd(cachedInputTokens, sample.cachedInputTokens);
    const nextCacheWrite = safeCounterAdd(cacheWriteTokens, sample.cacheWriteTokens);
    const nextOutput = safeCounterAdd(outputTokens, sample.outputTokens);
    const nextCost = safeCounterAdd(actualCostMicros, sampleCost);
    if ([nextInput, nextCached, nextCacheWrite, nextOutput, nextCost].some((counter) => counter === null)) return null;
    inputTokens = nextInput!;
    cachedInputTokens = nextCached!;
    cacheWriteTokens = nextCacheWrite!;
    outputTokens = nextOutput!;
    actualCostMicros = nextCost!;
  }
  if (cachedInputTokens > inputTokens || cacheWriteTokens > inputTokens - cachedInputTokens) return null;
  const responseIds = samples.flatMap((sample) => sample.responseId ? [sample.responseId] : []);
  return {
    samples,
    responseId: result.responseId ?? responseIds.at(-1) ?? null,
    observed: {
      status: "observed",
      actualCostMicros,
      inputTokens,
      cachedInputTokens,
      cacheWriteTokens,
      outputTokens,
      failed: result.failed === true,
    },
  };
}

function observedUsageFor(reservation: Pick<AiReservation, "feature">, result: AiUsageFinalization, resultId: string) {
  const usage = validatedObservedUsage(reservation, result);
  if (!usage) throw new AiQuotaError(409, "AI_RESULT_CHECKPOINT_INVALID", "The provider usage observation is malformed.");
  return {
    ...usage,
    responseId: usage.responseId ?? undefined,
    details: usage.responseId ? usageDetailsFor(usage.samples, usage.responseId, resultId) : {},
  };
}

function checkpointReceiptPath(value: Pick<AiReservation, "requestId" | "attemptToken">) {
  return `generationUsageReceipts/legacy-${value.requestId}-${value.attemptToken ?? "v0"}`;
}

function checkpointReceiptId(value: Pick<AiReservation, "requestId" | "attemptToken">) {
  return `legacy-${value.requestId}-${value.attemptToken ?? "v0"}`;
}

interface ObservedAiUsage {
  status: "observed";
  actualCostMicros: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  failed: boolean;
}

function parsedLegacyObservedReceipt(
  value: unknown,
  reservation: Pick<AiReservation, "requestId" | "attemptToken" | "globalPath">,
  expected?: ObservedAiUsage,
) {
  const receipt = recordValue(value);
  if (!receipt || !hasExactKeys(receipt, ["id", "version", "kind", "status", "actualCostMicros", "inputTokens",
    "cachedInputTokens", "cacheWriteTokens", "outputTokens", "failed", "globalPath", "updatedAt"])
    || receipt.id !== checkpointReceiptId(reservation)
    || receipt.version !== 1 || receipt.kind !== "legacy-ai-completion" || receipt.status !== "observed"
    || receipt.globalPath !== reservation.globalPath || !canonicalIsoDate(receipt.updatedAt)
    || typeof receipt.failed !== "boolean"
    || ![receipt.actualCostMicros, receipt.inputTokens, receipt.cachedInputTokens,
      receipt.cacheWriteTokens, receipt.outputTokens].every(nonnegativeInteger)
    || Number(receipt.cachedInputTokens) + Number(receipt.cacheWriteTokens) > Number(receipt.inputTokens)
    || (expected && (receipt.failed !== expected.failed
      || receipt.actualCostMicros !== expected.actualCostMicros
      || receipt.inputTokens !== expected.inputTokens
      || receipt.cachedInputTokens !== expected.cachedInputTokens
      || receipt.cacheWriteTokens !== expected.cacheWriteTokens
      || receipt.outputTokens !== expected.outputTokens))) return null;
  return receipt;
}

function parsedLegacyUncertainReceipt(
  value: unknown,
  reservation: Pick<AiReservation, "requestId" | "attemptToken" | "globalPath" | "reserveCostMicros">,
) {
  const receipt = recordValue(value);
  if (!receipt || !hasExactKeys(receipt, ["id", "version", "kind", "status", "actualCostMicros", "uncertainCostMicros", "globalPath"])
    || receipt.id !== checkpointReceiptId(reservation)
    || receipt.version !== 1 || receipt.kind !== "legacy-ai-completion" || receipt.status !== "uncertain"
    || receipt.globalPath !== reservation.globalPath || receipt.actualCostMicros !== 0
    || !nonnegativeInteger(reservation.reserveCostMicros) || reservation.reserveCostMicros <= 0
    || receipt.uncertainCostMicros !== reservation.reserveCostMicros) return null;
  return receipt;
}

function parsedGenericObservedReceipt(
  value: unknown,
  reservation: Pick<AiReservation, "requestId" | "attemptToken" | "globalPath">,
  checkpoint: AiResultCheckpoint,
) {
  const parsed = parsedGenericObservedReceiptProfile(value, reservation, checkpoint.observed);
  return parsed?.checkpointFingerprint === checkpoint.checkpointFingerprint ? parsed.raw : null;
}

function parsedGenericObservedReceiptProfile(
  value: unknown,
  reservation: Pick<AiReservation, "requestId" | "attemptToken" | "globalPath">,
  expected?: ObservedAiUsage,
) {
  const receipt = recordValue(value);
  if (!receipt || !hasExactKeys(receipt, ["id", "version", "kind", "checkpointFingerprint", "globalPath", "status",
    "actualCostMicros", "inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens", "failed", "updatedAt"])
    || receipt.id !== checkpointReceiptId(reservation)
    || receipt.version !== 2 || receipt.kind !== "generic-ai-result" || receipt.status !== "observed"
    || !SHA256_PATTERN.test(String(receipt.checkpointFingerprint))
    || receipt.globalPath !== reservation.globalPath || !canonicalIsoDate(receipt.updatedAt)
    || receipt.failed !== false
    || ![receipt.actualCostMicros, receipt.inputTokens, receipt.cachedInputTokens,
      receipt.cacheWriteTokens, receipt.outputTokens].every(nonnegativeInteger)
    || Number(receipt.cachedInputTokens) + Number(receipt.cacheWriteTokens) > Number(receipt.inputTokens)) return null;
  const observed: ObservedAiUsage = {
    status: "observed",
    actualCostMicros: Number(receipt.actualCostMicros),
    inputTokens: Number(receipt.inputTokens),
    cachedInputTokens: Number(receipt.cachedInputTokens),
    cacheWriteTokens: Number(receipt.cacheWriteTokens),
    outputTokens: Number(receipt.outputTokens),
    failed: false,
  };
  if (expected && !sameObservedUsage(observed, expected)) return null;
  return { raw: receipt, checkpointFingerprint: String(receipt.checkpointFingerprint), observed };
}

type LegacyObservedReceipt = {
  profile: "minimal_v1" | "full_v1";
  observed: ObservedAiUsage;
};

function parsedLegacyMinimalObservedReceipt(
  value: unknown,
  reservation: Pick<AiReservation, "requestId" | "attemptToken" | "globalPath">,
): LegacyObservedReceipt | null {
  const receipt = recordValue(value);
  if (!receipt || !hasExactKeys(receipt, ["id", "version", "kind", "status", "actualCostMicros", "inputTokens", "outputTokens", "globalPath"])
    || receipt.id !== checkpointReceiptId(reservation)
    || receipt.version !== 1 || receipt.kind !== "legacy-ai-completion" || receipt.status !== "observed"
    || receipt.globalPath !== reservation.globalPath
    || ![receipt.actualCostMicros, receipt.inputTokens, receipt.outputTokens].every(nonnegativeInteger)) return null;
  return {
    profile: "minimal_v1",
    observed: {
      status: "observed",
      actualCostMicros: Number(receipt.actualCostMicros),
      inputTokens: Number(receipt.inputTokens),
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: Number(receipt.outputTokens),
      failed: false,
    },
  };
}

function sameObservedUsage(left: ObservedAiUsage, right: ObservedAiUsage) {
  return left.status === right.status && left.actualCostMicros === right.actualCostMicros
    && left.inputTokens === right.inputTokens && left.cachedInputTokens === right.cachedInputTokens
    && left.cacheWriteTokens === right.cacheWriteTokens && left.outputTokens === right.outputTokens
    && left.failed === right.failed;
}

function parsedObservedAccountingState(value: unknown): ObservedAiUsage | null {
  const state = recordValue(value);
  if (!state || typeof state.failed !== "boolean"
    || ![state.actualCostMicros, state.inputTokens, state.cachedInputTokens,
      state.cacheWriteTokens, state.outputTokens].every(nonnegativeInteger)
    || Number(state.cachedInputTokens) + Number(state.cacheWriteTokens) > Number(state.inputTokens)) return null;
  return {
    status: "observed",
    actualCostMicros: Number(state.actualCostMicros),
    inputTokens: Number(state.inputTokens),
    cachedInputTokens: Number(state.cachedInputTokens),
    cacheWriteTokens: Number(state.cacheWriteTokens),
    outputTokens: Number(state.outputTokens),
    failed: state.failed,
  };
}

function parsedLegacyObservedReceiptProfile(
  value: unknown,
  reservation: Pick<AiReservation, "requestId" | "attemptToken" | "globalPath">,
  expected?: ObservedAiUsage,
): LegacyObservedReceipt | null {
  const full = parsedLegacyObservedReceipt(value, reservation);
  const parsed = full
    ? {
        profile: "full_v1" as const,
        observed: {
          status: "observed" as const,
          actualCostMicros: Number(full.actualCostMicros),
          inputTokens: Number(full.inputTokens),
          cachedInputTokens: Number(full.cachedInputTokens),
          cacheWriteTokens: Number(full.cacheWriteTokens),
          outputTokens: Number(full.outputTokens),
          failed: Boolean(full.failed),
        },
      }
    : parsedLegacyMinimalObservedReceipt(value, reservation);
  if (!parsed || (expected && !sameObservedUsage(parsed.observed, expected))) return null;
  return parsed;
}

function usageCounter(value: unknown) {
  if (value === undefined) return 0;
  return nonnegativeInteger(value) ? value : null;
}

function reconciliationRequired(message: string) {
  return new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", message);
}

function safeCounterAdd(left: number, right: number) {
  const result = left + right;
  return Number.isSafeInteger(result) ? result : null;
}

function exactAttemptIdentity(
  attempt: StoredDocument | null | undefined,
  reservation: Pick<AiReservation, "uid" | "feature" | "requestId" | "attemptToken" | "accountGeneration" | "requestPath" | "periodPath" | "userBudgetPath" | "globalPath" | "reserveCostMicros">,
) {
  return Boolean(attempt) && attempt?.id === aiUsageAttemptPath(reservation).split("/")[1]
    && attempt.kind === "ai-usage-attempt"
    && attempt.uid === reservation.uid && attempt.feature === reservation.feature
    && attempt.requestId === reservation.requestId && attempt.attemptToken === reservation.attemptToken
    && attempt.accountGeneration === reservation.accountGeneration && attempt.requestPath === reservation.requestPath
    && attempt.periodPath === reservation.periodPath && attempt.userBudgetPath === reservation.userBudgetPath
    && attempt.globalPath === reservation.globalPath && attempt.reservedCostMicros === reservation.reserveCostMicros;
}

function exactRootIdentity(
  request: StoredDocument | null | undefined,
  reservation: Pick<AiReservation, "uid" | "feature" | "requestId" | "attemptToken" | "accountGeneration" | "periodPath" | "userBudgetPath" | "globalPath" | "reserveCostMicros">,
) {
  return Boolean(request) && request?.id === reservation.requestId
    && request.uid === reservation.uid && request.feature === reservation.feature
    && request.attemptToken === reservation.attemptToken && request.accountGeneration === reservation.accountGeneration
    && request.periodPath === reservation.periodPath && request.userBudgetPath === reservation.userBudgetPath
    && request.globalPath === reservation.globalPath && request.reservedCostMicros === reservation.reserveCostMicros;
}

type CheckpointAccountingState = "checkpointed" | "completed";

function exactCheckpointAccountingState(
  request: StoredDocument | null | undefined,
  attempt: StoredDocument | null | undefined,
  reservation: AiReservation,
  checkpoint: AiResultCheckpoint,
): CheckpointAccountingState | null {
  if (!request || !attempt || !exactRootIdentity(request, reservation) || !exactAttemptIdentity(attempt, reservation)) return null;
  const requestCheckpoint = parsedResultCheckpoint(request.resultCheckpoint);
  const attemptCheckpoint = parsedResultCheckpoint(attempt.resultCheckpoint);
  if (!requestCheckpoint || !attemptCheckpoint
    || requestCheckpoint.checkpointFingerprint !== checkpoint.checkpointFingerprint
    || attemptCheckpoint.checkpointFingerprint !== checkpoint.checkpointFingerprint
    || !checkpointMatchesDocuments(checkpoint, request, attempt)) return null;

  const requestUncertain = usageCounter(request.uncertainCostMicros);
  const attemptUncertain = usageCounter(attempt.uncertainCostMicros);
  if (requestUncertain === null || attemptUncertain === null) return null;
  if (request.status === "completed" && attempt.status === "accounting_observed") {
    const requestObserved = parsedObservedAccountingState(request);
    const attemptObserved = parsedObservedAccountingState(attempt);
    return requestUncertain === 0 && attemptUncertain === 0
      && Boolean(requestObserved) && Boolean(attemptObserved)
      && sameObservedUsage(requestObserved!, checkpoint.observed)
      && sameObservedUsage(attemptObserved!, checkpoint.observed)
      ? "completed"
      : null;
  }
  if (request.status !== "result_checkpointed" || attempt.status !== "result_checkpointed"
    || request.terminalReason !== null) return null;
  const expectedUncertain = checkpoint.accountingStatus === "accounting_uncertain"
    ? reservation.reserveCostMicros
    : 0;
  const outerObservedCounters = [
    request.actualCostMicros,
    request.inputTokens,
    request.cachedInputTokens,
    request.cacheWriteTokens,
    request.outputTokens,
    attempt.actualCostMicros,
    attempt.inputTokens,
    attempt.cachedInputTokens,
    attempt.cacheWriteTokens,
    attempt.outputTokens,
  ].map(usageCounter);
  return requestUncertain === expectedUncertain && attemptUncertain === expectedUncertain
    && outerObservedCounters.every((value) => value === 0)
    ? "checkpointed"
    : null;
}

function checkpointGlobalSettlementWrites(
  documents: Record<string, StoredDocument | null>,
  reservation: AiReservation,
  checkpoint: AiResultCheckpoint,
  accountingState: CheckpointAccountingState,
  updatedAt: string,
) {
  const receiptPath = checkpointReceiptPath(reservation);
  const receipt = documents[receiptPath];
  const global = documents[reservation.globalPath];
  const reservedCostMicros = usageCounter(global?.reservedCostMicros);
  const uncertainCostMicros = usageCounter(global?.uncertainCostMicros);
  const actualCostMicros = usageCounter(global?.actualCostMicros);
  if (!global || reservedCostMicros === null || uncertainCostMicros === null || actualCostMicros === null
    || !nonnegativeInteger(reservation.reserveCostMicros) || reservation.reserveCostMicros <= 0) {
    throw reconciliationRequired("The global usage counters cannot be safely settled.");
  }

  const genericReceipt = receipt ? parsedGenericObservedReceipt(receipt, reservation, checkpoint) : null;
  const legacyReceipt = receipt ? parsedLegacyObservedReceipt(receipt, reservation, checkpoint.observed) : null;
  const uncertainReceipt = receipt ? parsedLegacyUncertainReceipt(receipt, reservation) : null;
  if (receipt && Number(Boolean(genericReceipt)) + Number(Boolean(legacyReceipt)) + Number(Boolean(uncertainReceipt)) !== 1) {
    throw reconciliationRequired("The global usage receipt cannot be safely settled.");
  }
  if (genericReceipt || legacyReceipt) {
    if (actualCostMicros < checkpoint.observed.actualCostMicros) {
      throw reconciliationRequired("The observed receipt is not represented by its global shard.");
    }
    return legacyReceipt
      ? [{ path: receiptPath, data: genericObservedReceipt(checkpoint, reservation, updatedAt) }]
      : [];
  }
  if (accountingState !== "checkpointed") {
    throw reconciliationRequired("Completed checkpoint accounting requires an exact observed receipt.");
  }

  const reservedDelta = receipt ? 0 : reservation.reserveCostMicros;
  const uncertainDelta = uncertainReceipt ? reservation.reserveCostMicros : 0;
  const nextActual = safeCounterAdd(actualCostMicros, checkpoint.observed.actualCostMicros);
  if ((uncertainReceipt && checkpoint.accountingStatus !== "accounting_uncertain")
    || (!uncertainReceipt && checkpoint.accountingStatus !== "accounting_reserved")
    || reservedCostMicros < reservedDelta || uncertainCostMicros < uncertainDelta || nextActual === null) {
    throw reconciliationRequired("The global usage reservation cannot be safely settled.");
  }
  return [
    { path: receiptPath, data: genericObservedReceipt(checkpoint, reservation, updatedAt) },
    { path: reservation.globalPath, data: { ...global,
      reservedCostMicros: reservedCostMicros - reservedDelta,
      uncertainCostMicros: uncertainCostMicros - uncertainDelta,
      actualCostMicros: nextActual,
      updatedAt } },
  ];
}

function genericObservedReceipt(checkpoint: AiResultCheckpoint, reservation: AiReservation, updatedAt: string) {
  return {
    version: 2,
    kind: "generic-ai-result",
    checkpointFingerprint: checkpoint.checkpointFingerprint,
    globalPath: reservation.globalPath,
    ...checkpoint.observed,
    updatedAt,
  };
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
  expected: { kind: AiProductKind; resourceId: string; resultId: string },
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
    || checkpoint.kind !== expected.kind || checkpoint.resourceId !== expected.resourceId || checkpoint.resultId !== expected.resultId
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
  const attemptPath = aiUsageAttemptPath(reservation);
  const now = new Date().toISOString();
  await runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([
    receiptPath,
    reservation.globalPath,
    reservation.requestPath,
    attemptPath,
  ], (documents) => {
    const accountingState = exactCheckpointAccountingState(
      documents[reservation.requestPath],
      documents[attemptPath],
      reservation,
      checkpoint,
    );
    if (!accountingState) {
      throw reconciliationRequired("The checkpoint request attempt cannot be safely settled.");
    }
    return { writes: checkpointGlobalSettlementWrites(documents, reservation, checkpoint, accountingState, now), result: undefined };
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
    reservation.globalPath,
  ])];
  return runWithAccountGeneration({ uid: reservation.uid, generation: reservation.accountGeneration }, () =>
    runStoredDocumentTransaction(transactionPaths, (documents) => {
      const request = documents[reservation.requestPath];
      const attempt = documents[attemptPath];
      const period = documents[reservation.periodPath];
      const budget = documents[reservation.userBudgetPath];
      const accountingState = exactCheckpointAccountingState(request, attempt, reservation, checkpoint);
      const periodRequests = usageCounter(period?.requestCount);
      const periodReserved = usageCounter(period?.reservedCostMicros);
      const periodUncertain = usageCounter(period?.uncertainCostMicros);
      const periodActual = usageCounter(period?.actualCostMicros);
      const budgetReserved = usageCounter(budget?.reservedCostMicros);
      const budgetUncertain = usageCounter(budget?.uncertainCostMicros);
      const budgetActual = usageCounter(budget?.actualCostMicros);
      const periodTokenCounters = ["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"].map((key) => (
        [key, usageCounter(period?.[key])] as const
      ));
      if (!accountingState || !request || !attempt || !period || !budget
        || [periodRequests, periodReserved, periodUncertain, periodActual,
          budgetReserved, budgetUncertain, budgetActual].some((value) => value === null)
        || periodTokenCounters.some(([, value]) => value === null)) {
        throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The checkpoint cannot be atomically settled into the product.");
      }
      const now = new Date().toISOString();
      const globalWrites = checkpointGlobalSettlementWrites(documents, reservation, checkpoint, accountingState, now);
      if (accountingState === "completed") {
        return { writes: globalWrites, result: checkpoint.result };
      }

      const reserved = checkpoint.accountingStatus === "accounting_reserved";
      const uncertain = checkpoint.accountingStatus === "accounting_uncertain";
      const reservedDelta = reserved ? reservation.reserveCostMicros : 0;
      const uncertainDelta = uncertain ? reservation.reserveCostMicros : 0;
      const requestDelta = uncertain ? 1 : 0;
      const nextPeriodRequests = safeCounterAdd(periodRequests!, requestDelta);
      const nextPeriodActual = safeCounterAdd(periodActual!, checkpoint.observed.actualCostMicros);
      const nextBudgetActual = safeCounterAdd(budgetActual!, checkpoint.observed.actualCostMicros);
      const periodTokenEntries = periodTokenCounters.map(([key, value]) => (
        [key, safeCounterAdd(value!, checkpoint.observed[key as keyof typeof checkpoint.observed] as number)] as const
      ));
      if (periodReserved! < reservedDelta || budgetReserved! < reservedDelta
        || periodUncertain! < uncertainDelta || budgetUncertain! < uncertainDelta
        || nextPeriodRequests === null || nextPeriodActual === null || nextBudgetActual === null
        || periodTokenEntries.some(([, value]) => value === null)) {
        throw reconciliationRequired("The checkpoint personal usage counters cannot be safely settled.");
      }
      const product = mutateProduct(documents, checkpoint);
      const productMutationPaths = [...product.writes.map((write) => write.path), ...(product.deletes ?? [])];
      if (productMutationPaths.some((path) => !allowedProductPaths.has(path))
        || contentHash(product.result) !== checkpoint.resultFingerprint) {
        throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "The product mutation does not match the immutable provider result.");
      }
      const periodTokens = Object.fromEntries(periodTokenEntries);
      return {
        writes: [
          ...globalWrites,
          ...product.writes,
          { path: attemptPath, data: { ...attempt, ...checkpoint.observed, status: "accounting_observed",
            uncertainCostMicros: 0, resultId: checkpoint.resultId, resultCheckpoint: checkpoint, updatedAt: now } },
          { path: reservation.periodPath, data: { ...period, ...periodTokens,
            requestCount: nextPeriodRequests,
            reservedCostMicros: periodReserved! - reservedDelta,
            uncertainCostMicros: periodUncertain! - uncertainDelta,
            actualCostMicros: nextPeriodActual,
            ...aiUsageReleaseLock(period, reservation.lockKey, reservation.requestId, reservation.attemptToken),
            updatedAt: now } },
          { path: reservation.userBudgetPath, data: { ...budget,
            reservedCostMicros: budgetReserved! - reservedDelta,
            uncertainCostMicros: budgetUncertain! - uncertainDelta,
            actualCostMicros: nextBudgetActual,
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

type FinalizedPersonalState = "reserved" | "uncertain" | "terminal";

function exactZeroOuterUsage(request: StoredDocument, attempt: StoredDocument) {
  return [
    request.actualCostMicros,
    request.inputTokens,
    request.cachedInputTokens,
    request.cacheWriteTokens,
    request.outputTokens,
    attempt.actualCostMicros,
    attempt.inputTokens,
    attempt.cachedInputTokens,
    attempt.cacheWriteTokens,
    attempt.outputTokens,
  ].every((counter) => usageCounter(counter) === 0);
}

function finalizedPersonalState(
  request: StoredDocument,
  attempt: StoredDocument,
  reservation: AiReservation,
  observed: ObservedAiUsage,
): FinalizedPersonalState | null {
  if (!exactRootIdentity(request, reservation) || !exactAttemptIdentity(attempt, reservation)) return null;
  const requestUncertain = usageCounter(request.uncertainCostMicros);
  const attemptUncertain = usageCounter(attempt.uncertainCostMicros);
  if (requestUncertain === null || attemptUncertain === null) return null;
  if (request.status === "reserved" && attempt.status === "accounting_reserved") {
    return requestUncertain === 0 && attemptUncertain === 0 && exactZeroOuterUsage(request, attempt)
      ? "reserved"
      : null;
  }
  if (request.status === "failed" && request.terminalReason === "provider_outcome_unknown"
    && attempt.status === "accounting_uncertain") {
    return requestUncertain === reservation.reserveCostMicros
      && attemptUncertain === reservation.reserveCostMicros
      && exactZeroOuterUsage(request, attempt)
      ? "uncertain"
      : null;
  }
  if (!["completed", "failed"].includes(String(request.status)) || attempt.status !== "accounting_observed"
    || requestUncertain !== 0 || attemptUncertain !== 0) return null;
  const requestObserved = parsedObservedAccountingState(request);
  const attemptObserved = parsedObservedAccountingState(attempt);
  if (!requestObserved || !attemptObserved
    || !sameObservedUsage(requestObserved, observed) || !sameObservedUsage(attemptObserved, observed)) return null;
  if (request.status === "completed") {
    return !observed.failed && (request.terminalReason === undefined || request.terminalReason === null)
      ? "terminal"
      : null;
  }
  const terminalReason = request.terminalReason;
  return (!observed.failed && terminalReason === "provider_outcome_unknown")
    || (observed.failed && (terminalReason === undefined || terminalReason === null
      || terminalReason === "pre_provider_failure" || terminalReason === "provider_outcome_unknown"))
    ? "terminal"
    : null;
}

function legacyObservedReceiptWrite(reservation: AiReservation, observed: ObservedAiUsage, updatedAt: string) {
  return {
    version: 1,
    kind: "legacy-ai-completion",
    ...observed,
    globalPath: reservation.globalPath,
    updatedAt,
  };
}

async function settleFinalizedAiUsage(
  reservation: AiReservation,
  observed: ObservedAiUsage,
  details: Record<string, unknown>,
  updatedAt: string,
) {
  if (!boundedText(reservation.accountGeneration, 64) || !boundedText(reservation.attemptToken, 64)
    || !nonnegativeInteger(reservation.reserveCostMicros) || reservation.reserveCostMicros <= 0) {
    throw reconciliationRequired("The observed usage is missing immutable attempt identity.");
  }
  const attemptPath = aiUsageAttemptPath(reservation);
  const receiptPath = checkpointReceiptPath(reservation);
  const lifecyclePath = accountLifecyclePath(reservation.uid);
  const transactionPaths = [
    receiptPath,
    reservation.globalPath,
    reservation.requestPath,
    attemptPath,
    reservation.periodPath,
    reservation.userBudgetPath,
    lifecyclePath,
  ];
  const accountResult = await runWithAccountGeneration(
    { uid: reservation.uid, generation: reservation.accountGeneration },
    () => runStoredDocumentTransaction(transactionPaths, (documents) => {
      const lifecycle = documents[lifecyclePath];
      const request = documents[reservation.requestPath];
      const attempt = documents[attemptPath];
      const period = documents[reservation.periodPath];
      const budget = documents[reservation.userBudgetPath];
      if (!lifecycle || lifecycle.generation !== reservation.accountGeneration || lifecycle.uid !== reservation.uid
        || lifecycle.state !== "active") {
        if (!request && !attempt && !period && !budget
          && lifecycle?.generation === reservation.accountGeneration
          && ["deleting", "deleted"].includes(String(lifecycle?.state))) {
          return { writes: [], result: "deleted" as const };
        }
        throw reconciliationRequired("The personal usage generation is no longer safely writable.");
      }
      if (!request || !attempt) {
        throw reconciliationRequired("The personal usage attempt is missing.");
      }
      const rootMatches = exactRootIdentity(request, reservation);
      const attemptMatches = exactAttemptIdentity(attempt, reservation);
      if (!rootMatches || !attemptMatches) {
        throw reconciliationRequired("The observed usage belongs to another request attempt.");
      }

      const hasCheckpointState = request.status === "result_checkpointed" || attempt.status === "result_checkpointed"
        || request.resultCheckpoint !== undefined || attempt.resultCheckpoint !== undefined;
      if (hasCheckpointState) {
        const checkpoint = parsedResultCheckpoint(request.resultCheckpoint);
        if (!checkpoint || exactCheckpointAccountingState(request, attempt, reservation, checkpoint) === null) {
          throw reconciliationRequired("The checkpoint state cannot be reconciled by ordinary finalization.");
        }
        return { writes: [], result: "checkpoint" as const };
      }

      const receiptValue = documents[receiptPath];
      const observedReceipt = receiptValue
        ? parsedLegacyObservedReceiptProfile(receiptValue, reservation, observed)
        : null;
      const uncertainReceipt = receiptValue ? parsedLegacyUncertainReceipt(receiptValue, reservation) : null;
      const genericReceipt = receiptValue
        ? parsedGenericObservedReceiptProfile(receiptValue, reservation, observed)
        : null;
      if (receiptValue && Number(Boolean(observedReceipt)) + Number(Boolean(uncertainReceipt))
        + Number(Boolean(genericReceipt)) !== 1) {
        throw reconciliationRequired("The global usage receipt cannot be safely settled.");
      }
      if (genericReceipt) {
        throw reconciliationRequired("A checkpoint receipt contradicts ordinary personal accounting.");
      }

      const state = finalizedPersonalState(request, attempt, reservation, observed);
      if (!state
        || (state === "terminal" && !observedReceipt)
        || (state === "uncertain" && !uncertainReceipt && !observedReceipt)
        || (!receiptValue && state !== "reserved")) {
        throw reconciliationRequired("The global usage receipt contradicts the request attempt state.");
      }

      const global = documents[reservation.globalPath];
      const globalReserved = usageCounter(global?.reservedCostMicros);
      const globalUncertain = usageCounter(global?.uncertainCostMicros);
      const globalActual = usageCounter(global?.actualCostMicros);
      if (!global || globalReserved === null || globalUncertain === null || globalActual === null
        || (observedReceipt && globalActual < observed.actualCostMicros)) {
        throw reconciliationRequired("The global usage counters cannot be safely settled.");
      }
      if (state === "terminal") return { writes: [], result: "settled" as const };

      const periodRequests = usageCounter(period?.requestCount);
      const periodReserved = usageCounter(period?.reservedCostMicros);
      const periodUncertain = usageCounter(period?.uncertainCostMicros);
      const periodActual = usageCounter(period?.actualCostMicros);
      const budgetReserved = usageCounter(budget?.reservedCostMicros);
      const budgetUncertain = usageCounter(budget?.uncertainCostMicros);
      const budgetActual = usageCounter(budget?.actualCostMicros);
      const reservedDelta = state === "reserved" ? reservation.reserveCostMicros : 0;
      const uncertainDelta = state === "uncertain" ? reservation.reserveCostMicros : 0;
      const requestDelta = state === "reserved" && observed.failed ? 1 : 0;
      const nextPeriodActual = periodActual === null ? null : safeCounterAdd(periodActual, observed.actualCostMicros);
      const nextBudgetActual = budgetActual === null ? null : safeCounterAdd(budgetActual, observed.actualCostMicros);
      const tokenEntries = ["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"].map((key) => {
        const current = usageCounter(period?.[key]);
        const delta = observed[key as keyof ObservedAiUsage];
        return [key, current === null || typeof delta !== "number" ? null : safeCounterAdd(current, delta)] as const;
      });
      if (!period || !budget
        || [periodRequests, periodReserved, periodUncertain, periodActual,
          budgetReserved, budgetUncertain, budgetActual].some((counter) => counter === null)
        || nextPeriodActual === null || nextBudgetActual === null
        || tokenEntries.some(([, counter]) => counter === null)
        || periodRequests! < requestDelta
        || periodReserved! < reservedDelta || budgetReserved! < reservedDelta
        || periodUncertain! < uncertainDelta || budgetUncertain! < uncertainDelta) {
        throw reconciliationRequired("The personal usage counters cannot be safely settled.");
      }

      const globalReservedDelta = receiptValue ? 0 : reservation.reserveCostMicros;
      const globalUncertainDelta = uncertainReceipt ? reservation.reserveCostMicros : 0;
      const nextGlobalActual = observedReceipt ? globalActual : safeCounterAdd(globalActual, observed.actualCostMicros);
      if (nextGlobalActual === null || globalReserved < globalReservedDelta
        || globalUncertain < globalUncertainDelta) {
        throw reconciliationRequired("The global usage counters cannot be safely settled.");
      }
      const globalWrites = observedReceipt ? [] : [
        { path: receiptPath, data: legacyObservedReceiptWrite(reservation, observed, updatedAt) },
        { path: reservation.globalPath, data: { ...global,
          reservedCostMicros: globalReserved - globalReservedDelta,
          uncertainCostMicros: globalUncertain - globalUncertainDelta,
          actualCostMicros: nextGlobalActual,
          updatedAt } },
      ];
      const tokens = Object.fromEntries(tokenEntries);
      return {
        writes: [
          ...globalWrites,
          { path: attemptPath, data: { ...attempt, kind: "ai-usage-attempt",
            requestPath: reservation.requestPath, requestId: reservation.requestId,
            ...observed, status: "accounting_observed", uncertainCostMicros: 0, updatedAt } },
          { path: reservation.periodPath, data: { ...period, ...tokens,
            requestCount: periodRequests! - requestDelta,
            reservedCostMicros: periodReserved! - reservedDelta,
            uncertainCostMicros: periodUncertain! - uncertainDelta,
            actualCostMicros: nextPeriodActual,
            ...aiUsageReleaseLock(period, reservation.lockKey, reservation.requestId, reservation.attemptToken),
            updatedAt } },
          { path: reservation.userBudgetPath, data: { ...budget,
            reservedCostMicros: budgetReserved! - reservedDelta,
            uncertainCostMicros: budgetUncertain! - uncertainDelta,
            actualCostMicros: nextBudgetActual,
            updatedAt } },
          { path: reservation.requestPath, data: { ...request, ...observed, ...details,
            status: state === "reserved" ? (observed.failed ? "failed" : "completed") : request.status,
            uncertainCostMicros: 0,
            updatedAt } },
        ],
        result: "settled" as const,
      };
    }),
  );
  if (accountResult !== "deleted") return;

  await runWithGlobalUsageAccounting(() => runStoredDocumentTransaction(transactionPaths, (documents) => {
    const lifecycle = documents[lifecyclePath];
    if (lifecycle?.uid !== reservation.uid || lifecycle.generation !== reservation.accountGeneration
      || !["deleting", "deleted"].includes(String(lifecycle.state))
      || documents[reservation.requestPath] || documents[attemptPath]
      || documents[reservation.periodPath] || documents[reservation.userBudgetPath]) {
      throw reconciliationRequired("Deleted-account usage can no longer be settled globally.");
    }
    const receiptValue = documents[receiptPath];
    const observedReceipt = receiptValue
      ? parsedLegacyObservedReceiptProfile(receiptValue, reservation, observed)
      : null;
    const genericReceipt = receiptValue
      ? parsedGenericObservedReceiptProfile(receiptValue, reservation, observed)
      : null;
    const uncertainReceipt = receiptValue ? parsedLegacyUncertainReceipt(receiptValue, reservation) : null;
    if (!receiptValue || Number(Boolean(observedReceipt)) + Number(Boolean(genericReceipt))
      + Number(Boolean(uncertainReceipt)) !== 1) {
      throw reconciliationRequired("The deleted-account usage receipt cannot be safely settled.");
    }
    const global = documents[reservation.globalPath];
    const globalReserved = usageCounter(global?.reservedCostMicros);
    const globalUncertain = usageCounter(global?.uncertainCostMicros);
    const globalActual = usageCounter(global?.actualCostMicros);
    if (!global || globalReserved === null || globalUncertain === null || globalActual === null
      || ((observedReceipt || genericReceipt) && globalActual < observed.actualCostMicros)) {
      throw reconciliationRequired("The deleted-account global counters cannot be safely settled.");
    }
    if (observedReceipt || genericReceipt) return { writes: [], result: undefined };
    const nextActual = safeCounterAdd(globalActual, observed.actualCostMicros);
    if (globalUncertain < reservation.reserveCostMicros || nextActual === null) {
      throw reconciliationRequired("The deleted-account global counters cannot be safely settled.");
    }
    return {
      writes: [
        { path: receiptPath, data: legacyObservedReceiptWrite(reservation, observed, updatedAt) },
        { path: reservation.globalPath, data: { ...global,
          reservedCostMicros: globalReserved,
          uncertainCostMicros: globalUncertain - reservation.reserveCostMicros,
          actualCostMicros: nextActual,
          updatedAt } },
      ],
      result: undefined,
    };
  }));
}

async function hasExactTerminalAiUsageState(reservation: AiReservation) {
  if (!reservation.accountGeneration || !reservation.attemptToken) return false;
  const attemptPath = aiUsageAttemptPath(reservation);
  const receiptPath = checkpointReceiptPath(reservation);
  return runWithAccountGeneration(
    { uid: reservation.uid, generation: reservation.accountGeneration },
    () => runStoredDocumentTransaction([
      reservation.requestPath,
      attemptPath,
      receiptPath,
      reservation.globalPath,
    ], (documents) => {
      const request = documents[reservation.requestPath];
      if (!request || !["completed", "failed"].includes(String(request.status))) {
        return { writes: [], result: false };
      }
      const attempt = documents[attemptPath];
      if (!attempt || !exactRootIdentity(request, reservation) || !exactAttemptIdentity(attempt, reservation)) {
        throw reconciliationRequired("The terminal usage attempt identity is inconsistent.");
      }
      const receipt = documents[receiptPath];
      const global = documents[reservation.globalPath];
      const globalActual = usageCounter(global?.actualCostMicros);
      const globalUncertain = usageCounter(global?.uncertainCostMicros);
      if (!global || globalActual === null || globalUncertain === null) {
        throw reconciliationRequired("The terminal global usage counters are malformed.");
      }

      if (request.status === "failed" && request.terminalReason === "provider_outcome_unknown"
        && attempt.status === "accounting_uncertain") {
        const requestUncertain = usageCounter(request.uncertainCostMicros);
        const attemptUncertain = usageCounter(attempt.uncertainCostMicros);
        if (!parsedLegacyUncertainReceipt(receipt, reservation)
          || requestUncertain !== reservation.reserveCostMicros
          || attemptUncertain !== reservation.reserveCostMicros
          || !exactZeroOuterUsage(request, attempt)
          || globalUncertain < reservation.reserveCostMicros) {
          throw reconciliationRequired("The terminal uncertainty state is inconsistent.");
        }
        return { writes: [], result: true };
      }

      const legacyReceipt = parsedLegacyObservedReceiptProfile(receipt, reservation);
      if (legacyReceipt) {
        if (finalizedPersonalState(request, attempt, reservation, legacyReceipt.observed) !== "terminal"
          || globalActual < legacyReceipt.observed.actualCostMicros) {
          throw reconciliationRequired("The terminal observed usage state is inconsistent.");
        }
        return { writes: [], result: true };
      }

      const checkpoint = parsedResultCheckpoint(request.resultCheckpoint);
      if (!checkpoint || !parsedGenericObservedReceipt(receipt, reservation, checkpoint)
        || exactCheckpointAccountingState(request, attempt, reservation, checkpoint) !== "completed"
        || globalActual < checkpoint.observed.actualCostMicros) {
        throw reconciliationRequired("The terminal checkpoint usage state is inconsistent.");
      }
      return { writes: [], result: true };
    }),
  );
}

export async function finalizeAiUsage(
  reservation: AiReservation,
  result: AiUsageFinalization,
) {
  if (reservation.operationId) throw new AiQuotaError(409, "DURABLE_OPERATION_REQUIRED", "Durable usage must settle through its operation.");
  const nowIso = new Date().toISOString();
  const usage = validatedObservedUsage(reservation, result);
  if (!usage) throw new AiUsageObservationError();
  const { samples, observed } = usage;
  const actualCostMicros = observed.actualCostMicros;
  const confirmedNotStarted = result.failed === true && result.providerOutcome === "not_started";
  if (confirmedNotStarted && (actualCostMicros !== 0 || usage.responseId !== null)) {
    throw new AiQuotaError(409, "AI_OUTCOME_RECONCILIATION_REQUIRED", "A provider response cannot be marked as not dispatched.");
  }
  // A failed call with no observed response cannot certify zero provider spend.
  // Preserve uncertainty until a late actual response or operator reconciliation.
  if (result.failed && !confirmedNotStarted && actualCostMicros === 0 && usage.responseId === null) {
    if (await hasExactTerminalAiUsageState(reservation)) return;
    const action = await reconcileAiUsageRoot(reservation.requestId, true, new Date(nowIso), reservation);
    if (action === "manual_reconciliation_required") {
      throw reconciliationRequired("The global usage receipt cannot be safely contained.");
    }
    return;
  }
  await settleFinalizedAiUsage(reservation, observed, {
    ...usageDetailsFor(samples, usage.responseId, result.resultId ?? null),
    ...(confirmedNotStarted ? { terminalReason: "pre_provider_failure", providerOutcome: "not_started" } : {}),
  }, nowIso);
}

/** Personal accounting is addressed by immutable attempt, not the replaceable retry key. */
export function aiUsageAttemptPath(value: { requestId: string; attemptToken?: string }) {
  return `aiRequests/${value.requestId}__attempt__${value.attemptToken ?? "v0"}`;
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


function parsedRootReservation(requestId: string, request: StoredDocument | null | undefined): AiReservation | null {
  const feature = request?.feature;
  const budgetPool = typeof request?.globalPath === "string"
    ? request.globalPath.split("/").at(-1)?.split("__")[0]
    : undefined;
  if (!request || !["course_outline", "course_banner", "lesson_generation", "tutor", "flashcard_generation", "command_center_draft"].includes(String(feature))
    || !["free", "paid", "owner"].includes(String(budgetPool))
    || ![request.uid, request.attemptToken, request.accountGeneration, request.periodPath, request.userBudgetPath, request.globalPath]
      .every((value) => typeof value === "string" && value.length > 0)
    || !nonnegativeInteger(request.reservedCostMicros) || request.reservedCostMicros <= 0) return null;
  const uid = String(request.uid);
  if (!String(request.periodPath).startsWith(`usagePeriods/${uid}__`)
    || !String(request.userBudgetPath).startsWith(`userAiBudgets/${uid}__`)
    || !String(request.globalPath).startsWith("systemUsageShards/")) return null;
  return {
    uid,
    feature: feature as AiFeature,
    requestId,
    attemptToken: String(request.attemptToken),
    accountGeneration: String(request.accountGeneration),
    periodPath: String(request.periodPath),
    globalPath: String(request.globalPath),
    userBudgetPath: String(request.userBudgetPath),
    budgetPool: budgetPool as AiBudgetPool,
    requestPath: `aiRequests/${requestId}`,
    reserveCostMicros: request.reservedCostMicros,
    lockKey: typeof request.lockKey === "string" ? request.lockKey : undefined,
    recovered: false,
  };
}

async function reconcileAiUsageRoot(
  requestId: string,
  apply: boolean,
  now: Date,
  expected?: AiReservation,
) {
  const requestPath = `aiRequests/${requestId}`;
  const initial = await getStoredDocument(requestPath);
  if (!initial || initial.kind === "ai-usage-attempt" || initial.operationId || initial.status !== "reserved") return "none";
  const reservation = parsedRootReservation(requestId, initial);
  if (!reservation || (expected && (expected.requestId !== requestId
    || !exactRootIdentity(initial, expected)))) return "manual_reconciliation_required";
  if (!expected && Date.parse(String(initial.leaseUntil)) > now.getTime()) return "none";
  const attemptPath = aiUsageAttemptPath(reservation);
  const receiptPath = checkpointReceiptPath(reservation);
  return runWithAccountGeneration({ uid: reservation.uid, generation: reservation.accountGeneration! }, () =>
    runStoredDocumentTransaction([
      requestPath,
      attemptPath,
      reservation.periodPath,
      reservation.userBudgetPath,
      reservation.globalPath,
      receiptPath,
    ], (documents) => {
      const request = documents[requestPath];
      const attempt = documents[attemptPath];
      if (!request || request.status !== "reserved" || (!expected && Date.parse(String(request.leaseUntil)) > now.getTime())) {
        return { writes: [], result: "none" };
      }
      if (!exactRootIdentity(request, reservation) || !exactAttemptIdentity(attempt, reservation)
        || attempt?.status !== "accounting_reserved") {
        return { writes: [], result: "manual_reconciliation_required" };
      }
      const receiptValue = documents[receiptPath];
      const observedReceipt = receiptValue
        ? parsedLegacyObservedReceiptProfile(receiptValue, reservation)
        : null;
      const uncertainReceipt = receiptValue
        ? parsedLegacyUncertainReceipt(receiptValue, reservation)
        : null;
      if (receiptValue && !observedReceipt && !uncertainReceipt) {
        return { writes: [], result: "manual_reconciliation_required" };
      }

      const period = documents[reservation.periodPath];
      const budget = documents[reservation.userBudgetPath];
      const global = documents[reservation.globalPath];
      const periodRequests = usageCounter(period?.requestCount);
      const periodReserved = usageCounter(period?.reservedCostMicros);
      const periodUncertain = usageCounter(period?.uncertainCostMicros);
      const periodActual = usageCounter(period?.actualCostMicros);
      const budgetReserved = usageCounter(budget?.reservedCostMicros);
      const budgetUncertain = usageCounter(budget?.uncertainCostMicros);
      const budgetActual = usageCounter(budget?.actualCostMicros);
      const globalReserved = usageCounter(global?.reservedCostMicros);
      const globalUncertain = usageCounter(global?.uncertainCostMicros);
      const globalActual = usageCounter(global?.actualCostMicros);
      const observed = observedReceipt?.observed;
      const actual = observed?.actualCostMicros ?? 0;
      const uncertainty = observed ? 0 : reservation.reserveCostMicros;
      const nextPeriodActual = periodActual === null ? null : safeCounterAdd(periodActual, actual);
      const nextBudgetActual = budgetActual === null ? null : safeCounterAdd(budgetActual, actual);
      const nextPeriodUncertain = periodUncertain === null ? null : safeCounterAdd(periodUncertain, uncertainty);
      const nextBudgetUncertain = budgetUncertain === null ? null : safeCounterAdd(budgetUncertain, uncertainty);
      const nextGlobalUncertain = globalUncertain === null ? null : safeCounterAdd(globalUncertain, uncertainty);
      const tokenEntries = ["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"].map((key) => {
        const current = usageCounter(period?.[key]);
        const delta = observed ? observed[key as keyof typeof observed] : 0;
        return [key, current === null || typeof delta !== "number" ? null : safeCounterAdd(current, delta)] as const;
      });
      const validCounters = Boolean(period && budget && global)
        && ![periodRequests, periodReserved, periodUncertain, periodActual, budgetReserved, budgetUncertain,
          budgetActual, globalReserved, globalUncertain, globalActual, nextPeriodActual, nextBudgetActual,
          nextPeriodUncertain, nextBudgetUncertain]
          .some((value) => value === null);
      const receiptGloballyBound = observedReceipt
        ? globalActual! >= observedReceipt.observed.actualCostMicros
        : uncertainReceipt
          ? globalUncertain! >= reservation.reserveCostMicros
          : globalReserved! >= reservation.reserveCostMicros && nextGlobalUncertain !== null;
      if (!validCounters || tokenEntries.some(([, value]) => value === null)
        || periodRequests! < 1 || periodReserved! < reservation.reserveCostMicros
        || budgetReserved! < reservation.reserveCostMicros || !receiptGloballyBound) {
        return { writes: [], result: "manual_reconciliation_required" };
      }
      if (!apply) return { writes: [], result: "would_contain_unknown_outcome" };

      const nowIso = now.toISOString();
      const tokens = Object.fromEntries(tokenEntries);
      return {
        writes: [
          { path: attemptPath, data: { ...attempt, ...(observed ?? {}), status: observed ? "accounting_observed" : "accounting_uncertain",
            actualCostMicros: actual, uncertainCostMicros: uncertainty, updatedAt: nowIso } },
          { path: requestPath, data: { ...request, ...(observed ?? {}), status: "failed",
            terminalReason: observed ? "completion_accounting_recovered" : "provider_outcome_unknown",
            actualCostMicros: actual, uncertainCostMicros: uncertainty, updatedAt: nowIso } },
          { path: reservation.periodPath, data: { ...period, ...tokens, requestCount: periodRequests! - 1,
            reservedCostMicros: periodReserved! - reservation.reserveCostMicros,
            actualCostMicros: nextPeriodActual, uncertainCostMicros: nextPeriodUncertain,
            ...aiUsageReleaseLock(period, reservation.lockKey, requestId, reservation.attemptToken), updatedAt: nowIso } },
          { path: reservation.userBudgetPath, data: { ...budget,
            reservedCostMicros: budgetReserved! - reservation.reserveCostMicros,
            actualCostMicros: nextBudgetActual, uncertainCostMicros: nextBudgetUncertain, updatedAt: nowIso } },
          ...(!receiptValue ? [
            { path: receiptPath, data: { version: 1, kind: "legacy-ai-completion", status: "uncertain",
              actualCostMicros: 0, uncertainCostMicros: reservation.reserveCostMicros, globalPath: reservation.globalPath } },
            { path: reservation.globalPath, data: { ...global,
              reservedCostMicros: globalReserved! - reservation.reserveCostMicros,
              uncertainCostMicros: nextGlobalUncertain, updatedAt: nowIso } },
          ] : []),
        ],
        result: "contained_unknown_outcome",
      };
    }));
}

/** Expired non-operation reservations are contained without repeating paid work. */
export async function reconcileExpiredAiUsage(requestId: string, apply: boolean, now = new Date()) {
  const requestPath = `aiRequests/${requestId}`;
  const initial = await getStoredDocument(requestPath);
  if (initial?.kind !== "ai-usage-attempt") return reconcileAiUsageRoot(requestId, apply, now);
  if (initial.status === "accounting_observed") return "none";
  // A durable product checkpoint must be completed by its owning route so
  // product mutation and personal accounting remain one transaction. Legacy
  // receipt repair has no product mutation context and must not split them.
  if (initial.status === "result_checkpointed" || initial.resultCheckpoint !== undefined) return "none";
  const rootRequestId = typeof initial.requestId === "string" ? initial.requestId : "";
  const reservation = parsedRootReservation(rootRequestId, {
    ...initial,
    status: "reserved",
    attemptToken: initial.attemptToken,
  });
  if (!reservation || requestPath !== aiUsageAttemptPath(reservation)
    || !exactAttemptIdentity(initial, reservation)) return "manual_reconciliation_required";
  const [receipt, global] = await Promise.all([
    getStoredDocument(checkpointReceiptPath(reservation)),
    getStoredDocument(reservation.globalPath),
  ]);
  const observedReceipt = receipt ? parsedLegacyObservedReceiptProfile(receipt, reservation) : null;
  const uncertainReceipt = receipt ? parsedLegacyUncertainReceipt(receipt, reservation) : null;
  if (receipt && !observedReceipt && !uncertainReceipt) return "manual_reconciliation_required";
  const globalActual = usageCounter(global?.actualCostMicros);
  const globalUncertain = usageCounter(global?.uncertainCostMicros);
  if (!global || globalActual === null || globalUncertain === null
    || (observedReceipt && globalActual < observedReceipt.observed.actualCostMicros)
    || (uncertainReceipt && globalUncertain < reservation.reserveCostMicros)) {
    return "manual_reconciliation_required";
  }
  if (uncertainReceipt) return initial.status === "accounting_uncertain" ? "none" : "manual_reconciliation_required";
  if (!observedReceipt) return initial.status === "accounting_uncertain" ? "manual_reconciliation_required" : "none";
  if (!apply) return "would_reconcile_observed_attempt";
  await settleFinalizedAiUsage(reservation, observedReceipt.observed, {}, new Date().toISOString());
  return "reconciled_observed_attempt";
}

/** Called before account-owned request records are removed. No personal write. */
export async function abandonAiUsage(requestId: string): Promise<void> {
  const request = await getStoredDocument(`aiRequests/${requestId}`);
  if (!request || request.kind === "ai-usage-attempt" || request.operationId) return;
  if (request.status === "result_checkpointed" || request.resultCheckpoint !== undefined) {
    const checkpoint = parsedResultCheckpoint(request.resultCheckpoint);
    if (!checkpoint || checkpoint.requestId !== requestId
      || ![request.uid, request.feature, request.attemptToken, request.accountGeneration, request.periodPath,
        request.userBudgetPath, request.globalPath, request.payloadFingerprint]
        .every((value) => typeof value === "string" && value.length > 0)) {
      throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    try {
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
    } catch (error) {
      if (error instanceof AiQuotaError && error.code === "AI_OUTCOME_RECONCILIATION_REQUIRED") {
        throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED", { cause: error });
      }
      throw error;
    }
    return;
  }
  const reservation = parsedRootReservation(requestId, request);
  if (!reservation) {
    throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
  }
  const receiptPath = checkpointReceiptPath(reservation);
  const attemptPath = aiUsageAttemptPath(reservation);
  await runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([
    receiptPath,
    reservation.globalPath,
    reservation.requestPath,
    attemptPath,
  ], (documents) => {
    const storedRequest = documents[reservation.requestPath];
    const attempt = documents[attemptPath];
    const reservedState = storedRequest?.status === "reserved" && attempt?.status === "accounting_reserved";
    const uncertainState = storedRequest?.status === "failed" && storedRequest.terminalReason === "provider_outcome_unknown"
      && attempt?.status === "accounting_uncertain";
    const observedState = ["completed", "failed"].includes(String(storedRequest?.status))
      && attempt?.status === "accounting_observed";
    if (!exactRootIdentity(storedRequest, reservation) || !exactAttemptIdentity(attempt, reservation)
      || (!reservedState && !uncertainState && !observedState)) {
      throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    const receiptValue = documents[receiptPath];
    const observedReceipt = receiptValue ? parsedLegacyObservedReceiptProfile(receiptValue, reservation) : null;
    const uncertainReceipt = receiptValue ? parsedLegacyUncertainReceipt(receiptValue, reservation) : null;
    if (receiptValue && !observedReceipt && !uncertainReceipt) {
      throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    if (uncertainState && !uncertainReceipt) {
      throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    if (observedState) {
      const requestObserved = parsedObservedAccountingState(storedRequest);
      const attemptObserved = parsedObservedAccountingState(attempt);
      if (!observedReceipt || !requestObserved || !attemptObserved
        || !sameObservedUsage(observedReceipt.observed, requestObserved)
        || !sameObservedUsage(observedReceipt.observed, attemptObserved)) {
        throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
      }
    }
    const global = documents[reservation.globalPath];
    const reserved = usageCounter(global?.reservedCostMicros);
    const uncertain = usageCounter(global?.uncertainCostMicros);
    const actual = usageCounter(global?.actualCostMicros);
    if (!global || reserved === null || uncertain === null || actual === null
      || (observedReceipt && actual < observedReceipt.observed.actualCostMicros)
      || (uncertainReceipt && uncertain < reservation.reserveCostMicros)) {
      throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    if (receiptValue) return { writes: [], result: undefined };
    if (!reservedState) {
      throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    const nextUncertain = safeCounterAdd(uncertain, reservation.reserveCostMicros);
    if (reserved < reservation.reserveCostMicros || nextUncertain === null) {
      throw new Error("AI_USAGE_MANUAL_RECONCILIATION_REQUIRED");
    }
    return { writes: [
      { path: receiptPath, data: { version: 1, kind: "legacy-ai-completion", status: "uncertain", actualCostMicros: 0,
        uncertainCostMicros: reservation.reserveCostMicros, globalPath: reservation.globalPath } },
      { path: reservation.globalPath, data: { ...global,
        reservedCostMicros: reserved - reservation.reserveCostMicros, uncertainCostMicros: nextUncertain } },
    ], result: undefined };
  }));
}
