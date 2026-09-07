import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ServerAccount } from "@/lib/account-server";
import { currentAccountGeneration, runWithGlobalUsageAccounting } from "@/lib/account-lifecycle";
import { getStoredDocument, runStoredDocumentTransaction } from "@/lib/document-store";
import { generationFingerprint, runGenerationTransaction, type GenerationLease } from "@/lib/generation-operations";

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const modelRate = z.object({
  maxInputTokens: integer.positive(), maxOutputTokens: integer.positive(),
  inputMicrosPerMillion: integer, cachedInputMicrosPerMillion: integer,
  cacheWriteInputMicrosPerMillion: integer, outputMicrosPerMillion: integer,
  maxToolCalls: integer.max(100), webSearchCallMicros: integer,
}).strict();
const approvalSchema = z.object({
  version: z.literal(1), uid: z.string().min(1).max(200), buildSha: z.string().regex(/^[a-f0-9]{40}$/),
  profile: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,79}$/), operationCeilingMicros: integer.positive(),
  expiresAt: z.string().datetime(), rateVersion: z.string().min(1).max(100),
  configurationFingerprints: z.object({ course: z.string().regex(/^[a-f0-9]{64}$/), lesson: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  models: z.record(z.string().min(1), modelRate),
  moderation: z.object({ model: z.string().min(1), maxInputBytes: integer.positive(), requestCostMicros: integer }).strict(),
}).strict();
type Approval = z.infer<typeof approvalSchema>;
type Json = Record<string, unknown>;
export type EvaluationCallKind = "generation" | "research" | "verifier" | "fallback" | "recovery" | "moderation";
export interface EvaluationCallMetadata { kind: Exclude<EvaluationCallKind, "moderation">; profile: string; promptVersion: string }
type Bound = { lease: GenerationLease; operationId: string; path: string; configuration: Json; configurationFingerprint: string };
type Context = { approval: Approval; approvalId: string; bound?: Bound };
type Sample = { model: string; responseId: string; promptVersion: string; profile: string; inputTokens: number; cachedInputTokens: number; cacheWriteTokens: number; outputTokens: number; toolCalls: number };
type Call = { attemptToken: string; callId: string; requestFingerprint: string; kind: EvaluationCallKind; status: "in_flight" | "uncertain" | "observed"; upperBoundMicros: number; costMicros: number; samples: Sample[] };
type Ledger = Json & { approvalId: string; configurationFingerprint: string; operationCeilingMicros: number; actualCostMicros: number; reconciliationRequired: boolean; calls: Record<string, Call> };
const context = new AsyncLocalStorage<Context | undefined>();
const callContext = new AsyncLocalStorage<EvaluationCallMetadata>();
export class EvaluationBudgetError extends Error {
  readonly status = 409;
  constructor(readonly code: string, readonly preDispatch = true) { super(`${code}: evaluation requires its approved configuration, sufficient reserved budget and reconciled provider evidence.`); }
}
const reject = (code = "EVALUATION_APPROVAL_REQUIRED"): never => { throw new EvaluationBudgetError(code); };
export function evaluationBudgetErrorFrom(error: unknown): EvaluationBudgetError | undefined {
  for (let i = 0; i < 8 && error; i++) {
    if (error instanceof EvaluationBudgetError) return error;
    error = typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
  }
}
export function isEvaluationPreDispatchError(error: unknown) { return evaluationBudgetErrorFrom(error)?.preDispatch === true; }
function readApproval(headers: Headers) {
  let approval: Approval;
  try { approval = approvalSchema.parse(JSON.parse(process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL ?? "")); }
  catch { return reject(); }
  if (headers.get("x-filosage-model-evaluation") !== "1" || Date.parse(approval.expiresAt) <= Date.now() || !Object.keys(approval.models).length
    || process.env.SITE_VERSION !== approval.buildSha
    || headers.get("x-filosage-evaluation-build-sha") !== approval.buildSha
    || headers.get("x-filosage-evaluation-profile") !== approval.profile
    || headers.get("x-filosage-evaluation-max-cost-micros") !== String(approval.operationCeilingMicros)) return reject();
  return { approval, approvalId: generationFingerprint(approval) };
}
export function runWithEvaluationRequest<T>(headers: Headers, work: () => T): T {
  const flag = headers.get("x-filosage-model-evaluation");
  if (flag === null) return context.run(undefined, work);
  if (flag !== "1") return reject();
  return context.run(readApproval(headers), work);
}
export function runWithEvaluationCall<T>(metadata: EvaluationCallMetadata, work: () => T): T {
  return callContext.run(Object.freeze({ ...metadata }), work);
}
function assertConfiguration(configuration: Json, approval: Approval, kind: "course" | "lesson") {
  if (configuration.provider !== "openai" || configuration.stub !== false || !Array.isArray(configuration.profiles)
    || !configuration.profiles.length || generationFingerprint(configuration) !== approval.configurationFingerprints[kind]) return reject("EVALUATION_CONFIGURATION_CHANGED");
  for (const value of configuration.profiles) {
    const profile = value as Json;
    if (typeof profile.id !== "string" || typeof profile.promptVersion !== "string" || typeof profile.model !== "string" || !approval.models[profile.model]) return reject("EVALUATION_CONFIGURATION_CHANGED");
  }
}
function assertOperation(operation: Json | null, scope: Context) {
  const actor = currentAccountGeneration();
  if (!actor || actor.uid !== scope.approval.uid || !operation || operation.uid !== actor.uid || operation.accountGeneration !== actor.generation) return reject("EVALUATION_OWNER_REQUIRED");
  if (operation.kind !== undefined && operation.kind !== "course" && operation.kind !== "lesson") return reject("EVALUATION_CONFIGURATION_CHANGED");
  if (operation.status !== "running" || typeof operation.leaseUntil !== "string"
    || !Number.isFinite(Date.parse(operation.leaseUntil)) || Date.parse(operation.leaseUntil) <= Date.now()) return reject("EVALUATION_OPERATION_REQUIRED");
  const configuration = operation.configuration as Json;
  if (!configuration || typeof configuration !== "object") return reject("EVALUATION_CONFIGURATION_CHANGED");
  assertConfiguration(configuration, scope.approval, operation.kind === "lesson" ? "lesson" : "course");
  return configuration;
}
function assertLedger(ledger: Ledger | null, scope: Context) {
  if (!ledger || ledger.approvalId !== scope.approvalId || ledger.operationCeilingMicros !== scope.approval.operationCeilingMicros
    || ledger.configurationFingerprint !== scope.bound?.configurationFingerprint) return reject("EVALUATION_CONFIGURATION_CHANGED");
  return ledger;
}
export async function bindEvaluationOperation(account: ServerAccount, lease: GenerationLease) {
  const operationId = lease.operationId;
  const scope = context.getStore();
  if (!scope) return;
  if (!account.isOwner || account.uid !== scope.approval.uid || !/^[a-f0-9]{64}$/.test(operationId)
    || (scope.bound && scope.bound.operationId !== operationId)) return reject("EVALUATION_OWNER_REQUIRED");
  const operationPath = `generationOperations/${operationId}`;
  const path = `generationUsageReceipts/${operationId}__evaluation`;
  const configuration = await runGenerationTransaction(lease, [operationPath, path], (documents) => {
    const configured = assertOperation(documents[operationPath], scope);
    const fingerprint = generationFingerprint(configured);
    const ledger = documents[path] as Ledger | null;
    if (ledger && (ledger.approvalId !== scope.approvalId || ledger.configurationFingerprint !== fingerprint)) return reject("EVALUATION_CONFIGURATION_CHANGED");
    if (ledger && (ledger.reconciliationRequired || Object.values(ledger.calls).some((call) => call.status !== "observed" && call.attemptToken !== lease.attemptToken))) return reject("EVALUATION_RECONCILIATION_REQUIRED");
    return { writes: ledger ? [] : [{ path, data: { approvalId: scope.approvalId, configurationFingerprint: fingerprint,
      operationCeilingMicros: scope.approval.operationCeilingMicros, rateVersion: scope.approval.rateVersion,
      actualCostMicros: 0, reconciliationRequired: false, calls: {} } }], result: configured };
  });
  scope.bound = { lease, operationId, path, configuration, configurationFingerprint: generationFingerprint(configuration) };
}
export async function evaluationBudgetCapability(account: ServerAccount, headers: Headers, configurations: { course: Json; lesson: Json }) {
  const scope = readApproval(headers);
  if (!account.isOwner || account.uid !== scope.approval.uid || currentAccountGeneration()?.uid !== account.uid) return reject("EVALUATION_OWNER_REQUIRED");
  assertConfiguration(configurations.course, scope.approval, "course");
  assertConfiguration(configurations.lesson, scope.approval, "lesson");
  return { buildSha: scope.approval.buildSha, profile: scope.approval.profile, enforcedOperationCeilingMicros: scope.approval.operationCeilingMicros,
    rateVersion: scope.approval.rateVersion, approvalId: scope.approvalId };
}
export async function readEvaluationBudgetEvidence(operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) return null;
  const actor = currentAccountGeneration();
  const operation = await getStoredDocument(`generationOperations/${operationId}`);
  if (!actor || !operation || operation.uid !== actor.uid || operation.accountGeneration !== actor.generation) return null;
  const ledger = await getStoredDocument(`generationUsageReceipts/${operationId}__evaluation`) as Ledger | null;
  if (!ledger) return null;
  const calls = Object.values(ledger.calls);
  return { actualCostMicros: ledger.actualCostMicros, uncertainCostMicros: calls.filter((call) => call.status !== "observed").reduce((sum, call) => sum + call.upperBoundMicros, 0),
    reconciliationRequired: ledger.reconciliationRequired || calls.some((call) => call.status !== "observed"
      && (call.attemptToken !== operation.attemptToken || operation.status !== "running" || !Number.isFinite(Date.parse(String(operation.leaseUntil))) || Date.parse(String(operation.leaseUntil)) <= Date.now())), enforcedOperationCeilingMicros: ledger.operationCeilingMicros,
    rateVersion: ledger.rateVersion, approvalId: ledger.approvalId, calls, configuration: operation.configuration };
}
function cost(tokens: number, rate: number) {
  return combinedCost([[tokens, rate]]);
}
function combinedCost(parts: Array<[number, number]>) {
  const value = (parts.reduce((sum, [tokens, rate]) => sum + BigInt(tokens) * BigInt(rate), BigInt(0)) + BigInt(999_999)) / BigInt(1_000_000);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return reject("EVALUATION_UNSUPPORTED_REQUEST");
  return Number(value);
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid provider usage");
  return value;
}
function textInput(value: unknown): boolean {
  if (typeof value === "string") return true;
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const message = item as Json;
    return ["user", "assistant", "system", "developer"].includes(String(message.role))
      && (typeof message.content === "string" || (Array.isArray(message.content) && message.content.every((part: Json) => part.type === "input_text" && typeof part.text === "string")));
  });
}
function dispatchPlan(scope: Context, input: string | URL | Request, init?: RequestInit) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://api.openai.com" || url.search || !["/v1/responses", "/v1/moderations"].includes(url.pathname)
    || init?.method !== "POST" || typeof init.body !== "string") return reject("EVALUATION_UNSUPPORTED_REQUEST");
  let body: Json;
  try { body = JSON.parse(init.body) as Json; } catch { return reject("EVALUATION_UNSUPPORTED_REQUEST"); }
  if (!body || Array.isArray(body) || !textInput(body.input)) return reject("EVALUATION_UNSUPPORTED_REQUEST");
  const moderation = url.pathname === "/v1/moderations";
  if (moderation) {
    if (body.model !== scope.approval.moderation.model || Buffer.byteLength(JSON.stringify(body.input)) > scope.approval.moderation.maxInputBytes
      || Object.keys(body).some((key) => !["model", "input"].includes(key))) return reject("EVALUATION_UNSUPPORTED_REQUEST");
    return { body, moderation, kind: "moderation" as EvaluationCallKind, profile: "moderation.standard", promptVersion: "moderation-provider-v1",
      upperBoundMicros: scope.approval.moderation.requestCostMicros, maxToolCalls: 0, rate: undefined };
  }
  const metadata = callContext.getStore();
  const profiles = scope.bound!.configuration.profiles as Json[];
  const profile = profiles.find((candidate) => candidate.id === metadata?.profile);
  const rate = scope.approval.models[String(body.model)];
  const allowed = ["model", "input", "instructions", "text", "reasoning", "max_output_tokens", "store", "tools", "tool_choice", "max_tool_calls", "parallel_tool_calls", "prompt_cache_key", "metadata", "temperature", "top_p", "include", "truncation", "service_tier"];
  if (!metadata || !["generation", "research", "verifier", "fallback", "recovery"].includes(metadata.kind)
    || !profile || profile.model !== body.model || profile.promptVersion !== metadata.promptVersion || !rate
    || Object.keys(body).some((key) => !allowed.includes(key)) || body.store !== false
    || body.service_tier !== "default"
    || !Number.isSafeInteger(body.max_output_tokens) || Number(body.max_output_tokens) <= 0 || Number(body.max_output_tokens) > rate.maxOutputTokens
    || Buffer.byteLength(init.body) > rate.maxInputTokens) return reject("EVALUATION_UNSUPPORTED_REQUEST");
  const tools = body.tools ?? [];
  if (!Array.isArray(tools) || tools.some((tool: Json) => !tool || !["web_search", "web_search_preview"].includes(String(tool.type)))) return reject("EVALUATION_UNSUPPORTED_REQUEST");
  const maxToolCalls = tools.length ? Number(body.max_tool_calls) : 0;
  if (!Number.isSafeInteger(maxToolCalls) || maxToolCalls < (tools.length ? 1 : 0) || maxToolCalls > rate.maxToolCalls) return reject("EVALUATION_UNSUPPORTED_REQUEST");
  const upperBoundMicros = cost(rate.maxInputTokens, Math.max(rate.inputMicrosPerMillion, rate.cachedInputMicrosPerMillion, rate.cacheWriteInputMicrosPerMillion))
    + cost(Number(body.max_output_tokens), rate.outputMicrosPerMillion) + maxToolCalls * rate.webSearchCallMicros;
  if (!Number.isSafeInteger(upperBoundMicros)) return reject("EVALUATION_UNSUPPORTED_REQUEST");
  return { body, moderation, ...metadata, upperBoundMicros, maxToolCalls, rate };
}
function observed(plan: ReturnType<typeof dispatchPlan>, response: Json): { costMicros: number; sample: Sample } {
  const base = { model: String(plan.body.model), responseId: String(response.id), profile: plan.profile, promptVersion: plan.promptVersion };
  if (plan.moderation) {
    if (!/^modr-[a-z0-9]+$/i.test(base.responseId) || response.model !== plan.body.model || !Array.isArray(response.results) || !response.results.length) throw new Error("Invalid moderation receipt");
    return { costMicros: plan.upperBoundMicros, sample: { ...base, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, toolCalls: 0 } };
  }
  if (!/^resp_[a-z0-9]+$/i.test(base.responseId) || response.model !== plan.body.model || response.service_tier !== "default"
    || !["completed", "incomplete", "failed", "cancelled"].includes(String(response.status))) throw new Error("Unresolved provider response");
  const usage = response.usage as Json;
  const details = usage?.input_tokens_details as Json;
  const inputTokens = number(usage?.input_tokens), cachedInputTokens = number(details?.cached_tokens), cacheWriteTokens = number(details?.cache_write_tokens), outputTokens = number(usage?.output_tokens);
  const output = response.output;
  if (!Array.isArray(output) || output.some((item: Json) => !item || !["message", "reasoning", "web_search_call"].includes(String(item.type)))) throw new Error("Unsupported provider output inventory");
  const toolCalls = output.filter((item: Json) => item.type === "web_search_call").length;
  const rate = plan.rate!;
  if (cachedInputTokens + cacheWriteTokens > inputTokens || inputTokens > rate.maxInputTokens || outputTokens > Number(plan.body.max_output_tokens) || toolCalls > plan.maxToolCalls) throw new Error("Provider exceeded reviewed bounds");
  const costMicros = combinedCost([[inputTokens - cachedInputTokens - cacheWriteTokens, rate.inputMicrosPerMillion], [cachedInputTokens, rate.cachedInputMicrosPerMillion],
      [cacheWriteTokens, rate.cacheWriteInputMicrosPerMillion]]) + cost(outputTokens, rate.outputMicrosPerMillion) + toolCalls * rate.webSearchCallMicros;
  return { costMicros, sample: { ...base, inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, toolCalls } };
}
async function evaluationFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const scope = context.getStore();
  if (!scope) return globalThis.fetch(input, init);
  // A cached SDK client can retry after the first dispatch; never reclassify that
  // prior ambiguous outcome as proof that no provider call was made.
  if ((new Headers(init?.headers).get("x-stainless-retry-count") ?? "0") !== "0") throw new EvaluationBudgetError("EVALUATION_RECONCILIATION_REQUIRED", false);
  if (!scope.bound || Date.parse(scope.approval.expiresAt) <= Date.now()) return reject("EVALUATION_OPERATION_REQUIRED");
  const bound = scope.bound;
  const plan = dispatchPlan(scope, input, init);
  const callId = randomUUID();
  const requestFingerprint = generationFingerprint({ body: plan.body, kind: plan.kind, profile: plan.profile });
  await runGenerationTransaction(bound.lease, [bound.path], (documents) => {
    assertOperation(documents[`generationOperations/${bound.operationId}`], scope);
    const ledger = assertLedger(documents[bound.path] as Ledger | null, scope);
    if (ledger.reconciliationRequired || Object.values(ledger.calls).some((call) => call.status !== "observed" && call.attemptToken !== bound.lease.attemptToken)) return reject("EVALUATION_RECONCILIATION_REQUIRED");
    const calls = Object.values(ledger.calls);
    const reserved = calls.filter((call) => call.status !== "observed").reduce((sum, call) => sum + call.upperBoundMicros, 0);
    if (calls.length >= 100 || plan.upperBoundMicros > ledger.operationCeilingMicros - ledger.actualCostMicros - reserved) return reject("EVALUATION_BUDGET_EXHAUSTED");
    const call: Call = { attemptToken: bound.lease.attemptToken, callId, requestFingerprint, kind: plan.kind, status: "in_flight", upperBoundMicros: plan.upperBoundMicros, costMicros: 0, samples: [] };
    return { writes: [{ path: bound.path, data: { ...ledger, calls: { ...ledger.calls, [callId]: call } } }], result: undefined };
  });
  const finish = (result?: ReturnType<typeof observed>) => runWithGlobalUsageAccounting(() => runStoredDocumentTransaction([bound.path], (documents) => {
    const ledger = assertLedger(documents[bound.path] as Ledger | null, scope);
    const call = ledger.calls[callId];
    if (!call || call.requestFingerprint !== requestFingerprint || call.status === "observed") throw new EvaluationBudgetError("EVALUATION_RECONCILIATION_REQUIRED", false);
    if (result && result.costMicros > call.upperBoundMicros) throw new EvaluationBudgetError("EVALUATION_RECONCILIATION_REQUIRED", false);
    return { writes: [{ path: bound.path, data: { ...ledger, actualCostMicros: ledger.actualCostMicros + (result?.costMicros ?? 0),
      reconciliationRequired: ledger.reconciliationRequired || !result,
      calls: { ...ledger.calls, [callId]: { ...call, status: result ? "observed" : "uncertain", costMicros: result?.costMicros ?? 0, samples: result ? [result.sample] : [] } } } }], result: undefined };
  }));
  try {
    const response = await globalThis.fetch(input, init);
    if (!response.ok || Number(response.headers.get("content-length")) > 8_000_000) throw new Error("Provider response requires reconciliation");
    const text = await response.clone().text();
    if (text.length > 8_000_000) throw new Error("Provider response exceeds evidence limit");
    await finish(observed(plan, JSON.parse(text) as Json));
    return response;
  } catch {
    await finish().catch(() => undefined);
    throw new EvaluationBudgetError("EVALUATION_RECONCILIATION_REQUIRED", false);
  }
}
export function evaluationClientOptions() {
  return { fetch: evaluationFetch, ...(context.getStore() ? { maxRetries: 0 } : {}) };
}
