import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as crypto from "node:crypto";
import * as asyncHooks from "node:async_hooks";
import * as zod from "zod";
import * as responseParser from "openai/lib/ResponsesParser";
import * as evaluationErrors from "../../src/lib/evaluation-errors";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { zodTextFormat } from "openai/helpers/zod";
import * as validation from "../../src/lib/validation";
import * as research from "../../src/lib/source-research";
import * as bibliography from "../../src/lib/bibliographic-references";
import * as profiles from "../../src/lib/openai-generation";
import * as sourceSafety from "../../src/lib/source-safety";
import * as reviewPolicy from "../../src/lib/course-pipeline/review-policy";
import * as contentLanguage from "../../src/lib/content-language";
import * as instructionalContext from "../../src/lib/instructional-context";
import * as learningDesign from "../../src/lib/learning-design";
import * as modelFallback from "../../src/lib/model-fallback";
import type { AiUsageSample } from "../../src/lib/ai-pricing";

export interface CapturedResearchRequest {
  model: string;
  prompt_cache_key: string;
  input: string;
  text: { format: { name: string; schema: unknown } };
}

// Executes the real route with isolated provider/storage/auth boundaries. No
// network, account, credit ledger, or production document can be touched.
export function researchRouteFixture(
  provider: (request: CapturedResearchRequest) => Promise<unknown>,
  options: { failPersistence?: boolean; routeSource?: string; afterPersistence?: () => void } = {},
) {
  const operationId = createHash("sha256").update("fixture-owner:course_outline:research-fixture").digest("hex");
  const documents = new Map<string, Record<string, unknown>>();
  const finalizations: Array<{ failed?: boolean; usageSamples?: AiUsageSample[] }> = [];
  const captured: CapturedResearchRequest[] = [];
  const checkpointUsage: AiUsageSample[] = [];
  const bindings: Record<string, unknown> = {
    "server-only": {},
    "node:crypto": crypto, "node:async_hooks": asyncHooks, zod,
    "openai/lib/ResponsesParser": responseParser,
    "@/lib/evaluation-errors": evaluationErrors,
    "@/lib/account-lifecycle": { currentAccountGeneration: () => ({ uid: "fixture-owner", generation: "fixture-generation" }) },
    "next/server": { NextResponse: Response },
    "openai/helpers/zod": { zodTextFormat },
    "@/lib/local-ai": { aiClient: () => ({ moderations: { create: async () => ({ results: [{ flagged: false }] }) }, responses: { parse: async (request: CapturedResearchRequest) => { captured.push(request); return provider(request); } } }) },
    "@/lib/auth-server": { requireAcceptedAccount: async () => ({ uid: "fixture-owner", isOwner: true }), withAccountRequest: (handler: unknown) => handler, authorizationResponse: () => null },
    "@/lib/document-store": {
      getCourse: async () => null,
      getStoredDocument: async (path: string) => documents.get(path),
      runStoredDocumentTransaction: async (_paths: string[], callback: (data: Record<string, Record<string, unknown>>) => { writes: Array<{ path: string; data: Record<string, unknown> }>; result: unknown }) => {
        if (options.failPersistence) throw new Error("fixture storage outage");
        const result = callback(Object.fromEntries(documents));
        for (const write of result.writes) documents.set(write.path, structuredClone(write.data));
        options.afterPersistence?.();
        return result.result;
      },
    },
    "@/lib/ai-usage": {
      AiQuotaError: class extends Error {}, aiQuotaResponse: () => null,
      openAiSafetyIdentifier: async () => "fixture-safety-id",
      reserveAiUsage: async () => ({ requestId: operationId, uid: "fixture-owner" }),
      extractOpenAiUsage: (response: { usage: { input_tokens: number; output_tokens: number } }) => ({ inputTokens: response.usage.input_tokens, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: response.usage.output_tokens }),
      finalizeAiUsage: async (_reservation: unknown, result: { failed?: boolean; usageSamples?: AiUsageSample[] }) => { finalizations.push(structuredClone(result)); },
    },
    "@/lib/course-credits": {
      CourseCreditError: class extends Error {},
      courseCreditClaimId: async (_uid: string, value: string) => createHash("sha256").update(value).digest("hex"),
      releaseCourseCreditReservation: async () => undefined,
    },
    "@/lib/local-mode": { isLocalMode: () => true },
    "@/lib/runtime-environment": { serverEnvironment: {} },
    "@/lib/generation-operations": {
      GenerationOperationError: class extends Error {}, GenerationPauseError: class extends Error {},
      isGenerationControlError: () => false, GENERATION_REQUEST_MS: 150_000,
      beginGenerationOperation: async (_account: unknown, _key: unknown, payload: unknown) => ({
        operationId, startedAt: Date.now(), operation: { accountGeneration: "fixture-generation", status: "running", requestFingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex") },
      }),
      generationOperationId: () => operationId,
      configureGenerationOperation: async () => undefined,
      generationResponseObservedAt: () => new Date().toISOString(),
      runGenerationProviderCall: async (_lease: unknown, input: CapturedResearchRequest, providerCall: () => Promise<{ id: string; usage: { input_tokens: number; output_tokens: number } }>) => {
        const response = await providerCall();
        checkpointUsage.push({ model: input.model, inputTokens: response.usage.input_tokens, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: response.usage.output_tokens, responseId: response.id, promptCacheKey: input.prompt_cache_key });
        for (let index = 0; index < research.webSearchCallCount(response); index += 1) checkpointUsage.push({ model: "openai-web-search", inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, fixedCostMicros: 10_000 });
        return response;
      },
      runGenerationTransaction: async (_lease: unknown, paths: string[], callback: unknown) => {
        const store = bindings["@/lib/document-store"] as { runStoredDocumentTransaction: (paths: string[], callback: unknown) => Promise<unknown> };
        return store.runStoredDocumentTransaction(paths, callback);
      },
      finishGenerationOperation: async (_lease: unknown, result: { failed?: boolean }) => {
        finalizations.push({ failed: result.failed, usageSamples: structuredClone(checkpointUsage) });
      },
      pauseGenerationOperation: async () => undefined,
    },
    "@/lib/content-safety": { AI_SAFETY_POLICY: "Fixture safety policy", assertSafeContent: async () => undefined, ContentSafetyError: class extends Error {} },
    "@/lib/api-security": { readJsonBody: (request: Request) => request.json(), apiRequestErrorResponse: () => null },
    "@/lib/feature-flags": { coursePipelineFeatureFlags: () => ({ pipelineV2: false }) },
    "@/lib/validation": validation, "@/lib/source-research": research,
    "@/lib/bibliographic-references": bibliography, "@/lib/openai-generation": profiles,
    "@/lib/source-safety": sourceSafety, "@/lib/course-pipeline/review-policy": reviewPolicy,
    "@/lib/instructional-context": instructionalContext, "@/lib/content-language": contentLanguage,
    "@/lib/model-fallback": modelFallback, "@/lib/learning-design": learningDesign,
  };
  const evaluateModule = (source: string) => {
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: Record<string, unknown> = {};
    runInNewContext(compiled, { exports, require: (name: string) => bindings[name] ?? {}, process: { env: { NODE_ENV: "test" } }, Date, Error, AbortSignal, Request, Response, Headers, Buffer,
      fetch: () => { throw new Error("Research route fixture cannot make network requests."); },
      console: { warn() {}, error() {}, info() {} } });
    return exports;
  };
  // Keep the route's extracted configuration, ordinary-request evaluation guard,
  // and durable provider adapter real. Only their IO/account boundaries above
  // are fixtures; provider accounting still goes through runGenerationProviderCall.
  for (const name of ["evaluation-budget", "course-generation-configuration", "generation-provider-client"]) {
    bindings[`@/lib/${name}`] = evaluateModule(readFileSync(`src/lib/${name}.ts`, "utf8"));
  }
  const exports = evaluateModule(options.routeSource ?? readFileSync("src/app/api/generate-course/route.ts", "utf8")) as { POST: (request: Request) => Promise<Response> };
  return {
    documents, finalizations, captured, operationId,
    run: () => exports.POST!(new Request("https://fixture.invalid/api/generate-course", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: "Scientific reasoning", goal: "Practice comparing the evidence behind claims.", language: "English" }) })),
  };
}

export function emptyStageResponse(name: string) {
  return { id: `response-${name}`, output_parsed: name === "course_research" ? { sources: [] } : { references: [] }, usage: { input_tokens: 40, output_tokens: 20 }, output: [{ type: "web_search_call", id: `search-${name}`, status: "completed", action: { type: "search", sources: [] } }] };
}
