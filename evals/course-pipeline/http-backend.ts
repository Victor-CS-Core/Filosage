import type { EvaluationBackend, EvaluationCapabilities, EvaluationConfig, OperationEvidence, OperationStatus, ProviderCall } from "./full-course-runner.ts";

type Json = Record<string, unknown>;

export function validateEvaluationOrigin(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use an explicit origin without credentials, options, or a path.");
  if (url.protocol === "http:" && !["127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("HTTP evaluation is restricted to literal loopback.");
  if (url.hostname === "filosage.com" || url.hostname.endsWith(".filosage.com") || url.hostname.endsWith(".chatgpt.site")) throw new Error("Production evaluation is not supported by this tool.");
  return url;
}

/** The R08 owner-only receipt DTO. No learner DTO or provider output is telemetry. */
export function normalizeOperationEvidence(value: Json, profile: string): OperationEvidence | undefined {
  const raw = value.evaluation as Json | undefined;
  const configuration = raw?.configuration as Json | undefined;
  if (!raw || !configuration || !Array.isArray(raw.calls) || !Array.isArray(configuration.profiles)) return undefined;
  if (Object.hasOwn(raw, "reconciliationRequired") && typeof raw.reconciliationRequired !== "boolean") {
    throw new Error("INVALID_PROVIDER_EVIDENCE: the reconciliation flag must be boolean.");
  }
  const calls = raw.calls.map((entry: Json): ProviderCall => {
    const samples = (Array.isArray(entry.samples) ? entry.samples : []) as ProviderCall["samples"];
    const profiles = samples.map((sample) => String(sample.profile ?? ""));
    if (entry.status === "observed" && (!profiles.length || profiles.some((name) => !/^\w+\.(?:research|grounding|standard|fallback|recovery|repair|bibliography|evidence-validation)$/.test(name)))) throw new Error("UNCLASSIFIED_PROVIDER_CALL: receipt profile cannot support trustworthy attempt counts.");
    const kind = entry.kind as ProviderCall["kind"];
    if (!["generation", "research", "verifier", "fallback", "recovery", "moderation"].includes(kind)) {
      throw new Error("UNCLASSIFIED_PROVIDER_CALL: a durable explicit call purpose is required.");
    }
    return {
      id: String(entry.callId ?? ""), kind,
      status: entry.status === "observed" ? "completed" : entry.status === "in_flight" ? "in_flight" : "unknown",
      costMicros: Number(entry.costMicros ?? 0),
      samples: samples.map((sample) => ({
        model: sample.model, responseId: sample.responseId, promptVersion: sample.promptVersion,
        inputTokens: sample.inputTokens, outputTokens: sample.outputTokens,
        cachedInputTokens: sample.cachedInputTokens, cacheWriteTokens: sample.cacheWriteTokens,
        profile: sample.profile, reasoningEffort: sample.reasoningEffort,
        fixedCostMicros: sample.fixedCostMicros, toolCalls: sample.toolCalls,
      })),
    };
  });
  return {
    provider: configuration.provider as "openai", stub: configuration.stub as false, profile,
    actualCostMicros: Number(raw.actualCostMicros), uncertainCostMicros: Number(raw.uncertainCostMicros), calls,
    reconciliationRequired: raw.reconciliationRequired === true,
    versions: Object.fromEntries(configuration.profiles.map((entry: Json) => [`prompt:${String(entry.id)}`, String(entry.promptVersion)])),
  };
}

export function httpEvaluationBackend(config: EvaluationConfig, token: string): EvaluationBackend {
  const origin = validateEvaluationOrigin(config.origin);
  const json = async (path: string, signal: AbortSignal, method = "GET", body?: unknown, key?: string, ceiling?: number) => {
    const response = await fetch(new URL(path, origin), {
      method, signal, redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Filosage-Model-Evaluation": "1",
        ...(key ? { "Idempotency-Key": key } : {}),
        "X-Filosage-Evaluation-Profile": config.profile,
        "X-Filosage-Evaluation-Build-Sha": config.buildSha,
        "X-Filosage-Evaluation-Max-Cost-Micros": String(ceiling ?? config.operationCeilingMicros),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // Never echo authentication headers or server error bodies into an acceptance packet.
    const text = await response.text();
    if (text.length > 8_000_000) throw new Error("RESPONSE_TOO_LARGE: preserve operation and investigate bounded output.");
    const value = JSON.parse(text) as Json;
    if (!response.ok && !(typeof value.operationId === "string" && /^[a-f0-9]{64}$/.test(value.operationId))) throw new Error(`HTTP_${response.status}: no resumable operation identity was returned.`);
    return value;
  };
  const evidenceEnvelope = (value: Json): Pick<OperationStatus, "evaluation" | "evaluationError"> => {
    try { return { evaluation: normalizeOperationEvidence(value, config.profile) }; }
    catch {
      // Reject telemetry without discarding a resumable identity. Never retain raw
      // provider data or exception text as evidence; the full reservation remains held.
      return { evaluation: undefined, evaluationError: "INVALID_PROVIDER_EVIDENCE" };
    }
  };
  const status = async (id: string, signal: AbortSignal): Promise<OperationStatus> => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid operation ID.");
    const value = await json(`/api/generation-operations/${id}`, signal);
    return { ...value, ...evidenceEnvelope(value) } as unknown as OperationStatus;
  };
  const observeMutation = async (path: string, signal: AbortSignal, body: unknown, key?: string, ceiling?: number) => {
    const value = await json(path, signal, "POST", body, key, ceiling);
    // Return identity even without telemetry; the orchestrator persists it before requesting reconciliation.
    return { ...value, status: value.status ?? (value.courseId ? "completed" : "pending"), resultId: value.resultId ?? value.courseId, ...evidenceEnvelope(value) } as unknown as OperationStatus;
  };
  return {
    evidenceKind: "real_provider",
    async preflight(signal) {
      const health = await json("/api/health", signal);
      if (health.ok !== true || health.version !== config.buildSha) throw new Error("CANDIDATE_MISMATCH: health does not identify the exact approved build.");
      const operations = await json("/api/generation-operations", signal);
      // The server advertises this only for the exact owner-approved runtime;
      // every provider call must pass its durable operation budget admission.
      return operations.evaluationCapabilities as EvaluationCapabilities | undefined;
    },
    start: (kind, payload, key, ceiling, signal) => observeMutation(`/api/generate-${kind}`, signal, payload, key, ceiling),
    status,
    resume: (id, ceiling, signal) => observeMutation(`/api/generation-operations/${id}`, signal, undefined, undefined, ceiling),
    async artifact(courseId, lessonId, signal) {
      if (!/^[a-zA-Z0-9_-]+$/.test(courseId) || (lessonId && !/^\d+-\d+$/.test(lessonId))) throw new Error("Invalid artifact identity.");
      return json(`/api/courses/${courseId}${lessonId ? `/lessons/${lessonId}` : ""}`, signal);
    },
  };
}
