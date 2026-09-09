import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "../../src/lib/validation";
import { DEFAULT_DASHBOARD_PREFERENCES } from "../../src/lib/dashboard-preferences";
import { DEFAULT_REMINDER_PREFERENCES } from "../../src/lib/learning-reminders";

const uid = "update-conflict-fixture-owner";

type StoredNote = { path: string; data: Record<string, unknown> };

// Executes the actual exported PUT handler with only its auth and document-store
// boundaries replaced. The operation log makes validation-before-persistence observable.
export function learnerStateRouteUpdateConflictFixture() {
  const preferenceWrites: Array<{ path: string; data: Record<string, unknown> }> = [];
  const noteWrites: StoredNote[][] = [];
  const noteDeletes: string[][] = [];
  const bindings: Record<string, unknown> = {
    "@/lib/auth-server": {
      requireAccount: async () => ({ uid }),
      requireAcceptedAccount: async () => ({ uid }),
      authorizationResponse: () => null,
      withAccountRequest: (handler: unknown) => handler,
    },
    "@/lib/document-store": {
      getStoredDocument: async () => null,
      listAllStoredDocuments: async () => [],
      putStoredDocument: async (path: string, data: Record<string, unknown>) => { preferenceWrites.push({ path, data }); },
      putStoredDocuments: async (writes: StoredNote[]) => { noteWrites.push(writes); },
      deleteStoredDocuments: async (paths: string[]) => { noteDeletes.push(paths); },
      runStoredDocumentTransaction: async () => { throw new Error("Unexpected transaction during learner-state PUT fixture."); },
    },
    "@/lib/validation": validation,
    "@/lib/dashboard-preferences": { DEFAULT_DASHBOARD_PREFERENCES },
    "@/lib/learning-reminders": { DEFAULT_REMINDER_PREFERENCES },
    "@/lib/api-security": { apiRequestErrorResponse: () => null, readJsonBody: (request: Request) => request.json() },
  };
  const source = readFileSync("src/app/api/learner-state/route.ts", "utf8");
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
    btoa,
  });
  return {
    run: async (body: unknown) => (exports.PUT as (request: Request) => Promise<Response>)(new Request("https://fixture.invalid/api/learner-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })),
    operations: () => ({
      preferenceWrites: structuredClone(preferenceWrites),
      noteWrites: structuredClone(noteWrites),
      noteDeletes: structuredClone(noteDeletes),
    }),
  };
}
