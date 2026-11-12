import assert from "node:assert/strict";
import test from "node:test";
import { zodTextFormat } from "openai/helpers/zod";
import { sparkProviderTurnSchema } from "../../src/lib/spark/provider-contracts.ts";

test("the actual OpenAI SDK accepts the live Spark output contract", () => {
  const format = zodTextFormat(sparkProviderTurnSchema, "spark_turn");
  assert.equal(format.strict, true);
  assert.equal(format.type, "json_schema");
  const inspect = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(inspect); return; }
    const value = node as Record<string, unknown>;
    assert.equal("default" in value, false, "Provider schema cannot emit unsupported defaults");
    if (value.type === "object") {
      assert.equal(value.additionalProperties, false);
      assert.deepEqual([...(value.required as string[])].sort(), Object.keys(value.properties as object).sort());
    }
    Object.values(value).forEach(inspect);
  };
  inspect(format.schema);
  const schema = JSON.stringify(format);
  assert.equal(schema.includes('"taskId"'), false, "Live output cannot invent graded tasks");
});

import { assertSparkInputBudget, normalizedSparkProviderBlocks } from "../../src/lib/spark/provider-contracts.ts";
import { sparkBlockSchema } from "../../src/lib/spark/contracts.ts";

test("nullable provider fields normalize into the unchanged trusted block contract", () => {
  const parsed = sparkProviderTurnSchema.parse({ stage: "define", suggestedActions: [], blocks: [{
    id: "explanation", type: "explanation", title: "Focus", text: "Use the saved rule.", style: "concise",
    sourceRefs: [], evidenceStatus: "ai_general_knowledge", objectiveIds: null, steps: null,
  }] });
  assert.equal(sparkBlockSchema.safeParse(normalizedSparkProviderBlocks(parsed)[0]).success, true);
  assert.equal(sparkProviderTurnSchema.safeParse({ ...parsed, blocks: [{ ...parsed.blocks[0], taskId: "invented" }] }).success, false);
});

test("input admission counts the actual format and rejects unknown or over-limit counts", async () => {
  const format = zodTextFormat(sparkProviderTurnSchema, "spark_turn");
  const request = { model: "gpt-4.1-mini-2025-04-14", instructions: "Use the lesson.", input: "Explain.", text: { format } };
  let calls = 0;
  const counter = { count: async (body: unknown, options: { maxRetries: number }) => {
    calls += 1;
    assert.deepEqual(body, request);
    assert.equal(options.maxRetries, 0);
    return { input_tokens: 4_000 };
  } };
  const inferenceRequest = { ...request, store: false, max_output_tokens: 900 };
  assert.equal(await assertSparkInputBudget(counter, inferenceRequest, 4_000), 4_000);
  assert.equal(calls, 1);
  await assert.rejects(assertSparkInputBudget({ count: async () => ({ input_tokens: 4_001 }) }, request, 4_000), { code: "SPARK_INPUT_LIMIT" });
  await assert.rejects(assertSparkInputBudget({ count: async () => ({ input_tokens: Number.NaN }) }, request, 4_000), { code: "SPARK_INPUT_COUNT_UNAVAILABLE" });
  await assert.rejects(assertSparkInputBudget({ count: async () => { throw new Error("count unavailable"); } }, request, 4_000), { code: "SPARK_INPUT_COUNT_UNAVAILABLE" });
});
