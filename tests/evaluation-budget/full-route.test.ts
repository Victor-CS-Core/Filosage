import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { aiClient } from "../../src/lib/local-ai.ts";
import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
import { getLesson, getStoredDocument, putStoredDocument } from "../../src/lib/document-store.ts";
import { courseGenerationConfiguration } from "../../src/lib/course-generation-configuration.ts";
import { lessonGenerationConfiguration } from "../../src/lib/lesson-generation-configuration.ts";
import { generationFingerprint, generationOperationId } from "../../src/lib/generation-operations.ts";
import { TERMS_VERSION, PRIVACY_VERSION } from "../../src/lib/legal.ts";
import { POST as coursePost } from "../../src/app/api/generate-course/route.ts";
import { POST as lessonPost } from "../../src/app/api/generate-lesson/route.ts";
import { GET as operationsGet } from "../../src/app/api/generation-operations/route.ts";
import { GET as operationGet, POST as operationPost } from "../../src/app/api/generation-operations/[operationId]/route.ts";
import { GET as courseGet } from "../../src/app/api/courses/[courseId]/route.ts";
import { GET as lessonGet } from "../../src/app/api/courses/[courseId]/lessons/[lessonId]/route.ts";
import { fullCourseCases } from "../../evals/course-pipeline/catalog.ts";
import { budgetState, callCounts, newRun, plannedLessonIds, runFullCourseEvaluation, type EvaluationBackend, type EvaluationConfig, type RunCheckpoint } from "../../evals/course-pipeline/full-course-runner.ts";
import { openCheckpointDirectory } from "../../evals/course-pipeline/checkpoints.ts";
import { httpEvaluationBackend } from "../../evals/course-pipeline/http-backend.ts";

if (process.env.OPENAI_API_KEY || process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new Error("Full route fixture requires local isolation and no provider credentials.");
const directory = mkdtempSync(join(tmpdir(), "evaluation-full-route-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
after(() => rmSync(directory, { recursive: true, force: true }));

test("HTTP evaluator composes authenticated routes and installed SDK for every planned lesson, durable resume and free completed replay", async () => {
  const local = aiClient(); // Capture schema fixture factory BEFORE enabling the intercepted SDK.
  const original = Object.fromEntries(["OPENAI_API_KEY", "SITE_VERSION", "COURSE_PIPELINE_V2", "FILOSAGE_MODEL_EVALUATION_APPROVAL"].map((key) => [key, process.env[key]]));
  const actor = await captureAccountGeneration("local-owner");
  await runWithAccountGeneration(actor, () => putStoredDocument("users/local-owner", { uid: "local-owner", plan: "pro", accountStatus: "active", acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION }));
  process.env.OPENAI_API_KEY = "synthetic-full-route-key";
  process.env.SITE_VERSION = "a".repeat(40);
  process.env.COURSE_PIPELINE_V2 = "false";
  const config: EvaluationConfig = { runId: "sdk-full-route-fixture", origin: "https://fixture.invalid", buildSha: "a".repeat(40), profile: "sdk-full-route-fixture", evidenceKind: "offline_fixture", budgetMicros: 1_000_000, operationCeilingMicros: 100_000, callDeadlineMs: 10_000, caseDeadlineMs: 300_000 };
  const account = { uid: "local-owner", isOwner: true };
  const courseConfiguration = courseGenerationConfiguration(account);
  const lessonConfiguration = lessonGenerationConfiguration(account);
  const rate = { maxInputTokens: 1_000_000, maxOutputTokens: 100_000, inputMicrosPerMillion: 0, cachedInputMicrosPerMillion: 0, cacheWriteInputMicrosPerMillion: 0, outputMicrosPerMillion: 1_000_000, maxToolCalls: 2, webSearchCallMicros: 3 };
  process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify({ version: 1, uid: "local-owner", buildSha: config.buildSha, profile: config.profile, operationCeilingMicros: config.operationCeilingMicros, expiresAt: "2099-01-01T00:00:00Z", rateVersion: "synthetic-full-route-tariffs", configurationFingerprints: { course: generationFingerprint(courseConfiguration), lesson: generationFingerprint(lessonConfiguration) }, models: Object.fromEntries([...courseConfiguration.profiles, ...lessonConfiguration.profiles].map((p) => [p.model, rate])), moderation: { model: "omni-moderation-latest", maxInputBytes: 1_000_000, requestCostMicros: 7 } });
  const requests: Array<{ path: string; method: string; status: number }> = [];
  const provider: Array<{ endpoint: string; format?: string }> = [];
  const snapshots: RunCheckpoint[] = [];
  const storage = await openCheckpointDirectory(join(directory, "runner-checkpoints"));
  let clock = Date.now();
  let interruptNextResume = true;
  const transport = mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === config.origin) {
      const request = new Request(url, init);
      assert.equal(request.headers.get("authorization"), "Bearer local-dev-token");
      assert.equal(request.headers.get("x-filosage-evaluation-profile"), config.profile);
      assert.equal(request.headers.get("x-filosage-evaluation-build-sha"), config.buildSha);
      assert.equal(request.headers.get("x-filosage-evaluation-max-cost-micros"), String(config.operationCeilingMicros));
      let response: Response;
      const operation = url.pathname.match(/^\/api\/generation-operations\/([a-f0-9]{64})$/);
      if (operation && request.method === "POST" && interruptNextResume) {
        interruptNextResume = false;
        throw new Error("Synthetic transport interruption before dispatching the first resume.");
      }
      const artifact = url.pathname.match(/^\/api\/courses\/([a-zA-Z0-9_-]+)(?:\/lessons\/(\d+-\d+))?$/);
      if (url.pathname === "/api/health") response = Response.json({ ok: true, version: config.buildSha, fixture: true }); // Only health is a fixture; no live build claim.
      else if (url.pathname === "/api/generation-operations") response = await operationsGet(request);
      else if (url.pathname === "/api/generate-course") response = await coursePost(request);
      else if (url.pathname === "/api/generate-lesson") response = await lessonPost(request);
      else if (operation) response = await (request.method === "POST" ? operationPost : operationGet)(request, { params: Promise.resolve({ operationId: operation[1] }) });
      else if (artifact) response = artifact[2] ? await lessonGet(request, { params: Promise.resolve({ courseId: artifact[1], lessonId: artifact[2] }) }) : await courseGet(request, { params: Promise.resolve({ courseId: artifact[1] }) });
      else assert.fail(`Unexpected application path ${url.pathname}`);
      requests.push({ path: url.pathname, method: request.method, status: response.status });
      return response;
    }
    // Fail closed on every other destination. Never delegate to real fetch.
    assert.equal(url.origin, "https://api.openai.com");
    const body = JSON.parse(String(init?.body));
    const format = body.text?.format?.name as string | undefined;
    provider.push({ endpoint: url.pathname, format });
    let response: Response;
    if (url.pathname === "/v1/moderations") response = Response.json({ id: `modr-${provider.length}`, model: "omni-moderation-latest", results: [{ flagged: false }] });
    else {
      assert.equal(url.pathname, "/v1/responses");
      const fixture = await local.responses.parse(body);
      const parsed = fixture.output_parsed as unknown as Record<string, unknown>;
      if (!["course_research", "course_bibliography", "course_outline", "source_evidence_validation", "course_grounding", "lesson_grounding"].includes(format ?? "")) {
        const objective = String(body.input).match(/Observable objective: (.*?)\. Copy this saved objective/);
        assert.ok(objective, "Lesson fixture must copy its actual saved course objective.");
        parsed.learningObjective = objective[1];
        parsed.visuals = [];
        parsed.interactions = [];
        // Keep this synthetic schema fixture within the saved explanation budget.
        parsed.content = String(parsed.content).split(/\s+/).slice(0, 240).join(" ");
      }
      // local-ai output_text is descriptive prose, not JSON. Reconstruct a real
      // SDK raw Response with fixed synthetic IDs, preserving web tool metadata.
      const rawOutput = (fixture.output as unknown as Array<Record<string, unknown>>).filter((item) => item.type !== "message").map((item, index) => ({ ...item, id: `search-${provider.length}-${index}` }));
      response = Response.json({ id: `resp_${provider.length}`, object: "response", status: "completed", service_tier: "default", model: body.model, output: [...rawOutput, { id: `msg-${provider.length}`, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(parsed), annotations: [] }] }], usage: { input_tokens: 10, output_tokens: 10, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } } });
    }
    // Advance only the clock, crossing provider-wave boundaries without sleeps.
    clock += 6_000;
    mock.timers.reset();
    mock.timers.enable({ apis: ["Date"], now: clock });
    return response;
  });
  try {
    const backend: EvaluationBackend = { ...httpEvaluationBackend(config, "local-dev-token"), evidenceKind: "offline_fixture" };
    const cases = fullCourseCases.slice(0, 1);
    let run = newRun(config, cases);
    const execute = () => runFullCourseEvaluation({ run, cases, backend, save: async (value) => { await storage.save(value); snapshots.push(structuredClone(value)); }, validate: async (course, lessons) => {
      assert.equal(lessons.length, plannedLessonIds(course).length);
      for (const lesson of lessons) assert.ok(String(lesson.content).length >= 400);
      return { issues: [], label: "Synthetic structural fixture only; no provider quality or human review claim." };
    } });
    await execute();
    assert.equal(run.cases[0].status, "blocked");
    const interruptedId = run.cases[0].steps.outline.operationId;
    assert.equal(interruptedId, generationOperationId("local-owner", run.cases[0].steps.outline.key));
    assert.equal(provider.length, 1, "Only the checkpointed input moderation precedes the interrupted resume.");
    run = (await storage.load())!;
    assert.deepEqual(run, JSON.parse(JSON.stringify(snapshots.at(-1))));
    await execute();
    const result = run.cases[0];
    assert.equal(result.steps.outline.operationId, interruptedId);
    assert.equal(requests.filter((r) => r.path === "/api/generate-course").length, 1, "Checkpoint recovery must status/resume the existing outline, never recreate it.");
    assert.equal(result.status, "fixture_complete", JSON.stringify({ error: result.error, steps: result.steps, provider, requests }));
    assert.deepEqual(result.lessonIds, ["0-0", "0-1", "1-0", "1-1"]);
    assert.equal(Object.keys(result.artifacts).length, 5);
    assert.equal(result.review.status, "not_reviewed");
    assert.equal(run.acceptance, "human_review_required");
    assert.ok(requests.some((r) => r.status === 202));
    assert.ok(requests.some((r) => /generation-operations\//.test(r.path) && r.method === "POST"));
    for (const [name, step] of Object.entries(result.steps)) {
      assert.equal(step.operationId, generationOperationId("local-owner", step.key, name === "outline" ? "course" : "lesson"));
      assert.equal(step.status, "complete");
      assert.equal(step.evidence?.uncertainCostMicros, 0);
      assert.equal((await getStoredDocument(`generationUsageReceipts/${step.operationId}`))?.actualCostMicros, step.actualCostMicros);
      assert.equal((await getStoredDocument(`aiRequests/${step.operationId}`))?.actualCostMicros, step.actualCostMicros);
    }
    assert.deepEqual(callCounts(result.steps.outline), { generationAttempts: 1, generationRetries: 0, researchCalls: 2, verifierCalls: 0, fallbackCalls: 0, recoveryCalls: 0, moderationCalls: 2 });
    assert.equal(result.steps.outline.actualCostMicros, 50);
    for (const id of result.lessonIds) {
      assert.deepEqual(callCounts(result.steps[`lesson:${id}`]), { generationAttempts: 1, generationRetries: 0, researchCalls: 0, verifierCalls: 0, fallbackCalls: 0, recoveryCalls: 0, moderationCalls: 2 });
      assert.equal(result.steps[`lesson:${id}`].actualCostMicros, 24);
      assert.ok((await getLesson(result.courseId!, id))?.generationSafetyProof);
    }
    assert.equal(provider.length, 17);
    assert.equal(budgetState(run).actualMicros, 146);
    assert.equal(budgetState(run).reservedMicros, 0);
    const dispatchCount = provider.length;
    const signal = new AbortController().signal;
    for (const step of Object.values(result.steps)) {
      const observed = await backend.status(step.operationId!, signal);
      assert.equal(observed.status, "completed");
      assert.equal(observed.evaluation?.actualCostMicros, step.actualCostMicros);
      const replay = await backend.resume(step.operationId!, config.operationCeilingMicros, signal);
      assert.equal(replay.operationId, step.operationId);
      assert.equal((replay as unknown as { recovered: boolean }).recovered, true);
      assert.equal(requests.at(-1)?.status, 200);
      assert.equal(replay.status, "completed");
      assert.equal(replay.resultId, step.resultId);
      const reconciled = await backend.status(step.operationId!, signal);
      assert.equal(reconciled.status, "completed");
      assert.equal(reconciled.evaluation?.actualCostMicros, step.actualCostMicros);
    }
    run = (await storage.load())!;
    assert.deepEqual(run, JSON.parse(JSON.stringify(snapshots.at(-1))));
    await execute();
    assert.equal(provider.length, dispatchCount, "Status, completed resume and checkpoint replay must not dispatch another paid call.");
    assert.equal(budgetState(run).actualMicros, 146);
  } finally {
    await storage.close();
    transport.mock.restore();
    mock.timers.reset();
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
