import { aiUsageLock, aiUsageReleaseLock } from "@/lib/ai-usage-lock";
import type { GenerationLease, GenerationOperation } from "@/lib/generation-operations";
import type { AiReservation } from "@/lib/ai-usage";
import { summarizeAiUsage, type AiUsageSample } from "@/lib/ai-pricing";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { LessonSaveError, lessonPublicationState, lessonCourseFingerprint, type LessonSavePipelineGuard } from "./lesson-save";

type Document = Record<string, unknown>;
type Documents = Record<string, Document | null | undefined>;
export interface LessonGenerationGuard extends LessonSavePipelineGuard {
  actor: { uid: string; isOwner: boolean };
  publicationState: string;
  reservation: AiReservation;
  operation?: GenerationLease;
  usage: { usageSamples: AiUsageSample[]; responseId?: string };
}
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
export const lessonAttemptPath = (reservation: AiReservation) => `aiRequests/${reservation.requestId}__attempt__${reservation.attemptToken}`;
export const lessonUsageReceiptPath = (reservation: AiReservation) => `generationUsageReceipts/legacy-${reservation.requestId}-${reservation.attemptToken}`;
export function lessonCommitPaths(guard: LessonGenerationGuard) {
  const r = guard.reservation;
  return [r.requestPath, r.periodPath, r.userBudgetPath, r.globalPath, lessonAttemptPath(r), ...(guard.operation ? [guard.operation.operationPath, guard.operation.receiptPath] : [lessonUsageReceiptPath(r)])];
}
export function assertLessonAttempt(documents: Documents, guard: LessonGenerationGuard, now: string, courseId: string, lessonId: string) {
  const r = guard.reservation;
  const request = documents[r.requestPath];
  const period = documents[r.periodPath];
  const attempt = documents[lessonAttemptPath(r)];
  const lock = aiUsageLock(period, r.lockKey);
  if (!request || !period || !attempt || r.feature !== "lesson_generation" || r.recovered
    || !r.attemptToken || !r.accountGeneration || r.uid !== guard.actor.uid
    || request.uid !== r.uid || request.accountGeneration !== r.accountGeneration
    || request.attemptToken !== r.attemptToken || request.status !== "reserved" || request.feature !== "lesson_generation"
    || ![`${courseId}:${lessonId}:generate`, `${courseId}:${lessonId}:regenerate`].includes(String(request.payloadFingerprint))
    || request.reservedCostMicros !== r.reserveCostMicros
    || attempt.attemptToken !== r.attemptToken || attempt.status !== "accounting_reserved"
    || attempt.uid !== r.uid || attempt.accountGeneration !== r.accountGeneration
    || attempt.requestId !== r.requestId || attempt.requestPath !== r.requestPath || attempt.feature !== r.feature
    || attempt.reservedCostMicros !== r.reserveCostMicros || attempt.lockKey !== r.lockKey
    || attempt.periodPath !== r.periodPath || attempt.userBudgetPath !== r.userBudgetPath || attempt.globalPath !== r.globalPath
    || request.periodPath !== r.periodPath || request.globalPath !== r.globalPath || request.userBudgetPath !== r.userBudgetPath
    || r.requestPath !== `aiRequests/${r.requestId}`
    || request.lockKey !== r.lockKey || lock.activeRequestId !== r.requestId || lock.activeAttemptToken !== r.attemptToken
    || !Number.isFinite(Date.parse(String(request.leaseUntil))) || Date.parse(String(request.leaseUntil)) <= Date.parse(now)
    || !Number.isFinite(Date.parse(String(lock.activeUntil))) || Date.parse(String(lock.activeUntil)) <= Date.parse(now)) {
    throw new LessonSaveError("LESSON_ATTEMPT_SUPERSEDED", "The lesson attempt expired or changed. Reopen its status before trying again.", "reconcile_generation");
  }
  if (guard.operation) {
    const lease = guard.operation;
    const operation = documents[lease.operationPath] as GenerationOperation | undefined;
    if (!operation || operation.kind !== "lesson" || operation.uid !== r.uid || operation.accountGeneration !== r.accountGeneration || operation.status !== "running" || operation.attemptToken !== r.attemptToken || operation.operationId !== r.requestId || request.operationId !== r.requestId || operation.pendingCalls.length || !Number.isFinite(Date.parse(operation.leaseUntil)) || Date.parse(operation.leaseUntil) <= Date.parse(now) || operation.request.courseId !== courseId || operation.request.lessonId !== lessonId || operation.lessonGuard?.courseFingerprint !== guard.courseFingerprint || operation.lessonGuard?.lessonFingerprint !== guard.lessonFingerprint || operation.lessonGuard?.publicationState !== guard.publicationState || !documents[lease.receiptPath]) throw new LessonSaveError("LESSON_ATTEMPT_SUPERSEDED", "Lesson operation ownership or stage confirmation changed.", "reconcile_generation");
  } else if (request.operationId) throw new LessonSaveError("DURABLE_OPERATION_REQUIRED", "This lesson must commit through its durable operation.", "reconcile_generation");
  if (!documents[r.userBudgetPath] || !documents[r.globalPath] || (!guard.operation && documents[lessonUsageReceiptPath(r)])) {
    throw new LessonSaveError("LESSON_ACCOUNTING_CHANGED", "The lesson accounting changed. Reconcile this request before continuing.", "reconcile_generation");
  }
}
/** The result and all original-period accounting commit in the lesson transaction. */
export function lessonAccountingWrites(courseId: string, lessonId: string, course: Document, lesson: Document, documents: Documents, guard: LessonGenerationGuard, now: string) {
  const r = guard.reservation;
  const lease = guard.operation;
  const receipt = lease ? documents[lease.receiptPath]! : undefined;
  const calls = receipt?.calls as Record<string, { status: string; samples?: AiUsageSample[] }> | undefined;
  if (calls && Object.values(calls).some((call) => call.status !== "observed")) throw new LessonSaveError("LESSON_USAGE_MISSING", "Every lesson call must have confirmed usage before committing.", "reconcile_generation");
  const samples = calls ? Object.values(calls).flatMap((call) => call.samples ?? []) : guard.usage.usageSamples;
  if (!Array.isArray(samples) || !samples.length) throw new LessonSaveError("LESSON_USAGE_MISSING", "Observed lesson usage is required before committing a result.", "reconcile_generation");
  const usage = summarizeAiUsage(samples);
  for (const value of Object.values(usage)) if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) throw new LessonSaveError("LESSON_USAGE_MISSING", "Lesson usage cannot be reconciled.", "reconcile_generation");
  const request = documents[r.requestPath]!;
  const period = documents[r.periodPath]!;
  const budget = documents[r.userBudgetPath]!;
  const global = documents[r.globalPath]!;
  const cost = usage.actualCostMicros;
  const tokens = Object.fromEntries(["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"].map((key) => [key, number(period[key]) + usage[key as keyof typeof usage]]));
  const observed = { actualCostMicros: cost, inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, cacheWriteTokens: usage.cacheWriteTokens, outputTokens: usage.outputTokens, failed: false };
  const resultId = `${courseId}:${lessonId}`;
  const lessonResult = { version: 1, courseId, lessonId, fingerprint: publicationContentFingerprint(lesson), courseFingerprint: lessonCourseFingerprint(course, lessonId), publicationState: lessonPublicationState(course), committedAt: now };
  return [
    ...(lease ? [{ path: lease.operationPath, data: { ...documents[lease.operationPath], status: "completed", stage: "Lesson ready", resultId, terminalReason: "lesson_committed", leaseUntil: now, updatedAt: now, pendingCalls: [] } }] : []),
    { path: r.requestPath, data: { ...request, ...observed, status: "completed", resultId, lessonResult, usageSamples: samples, responseId: guard.usage.responseId ?? null, ...(calls ? { accountedCallIds: Object.keys(calls) } : {}), updatedAt: now } },
    { path: lessonAttemptPath(r), data: { ...documents[lessonAttemptPath(r)], ...observed, status: "accounting_observed", uncertainCostMicros: 0, resultId, updatedAt: now } },
    { path: r.periodPath, data: { ...period, ...tokens, reservedCostMicros: Math.max(0, number(period.reservedCostMicros) - r.reserveCostMicros), actualCostMicros: number(period.actualCostMicros) + cost, ...aiUsageReleaseLock(period, r.lockKey, r.requestId, r.attemptToken), updatedAt: now } },
    { path: r.userBudgetPath, data: { ...budget, reservedCostMicros: Math.max(0, number(budget.reservedCostMicros) - r.reserveCostMicros), actualCostMicros: number(budget.actualCostMicros) + cost, updatedAt: now } },
    { path: r.globalPath, data: { ...global, reservedCostMicros: Math.max(0, number(global.reservedCostMicros) - (receipt ? number(receipt.remainingReserveMicros) : r.reserveCostMicros)), actualCostMicros: number(global.actualCostMicros) + (receipt ? 0 : cost), updatedAt: now } },
    ...(lease ? [{ path: lease.receiptPath, data: { ...receipt, remainingReserveMicros: 0, status: "completed", updatedAt: now } }] : [{ path: lessonUsageReceiptPath(r), data: { version: 1, kind: "legacy-ai-completion", status: "observed", ...observed, globalPath: r.globalPath, updatedAt: now } }]),
  ];
}
