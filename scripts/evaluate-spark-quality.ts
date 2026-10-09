import { SPARK_QUALITY_REVIEW, sparkQualityCases, sparkQualitySystemAssertions } from "../evals/spark-quality/catalog.ts";

if (!process.argv.includes("--dry-run")) {
  throw new Error("Spark quality evaluation defaults to no provider calls. Pass --dry-run to inspect the fixed corpus; a metered staging run requires separate owner approval.");
}

const count = (field: "domain" | "language" | "condition" | "executionSurface") => Object.fromEntries(
  [...new Set(sparkQualityCases.map((item) => item[field]))].sort().map((value) => [value, sparkQualityCases.filter((item) => item[field] === value).length]),
);

console.log(JSON.stringify({
  evidenceKind: "planning_only",
  providerCalls: 0,
  cases: sparkQualityCases.length,
  domains: count("domain"),
  languages: count("language"),
  conditions: count("condition"),
  executionSurfaces: count("executionSurface"),
  systemAssertions: sparkQualitySystemAssertions.length,
  ownerReview: SPARK_QUALITY_REVIEW,
}, null, 2));