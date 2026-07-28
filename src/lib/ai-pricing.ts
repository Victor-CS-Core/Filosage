export interface AiUsageSample {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  fixedCostMicros?: number;
  responseId?: string;
}

interface ModelRates {
  input: number;
  cachedInput: number;
  output: number;
}

const MODEL_RATES: Record<string, ModelRates> = {
  "gpt-5.6-sol": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.6-terra": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.6-luna": { input: 1, cachedInput: 0.1, output: 6 },
};

const FALLBACK_RATES: ModelRates = {
  input: 2.5,
  cachedInput: 0.25,
  output: 15,
};

export function ratesForModel(model: string): ModelRates {
  const normalized = model.trim().toLowerCase();
  const exact = MODEL_RATES[normalized];
  if (exact) return exact;

  const family = Object.keys(MODEL_RATES).find((candidate) => normalized.startsWith(`${candidate}-`));
  return family ? MODEL_RATES[family] : FALLBACK_RATES;
}

export function estimateAiUsageCostMicros(sample: AiUsageSample) {
  if (typeof sample.fixedCostMicros === "number" && Number.isFinite(sample.fixedCostMicros)) {
    return Math.max(0, Math.round(sample.fixedCostMicros));
  }
  const rates = ratesForModel(sample.model);
  const inputTokens = Math.max(0, sample.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, Math.max(0, sample.cachedInputTokens));
  const cacheWriteTokens = Math.min(
    inputTokens - cachedInputTokens,
    Math.max(0, sample.cacheWriteTokens),
  );
  const uncachedInputTokens = inputTokens - cachedInputTokens - cacheWriteTokens;
  const outputTokens = Math.max(0, sample.outputTokens);

  // A $1-per-million-token rate is exactly one microdollar per token.
  return Math.max(0, Math.round(
    uncachedInputTokens * rates.input
      + cachedInputTokens * rates.cachedInput
      + cacheWriteTokens * rates.input * 1.25
      + outputTokens * rates.output,
  ));
}

export function summarizeAiUsage(samples: AiUsageSample[]) {
  return samples.reduce(
    (summary, sample) => ({
      inputTokens: summary.inputTokens + Math.max(0, sample.inputTokens),
      cachedInputTokens: summary.cachedInputTokens + Math.max(0, sample.cachedInputTokens),
      cacheWriteTokens: summary.cacheWriteTokens + Math.max(0, sample.cacheWriteTokens),
      outputTokens: summary.outputTokens + Math.max(0, sample.outputTokens),
      actualCostMicros: summary.actualCostMicros + estimateAiUsageCostMicros(sample),
    }),
    { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, actualCostMicros: 0 },
  );
}
