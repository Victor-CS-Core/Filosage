import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { GET } from "../../src/app/api/generation-operations/route.ts";
import { courseGenerationConfiguration } from "../../src/lib/course-generation-configuration.ts";
import { lessonGenerationConfiguration } from "../../src/lib/lesson-generation-configuration.ts";
import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
import { putStoredDocument } from "../../src/lib/document-store.ts";
import { generationFingerprint } from "../../src/lib/generation-operations.ts";
import { TERMS_VERSION, PRIVACY_VERSION } from "../../src/lib/legal.ts";
import { httpEvaluationBackend } from "../../evals/course-pipeline/http-backend.ts";

if (process.env.OPENAI_API_KEY || process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new Error("Capability fixture requires isolated local mode without provider credentials.");
const directory = mkdtempSync(join(tmpdir(), "evaluation-capability-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.OPENAI_API_KEY = "synthetic-capability-key";
process.env.SITE_VERSION = "a".repeat(40);
process.env.COURSE_PIPELINE_V2 = "true";
process.env.COURSE_LABS_V2 = "false";
process.env.COURSE_VISUALS_V2 = "false";
after(() => rmSync(directory, { recursive: true, force: true }));
const account = { uid: "local-owner", isOwner: true };
const config = { runId: "capability-fixture", origin: "https://fixture.invalid", buildSha: "a".repeat(40), profile: "capability-fixture", evidenceKind: "real_provider" as const, budgetMicros: 10_000, operationCeilingMicros: 1000, callDeadlineMs: 1000, caseDeadlineMs: 10_000 };
const headers = { Authorization: "Bearer local-dev-token", "x-filosage-model-evaluation": "1", "x-filosage-evaluation-build-sha": config.buildSha, "x-filosage-evaluation-profile": config.profile, "x-filosage-evaluation-max-cost-micros": "1000" };
const request = (h: Record<string, string> = headers) => new Request(`${config.origin}/api/generation-operations`, { headers: h });

test("HTTP evaluation preflight advertises only the approved owner runtime and never calls a provider", async () => {
  const actor = await captureAccountGeneration(account.uid);
  await runWithAccountGeneration(actor, () => putStoredDocument(`users/${account.uid}`, { uid: account.uid, plan: "pro", accountStatus: "active", acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION }));
  const ordinary = await GET(request({ Authorization: headers.Authorization }));
  assert.equal(ordinary.status, 200);
  assert.equal((await ordinary.json()).evaluationCapabilities, undefined);
  assert.equal((await GET(request())).status, 409, "Unapproved requests cannot advertise a spend capability.");
  const configurations = { course: courseGenerationConfiguration(account), lesson: lessonGenerationConfiguration(account) };
  const rate = { maxInputTokens: 1000, maxOutputTokens: 1000, inputMicrosPerMillion: 1, cachedInputMicrosPerMillion: 1, cacheWriteInputMicrosPerMillion: 1, outputMicrosPerMillion: 1, maxToolCalls: 0, webSearchCallMicros: 0 };
  process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify({ version: 1, uid: account.uid, buildSha: config.buildSha, profile: config.profile, operationCeilingMicros: 1000, expiresAt: "2099-01-01T00:00:00Z", rateVersion: "synthetic-capability-tariffs", configurationFingerprints: { course: generationFingerprint(configurations.course), lesson: generationFingerprint(configurations.lesson) }, models: Object.fromEntries([...configurations.course.profiles, ...configurations.lesson.profiles].map((p) => [p.model, rate])), moderation: { model: "omni-moderation-latest", maxInputBytes: 8192, requestCostMicros: 1 } });
  let applicationRequests = 0;
  const transport = mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, config.origin, "Preflight must not contact a provider.");
    applicationRequests++;
    // Health identity is a fixture; the capability handler is the real authenticated route.
    if (url.pathname === "/api/health") return Response.json({ ok: true, version: config.buildSha });
    assert.equal(url.pathname, "/api/generation-operations");
    return GET(new Request(url, init));
  });
  try {
    const result = await httpEvaluationBackend(config, "local-dev-token").preflight(new AbortController().signal);
    assert.ok(result);
    assert.equal(result.version, 1);
    assert.equal(result.provider, "openai");
    assert.equal(result.stub, false);
    assert.equal(result.operationUsage, true);
    assert.equal(result.lessonOperations, true);
    assert.equal(result.buildSha, config.buildSha);
    assert.equal(result.profile, config.profile);
    assert.equal(result.enforcedOperationCeilingMicros, config.operationCeilingMicros);
    assert.equal(applicationRequests, 2);
    process.env.COURSE_LABS_V2 = "true";
    const changed = await GET(request());
    assert.equal(changed.status, 409);
    assert.equal((await changed.json()).code, "EVALUATION_CONFIGURATION_CHANGED");
    process.env.COURSE_LABS_V2 = "false";
    delete process.env.OPENAI_API_KEY;
    const stub = await GET(request());
    assert.equal(stub.status, 409);
    assert.equal((await stub.json()).code, "EVALUATION_CONFIGURATION_CHANGED");
    assert.equal(applicationRequests, 2);
  } finally { transport.mock.restore(); }
});
