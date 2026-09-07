import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { courseGenerationConfiguration } from "../../src/lib/course-generation-configuration.ts";
import { POST } from "../../src/app/api/generate-course/route.ts";
import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
import { getStoredDocument, putStoredDocument } from "../../src/lib/document-store.ts";
import { generationFingerprint, generationOperationId } from "../../src/lib/generation-operations.ts";
import { openAiExecutionProfile } from "../../src/lib/openai-generation.ts";
import { TERMS_VERSION, PRIVACY_VERSION } from "../../src/lib/legal.ts";

if (process.env.OPENAI_API_KEY || process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new Error("Budget route fixture requires isolated local mode without provider credentials.");
const directory = mkdtempSync(join(tmpdir(), "course-budget-route-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.OPENAI_API_KEY = "synthetic-route-budget-key";
process.env.SITE_VERSION = "a".repeat(40);
process.env.COURSE_PIPELINE_V2 = "false";
after(() => rmSync(directory, { recursive: true, force: true }));
const request = (key: string) => new Request("https://fixture.invalid/api/generate-course", { method: "POST", headers: {
  Authorization: "Bearer local-dev-token", "Content-Type": "application/json", "Idempotency-Key": key,
  "x-filosage-model-evaluation": "1", "x-filosage-evaluation-build-sha": "a".repeat(40),
  "x-filosage-evaluation-profile": "route-fixture", "x-filosage-evaluation-max-cost-micros": "1",
}, body: JSON.stringify({ topic: "Scientific reasoning", goal: "Compare evidence behind everyday claims.", language: "English" }) });

test("review: completed replay cannot bypass changed approval identity", async () => {
  const actor = await captureAccountGeneration("local-owner");
  await runWithAccountGeneration(actor, () => putStoredDocument("users/local-owner", { uid: "local-owner", plan: "pro", accountStatus: "active", acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION }));
  const profiles = (["course.standard", "course.research", "course.grounding", "course.repair", "course.recovery"] as const)
    .map((id) => openAiExecutionProfile(id, undefined, { coursePipelineV2: false }));
  const configuration = courseGenerationConfiguration({ uid: "local-owner", isOwner: true });
  const rate = { maxInputTokens: 1_000_000, maxOutputTokens: 100_000, inputMicrosPerMillion: 1_000_000,
    cachedInputMicrosPerMillion: 1_000_000, cacheWriteInputMicrosPerMillion: 1_000_000, outputMicrosPerMillion: 1_000_000,
    maxToolCalls: 2, webSearchCallMicros: 10_000 };
  process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify({ version: 1, uid: "local-owner", buildSha: "a".repeat(40), profile: "route-fixture",
    operationCeilingMicros: 1, expiresAt: "2099-01-01T00:00:00Z", rateVersion: "synthetic-route-tariffs",
    configurationFingerprints: { course: generationFingerprint(configuration), lesson: generationFingerprint(configuration) },
    models: Object.fromEntries(profiles.map((profile) => [profile.model, rate])),
    moderation: { model: "omni-moderation-latest", maxInputBytes: 8192, requestCostMicros: 1 },
  });
  const key = "review-completed-budget-ceiling";
  let dispatches = 0;
  const transport = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    dispatches++;
    assert.match(String(input), /\/moderations$/);
    return Response.json({ id: "modr-route1", model: "omni-moderation-latest", results: [{ flagged: false }] });
  });
  try {
    const result = await POST(request(key));
    const body = await result.json();
    assert.equal(result.status, 409, JSON.stringify(body));
    assert.equal(body.operationId, generationOperationId("local-owner", key));
    assert.equal(body.evaluation.actualCostMicros, 1);
    assert.equal(body.evaluation.calls.length, 1);
    assert.equal(body.evaluation.calls[0].kind, "moderation");
    assert.equal(dispatches, 1);
    const operation = await getStoredDocument(`generationOperations/${body.operationId}`);
    assert.equal(operation?.uid, "local-owner");
    await runWithAccountGeneration(actor, async () => {
      await putStoredDocument(`courses/${body.operationId}`, { id: body.operationId, topic: "Historical course", authorId: "local-owner", language: "English", modules: [], sourcePack: [] });
      await putStoredDocument(`generationOperations/${body.operationId}`, { ...operation, status: "completed", resultId: body.operationId });
    });
    const changed = JSON.parse(process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL!);
    changed.rateVersion = "changed-approval";
    process.env.FILOSAGE_MODEL_EVALUATION_APPROVAL = JSON.stringify(changed);
    const replay = await POST(request(key));
    const replayBody = await replay.json();
    assert.equal(replay.status, 409, JSON.stringify(replayBody));
    assert.equal(replayBody.code, "EVALUATION_CONFIGURATION_CHANGED");
    assert.equal(replayBody.operationId, body.operationId);
    assert.equal(replayBody.evaluation, undefined);
    assert.equal(dispatches, 1);
  } finally { transport.mock.restore(); }
});
