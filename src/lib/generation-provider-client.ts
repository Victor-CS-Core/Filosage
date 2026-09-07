import "server-only";
import type OpenAI from "openai";
import { parseResponse } from "openai/lib/ResponsesParser";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";
import { runGenerationProviderCall, preserveGenerationResponseObservedAt, GENERATION_REQUEST_MS, type GenerationLease } from "@/lib/generation-operations";
import { evaluationResponseParameters, runWithEvaluationCall, type EvaluationCallMetadata } from "@/lib/evaluation-budget";
import { aiUsageProfileMetadata, type AiExecutionProfile } from "@/lib/openai-generation";

/** Explicit stage metadata is shared by checkpointing and the evaluation transport. */
export function durableGenerationResponse(client: OpenAI, lease: GenerationLease, profile: AiExecutionProfile,
  kind: EvaluationCallMetadata["kind"]): typeof client.responses.parse {
  return (async (input, options) => {
    const params = evaluationResponseParameters(input);
    const requestOptions = { ...options, maxRetries: 0, signal: AbortSignal.any([
      ...(options?.signal ? [options.signal] : []),
      AbortSignal.timeout(Math.max(1, Math.min(120_000, GENERATION_REQUEST_MS - (Date.now() - lease.startedAt) - 20_000))),
    ]) };
    // The local fixture exposes a deterministic parsed object; its create method
    // is the tutor stream. It is never admitted as real evaluation evidence.
    if (isLocalMode() && !serverEnvironment.OPENAI_API_KEY) {
      return runGenerationProviderCall(lease, params, () => client.responses.parse(params, requestOptions), aiUsageProfileMetadata(profile));
    }
    // Persist the actual reply and observed usage before local schema parsing can
    // throw. A malformed artifact can be replayed/repaired without buying it again.
    const raw = await runGenerationProviderCall(lease, params, () => runWithEvaluationCall({ kind, profile: profile.id, promptVersion: profile.promptVersion }, () =>
      client.responses.create(params as ResponseCreateParamsNonStreaming, requestOptions)), aiUsageProfileMetadata(profile));
    const parsed = parseResponse(raw, params);
    preserveGenerationResponseObservedAt(raw, parsed);
    return parsed;
  }) as typeof client.responses.parse;
}

/** Cache the real moderation reply before policy inspection, just like other stages. */
export function checkpointGenerationModeration(client: OpenAI, lease: GenerationLease): OpenAI {
  const create = client.moderations.create.bind(client.moderations);
  client.moderations.create = ((params, options) => runGenerationProviderCall(lease,
    { ...params, endpoint: "moderations" }, () => create(params, { ...options, maxRetries: 0 }),
    { profile: "moderation.standard", promptVersion: "moderation-provider-v1" })) as typeof client.moderations.create;
  return client;
}
