import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fullCourseCases, FULL_COURSE_DATASET_VERSION, catalogRubric, reviewTemplate } from "../evals/course-pipeline/catalog.ts";
import { coursePipelineEvaluationCases } from "../evals/course-pipeline/dataset/v1.ts";
import { budgetState, callCounts, fingerprint, newRun, runFullCourseEvaluation, type EvaluationConfig } from "../evals/course-pipeline/full-course-runner.ts";
import { httpEvaluationBackend, validateEvaluationOrigin } from "../evals/course-pipeline/http-backend.ts";
import { openCheckpointDirectory } from "../evals/course-pipeline/checkpoints.ts";

function argumentsForRun(args: string[]) {
  const allowed = new Set(["--dry-run", "--list", "--help", "--live", "--resume"]);
  const options = new Set(["--cases", "--run-id", "--origin", "--expected-sha", "--profile", "--budget-usd", "--operation-ceiling-usd", "--call-deadline-ms", "--case-deadline-ms", "--output", "--authorization"]);
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    if (allowed.has(args[index])) flags.add(args[index]);
    else if (options.has(args[index]) && args[index + 1] && !args[index + 1].startsWith("--")) {
      if (values[args[index]]) throw new Error("Duplicate evaluation option.");
      values[args[index]] = args[++index];
    } else throw new Error("Unknown or incomplete evaluation option. Use --help.");
  }
  return { values, flags };
}

function dollars(value: string | undefined) {
  if (!value || !/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error("An explicit USD ceiling with at most six decimal places is required.");
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("The USD ceiling must be positive and bounded.");
  return amount;
}

async function main() {
  const { values, flags } = argumentsForRun(process.argv.slice(2));
  if (flags.has("--help")) {
    console.log(`Full-course evaluation (no provider calls by default)
  npm run eval:model-quality -- --dry-run
  npm run eval:model-quality -- --list --cases systems-thinking,reading-metrics

Live mode requires --live --run-id ID --origin ORIGIN --expected-sha FULL_SHA
  --profile product-default --budget-usd N --operation-ceiling-usd N
  --output ABSOLUTE_DIRECTORY --authorization approve-live-RUN_ID
  and MODEL_QUALITY_EVAL_LIVE=1, MODEL_QUALITY_EVAL_AUTH_TOKEN, OPENAI_API_KEY.
Use --resume with exactly the original arguments and checkpoint directory.
Defaults: 150000 ms per HTTP call; 7200000 ms per case, across resumptions.
Current R08 has no proven hard spend cap: live mode intentionally refuses before mutation.
See docs/MODEL_QUALITY_EVALUATION.md for the acceptance and recovery contract.`);
    return;
  }
  const requested = values["--cases"]?.split(",") ?? fullCourseCases.map((item) => item.id);
  const chosen = requested.map((id) => {
    const item = fullCourseCases.find((candidate) => candidate.id === id);
    if (!item) throw new Error("Unknown evaluation case. Use --list.");
    return item;
  });
  if (new Set(requested).size !== requested.length) throw new Error("Cases must be unique.");
  if (flags.has("--dry-run") || flags.has("--list")) {
    if (flags.has("--live") || flags.has("--resume")) throw new Error("Planning cannot be combined with live execution or resume.");
    console.log(JSON.stringify({
      evidenceKind: "planning_only", datasetVersion: FULL_COURSE_DATASET_VERSION,
      deterministicInvariantCases: coursePipelineEvaluationCases.length,
      realCoursesGenerated: 0, providerCalls: 0, completedCourseQuality: "not_measured",
      cases: chosen.map((item) => ({ ...item, requestHash: fingerprint(item.request), review: reviewTemplate(item.expertise) })),
      languageDistribution: Object.fromEntries([...new Set(chosen.map((item) => item.request.language))].map((language) => [language, chosen.filter((item) => item.request.language === language).length])),
      completionContract: "Every planned lesson, actual operation usage and immutable local artifact hashes; no first-lesson proxy.",
      rubric: catalogRubric, humanReviewThreshold: "13/16, no zero accuracy/sourceQuality/accessibility, no unresolved critical feedback",
      profileComparison: "Run the same selected cases against separately approved exact builds/profiles; selective Astra is a separate budgeted campaign, never an implicit override.",
      liveBlockers: ["explicit operator authorization and spend ceiling", "server-enforced cost cap capability", "real-provider telemetry and durable lesson operations", "competent catalog/language/accessibility reviewers"],
    }, null, 2));
    return;
  }
  const runId = values["--run-id"];
  if (!flags.has("--live") || process.env.MODEL_QUALITY_EVAL_LIVE !== "1" || !runId || values["--authorization"] !== `approve-live-${runId}`) throw new Error("Refusing provider spend without the exact run's explicit live authorization; use --dry-run.");
  const token = process.env.MODEL_QUALITY_EVAL_AUTH_TOKEN?.trim();
  const providerKey = process.env.OPENAI_API_KEY?.trim();
  if (!token || !providerKey || /stub|mock|testfixture/i.test(providerKey)) throw new Error("Live execution requires a short-lived owner credential and explicitly configured provider key; neither is printed or persisted.");
  const origin = validateEvaluationOrigin(values["--origin"] ?? "").origin;
  if (!values["--expected-sha"] || !values["--profile"] || !values["--output"]) throw new Error("An exact SHA, profile label and checkpoint output directory are required.");
  if (!isAbsolute(values["--output"])) throw new Error("The checkpoint output directory must be an explicit absolute path.");
  const localSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (localSha !== values["--expected-sha"]) throw new Error("The local deterministic validator must be the exact approved candidate SHA.");
  const config: EvaluationConfig = {
    runId, origin, buildSha: localSha, profile: values["--profile"], evidenceKind: "real_provider",
    budgetMicros: dollars(values["--budget-usd"]), operationCeilingMicros: dollars(values["--operation-ceiling-usd"]),
    callDeadlineMs: Number(values["--call-deadline-ms"] ?? 150_000), caseDeadlineMs: Number(values["--case-deadline-ms"] ?? 7_200_000),
  };
  const proposed = newRun(config, chosen);
  const storage = await openCheckpointDirectory(resolve(values["--output"]));
  try {
    const existing = await storage.load();
    if (Boolean(existing) !== flags.has("--resume")) throw new Error("Use --resume for an existing run, or a new empty checkpoint directory for a new run.");
    if (existing && fingerprint(existing.config) !== fingerprint(config)) throw new Error("Resume cannot change candidate, origin, profile, budget, deadlines or run identity.");
    const run = existing ?? proposed;
    await storage.save(run);
    const { validateCourseCandidateV2 } = await import("../src/lib/course-pipeline/validation.ts");
    const { expectedLessonIds, expectedLessonModes } = await import("../src/lib/course-progress.ts");
    const result = await runFullCourseEvaluation({
      run, cases: chosen, backend: httpEvaluationBackend(config, token), save: storage.save,
      validate: async (course, lessons) => {
        const candidate = course as Parameters<typeof validateCourseCandidateV2>[0];
        return validateCourseCandidateV2(candidate, lessons, expectedLessonIds(candidate), expectedLessonModes(candidate));
      },
    });
    console.log(JSON.stringify({
      evidenceKind: result.config.evidenceKind, runId: result.config.runId, acceptance: result.acceptance,
      budget: budgetState(result), cases: result.cases.map((item) => ({
        id: item.id, status: item.status, error: item.error, courseId: item.courseId, releaseId: item.releaseId,
        plannedLessons: item.lessonIds.length, retainedLessons: item.lessonIds.filter((id) => item.artifacts[id]).length,
        operations: Object.fromEntries(Object.entries(item.steps).map(([name, step]) => [name, { operationId: step.operationId, status: step.status, elapsedMs: step.elapsedMs, ...callCounts(step) }])),
        deterministicStatus: item.deterministicStatus, humanReview: item.review.status,
      })),
    }, null, 2));
    if (result.cases.some((item) => item.status !== "awaiting_review")) process.exitCode = 1;
  } finally { await storage.close(); }
}

main().catch((error: unknown) => {
  const safe = error instanceof Error && !/https?:|Bearer |sk-/i.test(error.message) ? error.message : "Evaluation stopped; inspect the retained checkpoint and server operation status.";
  console.error(safe);
  process.exitCode = 1;
});
