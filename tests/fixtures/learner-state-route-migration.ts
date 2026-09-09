import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "../../src/lib/validation";
import { DEFAULT_DASHBOARD_PREFERENCES } from "../../src/lib/dashboard-preferences";
import { DEFAULT_REMINDER_PREFERENCES } from "../../src/lib/learning-reminders";

const uid = "migration-fixture-owner";
const key = "course:0-0";
const preferencesPath = `users/${uid}/learningData/preferences`;

type Document = Record<string, unknown>;
type Note = { content: string; updatedAt?: string };

export interface LearnerStateMigrationFixtureOptions {
  legacy: Note;
  legacyNotes?: Record<string, Note>;
  durable?: Note;
  durableNotes?: Record<string, Note>;
  concurrentDurable?: { content: string; updatedAt: string };
  failBeforeCommit?: boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function notePath(key: string) {
  return `users/${uid}/lessonNotes/${Buffer.from(key).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}

function preferenceNotes(options: LearnerStateMigrationFixtureOptions) {
  return options.legacyNotes ?? { [key]: options.legacy };
}

function preferencesWithLegacy(options: LearnerStateMigrationFixtureOptions): Document {
  const notes = preferenceNotes(options);
  return {
    courseBookmarks: [],
    lessonBookmarks: [],
    weeklyLessonGoal: 5,
    dashboardPreferences: clone(DEFAULT_DASHBOARD_PREFERENCES),
    reminderPreferences: clone(DEFAULT_REMINDER_PREFERENCES),
    updatedAt: "2026-09-08T00:00:00.000Z",
    notes: Object.fromEntries(Object.entries(notes).map(([key, note]) => [key, note.content])),
    noteUpdatedAt: Object.fromEntries(Object.entries(notes).flatMap(([key, note]) => note.updatedAt === undefined ? [] : [[key, note.updatedAt]])),
  };
}

function noteDocument(key: string, note: Note): Document {
  return { key, content: note.content, ...(note.updatedAt === undefined ? {} : { updatedAt: note.updatedAt }) };
}

// Executes the actual exported GET handler with only its auth and document-store
// boundaries replaced. The in-memory adapter mimics transaction lock expansion:
// it reruns a pure callback after adding any document it intends to write.
export function learnerStateRouteMigrationFixture(options: LearnerStateMigrationFixtureOptions) {
  let documents = new Map<string, Document>([[preferencesPath, preferencesWithLegacy(options)]]);
  const durableNotes = options.durableNotes ?? (options.durable ? { [key]: options.durable } : {});
  for (const [key, note] of Object.entries(durableNotes)) {
    documents.set(notePath(key), noteDocument(key, note));
  }
  let completedInitialReads = 0;
  let directMigrationWrites = 0;
  let transactionCalls = 0;
  let maximumTransactionWrites = 0;

  const completeInitialRead = () => {
    completedInitialReads += 1;
    if (completedInitialReads !== 2 || !options.concurrentDurable) return;
    documents.set(notePath(key), noteDocument(key, options.concurrentDurable));
  };
  const readDocument = (path: string) => clone(documents.get(path) ?? null);
  const bindings: Record<string, unknown> = {
    "@/lib/auth-server": {
      requireAccount: async () => ({ uid }),
      requireAcceptedAccount: async () => ({ uid }),
      authorizationResponse: () => null,
      withAccountRequest: (handler: unknown) => handler,
    },
    "@/lib/document-store": {
      getStoredDocument: async (path: string) => {
        completeInitialRead();
        return readDocument(path);
      },
      listAllStoredDocuments: async (prefix: string) => {
        const listed = [...documents.entries()]
          .filter(([path]) => path.startsWith(`${prefix}/`))
          .map(([, document]) => clone(document));
        completeInitialRead();
        return listed;
      },
      putStoredDocument: async () => {
        directMigrationWrites += 1;
        throw new Error("Fixture forbids direct GET migration writes.");
      },
      putStoredDocuments: async () => {
        directMigrationWrites += 1;
        throw new Error("Fixture forbids direct GET migration writes.");
      },
      deleteStoredDocuments: async () => {
        throw new Error("Fixture forbids direct GET migration deletes.");
      },
      runStoredDocumentTransaction: async (
        paths: string[],
        callback: (current: Record<string, Document | null>) => {
          writes: Array<{ path: string; data: Document }>;
          deletes?: string[];
          result: unknown;
        },
      ) => {
        transactionCalls += 1;
        let locked = [...new Set(paths)];
        for (let expansion = 0; expansion < 4; expansion += 1) {
          const current = Object.fromEntries(locked.map((path) => [path, readDocument(path)]));
          const next = callback(current);
          const writeCount = next.writes.length + (next.deletes ?? []).length;
          maximumTransactionWrites = Math.max(maximumTransactionWrites, writeCount);
          if (writeCount > 500) throw new Error("Fixture transaction exceeds the 500-write limit.");
          const expanded = [...new Set([...locked, ...next.writes.map((write) => write.path), ...(next.deletes ?? [])])];
          if (expanded.length !== locked.length) {
            locked = expanded;
            continue;
          }
          if (options.failBeforeCommit) throw new Error("Fixture injected transaction failure before commit.");
          const staged = new Map(documents);
          for (const write of next.writes) staged.set(write.path, clone(write.data));
          for (const path of next.deletes ?? []) staged.delete(path);
          documents = staged;
          return next.result;
        }
        throw new Error("Fixture transaction lock set did not stabilize.");
      },
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
    structuredClone,
  });
  return {
    run: async () => (exports.GET as (request: Request) => Promise<Response>)(new Request("https://fixture.invalid/api/learner-state")),
    durable: (noteKey = key) => readDocument(notePath(noteKey)),
    preferences: () => readDocument(preferencesPath),
    directMigrationWrites: () => directMigrationWrites,
    transactionCalls: () => transactionCalls,
    maximumTransactionWrites: () => maximumTransactionWrites,
  };
}
