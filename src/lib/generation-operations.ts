import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { ServerAccount } from "@/lib/account-server";
import { currentAccountGeneration, captureAccountGeneration, runWithAccountGeneration, runWithGlobalUsageAccounting } from "@/lib/account-lifecycle";
import { getStoredDocument, runStoredDocumentTransaction } from "@/lib/document-store";
import { AiQuotaError, courseOutlineAccountingContext, extractOpenAiUsage } from "@/lib/ai-usage";
import { summarizeAiUsage, type AiUsageSample } from "@/lib/ai-pricing";
import { courseCreditPaths, generationCreditReservationWrites, generationCreditSettlementWrites, generationLessonGrant } from "@/lib/course-credits";
import { webSearchCallCount } from "@/lib/source-research";

// A request starts at most one slow wave. Reopening executes the next wave.
// Provider deadlines are bounded by 120 seconds; lease includes storage cleanup.
export const GENERATION_REQUEST_MS = 150_000;
export const GENERATION_LEASE_MS = 180_000;
export const GENERATION_ABANDONED_MS = 24 * 60 * 60_000;
const START_WAVE_MS = 5_000;
const VERSION = 1;
const responseTimes = new WeakMap<object, string>();
export function generationResponseObservedAt(response: unknown) {
  return response && typeof response === "object" ? responseTimes.get(response) ?? new Date().toISOString() : new Date().toISOString();
}
type Document = Record<string, unknown>;
type Documents = Record<string, Document | null>;
type Accounting = ReturnType<typeof courseOutlineAccountingContext>;
type UsageCall = { status: "in_flight" | "observed" | "uncertain"; estimateMicros?: number; costMicros?: number; samples?: AiUsageSample[] };
type Receipt = Document & { globalPath: string; remainingReserveMicros: number; actualCostMicros: number; uncertainCostMicros: number; calls: Record<string, UsageCall> };
export type GenerationOperation = Document & {
  uid: string; accountGeneration: string; operationId: string; requestFingerprint: string; request: Document;
  idempotencyKey: string; status: "running" | "pending" | "completed" | "failed";
  stage: string; attemptToken: string; leaseUntil: string; createdAt: string; updatedAt: string;
  accounting: Accounting; resultId?: string; terminalReason?: string; pendingCalls: string[];
};
export interface GenerationLease { operationId: string; operationPath: string; receiptPath: string; attemptToken: string; startedAt: number; waveStartedAt?: number; operation: GenerationOperation }
export class GenerationOperationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) { super(message); }
}
export class GenerationPauseError extends GenerationOperationError {
  constructor() { super("GENERATION_RESUME_REQUIRED", "The completed stage is saved. Resume to continue.", 202); }
}
export function isGenerationControlError(error: unknown) { return error instanceof GenerationOperationError; }
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const generationFingerprint = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
export const generationOperationId = (uid: string, key: string) => createHash("sha256").update(`${uid}:course_outline:${key}`).digest("hex");
function paths(operation: GenerationOperation) {
  const credit = courseCreditPaths(operation.uid, operation.operationId);
  return [`generationOperations/${operation.operationId}`, `generationUsageReceipts/${operation.operationId}`, ...Object.values(credit),
    operation.accounting.requestPath, operation.accounting.periodPath, operation.accounting.userBudgetPath, operation.accounting.globalPath];
}
function leaseFor(operation: GenerationOperation, now: Date): GenerationLease {
  return { operationId: operation.operationId, operationPath: `generationOperations/${operation.operationId}`, receiptPath: `generationUsageReceipts/${operation.operationId}`, attemptToken: operation.attemptToken, startedAt: now.getTime(), operation };
}
function assertOwner(lease: GenerationLease, documents: Documents, active = true, now = Date.now()) {
  const operation = documents[lease.operationPath] as GenerationOperation | null;
  if (!operation || operation.uid !== lease.operation.uid || operation.accountGeneration !== lease.operation.accountGeneration || operation.attemptToken !== lease.attemptToken) {
    throw new GenerationOperationError("GENERATION_OWNERSHIP_LOST", "Generation attempt ownership changed. Reopen its current status.");
  }
  if (active) {
    const period: Document = documents[operation.accounting.periodPath] ?? {};
    const request = documents[operation.accounting.requestPath];
    if (operation.status !== "running" || Date.parse(operation.leaseUntil) <= now || period?.activeRequestId !== operation.operationId || period.activeAttemptToken !== lease.attemptToken || request?.attemptToken !== lease.attemptToken) {
      throw new GenerationOperationError("GENERATION_OWNERSHIP_LOST", "Generation attempt ownership expired. Reopen its current status.");
    }
  }
  return operation;
}

export async function getGenerationOperation(uid: string, operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) return null;
  const operation = await getStoredDocument(`generationOperations/${operationId}`) as GenerationOperation | null;
  if (!operation || operation.uid !== uid) return null;
  const actor = currentAccountGeneration();
  if (actor && operation.accountGeneration !== actor.generation) return null;
  return operation;
}

export function generationOperationStatus(operation: GenerationOperation) {
  return { operationId: operation.operationId, status: operation.status, stage: operation.stage,
    resultId: operation.resultId, terminalReason: operation.terminalReason,
    retryAt: operation.status === "running" ? operation.leaseUntil : undefined,
    resumable: operation.status === "pending" || (operation.status === "running" && Date.parse(operation.leaseUntil) <= Date.now()),
    ...(operation.failure && typeof operation.failure === "object" ? { recovery: (operation.failure as Document).recovery, code: (operation.failure as Document).code, error: (operation.failure as Document).error } : {}),
    topic: operation.request.topic, updatedAt: operation.updatedAt };
}

/** Permanently close a never-admitted key before allowing the client to replace it. */
export async function denyGenerationAdmission(operationId: string): Promise<boolean> {
  const actor = currentAccountGeneration();
  if (!actor || !/^[a-f0-9]{64}$/.test(operationId)) return false;
  const operationPath = `generationOperations/${operationId}`;
  const requestPath = `aiRequests/${operationId}`;
  return runStoredDocumentTransaction([operationPath, requestPath], (documents) => {
    if (documents[operationPath]) return { writes: [], result: false };
    const request = documents[requestPath];
    if (request) return { writes: [], result: request.status === "not_admitted" && request.uid === actor.uid && request.accountGeneration === actor.generation };
    return { writes: [{ path: requestPath, data: { uid: actor.uid, accountGeneration: actor.generation, operationId,
      feature: "course_outline", status: "not_admitted", createdAt: new Date().toISOString() } }], result: true };
  });
}

export async function beginGenerationOperation(account: ServerAccount, key: string | null, request: Document, now = new Date()): Promise<GenerationLease> {
  const actor = currentAccountGeneration();
  if (!actor) {
    const captured = await captureAccountGeneration(account.uid);
    return runWithAccountGeneration(captured, () => beginGenerationOperation(account, key, request, now));
  }
  if (actor.uid !== account.uid) throw new GenerationOperationError("GENERATION_OWNERSHIP_LOST", "The authoring account changed.");
  if (!key || key.length < 12 || key.length > 200) throw new GenerationOperationError("IDEMPOTENCY_KEY_REQUIRED", "A retry-safe operation key is required.");
  const operationId = generationOperationId(account.uid, key);
  const operationPath = `generationOperations/${operationId}`;
  const requestFingerprint = generationFingerprint(request);
  const previous = await getGenerationOperation(account.uid, operationId);
  if (previous && previous.requestFingerprint !== requestFingerprint) throw new GenerationOperationError("IDEMPOTENCY_CONFLICT", "This operation belongs to a different request.");
  // A lost process cannot recover a store:false remote response. Never repeat an
  // ambiguous paid call; refund the product and retain explicitly uncertain cost.
  if (previous?.status === "running" && Date.parse(previous.leaseUntil) <= now.getTime() && previous.pendingCalls.length) {
    await finishGenerationOperation(leaseFor(previous, now), { failed: true, reason: "provider_outcome_unknown", reconcile: true }, now);
    throw new GenerationOperationError("GENERATION_OUTCOME_UNKNOWN", "The provider result could not be confirmed. Your course credit was restored; start a new course request.");
  }
  if (previous?.status === "pending" && Date.parse(previous.updatedAt) + GENERATION_ABANDONED_MS <= now.getTime()) {
    await finishGenerationOperation(leaseFor(previous, now), { failed: true, reason: "abandoned", reconcile: true }, now);
    throw new GenerationOperationError("GENERATION_FAILED", "This saved request expired and its course credit was restored. Start a new request.");
  }
  const context = previous?.accounting ?? courseOutlineAccountingContext(account, operationId, now);
  const accountGeneration = currentAccountGeneration()!.generation;
  const proposed: GenerationOperation = { uid: account.uid, accountGeneration, operationId, requestFingerprint, request,
    idempotencyKey: key, activeOwnerUid: account.uid, version: VERSION, status: "running", stage: "Preparing course", attemptToken: randomUUID(),
    leaseUntil: new Date(now.getTime() + GENERATION_LEASE_MS).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(),
    accounting: context, pendingCalls: [] };
  const operation = await runStoredDocumentTransaction(paths(proposed), (documents) => {
    const current = documents[operationPath] as GenerationOperation | null;
    if (current && (current.uid !== account.uid || current.accountGeneration !== accountGeneration || current.requestFingerprint !== requestFingerprint)) throw new GenerationOperationError("IDEMPOTENCY_CONFLICT", "This operation belongs to a different request.");
    if (current?.status === "completed") return { writes: [], result: current };
    if (current?.status === "failed") throw new GenerationOperationError("GENERATION_FAILED", "This operation ended and its course credit was restored. Start a new request.");
    if (current?.status === "running" && Date.parse(current.leaseUntil) > now.getTime()) throw new GenerationOperationError("GENERATION_IN_PROGRESS", "This operation is already running. Reopen its status.");
    if (current?.pendingCalls.length) throw new GenerationOperationError("GENERATION_OUTCOME_UNKNOWN", "A provider result requires reconciliation before another attempt.");
    if (current && stable(current.accounting) !== stable(context)) throw new GenerationOperationError("GENERATION_OWNERSHIP_LOST", "The original accounting period changed.");
    if (!current && documents[context.requestPath]?.status === "not_admitted") throw new GenerationOperationError("GENERATION_NOT_ADMITTED", "This request did not start. Update your brief or allowance and submit a new request.");
    const period: Document = documents[context.periodPath] ?? {};
    const global: Document = documents[context.globalPath] ?? {};
    const budget: Document = documents[context.userBudgetPath] ?? {};
    if (Date.parse(String(period.activeUntil ?? "")) > now.getTime()) throw new AiQuotaError(429, "GENERATION_IN_PROGRESS", "Another course operation is already running.");
    if (!current && documents[context.requestPath]) throw new GenerationOperationError("LEGACY_GENERATION_RECONCILIATION_REQUIRED", "An earlier course request requires reconciliation before this key can be reused.");
    const newReserve = current ? 0 : context.reserveCostMicros;
    if (!current && context.limit === 0) throw new AiQuotaError(429, "PLAN_LIMIT", "Your current plan does not include course creation.");
    if (amount(global.actualCostMicros) + amount(global.uncertainCostMicros) + amount(global.reservedCostMicros) + newReserve > context.poolLimitMicros) throw new AiQuotaError(503, "POOL_BUDGET_REACHED", "Course generation is temporarily paused for this plan.");
    if (amount(budget.actualCostMicros) + amount(budget.uncertainCostMicros) + amount(budget.reservedCostMicros) + newReserve > context.userLimitMicros) throw new AiQuotaError(429, "USER_BUDGET_REACHED", "Your monthly AI cost allowance has been reached.");
    const minuteKey = now.toISOString().slice(0, 16);
    const minuteCount = period.minuteKey === minuteKey ? amount(period.minuteCount) : 0;
    if (!current && minuteCount >= context.maxPerMinute) throw new AiQuotaError(429, "RATE_LIMITED", "Please wait before starting another course.");
    const next = { ...(current ?? proposed), status: "running" as const, attemptToken: proposed.attemptToken, leaseUntil: proposed.leaseUntil, updatedAt: now.toISOString() };
    const writes: Array<{path: string; data: Document}> = [
      { path: operationPath, data: next },
      { path: context.requestPath, data: { ...(documents[context.requestPath] ?? {}), uid: account.uid, accountGeneration, feature: "course_outline", operationId,
        payloadFingerprint: requestFingerprint, status: "reserved", attemptToken: next.attemptToken, ...context, createdAt: current?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() } },
      { path: context.periodPath, data: { ...period, uid: account.uid, accountGeneration, feature: "course_outline", periodKey: context.periodKey,
        requestCount: amount(period.requestCount) + (current ? 0 : 1), reservedCostMicros: amount(period.reservedCostMicros) + newReserve,
        minuteKey, minuteCount: minuteCount + (current ? 0 : 1), activeRequestId: operationId, activeAttemptToken: next.attemptToken, activeUntil: next.leaseUntil, resetAt: context.resetAt } },
    ];
    if (!current) writes.push(
      ...generationCreditReservationWrites(account, operationId, documents, requestFingerprint, accountGeneration, now),
      { path: context.userBudgetPath, data: { ...budget, uid: account.uid, accountGeneration, plan: context.budgetPool, periodKey: context.periodKey, reservedCostMicros: amount(budget.reservedCostMicros) + newReserve, actualCostMicros: amount(budget.actualCostMicros) } },
      { path: context.globalPath, data: { ...global, pool: context.budgetPool, shard: context.shard, periodKey: context.periodKey, reservedCostMicros: amount(global.reservedCostMicros) + newReserve, actualCostMicros: amount(global.actualCostMicros) } },
      { path: `generationUsageReceipts/${operationId}`, data: { version: VERSION, globalPath: context.globalPath, remainingReserveMicros: newReserve, actualCostMicros: 0, uncertainCostMicros: 0, calls: {}, status: "reserved" } },
    );
    return { writes, result: next };
  });
  return leaseFor(operation, now);
}

export async function runGenerationTransaction<T>(lease: GenerationLease, extraPaths: string[], update: (documents: Documents) => { writes: Array<{ path: string; data: Document }>; result: T }) {
  return runWithAccountGeneration({ uid: lease.operation.uid, generation: lease.operation.accountGeneration }, () => runStoredDocumentTransaction([...new Set([lease.operationPath, lease.operation.accounting.periodPath, lease.operation.accounting.requestPath, ...extraPaths])], (documents) => {
    assertOwner(lease, documents);
    return update(documents);
  }));
}

/** Global-only accounting survives account deletion and never recreates a user record. */
async function recordProviderUsage(lease: GenerationLease, callId: string, samples: AiUsageSample[]) {
  return runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([lease.receiptPath, lease.operation.accounting.globalPath], (documents) => {
    const receipt = documents[lease.receiptPath] as Receipt | null;
    const call = receipt?.calls[callId];
    if (!receipt || !call || call.status === "observed") return { writes: [], result: undefined };
    const usage = summarizeAiUsage(samples);
    const global: Document = documents[receipt.globalPath] ?? {};
    const released = Math.min(receipt.remainingReserveMicros, usage.actualCostMicros);
    const uncertain = amount(call.estimateMicros);
    return { writes: [
      { path: receipt.globalPath, data: { ...global, reservedCostMicros: Math.max(0, amount(global.reservedCostMicros) - released), actualCostMicros: amount(global.actualCostMicros) + usage.actualCostMicros,
        uncertainCostMicros: Math.max(0, amount(global.uncertainCostMicros) - uncertain) } },
      { path: lease.receiptPath, data: { ...receipt, remainingReserveMicros: receipt.remainingReserveMicros - released,
        actualCostMicros: receipt.actualCostMicros + usage.actualCostMicros, uncertainCostMicros: Math.max(0, receipt.uncertainCostMicros - uncertain),
        calls: { ...receipt.calls, [callId]: { status: "observed", estimateMicros: uncertain, costMicros: usage.actualCostMicros, samples } } } },
    ], result: undefined };
  }));
}

export async function runGenerationProviderCall<T>(lease: GenerationLease, input: unknown, provider: () => Promise<T>, metadata: Partial<AiUsageSample> = {}): Promise<T> {
  const fingerprint = generationFingerprint(input);
  const callId = generationFingerprint({ operationId: lease.operationId, fingerprint });
  const stagePath = `generationStages/${callId}`;
  const params = input as { model?: string; text?: { format?: { name?: string } }; prompt_cache_key?: string };
  const stage = params.text?.format?.name?.replaceAll("_", " ") ?? "Course generation";
  const saved = await runGenerationTransaction(lease, [stagePath, lease.receiptPath], (documents) => {
    const existing = documents[stagePath];
    if (existing?.status === "completed" && existing.requestFingerprint === fingerprint) return { writes: [], result: { reused: true, response: existing.response as T, observedAt: String(existing.completedAt) } };
    if (existing) throw new GenerationOperationError("GENERATION_OUTCOME_UNKNOWN", "A provider call has an unconfirmed result. Reopen this operation after its lease expires.");
    lease.waveStartedAt ??= Date.now();
    if (Date.now() - lease.waveStartedAt! > START_WAVE_MS || Date.now() - lease.startedAt > GENERATION_REQUEST_MS - 25_000) throw new GenerationPauseError();
    const receipt = documents[lease.receiptPath] as unknown as Receipt;
    if (!receipt || receipt.remainingReserveMicros <= 0) throw new GenerationOperationError("GENERATION_BUDGET_EXHAUSTED", "This course reached its reserved generation budget.");
    const operation = documents[lease.operationPath] as GenerationOperation;
    return { writes: [
      { path: stagePath, data: { uid: operation.uid, accountGeneration: operation.accountGeneration, operationId: operation.operationId, attemptToken: lease.attemptToken, requestFingerprint: fingerprint, status: "in_flight", stage, startedAt: new Date().toISOString() } },
      { path: lease.operationPath, data: { ...operation, stage, pendingCalls: [...operation.pendingCalls, callId], updatedAt: new Date().toISOString() } },
      { path: lease.receiptPath, data: { ...receipt, calls: { ...receipt.calls, [callId]: { status: "in_flight" } } } },
    ], result: { reused: false, response: undefined as T | undefined, observedAt: undefined as string | undefined } };
  });
  if (saved.reused) {
    if (saved.response && typeof saved.response === "object") responseTimes.set(saved.response, saved.observedAt!);
    return saved.response as T;
  }
  let response: T;
  try { response = await provider(); } catch {
    throw new GenerationOperationError("GENERATION_OUTCOME_UNKNOWN", "The provider result is unconfirmed. Check this operation after its lease expires; the same paid call will not be repeated automatically.");
  }
  const observedAt = new Date().toISOString();
  if (response && typeof response === "object") responseTimes.set(response, observedAt);
  const samples: AiUsageSample[] = [{ model: params.model ?? "unknown", ...extractOpenAiUsage(response),
    responseId: (response as { id?: string }).id, profile: stage, ...metadata, promptCacheKey: params.prompt_cache_key }];
  for (let index = 0; index < webSearchCallCount(response); index += 1) samples.push({ model: "openai-web-search", inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, fixedCostMicros: 10_000 });
  // Cost is checkpointed before any parsing/certification or personal output save.
  await recordProviderUsage(lease, callId, samples);
  await reconcileGenerationPersonalUsage(lease).catch(() => undefined);
  await runGenerationTransaction(lease, [stagePath], (documents) => {
    const operation = documents[lease.operationPath] as GenerationOperation;
    const existing = documents[stagePath];
    if (existing?.attemptToken !== lease.attemptToken) throw new GenerationOperationError("GENERATION_OWNERSHIP_LOST", "Provider result ownership changed.");
    return { writes: [
      { path: stagePath, data: { ...existing, status: "completed", response: JSON.parse(JSON.stringify(response)), completedAt: observedAt } },
      { path: lease.operationPath, data: { ...operation, pendingCalls: operation.pendingCalls.filter((id) => id !== callId), updatedAt: new Date().toISOString() } },
    ], result: undefined };
  });
  return response;
}

export async function pauseGenerationOperation(lease: GenerationLease) {
  return runGenerationTransaction(lease, [], (documents) => {
    const operation = documents[lease.operationPath] as GenerationOperation;
    if (operation.pendingCalls.length) throw new GenerationOperationError("GENERATION_OUTCOME_UNKNOWN", "An unconfirmed provider call cannot be resumed automatically.");
    return { writes: [
      { path: lease.operationPath, data: { ...operation, status: "pending", leaseUntil: new Date().toISOString(), updatedAt: new Date().toISOString() } },
      { path: operation.accounting.periodPath, data: { ...documents[operation.accounting.periodPath], activeUntil: null } },
    ], result: undefined };
  });
}

export async function finishGenerationOperation(lease: GenerationLease, result: { course?: Document; failed?: boolean; reason?: string; reconcile?: boolean; failure?: Document }, now = new Date()) {
  const coursePath = `courses/${lease.operationId}`;
  return runWithAccountGeneration({ uid: lease.operation.uid, generation: lease.operation.accountGeneration }, () => runStoredDocumentTransaction([...paths(lease.operation), coursePath], (documents) => {
    const operation = assertOwner(lease, documents, false);
    if (operation.status === "completed" || operation.status === "failed") return { writes: [], result: documents[coursePath] };
    if (result.reconcile) {
      if (Date.parse(operation.leaseUntil) > now.getTime()) throw new GenerationOperationError("GENERATION_IN_PROGRESS", "The generation lease has not expired.");
    } else assertOwner(lease, documents, true, now.getTime());
    const context = operation.accounting;
    const request = documents[context.requestPath];
    if (request?.attemptToken !== lease.attemptToken) throw new GenerationOperationError("GENERATION_OWNERSHIP_LOST", "Accounting attempt ownership changed.");
    const receipt = documents[lease.receiptPath] as unknown as Receipt;
    if (!receipt) throw new Error("The generation usage reservation is missing.");
    const failed = Boolean(result.failed);
    if (!failed && (!result.course || operation.pendingCalls.length)) throw new Error("The completed generation requires confirmed stage results.");
    const course = failed ? null : prepareGenerationCourse(lease, result.course!, now);
    const period: Document = documents[context.periodPath] ?? {};
    const budget: Document = documents[context.userBudgetPath] ?? {};
    const global: Document = documents[context.globalPath] ?? {};
    const calls = { ...receipt.calls };
    const unknownIds = Object.keys(calls).filter((id) => calls[id].status === "in_flight");
    let uncertain = 0;
    unknownIds.forEach((id, index) => {
      const estimateMicros = index === unknownIds.length - 1 ? receipt.remainingReserveMicros - uncertain : Math.floor(receipt.remainingReserveMicros / unknownIds.length);
      uncertain += estimateMicros;
      calls[id] = { status: "uncertain", estimateMicros };
    });
    const usage = summarizeAiUsage(Object.values(calls).flatMap((call) => call.samples ?? []));
    const ownsPeriod = period.activeRequestId === operation.operationId && period.activeAttemptToken === lease.attemptToken;
    const writes: Array<{path: string; data: Document}> = [
      { path: lease.operationPath, data: { ...operation, status: failed ? "failed" : "completed", stage: failed ? "Course creation ended" : "Course ready", resultId: course?.id ?? null, failure: result.failure ?? null, activeOwnerUid: null, terminalReason: failed ? result.reason ?? "generation_failed" : "course_committed", leaseUntil: now.toISOString(), updatedAt: now.toISOString() } },
      { path: context.requestPath, data: { ...request, status: failed ? "failed" : "completed", resultId: course?.id ?? null, ...usage, uncertainCostMicros: uncertain, accountedCallIds: Object.keys(calls).filter((id) => calls[id].status === "observed"), updatedAt: now.toISOString() } },
      { path: lease.receiptPath, data: { ...receipt, remainingReserveMicros: 0, uncertainCostMicros: receipt.uncertainCostMicros + uncertain, calls, status: failed ? "failed" : "completed" } },
      { path: context.globalPath, data: { ...global, reservedCostMicros: Math.max(0, amount(global.reservedCostMicros) - receipt.remainingReserveMicros), uncertainCostMicros: amount(global.uncertainCostMicros) + uncertain } },
      { path: context.periodPath, data: { ...period, requestCount: Math.max(0, amount(period.requestCount) - (failed ? 1 : 0)), reservedCostMicros: Math.max(0, amount(period.reservedCostMicros) - context.reserveCostMicros),
        inputTokens: amount(period.inputTokens) + usage.inputTokens, cachedInputTokens: amount(period.cachedInputTokens) + usage.cachedInputTokens,
        cacheWriteTokens: amount(period.cacheWriteTokens) + usage.cacheWriteTokens, outputTokens: amount(period.outputTokens) + usage.outputTokens,
        actualCostMicros: amount(period.actualCostMicros) + usage.actualCostMicros, uncertainCostMicros: amount(period.uncertainCostMicros) + uncertain,
        ...(ownsPeriod ? { activeRequestId: null, activeAttemptToken: null, activeUntil: null } : {}) } },
      { path: context.userBudgetPath, data: { ...budget, reservedCostMicros: Math.max(0, amount(budget.reservedCostMicros) - context.reserveCostMicros), actualCostMicros: amount(budget.actualCostMicros) + usage.actualCostMicros, uncertainCostMicros: amount(budget.uncertainCostMicros) + uncertain } },
      ...generationCreditSettlementWrites(operation.uid, operation.operationId, documents, failed, now.toISOString()),
      ...(course ? [{ path: coursePath, data: course }] : []),
    ];
    return { writes, result: course };
  }));
}

export async function reconcileGenerationOperation(operation: GenerationOperation, apply: boolean, now = new Date()) {
  if (operation.status === "failed") {
    const request = await getStoredDocument(operation.accounting.requestPath);
    const receipt = await getStoredDocument(`generationUsageReceipts/${operation.operationId}`) as Receipt | null;
    const accounted = Array.isArray(request?.accountedCallIds) ? request.accountedCallIds.map(String) : [];
    const hasLateUsage = request && receipt && Object.entries(receipt.calls).some(([id, call]) => call.status === "observed" && !accounted.includes(id));
    if (hasLateUsage) {
      if (apply) await reconcileGenerationPersonalUsage(leaseFor(operation, now));
      return { operationId: operation.operationId, action: apply ? "late_usage_reconciled" : "would_reconcile_late_usage" };
    }
  }
  const expired = (operation.status === "running" && Date.parse(operation.leaseUntil) <= now.getTime())
    || (operation.status === "pending" && Date.parse(operation.updatedAt) + GENERATION_ABANDONED_MS <= now.getTime());
  if (!expired) return { operationId: operation.operationId, action: "none" };
  if (apply) await finishGenerationOperation(leaseFor(operation, now), { failed: true, reason: operation.pendingCalls.length ? "provider_outcome_unknown" : "abandoned", reconcile: true }, now);
  return { operationId: operation.operationId, action: apply ? "refunded" : "would_refund", unknownProviderOutcome: operation.pendingCalls.length > 0 };
}

/** Prepare every bound field before actual output moderation and proof creation. */
export function prepareGenerationCourse(lease: GenerationLease, data: Document, now = new Date()): Document & { id: string; generationGrant: ReturnType<typeof generationLessonGrant> } {
  const redeemedAt = (data.generationGrant as { redeemedAt?: string } | undefined)?.redeemedAt ?? now.toISOString();
  return { ...data, id: lease.operationId, uid: lease.operation.uid, accountGeneration: lease.operation.accountGeneration,
    authorId: lease.operation.uid, isPublic: false, generationOperationId: lease.operationId,
    generationGrant: generationLessonGrant(lease.operationId, data.modules, redeemedAt),
    createdAt: data.createdAt ?? now.toISOString(), updatedAt: now.toISOString() };
}

export async function abandonGenerationOperation(operation: GenerationOperation) {
  return finishGenerationOperation(leaseFor(operation, new Date()), { failed: true, reason: "author_abandoned", reconcile: true });
}

/** Deletion calls this before removing private operation/stage records. */
export async function abandonGenerationUsage(operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) throw new Error("Invalid generation operation ID.");
  const receiptPath = `generationUsageReceipts/${operationId}`;
  const initial = await getStoredDocument(receiptPath) as Receipt | null;
  if (!initial || typeof initial.globalPath !== "string" || !initial.globalPath.startsWith("systemUsageShards/")) return;
  return runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([receiptPath, initial.globalPath], (documents) => {
    const receipt = documents[receiptPath] as unknown as Receipt | null;
    if (!receipt || receipt.remainingReserveMicros <= 0) return { writes: [], result: undefined };
    const global: Document = documents[initial.globalPath] ?? {};
    const calls = { ...receipt.calls };
    const unknownIds = Object.keys(calls).filter((id) => calls[id].status === "in_flight");
    let uncertain = 0;
    unknownIds.forEach((id, index) => {
      const estimateMicros = index === unknownIds.length - 1 ? receipt.remainingReserveMicros - uncertain : Math.floor(receipt.remainingReserveMicros / unknownIds.length);
      uncertain += estimateMicros;
      calls[id] = { status: "uncertain", estimateMicros };
    });
    return { writes: [
      { path: receiptPath, data: { ...receipt, calls, remainingReserveMicros: 0, uncertainCostMicros: receipt.uncertainCostMicros + uncertain, status: "account_removed" } },
      { path: initial.globalPath, data: { ...global, reservedCostMicros: Math.max(0, amount(global.reservedCostMicros) - receipt.remainingReserveMicros), uncertainCostMicros: amount(global.uncertainCostMicros) + uncertain } },
    ], result: undefined };
  }));
}


export async function configureGenerationOperation(lease: GenerationLease, configuration: Document) {
  return runGenerationTransaction(lease, [], (documents) => {
    const operation = documents[lease.operationPath] as GenerationOperation;
    const existing = operation.configuration as Document | undefined;
    // A revision may only resume the exact model/prompt/runtime contract it
    // began with. Drain/reconcile older operations before incompatible cutover.
    if (existing && generationFingerprint(existing) !== generationFingerprint(configuration)) {
      throw new GenerationOperationError("GENERATION_WRITER_VERSION_CHANGED", "This course request requires its original generation configuration or explicit reconciliation.");
    }
    return { writes: existing ? [] : [{ path: lease.operationPath, data: { ...operation, configuration } }], result: undefined };
  });
}

export async function generationOperationTelemetry(operation: GenerationOperation) {
  const receipt = await getStoredDocument(`generationUsageReceipts/${operation.operationId}`) as Receipt | null;
  if (!receipt) return null;
  const calls = Object.entries(receipt.calls).slice(0, 100).map(([callId, call]) => ({ callId, ...call }));
  return { actualCostMicros: receipt.actualCostMicros, uncertainCostMicros: receipt.uncertainCostMicros,
    remainingReserveMicros: receipt.remainingReserveMicros, calls, configuration: operation.configuration ?? null };
}


async function reconcileGenerationPersonalUsage(lease: GenerationLease) {
  const context = lease.operation.accounting;
  return runWithAccountGeneration({ uid: lease.operation.uid, generation: lease.operation.accountGeneration }, () =>
    runStoredDocumentTransaction([lease.operationPath, lease.receiptPath, context.requestPath, context.periodPath, context.userBudgetPath], (documents) => {
      const operation = documents[lease.operationPath];
      const request = documents[context.requestPath];
      const receipt = documents[lease.receiptPath] as unknown as Receipt | null;
      if (!operation || !request || !receipt || operation.status !== "failed" || request.attemptToken !== lease.attemptToken) return { writes: [], result: undefined };
      const accounted = Array.isArray(request.accountedCallIds) ? request.accountedCallIds.map(String) : [];
      const observed = Object.entries(receipt.calls).filter(([id, call]) => call.status === "observed" && !accounted.includes(id));
      if (!observed.length) return { writes: [], result: undefined };
      const usage = summarizeAiUsage(observed.flatMap(([, call]) => call.samples ?? []));
      const uncertain = observed.reduce((sum, [, call]) => sum + amount(call.estimateMicros), 0);
      const period: Document = documents[context.periodPath] ?? {};
      const budget: Document = documents[context.userBudgetPath] ?? {};
      return { writes: [
        { path: context.requestPath, data: { ...request, actualCostMicros: amount(request.actualCostMicros) + usage.actualCostMicros,
          uncertainCostMicros: Math.max(0, amount(request.uncertainCostMicros) - uncertain), accountedCallIds: [...accounted, ...observed.map(([id]) => id)] } },
        { path: context.periodPath, data: { ...period, actualCostMicros: amount(period.actualCostMicros) + usage.actualCostMicros, uncertainCostMicros: Math.max(0, amount(period.uncertainCostMicros) - uncertain),
          inputTokens: amount(period.inputTokens) + usage.inputTokens, cachedInputTokens: amount(period.cachedInputTokens) + usage.cachedInputTokens,
          cacheWriteTokens: amount(period.cacheWriteTokens) + usage.cacheWriteTokens, outputTokens: amount(period.outputTokens) + usage.outputTokens } },
        { path: context.userBudgetPath, data: { ...budget, actualCostMicros: amount(budget.actualCostMicros) + usage.actualCostMicros, uncertainCostMicros: Math.max(0, amount(budget.uncertainCostMicros) - uncertain) } },
      ], result: undefined };
    }));
}
