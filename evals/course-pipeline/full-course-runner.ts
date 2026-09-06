import { createHash } from "node:crypto";
import { FULL_COURSE_DATASET_VERSION, reviewTemplate, type FullCourseCase } from "./catalog.ts";

type Json = Record<string, unknown>;
export function fingerprint(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : item;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export interface EvaluationConfig {
  runId: string;
  origin: string;
  buildSha: string;
  profile: string;
  evidenceKind: "real_provider" | "offline_fixture";
  budgetMicros: number;
  operationCeilingMicros: number;
  callDeadlineMs: number;
  caseDeadlineMs: number;
}
export interface ProviderCall {
  id: string;
  kind: "generation" | "research" | "verifier" | "fallback" | "recovery";
  status: "completed" | "failed" | "in_flight" | "unknown";
  costMicros: number;
  samples: Array<{ model: string; responseId: string; promptVersion: string; inputTokens: number; outputTokens: number; [key: string]: unknown }>;
}
export interface OperationEvidence {
  provider: "openai";
  stub: false;
  profile: string;
  actualCostMicros: number;
  uncertainCostMicros: number;
  calls: ProviderCall[];
  versions: Record<string, string>;
}
export interface OperationStatus {
  operationId: string;
  status: "running" | "pending" | "completed" | "failed";
  stage: string;
  resultId?: string;
  retryAt?: string;
  resumable?: boolean;
  terminalReason?: string;
  evaluation?: OperationEvidence;
}
export interface EvaluationCapabilities {
  version: 1;
  provider: "openai";
  stub: false;
  buildSha: string;
  profile: string;
  operationUsage: true;
  lessonOperations: true;
  enforcedOperationCeilingMicros: number;
}
export interface EvaluationBackend {
  evidenceKind: EvaluationConfig["evidenceKind"];
  preflight(signal: AbortSignal): Promise<EvaluationCapabilities | undefined>;
  start(kind: "course" | "lesson", payload: Json, key: string, ceiling: number, signal: AbortSignal): Promise<OperationStatus>;
  status(id: string, signal: AbortSignal): Promise<OperationStatus>;
  resume(id: string, ceiling: number, signal: AbortSignal): Promise<OperationStatus>;
  artifact(courseId: string, lessonId: string | undefined, signal: AbortSignal): Promise<Json>;
}
export interface StepCheckpoint {
  key: string;
  payloadHash: string;
  status: "intent" | "active" | "complete" | "failed" | "unknown";
  operationId?: string;
  reservedMicros: number;
  actualCostMicros: number;
  uncertainCostMicros: number;
  evidence?: OperationEvidence;
  resultId?: string;
  lastStage?: string;
  startedAt: string;
  lastObservedAt?: string;
  elapsedMs?: number;
}
export interface CaseCheckpoint {
  id: string;
  requestHash: string;
  status: "pending" | "active" | "awaiting_review" | "fixture_complete" | "blocked";
  startedAt?: string;
  deadlineAt?: string;
  error?: string;
  courseId?: string;
  releaseId: string | null;
  lessonIds: string[];
  steps: Record<string, StepCheckpoint>;
  artifacts: Record<string, { hash: string; value: Json }>;
  validation?: unknown;
  deterministicStatus?: "passed" | "blocked";
  review: ReturnType<typeof reviewTemplate>;
}
export interface RunCheckpoint {
  schemaVersion: 1;
  datasetVersion: string;
  config: EvaluationConfig;
  inventoryHash: string;
  cases: CaseCheckpoint[];
  events: Array<{ at: string; caseId: string; event: string; step?: string; stage?: string }>;
  acceptance: "human_review_required";
}

export function newRun(config: EvaluationConfig, cases: FullCourseCase[]): RunCheckpoint {
  for (const value of [config.budgetMicros, config.operationCeilingMicros, config.callDeadlineMs, config.caseDeadlineMs]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Budget and deadlines must be explicit positive integers.");
  }
  if (config.operationCeilingMicros > config.budgetMicros) throw new Error("The operation ceiling exceeds the approved run budget.");
  if (config.callDeadlineMs > 180_000 || config.caseDeadlineMs > 86_400_000) throw new Error("Bound requests to three minutes and cases to one day.");
  if (!/^[a-z0-9][a-z0-9-]{2,70}$/.test(config.runId) || !/^[a-f0-9]{40}$/.test(config.buildSha)) throw new Error("Use a bounded run ID and exact candidate SHA.");
  if (!cases.length || new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("Select unique evaluation cases.");
  return {
    schemaVersion: 1, datasetVersion: FULL_COURSE_DATASET_VERSION, config: { ...config },
    inventoryHash: fingerprint(cases), acceptance: "human_review_required", events: [],
    cases: cases.map((item) => ({
      id: item.id, requestHash: fingerprint(item.request), status: "pending", releaseId: null,
      lessonIds: [], steps: {}, artifacts: {}, review: reviewTemplate(item.expertise),
    })),
  };
}

export function budgetState(run: RunCheckpoint) {
  const steps = run.cases.flatMap((item) => Object.values(item.steps));
  const actualMicros = steps.reduce((sum, step) => sum + step.actualCostMicros, 0);
  const uncertainMicros = steps.reduce((sum, step) => sum + step.uncertainCostMicros, 0);
  const reservedMicros = steps.filter((step) => !["complete", "failed"].includes(step.status))
    .reduce((sum, step) => sum + Math.max(0, step.reservedMicros - step.actualCostMicros), 0);
  return { actualMicros, uncertainMicros, reservedMicros, availableMicros: run.config.budgetMicros - actualMicros - reservedMicros };
}

function assertCapabilities(capabilities: EvaluationCapabilities | undefined, config: EvaluationConfig) {
  if (!capabilities || capabilities.version !== 1 || capabilities.provider !== "openai" || capabilities.stub !== false
    || capabilities.buildSha !== config.buildSha || capabilities.profile !== config.profile
    || capabilities.operationUsage !== true || capabilities.lessonOperations !== true
    || !Number.isSafeInteger(capabilities.enforcedOperationCeilingMicros)
    || capabilities.enforcedOperationCeilingMicros !== config.operationCeilingMicros) {
    throw new Error("LIVE_CAPABILITY_UNAVAILABLE: require exact candidate/profile, real-provider identity, durable usage, lesson operations, and a server-enforced operation ceiling before mutation.");
  }
}

function recordEvidence(step: StepCheckpoint, status: OperationStatus, config: EvaluationConfig) {
  const evidence = status.evaluation;
  if (!evidence || evidence.provider !== "openai" || evidence.stub !== false || evidence.profile !== config.profile
    || !Array.isArray(evidence.calls) || !evidence.versions || !Object.keys(evidence.versions).length) {
    throw new Error("PROVIDER_EVIDENCE_MISSING: preserve reservation and reconcile the operation before continuing.");
  }
  for (const amount of [evidence.actualCostMicros, evidence.uncertainCostMicros]) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid durable operation accounting.");
  }
  if (evidence.actualCostMicros < step.actualCostMicros) throw new Error("Durable usage cannot decrease across checkpoints.");
  if (new Set(evidence.calls.map((call) => call.id)).size !== evidence.calls.length) throw new Error("Duplicate provider call receipts.");
  for (const call of evidence.calls) {
    if (!call.id || !["generation", "research", "verifier", "fallback", "recovery"].includes(call.kind)
      || !["completed", "failed", "in_flight", "unknown"].includes(call.status)
      || !Number.isSafeInteger(call.costMicros) || call.costMicros < 0 || !Array.isArray(call.samples)) throw new Error("Invalid provider call receipt.");
    for (const sample of call.samples) {
      if (!/^resp_[a-z0-9]+$/i.test(sample.responseId) || /stub|mock|fixture|local/i.test(sample.model)
        || !sample.model || !sample.promptVersion || !Number.isSafeInteger(sample.inputTokens) || sample.inputTokens < 0
        || !Number.isSafeInteger(sample.outputTokens) || sample.outputTokens < 0) throw new Error("Stub or incomplete provider usage cannot count as live evidence.");
    }
  }
  if (evidence.calls.reduce((sum, call) => sum + call.costMicros, 0) !== evidence.actualCostMicros) throw new Error("Durable receipt costs do not reconcile.");
  for (const previous of step.evidence?.calls ?? []) {
    if (previous.status === "completed" && !evidence.calls.some((call) => call.id === previous.id && fingerprint(call) === fingerprint(previous))) throw new Error("Observed provider receipts cannot disappear or change during resume.");
  }
  step.actualCostMicros = evidence.actualCostMicros;
  step.uncertainCostMicros = evidence.uncertainCostMicros;
  step.evidence = evidence;
  if (evidence.actualCostMicros + evidence.uncertainCostMicros > step.reservedMicros) throw new Error("SERVER_BUDGET_BREACH: stop and reconcile; the declared ceiling was exceeded.");
}

export function callCounts(step: StepCheckpoint) {
  const calls = step.evidence?.calls ?? [];
  const count = (kind: ProviderCall["kind"]) => calls.filter((call) => call.kind === kind).length;
  const generationAttempts = count("generation") + count("fallback") + count("recovery");
  return { generationAttempts, generationRetries: Math.max(0, generationAttempts - 1), researchCalls: count("research"), verifierCalls: count("verifier"), fallbackCalls: count("fallback"), recoveryCalls: count("recovery") };
}

export function plannedLessonIds(course: Json): string[] {
  if (!Array.isArray(course.modules) || !course.modules.length || course.modules.length > 20) throw new Error("The saved course has no bounded complete lesson plan.");
  return course.modules.flatMap((module: unknown, moduleIndex) => {
    const lessons = (module as Json)?.lessons;
    if (!Array.isArray(lessons) || !lessons.length || lessons.length > 20) throw new Error("Every planned module needs a bounded lesson inventory.");
    return lessons.map((_, lessonIndex) => `${moduleIndex}-${lessonIndex}`);
  });
}

export async function runFullCourseEvaluation(options: {
  run: RunCheckpoint; cases: FullCourseCase[]; backend: EvaluationBackend;
  save: (run: RunCheckpoint) => Promise<void>;
  validate: (course: Json, lessons: Json[]) => Promise<unknown>;
  now?: () => number; pause?: (milliseconds: number) => Promise<void>;
}) {
  const { run, cases, backend, save, validate } = options;
  const now = options.now ?? Date.now;
  const pause = options.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (run.schemaVersion !== 1 || run.inventoryHash !== fingerprint(cases) || run.datasetVersion !== FULL_COURSE_DATASET_VERSION
    || backend.evidenceKind !== run.config.evidenceKind) throw new Error("Resume requires the original inventory and evidence mode.");
  const bounded = async <T>(action: (signal: AbortSignal) => Promise<T>, caseDeadline = Infinity): Promise<T> => {
    const duration = Math.min(run.config.callDeadlineMs, caseDeadline - now());
    if (duration <= 0) throw new Error("CASE_DEADLINE_EXPIRED: no further provider work is authorized for this case.");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("CALL_DEADLINE_EXPIRED: outcome may be unknown; reconcile before resume.")); }, duration);
    });
    try { return await Promise.race([action(controller.signal), deadline]); }
    finally { clearTimeout(timer!); }
  };
  assertCapabilities(await bounded((signal) => backend.preflight(signal)), run.config);
  const checkpoint = async (item: CaseCheckpoint, event: string, step?: string, stage?: string) => {
    run.events.push({ at: new Date(now()).toISOString(), caseId: item.id, event, ...(step ? { step } : {}), ...(stage ? { stage } : {}) });
    await save(run);
  };
  for (const item of run.cases) {
    if (["awaiting_review", "fixture_complete"].includes(item.status)) continue;
    const input = cases.find((candidate) => candidate.id === item.id);
    if (!input || item.requestHash !== fingerprint(input.request)) throw new Error("The resumed case request changed.");
    item.startedAt ??= new Date(now()).toISOString();
    item.deadlineAt ??= new Date(now() + run.config.caseDeadlineMs).toISOString();
    const caseDeadline = Date.parse(item.deadlineAt);
    const stepRun = async (name: string, kind: "course" | "lesson", payload: Json): Promise<string> => {
      let step = item.steps[name];
      if (step && step.payloadHash !== fingerprint(payload)) throw new Error("The persisted operation payload changed.");
      if (step?.status === "complete") return step.resultId!;
      if (step?.status === "failed") throw new Error("TERMINAL_OPERATION: retain this failed case; a new paid experiment requires a new approved run.");
      if (step && !step.operationId) throw new Error("UNKNOWN_OPERATION: intent was persisted but no operation ID returned; reconcile server status, never submit another creation automatically.");
      if (budgetState(run).uncertainMicros > 0) throw new Error("UNKNOWN_COST: reconcile uncertain provider cost before further spending.");
      let status: OperationStatus;
      if (!step) {
        if (budgetState(run).availableMicros < run.config.operationCeilingMicros) throw new Error("BUDGET_EXHAUSTED: remaining ceiling cannot fund another bounded operation.");
        step = { key: `eval-${fingerprint([run.config.runId, item.id, name])}`, payloadHash: fingerprint(payload), status: "intent", reservedMicros: run.config.operationCeilingMicros, actualCostMicros: 0, uncertainCostMicros: 0, startedAt: new Date(now()).toISOString() };
        item.steps[name] = step;
        // Must reach durable storage before the first mutation; a crash cannot erase spend intent.
        await checkpoint(item, "operation_intent", name);
        status = await bounded((signal) => backend.start(kind, payload, step.key, step.reservedMicros, signal), caseDeadline);
      } else {
        status = await bounded((signal) => backend.status(step.operationId!, signal), caseDeadline);
      }
      for (;;) {
        if (!/^[a-f0-9]{64}$/.test(status.operationId) || (step.operationId && step.operationId !== status.operationId)) throw new Error("Operation identity changed or is missing.");
        step.operationId = status.operationId;
        step.status = "active";
        step.lastStage = status.stage;
        step.lastObservedAt = new Date(now()).toISOString();
        step.elapsedMs = now() - Date.parse(step.startedAt);
        // Save the identity before rejecting incomplete cost evidence so a lost response remains recoverable.
        await checkpoint(item, "operation_observed", name, status.stage);
        if (!status.evaluation) {
          status = await bounded((signal) => backend.status(step.operationId!, signal), caseDeadline);
          if (status.operationId !== step.operationId) throw new Error("Operation identity changed during evidence recovery.");
          step.lastStage = status.stage;
        }
        recordEvidence(step, status, run.config);
        await checkpoint(item, "usage_checkpoint", name, status.stage);
        if (step.uncertainCostMicros || step.evidence!.calls.some((call) => call.status === "unknown")) throw new Error("UNKNOWN_COST: provider outcome must be reconciled; automatic generation resume is forbidden.");
        if (status.status === "failed") {
          step.status = "failed";
          await checkpoint(item, "operation_failed", name, status.stage);
          throw new Error("GENERATION_FAILED: durable cost and failed-stage evidence retained.");
        }
        if (status.status === "completed") {
          if (step.evidence!.calls.some((call) => call.status === "in_flight")) throw new Error("Completed operation has unresolved provider receipts.");
          if (!status.resultId || !step.evidence!.calls.some((call) => ["generation", "fallback", "recovery"].includes(call.kind) && call.status === "completed" && call.samples.length)) throw new Error("A completed operation needs real generation receipts and a durable result ID.");
          step.status = "complete";
          step.resultId = status.resultId;
          await checkpoint(item, "operation_complete", name, status.stage);
          return status.resultId;
        }
        if (!["pending", "running"].includes(status.status)) throw new Error("Unsupported operation status.");
        if (now() >= caseDeadline) throw new Error("CASE_DEADLINE_EXPIRED: operation retained for reconciliation.");
        if (status.status === "pending" && status.resumable === true) {
          await checkpoint(item, "resume_intent", name, status.stage);
          status = await bounded((signal) => backend.resume(step.operationId!, step.reservedMicros, signal), caseDeadline);
        } else {
          const retryAt = status.retryAt ? Date.parse(status.retryAt) : now() + 1_000;
          await pause(Math.max(20, Math.min(5_000, caseDeadline - now(), retryAt - now())));
          status = await bounded((signal) => backend.status(step.operationId!, signal), caseDeadline);
        }
      }
    };
    try {
      item.status = "active";
      delete item.error;
      await checkpoint(item, "case_started");
      item.courseId = await stepRun("outline", "course", input.request);
      if (!item.artifacts.course) {
        const course = await bounded((signal) => backend.artifact(item.courseId!, undefined, signal), caseDeadline);
        item.lessonIds = plannedLessonIds(course);
        item.releaseId = typeof course.publishedReleaseId === "string" ? course.publishedReleaseId : null;
        item.artifacts.course = { value: course, hash: fingerprint(course) };
        await checkpoint(item, "outline_saved");
      }
      for (const lessonId of item.lessonIds) {
        await stepRun(`lesson:${lessonId}`, "lesson", { courseId: item.courseId, lessonId });
        if (!item.artifacts[lessonId]) {
          const lesson = await bounded((signal) => backend.artifact(item.courseId!, lessonId, signal), caseDeadline);
          if (typeof lesson.content !== "string" || !lesson.content.trim()) throw new Error("The committed lesson has no instructional body.");
          item.artifacts[lessonId] = { value: { ...lesson, id: lessonId }, hash: fingerprint({ ...lesson, id: lessonId }) };
          await checkpoint(item, "lesson_saved", `lesson:${lessonId}`);
        }
      }
      item.validation = await validate(item.artifacts.course.value, item.lessonIds.map((id) => item.artifacts[id].value));
      const report = item.validation as { issues?: unknown[] };
      item.deterministicStatus = Array.isArray(report?.issues) && report.issues.length === 0 ? "passed" : "blocked";
      if (item.deterministicStatus === "blocked") throw new Error("DETERMINISTIC_VALIDATION_FAILED: retain the complete course and diagnostics for repair/review.");
      item.status = run.config.evidenceKind === "real_provider" ? "awaiting_review" : "fixture_complete";
      await checkpoint(item, "full_course_retained");
    } catch (error) {
      item.status = "blocked";
      // Errors are bounded codes from this runner/transport, never provider payloads or credentials.
      item.error = error instanceof Error && /^[A-Z_]+:/.test(error.message) ? error.message.split(":")[0] : "EVALUATION_BLOCKED";
      await checkpoint(item, "case_blocked");
      // An unresolved request or uncertain accounting stops the whole run, not just this case.
      if (budgetState(run).uncertainMicros > 0 || Object.values(item.steps).some((step) => !["complete", "failed"].includes(step.status))) break;
    }
  }
  return run;
}
