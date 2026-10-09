import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { SPARK_QUALITY_REVIEW, sparkQualityCases, sparkQualitySystemAssertions } from "../../evals/spark-quality/catalog.ts";

test("Spark quality corpus covers at least thirty fixed cross-domain cases", () => {
  assert.ok(sparkQualityCases.length >= 30);
  assert.equal(new Set(sparkQualityCases.map((item) => item.id)).size, sparkQualityCases.length);
  assert.deepEqual(new Set(sparkQualityCases.map((item) => item.domain)), new Set(["ai", "math", "guitar", "history", "programming"]));
  assert.ok(new Set(sparkQualityCases.map((item) => item.language)).size >= 4);
  assert.ok(sparkQualityCases.every((item) => item.expectedCriteria.length >= 3 && item.allowedComponents.length > 0));
  assert.ok(sparkQualityCases.every((item) => item.reviewStatus === "approved_owner_delegate"));
  assert.ok(sparkQualityCases.every((item) => item.executionSurface !== "live_tutor"
    || item.allowedComponents.every((component) => ["explanation", "step_through", "parameter_explorer"].includes(component))));
  assert.ok(sparkQualityCases.filter((item) => item.stage === "return").length >= 5);
  assert.ok(sparkQualityCases.filter((item) => item.condition === "budget_unavailable").length >= 3);
  assert.ok(sparkQualitySystemAssertions.length >= 5);
  for (const condition of ["misconception", "transfer", "unsupported_reference", "prompt_injection", "budget_unavailable"] as const) {
    assert.ok(sparkQualityCases.some((item) => item.condition === condition), `missing ${condition}`);
  }
});

test("Spark evaluation dry-run performs no provider calls and reports the delegated expert review", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/evaluate-spark-quality.ts", "--dry-run"], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.cases, sparkQualityCases.length);
  assert.equal(report.providerCalls, 0);
  assert.equal(report.evidenceKind, "planning_only");
  assert.equal(report.ownerReview.version, SPARK_QUALITY_REVIEW.version);
  assert.equal(report.ownerReview.decision, "approved_for_bounded_staging");
});