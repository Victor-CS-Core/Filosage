import assert from "node:assert/strict";
import test from "node:test";
import { estimateAiUsageCostMicros } from "../../src/lib/ai-pricing.ts";

test("shared allowance accounting recognizes the pinned Spark model price", () => {
  assert.equal(estimateAiUsageCostMicros({
    model: "gpt-4.1-mini-2025-04-14",
    inputTokens: 4_000,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 900,
  }), 3_040);
});