import { randomUUID } from "node:crypto";

interface EvaluationCase {
  id: string;
  request: {
    topic: string;
    goal: string;
    application: string;
    background: string;
    level: "Foundations" | "Intermediate" | "Advanced";
    weeklyMinutes: number;
    targetWeeks: number;
    courseStyle: "Balanced" | "Concept-first" | "Project-led";
    artifactPreference: string;
    scenarioPreference: string;
  };
}

const cases: EvaluationCase[] = [
  {
    id: "morse-code",
    request: {
      topic: "Morse Code",
      goal: "Accurately send and copy a short practical message at five words per minute.",
      application: "Exchange a concise field message without looking up every character.",
      background: "I recognize a few common Morse Code letters but cannot yet copy a full message.",
      level: "Foundations",
      weeklyMinutes: 120,
      targetWeeks: 4,
      courseStyle: "Project-led",
      artifactPreference: "A recorded and transcribed Morse Code field message",
      scenarioPreference: "Prepare and verify a message exchange for a volunteer radio exercise",
    },
  },
  {
    id: "personal-finance",
    request: {
      topic: "Personal finance and investing for long-term wealth",
      goal: "Build and defend a realistic twelve-month money plan and long-term investing policy.",
      application: "Make monthly saving, debt, emergency-fund, and diversified-investing decisions.",
      background: "I can follow a budget but have not written an investing policy.",
      level: "Foundations",
      weeklyMinutes: 150,
      targetWeeks: 6,
      courseStyle: "Balanced",
      artifactPreference: "A personal financial plan with an investment policy statement",
      scenarioPreference: "Respond to changing income, expenses, and market conditions without abandoning the plan",
    },
  },
  {
    id: "sql-debugging",
    request: {
      topic: "Debugging analytical SQL",
      goal: "Diagnose incorrect analytical query results and defend a tested correction.",
      application: "Review production reporting queries before stakeholders rely on them.",
      background: "I can write joins and aggregations but struggle to isolate subtle grain and null errors.",
      level: "Intermediate",
      weeklyMinutes: 120,
      targetWeeks: 4,
      courseStyle: "Concept-first",
      artifactPreference: "A query-debugging casebook with tests and corrected queries",
      scenarioPreference: "Investigate a dashboard whose totals disagree with the source system",
    },
  },
];

function help() {
  console.log(`Filosage model-quality evaluation

Dry run:
  npm run eval:model-quality -- --dry-run

Live run (PowerShell):
  $env:MODEL_QUALITY_EVAL_LIVE="1"
  $env:MODEL_QUALITY_EVAL_BASE_URL="http://127.0.0.1:3000"
  $env:MODEL_QUALITY_EVAL_AUTH_TOKEN="playwright-local-owner"
  npm run eval:model-quality

Optional:
  MODEL_QUALITY_EVAL_CASES=morse-code,sql-debugging
  MODEL_QUALITY_EVAL_ALLOW_PRODUCTION=1`);
}

function selectedCases() {
  const selection = process.env.MODEL_QUALITY_EVAL_CASES
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!selection?.length) return cases;
  const selected = cases.filter((candidate) => selection.includes(candidate.id));
  const missing = selection.filter((id) => !selected.some((candidate) => candidate.id === id));
  if (missing.length) throw new Error(`Unknown evaluation cases: ${missing.join(", ")}`);
  return selected;
}

function isProductionHost(url: URL) {
  return url.hostname === "filosage.com"
    || url.hostname.endsWith(".filosage.com")
    || url.hostname.endsWith(".chatgpt.site");
}

function checksPassed(checks: Record<string, boolean>) {
  const values = Object.values(checks);
  return {
    checks,
    passed: values.filter(Boolean).length,
    total: values.length,
    score: values.filter(Boolean).length / values.length,
  };
}

function scoreCourse(value: Record<string, unknown>) {
  const modules = Array.isArray(value.modules) ? value.modules as Array<Record<string, unknown>> : [];
  const lessons = modules.flatMap((courseModule) => Array.isArray(courseModule.lessons)
    ? courseModule.lessons as Array<Record<string, unknown>>
    : []);
  const modes = new Set(lessons.map((lesson) => lesson.lessonMode).filter(Boolean));
  return checksPassed({
    moduleRange: modules.length >= 2 && modules.length <= 6,
    lessonsPerModule: modules.length > 0 && modules.every((courseModule) => Array.isArray(courseModule.lessons) && courseModule.lessons.length >= 2),
    observableModuleObjectives: modules.every((courseModule) => typeof courseModule.objective === "string" && courseModule.objective.length >= 20),
    variedTeachingModes: modes.size >= Math.min(3, lessons.length),
    artifactThread: Boolean(value.artifact) && lessons.every((lesson) => typeof lesson.artifactContribution === "string" && lesson.artifactContribution.length >= 15),
    assessableCapstone: Boolean(value.capstone),
  });
}

function scoreLesson(value: Record<string, unknown>) {
  const guided = value.guidedPractice as Record<string, unknown> | undefined;
  const transfer = value.transferTask as Record<string, unknown> | undefined;
  const quizzes = Array.isArray(value.quizzes) ? value.quizzes as Array<Record<string, unknown>> : [];
  const provenance = value.provenance as Record<string, unknown> | undefined;
  return checksPassed({
    substantialContent: typeof value.content === "string" && value.content.length >= 800,
    observableObjective: typeof value.learningObjective === "string" && value.learningObjective.length >= 20,
    modeSpecificExperience: Boolean(value.experience && typeof value.experience === "object"),
    guidedPractice: Boolean(guided && Array.isArray(guided.steps) && guided.steps.length >= 2 && guided.modelAnswer),
    transferTask: Boolean(transfer && Array.isArray(transfer.successCriteria) && transfer.successCriteria.length >= 2 && transfer.modelResponse),
    actionableQuizzes: quizzes.length >= 2 && quizzes.every((quiz) => Array.isArray(quiz.optionFeedback) && quiz.optionFeedback.length === 4),
    promptProvenance: Boolean(provenance?.generationModel && provenance?.promptVersion),
  });
}

async function postJson(baseUrl: URL, path: string, token: string, data: unknown) {
  const startedAt = performance.now();
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `model-eval-${randomUUID()}`,
      "X-Filosage-Model-Evaluation": "1",
    },
    body: JSON.stringify(data),
  });
  const body = await response.json() as Record<string, unknown>;
  return { status: response.status, ok: response.ok, latencyMs: Math.round(performance.now() - startedAt), body };
}

async function run() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    help();
    return;
  }
  const chosen = selectedCases();
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ live: false, cases: chosen.map(({ id, request }) => ({ id, topic: request.topic })) }, null, 2));
    return;
  }
  if (process.env.MODEL_QUALITY_EVAL_LIVE !== "1") {
    throw new Error("Refusing to spend model quota. Set MODEL_QUALITY_EVAL_LIVE=1 or use --dry-run.");
  }
  const token = process.env.MODEL_QUALITY_EVAL_AUTH_TOKEN?.trim();
  if (!token) throw new Error("MODEL_QUALITY_EVAL_AUTH_TOKEN must be a local-mode owner evaluation token.");
  const baseUrl = new URL(process.env.MODEL_QUALITY_EVAL_BASE_URL || "http://127.0.0.1:3000");
  if (isProductionHost(baseUrl) && process.env.MODEL_QUALITY_EVAL_ALLOW_PRODUCTION !== "1") {
    throw new Error("Refusing to mutate a production host. Use a preview/local environment, or explicitly set MODEL_QUALITY_EVAL_ALLOW_PRODUCTION=1.");
  }

  const results = [];
  for (const evaluationCase of chosen) {
    const course = await postJson(baseUrl, "/api/generate-course", token, evaluationCase.request);
    if (!course.ok) {
      results.push({ id: evaluationCase.id, course: { status: course.status, latencyMs: course.latencyMs, error: course.body.error } });
      continue;
    }
    const courseId = String(course.body.courseId || "");
    const lesson = await postJson(baseUrl, "/api/generate-lesson", token, { courseId, lessonId: "0-0" });
    results.push({
      id: evaluationCase.id,
      course: {
        status: course.status,
        latencyMs: course.latencyMs,
        quality: scoreCourse(course.body),
        generation: course.body.evaluation,
      },
      lesson: {
        status: lesson.status,
        latencyMs: lesson.latencyMs,
        quality: lesson.ok ? scoreLesson(lesson.body) : undefined,
        generation: lesson.body.evaluation,
        error: lesson.ok ? undefined : lesson.body.error,
      },
    });
  }

  const successful = results.filter((result) => "lesson" in result && result.lesson?.status === 200);
  const qualityScores = successful.flatMap((result) => [result.course.quality?.score, result.lesson?.quality?.score])
    .filter((score): score is number => typeof score === "number");
  const summary = {
    cases: results.length,
    completedFlows: successful.length,
    meanQualityScore: qualityScores.length
      ? Number((qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length).toFixed(3))
      : 0,
    recoveryRuns: successful.filter((result) => {
      const courseGeneration = result.course.generation as Record<string, unknown> | undefined;
      const lessonGeneration = result.lesson?.generation as Record<string, unknown> | undefined;
      return courseGeneration?.recoveryUsed === true || lessonGeneration?.recoveryUsed === true;
    }).length,
  };
  console.log(JSON.stringify({ baseUrl: baseUrl.origin, summary, results }, null, 2));
  if (summary.completedFlows !== results.length || summary.meanQualityScore < 0.9) process.exitCode = 1;
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
