import nextEnv from "@next/env";
import OpenAI from "openai";
import { estimateAiUsageCostMicros, summarizeAiUsage, type AiUsageSample } from "../src/lib/ai-pricing.ts";
import {
  commandCenterDraftEvaluationCases,
  commandCenterDraftEvaluationJsonSchema,
  commandCenterDraftEvaluationModel,
  commandCenterDraftEvaluationPromptVersion,
  commandCenterDraftInstructions,
  scoreCommandCenterDraftEvaluation,
  type EvaluatedCommandCenterDraft,
} from "../src/lib/command-center-draft-evaluation.ts";

nextEnv.loadEnvConfig(process.cwd());

function selectedCases() {
  const requested = process.env.COMMAND_CENTER_EVAL_CASES
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!requested?.length) return commandCenterDraftEvaluationCases;
  const selected = commandCenterDraftEvaluationCases.filter((candidate) => requested.includes(candidate.id));
  const missing = requested.filter((id) => !selected.some((candidate) => candidate.id === id));
  if (missing.length) throw new Error(`Unknown evaluation cases: ${missing.join(", ")}`);
  return selected;
}

function usageSample(model: string, response: { id: string; usage?: {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
} | null }): AiUsageSample {
  return {
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    responseId: response.id,
    promptVersion: commandCenterDraftEvaluationPromptVersion,
    profile: "command-center.live-evaluation",
    reasoningEffort: "medium",
  };
}

async function run() {
  const cases = selectedCases();
  const model = process.env.OPENAI_COMMAND_CENTER_MODEL?.trim() || commandCenterDraftEvaluationModel;
  const configuredRepetitions = Number(process.env.COMMAND_CENTER_EVAL_REPETITIONS || "2");
  if (!Number.isInteger(configuredRepetitions) || configuredRepetitions < 1 || configuredRepetitions > 5) {
    throw new Error("COMMAND_CENTER_EVAL_REPETITIONS must be an integer from 1 to 5.");
  }
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({
      live: false,
      model,
      promptVersion: commandCenterDraftEvaluationPromptVersion,
      repetitions: configuredRepetitions,
      cases: cases.map(({ id, purpose, safetyCritical }) => ({ id, purpose, safetyCritical })),
      hardGate: "All cases, schema responses, and hard safety checks must pass.",
    }, null, 2));
    return;
  }
  if (process.env.COMMAND_CENTER_EVAL_LIVE !== "1") {
    throw new Error("Refusing to spend model quota. Set COMMAND_CENTER_EVAL_LIVE=1 or use --dry-run.");
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for a live evaluation. Local stub output is never accepted as evaluation evidence.");

  const client = new OpenAI({ apiKey });
  const results = [];
  const usage: AiUsageSample[] = [];
  for (let repetition = 1; repetition <= configuredRepetitions; repetition += 1) {
    for (const evaluation of cases) {
      const startedAt = performance.now();
      try {
      const response = await client.responses.create({
        model,
        store: false,
        instructions: commandCenterDraftInstructions,
        input: evaluation.prompt,
        reasoning: { effort: "medium" },
        text: {
          format: {
            type: "json_schema",
            name: "command_center_draft",
            strict: true,
            schema: commandCenterDraftEvaluationJsonSchema,
          },
          verbosity: "medium",
        },
        prompt_cache_key: `filosage:commandcenter:${commandCenterDraftEvaluationPromptVersion}:${model}`.toLowerCase().slice(0, 120),
        max_output_tokens: 2_500,
        safety_identifier: "filosage-command-center-evaluation",
      });
      const sample = usageSample(model, response);
      usage.push(sample);
      const output = JSON.parse(response.output_text) as EvaluatedCommandCenterDraft;
      const scoring = scoreCommandCenterDraftEvaluation(evaluation, output);
        results.push({ id: evaluation.id, repetition, purpose: evaluation.purpose, safetyCritical: evaluation.safetyCritical, schemaValid: true, latencyMs: Math.round(performance.now() - startedAt), estimatedCostMicros: estimateAiUsageCostMicros(sample), scoring, output });
      } catch (error) {
        results.push({ id: evaluation.id, repetition, purpose: evaluation.purpose, safetyCritical: evaluation.safetyCritical, schemaValid: false, latencyMs: Math.round(performance.now() - startedAt), error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const scored = results.filter((result): result is typeof result & { schemaValid: true; scoring: ReturnType<typeof scoreCommandCenterDraftEvaluation> } => result.schemaValid);
  const usageSummary = summarizeAiUsage(usage);
  const failedCaseIds = results.filter((result) => {
    if (!result.schemaValid || !("scoring" in result) || !result.scoring) return true;
    return !result.scoring.passed || !result.scoring.hardPassed;
  }).map((result) => `${result.id}#${result.repetition}`);
  const summary = {
    model,
    promptVersion: commandCenterDraftEvaluationPromptVersion,
    evaluatedAt: new Date().toISOString(),
    totalCases: cases.length,
    repetitions: configuredRepetitions,
    totalExecutions: results.length,
    schemaValidCases: scored.length,
    passedCases: scored.filter((result) => result.scoring.passed).length,
    hardSafetyPassed: scored.length === results.length && scored.every((result) => result.scoring.hardPassed),
    meanScore: scored.length ? Number((scored.reduce((sum, result) => sum + result.scoring.score, 0) / scored.length).toFixed(3)) : 0,
    productionGatePassed: scored.length === results.length && scored.every((result) => result.scoring.passed && result.scoring.hardPassed),
    failedCaseIds,
    usage: usageSummary,
    estimatedCostUsd: Number((usageSummary.actualCostMicros / 1_000_000).toFixed(6)),
  };
  const reportedResults = process.argv.includes("--verbose")
    ? results
    : results.map(({ id, repetition, purpose, safetyCritical, schemaValid, latencyMs, ...result }) => ({
      id,
      repetition,
      purpose,
      safetyCritical,
      schemaValid,
      latencyMs,
      ...(schemaValid && "scoring" in result ? { scoring: result.scoring } : { error: "error" in result ? result.error : "Unknown evaluation failure" }),
    }));
  console.log(JSON.stringify({ summary, results: reportedResults }, null, 2));
  if (!summary.productionGatePassed) process.exitCode = 1;
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
