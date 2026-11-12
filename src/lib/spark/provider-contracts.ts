import { z } from "zod";
import type { InputTokenCountParams } from "openai/resources/responses/input-tokens";
import {
  sparkCompoundGrowthSchema,
  sparkExplanationSchema,
  sparkLinearSchema,
  sparkNeuronSchema,
  sparkStageSchema,
  sparkStepThroughSchema,
  sparkSuggestedActionSchema,
} from "@/lib/spark/contracts";

// The provider requires every field. Null represents an absent optional field;
// application contracts remain unchanged and normalization removes these nulls.
const providerBase = {
  objectiveIds: sparkExplanationSchema.shape.objectiveIds.unwrap().nullable(),
  sourceRefs: sparkExplanationSchema.shape.sourceRefs.unwrap(),
};
export const sparkProviderTurnSchema = z.object({
  stage: sparkStageSchema,
  blocks: z.array(z.union([
    sparkExplanationSchema.extend({ ...providerBase, steps: sparkExplanationSchema.shape.steps.unwrap().nullable() }),
    sparkStepThroughSchema.extend(providerBase),
    sparkNeuronSchema.extend(providerBase),
    sparkLinearSchema.extend(providerBase),
    sparkCompoundGrowthSchema.extend({ ...providerBase, config: sparkCompoundGrowthSchema.shape.config.extend({
      contribution: sparkCompoundGrowthSchema.shape.config.shape.contribution.unwrap(),
      currencyLabel: sparkCompoundGrowthSchema.shape.config.shape.currencyLabel.unwrap(),
    }) }),
  ])).min(1).max(4),
  suggestedActions: z.array(sparkSuggestedActionSchema).max(4),
}).strict();

export function normalizedSparkProviderBlocks(value: z.infer<typeof sparkProviderTurnSchema>) {
  return value.blocks.map((block) => ({
    ...block,
    objectiveIds: block.objectiveIds ?? undefined,
    ...(block.type === "explanation" ? { steps: block.steps ?? undefined } : {}),
  }));
}

export class SparkInputBudgetError extends Error {
  retryWithNewRequest = false;
  constructor(public readonly code: "SPARK_INPUT_LIMIT" | "SPARK_INPUT_COUNT_UNAVAILABLE") {
    super(code === "SPARK_INPUT_LIMIT"
      ? "This Spark request is too large for one response. Use saved practice or ask about a shorter passage."
      : "Spark could not confirm the input limit. Your saved practice is still available.");
  }
}

interface TokenCounter {
  count: (body: InputTokenCountParams, options: { maxRetries: number; timeout: number; signal?: AbortSignal }) => Promise<{ input_tokens: number }>;
}

/** Count instructions, input and the real structured-output schema before inference dispatch. */
export async function assertSparkInputBudget(counter: TokenCounter, request: InputTokenCountParams, maximum: number, signal?: AbortSignal) {
  const tokenRequest = { model: request.model, instructions: request.instructions, input: request.input, text: request.text };
  const counted = await counter.count(tokenRequest, { maxRetries: 0, timeout: 10_000, signal }).catch(() => {
    throw new SparkInputBudgetError("SPARK_INPUT_COUNT_UNAVAILABLE");
  });
  if (!Number.isSafeInteger(counted.input_tokens) || counted.input_tokens < 1) {
    throw new SparkInputBudgetError("SPARK_INPUT_COUNT_UNAVAILABLE");
  }
  if (counted.input_tokens > maximum) throw new SparkInputBudgetError("SPARK_INPUT_LIMIT");
  return counted.input_tokens;
}
