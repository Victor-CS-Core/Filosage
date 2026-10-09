import "server-only";

import pricing from "../../../config/spark-pricing.json";
import { serverEnvironment } from "@/lib/runtime-environment";
import {
  SPARK_MAX_INPUT_TOKENS,
  SPARK_MAX_OUTPUT_TOKENS,
  type SparkBudgetCategory,
} from "@/lib/spark/contracts";

export const SPARK_DEFAULT_MODEL = "gpt-4.1-mini-2025-04-14";
export const SPARK_PRICE_VERSION = pricing.version;

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function sparkFeaturePolicy() {
  const sparkEnabled = enabled(serverEnvironment.SPARK_ENABLED);
  const liveAiEnabled = sparkEnabled && enabled(serverEnvironment.SPARK_LIVE_AI_ENABLED);
  return {
    sparkEnabled,
    liveAiEnabled,
    prepareEnabled: sparkEnabled && enabled(serverEnvironment.SPARK_PREPARE_ENABLED),
    semanticRetrievalEnabled: sparkEnabled && enabled(serverEnvironment.SPARK_SEMANTIC_RETRIEVAL_ENABLED),
  };
}

export function sparkRuntimeLimits() {
  return {
    maximumInputTokens: integer(serverEnvironment.SPARK_MAX_INPUT_TOKENS, SPARK_MAX_INPUT_TOKENS, 500, SPARK_MAX_INPUT_TOKENS),
    maximumOutputTokens: integer(serverEnvironment.SPARK_MAX_OUTPUT_TOKENS, SPARK_MAX_OUTPUT_TOKENS, 100, SPARK_MAX_OUTPUT_TOKENS),
    globalConcurrency: integer(serverEnvironment.SPARK_GLOBAL_CONCURRENCY, 4, 1, 16),
    turnsPerMinute: integer(serverEnvironment.SPARK_TURNS_PER_MINUTE, 6, 1, 30),
  };
}

export interface SparkPrice {
  provider: "openai";
  model: string;
  version: string;
  inputMicrosPerToken: number;
  cachedInputMicrosPerToken: number;
  outputMicrosPerToken: number;
  maximumInputTokens: number;
  maximumOutputTokens: number;
  verifiedAt: string;
  expiresAt: string;
}

export function sparkPrice(now = new Date()): SparkPrice {
  const configured = serverEnvironment.OPENAI_SPARK_MODEL?.trim() || SPARK_DEFAULT_MODEL;
  const model = pricing.models[configured as keyof typeof pricing.models];
  if (!model || !Number.isFinite(Date.parse(pricing.expiresAt)) || Date.parse(pricing.expiresAt) <= now.getTime()) {
    throw new Error("SPARK_PRICE_UNAVAILABLE");
  }
  return {
    provider: model.provider as "openai",
    model: configured,
    version: pricing.version,
    inputMicrosPerToken: model.inputMicrosPerToken,
    cachedInputMicrosPerToken: model.cachedInputMicrosPerToken,
    outputMicrosPerToken: model.outputMicrosPerToken,
    maximumInputTokens: model.maximumInputTokens,
    maximumOutputTokens: model.maximumOutputTokens,
    verifiedAt: pricing.verifiedAt,
    expiresAt: pricing.expiresAt,
  };
}

export function sparkMaximumReservationMicros(price = sparkPrice()) {
  return Math.ceil(
    price.maximumInputTokens * price.inputMicrosPerToken
      + price.maximumOutputTokens * price.outputMicrosPerToken,
  );
}

export function sparkUsageCostMicros(
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  price = sparkPrice(),
) {
  const cachedInputTokens = Math.min(usage.inputTokens, Math.max(0, usage.cachedInputTokens));
  return Math.ceil(
    (usage.inputTokens - cachedInputTokens) * price.inputMicrosPerToken
      + cachedInputTokens * price.cachedInputMicrosPerToken
      + usage.outputTokens * price.outputMicrosPerToken,
  );
}

export const SPARK_BUDGET_MICROS = {
  total: 30_000_000,
  fixed: 5_000_000,
  ai: 17_000_000,
  infrastructure: 3_000_000,
  uncertainty: 5_000_000,
  categories: {
    tutoring: 12_000_000,
    preparation: 3_000_000,
    assessment: 2_000_000,
    summary: 0,
    embedding: 0,
  } satisfies Record<SparkBudgetCategory, number>,
} as const;