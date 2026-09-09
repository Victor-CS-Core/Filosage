import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as zod from "zod";
import * as lessonInteractions from "../../src/lib/lesson-interactions";
import { publicationContentHash } from "../../src/lib/publication-content";

const uid = "hydration-fixture-learner";
const courseId = "hydration-course";
const lessonId = "0-0";
const progressOperationId = "progress-operation-123";
const interactionId = "interaction-recognition-morse";

const lesson = {
  learningObjective: "Classify 6 of 6 introduced Morse patterns correctly without consulting the chart.",
  content: [
    "| Character | Pattern |",
    "| --- | --- |",
    "| A | .- |",
    "| B | -... |",
    "| C | -.-. |",
    "| D | -.. |",
    "| E | . |",
    "| F | ..-. |",
  ].join("\n"),
  quizzes: [],
};

function documentId(operationId: string, itemId: string) {
  return `hydration-${operationId}-${itemId}`;
}

// Executes the actual exported GET handler with only the permitted auth,
// artifact, rate-limit, document-store, and receipt boundaries replaced.
export function lessonInteractionHydrationRouteFixture() {
  const documents = new Map<string, Record<string, unknown>>([
    [`users/${uid}/lessonInteraction/${documentId(progressOperationId, "item-morse-a")}`, {
      attempts: 2,
      firstAttemptCorrect: false,
      mastered: true,
    }],
  ]);
  const bindings: Record<string, unknown> = {
    "server-only": {},
    zod,
    "@/lib/auth-server": {
      requireAcceptedAccount: async () => ({ uid, isOwner: false }),
      withAccountRequest: (handler: unknown) => handler,
      authorizationResponse: () => null,
    },
    "@/lib/api-security": { apiRequestErrorResponse: () => null, readJsonBody: (request: Request) => request.json() },
    "@/lib/document-store": {
      getStoredDocument: async (path: string) => structuredClone(documents.get(path) ?? null),
      runStoredDocumentTransaction: async () => { throw new Error("Unexpected interaction mutation during GET hydration."); },
    },
    "@/lib/lesson-interactions": lessonInteractions,
    "@/lib/interaction-receipts": {
      interactionDocumentId: async (
        receivedCourseId: string,
        receivedLessonId: string,
        receivedProgressOperationId: string,
        receivedInteractionId: string,
        itemId: string,
        receivedArtifactHash: string,
      ) => {
        if (
          receivedCourseId !== courseId
          || receivedLessonId !== lessonId
          || receivedInteractionId !== interactionId
          || !receivedArtifactHash
        ) throw new Error("Unexpected hydration document identity.");
        return documentId(receivedProgressOperationId, itemId);
      },
      issueInteractionReceipt: async (claims: { itemId: string }) => `fixture-receipt-${claims.itemId}`,
    },
    "@/lib/request-rate-limit": { enforceDurableRateLimit: async () => null },
    "@/lib/course-pipeline/artifact-access": {
      getCourseRuntimeArtifact: async () => ({ id: courseId, courseId, isPublic: true }),
      getLessonRuntimeArtifact: async () => structuredClone(lesson),
      publishedReleaseUnavailableResponse: () => null,
    },
    "@/lib/publication-content": { publicationContentHash },
    "@/lib/course-pipeline/interaction-attempt": {},
  };
  const source = readFileSync("src/app/api/lesson-interaction/route.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => bindings[name] ?? {},
    Date,
    Error,
    Headers,
    Request,
    Response,
    TextEncoder,
    URL,
    structuredClone,
  });
  const request = (query: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) search.set(key, value);
    return new Request(`https://fixture.invalid/api/lesson-interaction?${search.toString()}`);
  };
  return {
    validRequest: () => request({ courseId, lessonId, progressOperationId, interactionId }),
    missingProgressOperationIdRequest: () => request({ courseId, lessonId, interactionId }),
    invalidProgressOperationIdRequest: () => request({ courseId, lessonId, progressOperationId: "invalid", interactionId }),
    run: (request: Request) => (exports.GET as (request: Request) => Promise<Response>)(request),
  };
}
