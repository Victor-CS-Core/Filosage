import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { accountFenceReadPaths, assertAccountMutation } from "@/lib/account-write-fence";
import type { Course, LessonMode } from "@/lib/course-types";
import type { AiReservation } from "@/lib/ai-usage";
import type { CourseStage, RepairOperation, ValidationReport } from "@/lib/course-pipeline/contract";
import { expectedLessonIds as outlinedLessonIds } from "@/lib/course-progress";
import { assertPublicationProofToken, StalePublicationProofError, currentManualReviewResolution, publicationProofApprovalFingerprint, publicationProofIsCurrent, PUBLICATION_PROOF_POLICY_VERSION, type PublicationProof } from "@/lib/publication-proofs";
import { publicationDecisionFromReport } from "@/lib/course-pipeline/validation";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { assertPublicationResearchUnchanged } from "@/lib/publication-research";

import {
  fromDocumentFields,
  toDocumentFields,
  toDocumentValue,
  fromDocumentValue,
  type DocumentRecord,
  type DocumentValue,
} from "@/lib/document-values";
import { isLocalMode } from "@/lib/local-mode";
import { COURSE_SCOPED_COLLECTION_GROUPS, removeCourseReferences } from "@/lib/course-deletion";
import type { PublicationLessonReview, PublicationOwnerOverride } from "@/lib/publication-review";
import { publicationContentFingerprint, publicationCandidateContentFingerprint } from "@/lib/publication-content";
import {
  buildGuardedLessonEvidenceDowngrade,
  buildGuardedLessonSave,
  type LessonEvidenceDowngradeGuard,
  type LessonSavePipelineGuard,
} from "@/lib/course-pipeline/lesson-save";
import { inspectCoursePublishReadiness } from "@/lib/publication-readiness";
import { serverEnvironment } from "@/lib/runtime-environment";
import { currentAccountGeneration } from "@/lib/account-lifecycle";
import { assertLessonAttempt, lessonAccountingWrites, lessonCommitPaths, type LessonGenerationGuard } from "@/lib/course-pipeline/lesson-commit";
import { LessonSaveError, lessonPublicationState, lessonCourseFingerprint } from "@/lib/course-pipeline/lesson-save";

export interface StoredDocument extends Record<string, unknown> {
  id: string;
  authorId?: string;
  isPublic?: boolean;
  topic?: string;
}

export interface StoredDocumentPage {
  documents: StoredDocument[];
  /** Raw records returned for this page, excluding the look-ahead sentinel. */
  inspected: number;
  hasMore: boolean;
  /** Document ID used to resume the raw __name__ traversal. */
  nextAfterId: string | null;
}

interface DocumentBatchGetResult {
  found?: DocumentRecord;
  missing?: string;
  transaction?: string;
}

interface DocumentRecordList {
  documents?: DocumentRecord[];
  nextPageToken?: string;
}

interface DocumentAggregationResult {
  result?: {
    aggregateFields?: Record<string, DocumentValue>;
  };
}

interface LocatedStoredDocument {
  path: string;
  data: StoredDocument;
}

function encodeDocumentPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function rawDocumentStoreJson<T>(
  path: string,
  init: RequestInit = {},
  allowNotFound = false,
): Promise<T | null> {
  if (process.env.NODE_ENV !== "production" && isLocalMode()) {
    const { localDocumentStoreJson } = await import("@/lib/local-store");
    return localDocumentStoreJson<T>(path, init, allowNotFound);
  }
  if (serverEnvironment.DATABASE_URL?.trim()) {
    const { postgresDocumentStoreJson } = await import("@/lib/postgres-document-store");
    return postgresDocumentStoreJson<T>(path, init, allowNotFound);
  }
  throw new Error("Azure PostgreSQL is required outside local development.");
}

// Every mutation uses the same transaction boundary, including legacy PATCH,
// masked course updates and generated-ID creates. Adapter access stays private.
async function documentStoreJson<T>(path: string, init: RequestInit = {}, allowNotFound = false): Promise<T | null> {
  const method = (init.method ?? "GET").toUpperCase();
  if (path.startsWith("/documents/") && (method === "PATCH" || method === "POST")) {
    const [rawPath, query] = path.slice("/documents/".length).split("?");
    const search = new URLSearchParams(query);
    const decoded = rawPath.split("/").map(decodeURIComponent).join("/");
    const target = method === "POST" ? `${decoded}/${search.get("documentId") ?? randomUUID()}` : decoded;
    const body = JSON.parse(String(init.body ?? "{}"));
    const incoming = fromDocumentFields(body.fields ?? {});
    const masks = search.getAll("updateMask.fieldPaths");
    return runStoredDocumentTransaction([target], (documents) => {
      const before = documents[target];
      if (method === "POST" && before) throw new Error("Document already exists.");
      if (masks.length && !before) throw new Error("The document was removed before its update.");
      const data = masks.length ? { ...before, ...Object.fromEntries(masks.map((key) => [key, incoming[key]])) } : incoming;
      delete data.id;
      return { writes: [{ path: target, data }], result: { name: fullDocumentName(target), fields: toDocumentFields(data) } as T };
    });
  }
  return rawDocumentStoreJson<T>(path, init, allowNotFound);
}

function parseDocument(document: DocumentRecord): StoredDocument {
  const id = document.name.split("/").pop() ?? "";
  const fields = fromDocumentFields(document.fields ?? {});
  if (typeof fields.authorName === "string" && (fields.authorName.includes("@") || fields.authorName === "Teach")) {
    fields.authorName = "Filosage";
  }
  // The document path is the canonical identity. Stored field data must never
  // be able to replace it, because malformed records are surfaced by ID in
  // bounded owner diagnostics.
  return { ...fields, id };
}

function parseLocatedDocument(document: DocumentRecord): LocatedStoredDocument {
  const marker = "/documents/";
  const markerIndex = document.name.indexOf(marker);
  if (markerIndex < 0) throw new Error("The document store returned an invalid document path.");
  return {
    path: document.name.slice(markerIndex + marker.length),
    data: parseDocument(document),
  };
}

function fullDocumentName(path: string) {
  const projectId = isLocalMode() ? "local" : "azure";
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

async function runCourseQuery(structuredQuery: Record<string, unknown>) {
  const results = await documentStoreJson<Array<{ document?: DocumentRecord }>>(
    "/documents:runQuery",
    { method: "POST", body: JSON.stringify({ structuredQuery }) },
  );
  return (results ?? []).flatMap((result) =>
    result.document ? [parseDocument(result.document)] : [],
  );
}

async function runLocatedQuery(structuredQuery: Record<string, unknown>) {
  const results = await documentStoreJson<Array<{ document?: DocumentRecord }>>(
    "/documents:runQuery",
    { method: "POST", body: JSON.stringify({ structuredQuery }) },
  );
  return (results ?? []).flatMap((result) =>
    result.document ? [parseLocatedDocument(result.document)] : [],
  );
}

function collectionGroupFrom(collectionId: string) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId)) {
    throw new Error("Invalid document collection.");
  }
  return [{ collectionId, allDescendants: true }];
}

function courseQuery(
  filters: Array<{ field: string; value: unknown }>,
  options: { orderBy?: string; limit?: number } = {},
) {
  const fieldFilters = filters.map(({ field, value }) => ({
    fieldFilter: {
      field: { fieldPath: field },
      op: "EQUAL",
      value: toDocumentValue(value),
    },
  }));

  return {
    from: [{ collectionId: "courses" }],
    ...(fieldFilters.length === 1
      ? { where: fieldFilters[0] }
      : { where: { compositeFilter: { op: "AND", filters: fieldFilters } } }),
    ...(options.orderBy
      ? { orderBy: [{ field: { fieldPath: options.orderBy }, direction: "DESCENDING" }] }
      : {}),
    ...(options.limit ? { limit: options.limit } : {}),
  };
}

export async function listPublicCourses() {
  return runCourseQuery(courseQuery([{ field: "isPublic", value: true }], {
    orderBy: "updatedAt",
    limit: 24,
  }));
}

export function listOwnerCourses(authorId: string) {
  return runCourseQuery(courseQuery([{ field: "authorId", value: authorId }], {
    orderBy: "updatedAt",
  }));
}

export async function findOwnerCourse(authorId: string, topic: string) {
  const courses = await runCourseQuery(
    courseQuery([
      { field: "authorId", value: authorId },
      { field: "topic", value: topic },
    ], { limit: 1 }),
  );
  return courses[0] ?? null;
}

export async function getCourse(courseId: string) {
  const document = await documentStoreJson<DocumentRecord>(
    `/documents/${encodeDocumentPath(`courses/${courseId}`)}`,
    {},
    true,
  );
  return document ? parseDocument(document) : null;
}

export async function createCourse(data: Record<string, unknown>, courseId?: string) {
  const now = new Date();
  const document = courseId
    ? await documentStoreJson<DocumentRecord>(
        `/documents/${encodeDocumentPath(`courses/${courseId}`)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fields: toDocumentFields({ ...data, createdAt: now, updatedAt: now }),
          }),
        },
      )
    : await documentStoreJson<DocumentRecord>("/documents/courses", {
        method: "POST",
        body: JSON.stringify({
          fields: toDocumentFields({ ...data, createdAt: now, updatedAt: now }),
        }),
      });
  if (!document) throw new Error("The document store did not return the new course.");
  return parseDocument(document);
}

export async function updateCourseBanner(
  courseId: string,
  banner: { assetId: string; version: 1; generatedAt: string },
) {
  const updatedAt = new Date();
  const document = await documentStoreJson<DocumentRecord>(
    `/documents/${encodeDocumentPath(`courses/${courseId}`)}?updateMask.fieldPaths=banner&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: toDocumentFields({ banner, updatedAt }),
      }),
    },
  );
  if (!document) throw new Error("The document store did not return the updated course.");
  return parseDocument(document);
}

export async function listLessons(courseId: string) {
  const response = await documentStoreJson<{ documents?: DocumentRecord[] }>(
    `/documents/${encodeDocumentPath(`courses/${courseId}/lessons`)}?pageSize=300`,
  );
  return (response?.documents ?? []).map(parseDocument);
}

export async function getLesson(courseId: string, lessonId: string) {
  const document = await documentStoreJson<DocumentRecord>(
    `/documents/${encodeDocumentPath(`courses/${courseId}/lessons/${lessonId}`)}`,
    {},
    true,
  );
  return document ? parseDocument(document) : null;
}

function requireLessonGenerationGuard(guard: LessonSavePipelineGuard | undefined): LessonGenerationGuard {
  const value = guard as LessonGenerationGuard | undefined;
  const scope = currentAccountGeneration();
  if (!value?.reservation || !value.actor || !value.usage || !value.publicationState || !scope
      || scope.uid !== value.actor.uid || scope.generation !== value.reservation.accountGeneration) {
    throw new LessonSaveError("LESSON_SAVE_GUARD_REQUIRED", "A current account and lesson attempt guard are required. Reopen the draft before generating.", "reopen_course");
  }
  return value;
}
async function commitGeneratedLesson(courseId: string, lessonId: string, data: Record<string, unknown>, supplied: LessonSavePipelineGuard | undefined, downgrade = false) {
  const guard = requireLessonGenerationGuard(supplied);
  const coursePath = `courses/${courseId}`;
  const lessonPath = `${coursePath}/lessons/${lessonId}`;
  return runStoredDocumentTransaction([coursePath, lessonPath, ...lessonCommitPaths(guard)], (documents) => {
    const course = documents[coursePath];
    const now = new Date().toISOString();
    if (course && course.authorId !== guard.actor.uid && !guard.actor.isOwner) throw new LessonSaveError("LESSON_AUTHOR_CHANGED", "This course belongs to another account.", "reopen_course");
    if (course && courseUsesPipelineV2(course) && !coursePipelineFeatureFlags(guard.actor).pipelineV2) throw new LessonSaveError("COURSE_PIPELINE_V2_PAUSED", "Course Pipeline V2 is paused. This draft was preserved.", "reopen_course");
    if (course?.moderationStatus === "quarantined") throw new LessonSaveError("LESSON_COURSE_QUARANTINED", "This course is quarantined. Resolve its moderation hold before generating.", "reopen_course");
    assertLessonAttempt(documents, guard, now, courseId, lessonId);
    const target = lessonId.match(/^(\d+)-(\d+)$/);
    const modules = course?.modules as Array<{ lessons?: unknown[] }> | undefined;
    if (!target || !Array.isArray(modules) || !modules[Number(target[1])]?.lessons?.[Number(target[2])]) throw new LessonSaveError("LESSON_TARGET_CHANGED", "This lesson is not in the current course outline.", "reopen_course");
    const next = downgrade
      ? buildGuardedLessonEvidenceDowngrade(courseId, lessonId, course ?? undefined, documents[lessonPath] ?? undefined, data,
          { ...guard, actorId: guard.actor.uid, ownerOverride: guard.actor.isOwner }, now)
      : buildGuardedLessonSave(courseId, lessonId, course ?? undefined, documents[lessonPath] ?? undefined, data, guard, now);
    const finalCourse = next.writes.find((write) => write.path === coursePath)?.data ?? course!;
    const finalLesson = next.writes.find((write) => write.path === lessonPath)!.data;
    return { writes: [...next.writes, ...lessonAccountingWrites(courseId, lessonId, finalCourse, finalLesson, documents, guard, now)], result: next.result };
  });
}
export async function saveLesson(courseId: string, lessonId: string, data: Record<string, unknown>, pipelineGuard?: LessonSavePipelineGuard | LessonGenerationGuard) {
  return commitGeneratedLesson(courseId, lessonId, data, pipelineGuard);
}
export async function saveLessonWithEvidenceDowngrade(courseId: string, lessonId: string, data: Record<string, unknown>, guard: LessonEvidenceDowngradeGuard | (LessonGenerationGuard & { actorId: string; ownerOverride: boolean })) {
  return commitGeneratedLesson(courseId, lessonId, data, guard, true);
}

/** Reopen only the exact committed output; a later edit is not that result. */
export async function recoverCommittedLesson(courseId: string, lessonId: string, reservation: Pick<AiReservation, "uid" | "requestId" | "requestPath">) {
  const coursePath = `courses/${courseId}`;
  const lessonPath = `${coursePath}/lessons/${lessonId}`;
  const scope = currentAccountGeneration();
  return runStoredDocumentTransaction([coursePath, lessonPath, reservation.requestPath], (documents) => {
    const request = documents[reservation.requestPath];
    const course = documents[coursePath];
    const lesson = documents[lessonPath];
    const result = request?.lessonResult as Record<string, unknown> | undefined;
    if (!scope || scope.uid !== reservation.uid || request?.uid !== scope.uid || request?.accountGeneration !== scope.generation
      || reservation.requestPath !== `aiRequests/${reservation.requestId}` || request.status !== "completed"
      || !result || result.version !== 1 || result.courseId !== courseId || result.lessonId !== lessonId || !lesson || !course) {
      throw new LessonSaveError("IDEMPOTENCY_RESULT_MISSING", "The original lesson result could not be confirmed. Reconcile the saved request before generating again.", "reconcile_generation");
    }
    if (result.fingerprint !== publicationContentFingerprint(lesson) || result.publicationState !== lessonPublicationState(course) || result.courseFingerprint !== lessonCourseFingerprint(course, lessonId)) {
      throw new LessonSaveError("IDEMPOTENCY_RESULT_SUPERSEDED", "The lesson or its publication state changed after this request. Reopen the current lesson; the newer work was preserved.", "reopen_lesson");
    }
    return { writes: [], result: lesson };
  });
}

async function commitWrites(writes: Array<Record<string, unknown>>) {
  for (let index = 0; index < writes.length; index += 400) {
    const chunk = writes.slice(index, index + 400);
    const pathOf = (write: Record<string, unknown>) => String(write.delete ?? (write.update as { name: string }).name).split("/documents/")[1];
    await runStoredDocumentTransaction(chunk.map(pathOf), (documents) => ({
      writes: chunk.flatMap((write) => {
        if (!write.update) return [];
        const path = pathOf(write);
        const update = write.update as { fields: Record<string, DocumentValue> };
        const incoming = fromDocumentFields(update.fields ?? {});
        const masks = (write.updateMask as { fieldPaths?: string[] } | undefined)?.fieldPaths;
        if (masks?.length && !documents[path]) throw new Error("The document was removed before its update.");
        return [{ path, data: masks?.length ? { ...documents[path], ...Object.fromEntries(masks.map((key) => [key, incoming[key]])) } : incoming }];
      }),
      deletes: chunk.filter((write) => write.delete).map(pathOf), result: undefined,
    }));
  }
}

export async function getStoredDocument(path: string) {
  const document = await documentStoreJson<DocumentRecord>(
    `/documents/${encodeDocumentPath(path)}`,
    {},
    true,
  );
  return document ? parseDocument(document) : null;
}

export async function checkDocumentStoreReadiness() {
  if (process.env.NODE_ENV !== "production" && isLocalMode()) {
    await getStoredDocument("system/health");
    return;
  }
  if (serverEnvironment.DATABASE_URL?.trim()) {
    const { checkPostgresDocumentStoreReadiness } = await import("@/lib/postgres-document-store");
    await checkPostgresDocumentStoreReadiness();
    return;
  }
  throw new Error("Azure PostgreSQL is required outside local development.");
}

export async function putStoredDocument(path: string, data: Record<string, unknown>) {
  const storedData = { ...data };
  delete storedData.id;
  const document = await documentStoreJson<DocumentRecord>(
    `/documents/${encodeDocumentPath(path)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: toDocumentFields(storedData) }),
    },
  );
  if (!document) throw new Error("The document store did not return the saved document.");
  return parseDocument(document);
}

export async function putStoredDocuments(
  documents: Array<{ path: string; data: Record<string, unknown> }>,
) {
  if (!documents.length) return;
  await commitWrites(documents.map(({ path, data }) => {
    const storedData = { ...data };
    delete storedData.id;
    return {
      update: {
        name: fullDocumentName(path),
        fields: toDocumentFields(storedData),
      },
    };
  }));
}

export async function listStoredDocuments(path: string, pageSize = 100) {
  const response = await documentStoreJson<DocumentRecordList>(
    `/documents/${encodeDocumentPath(path)}?pageSize=${Math.min(Math.max(pageSize, 1), 300)}`,
  );
  return (response?.documents ?? []).map(parseDocument);
}

export async function listAllStoredDocuments(path: string, maximum = 500) {
  const documents: StoredDocument[] = [];
  let pageToken = "";
  const limit = Math.min(Math.max(maximum, 1), 10_000);

  do {
    const remaining = limit - documents.length;
    const query = new URLSearchParams({
      pageSize: String(Math.min(remaining, 300)),
      ...(pageToken ? { pageToken } : {}),
    });
    const response = await documentStoreJson<DocumentRecordList>(
      `/documents/${encodeDocumentPath(path)}?${query}`,
    );
    documents.push(...(response?.documents ?? []).map(parseDocument));
    pageToken = response?.nextPageToken ?? "";
  } while (pageToken && documents.length < limit);

  return documents;
}

export function listStoredDocumentsByField(
  collectionId: string,
  field: string,
  value: unknown,
  limit = 300,
) {
  return runCourseQuery({
    from: [{ collectionId }],
    where: {
      fieldFilter: {
        field: { fieldPath: field },
        op: "EQUAL",
        value: toDocumentValue(value),
      },
    },
    limit: Math.min(Math.max(limit, 1), 10_000),
  });
}

export function listCollectionGroupDocumentsByField(
  collectionId: string,
  field: string,
  value: unknown,
  limit = 300,
) {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(field)) {
    throw new Error("Invalid document collection-group field query.");
  }
  return runCourseQuery({
    from: collectionGroupFrom(collectionId),
    where: {
      fieldFilter: {
        field: { fieldPath: field },
        op: "EQUAL",
        value: toDocumentValue(value),
      },
    },
    limit: Math.min(Math.max(limit, 1), 10_000),
  });
}

export function listCollectionDocuments(collectionId: string, limit = 1_000) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId)) {
    throw new Error("Invalid document collection.");
  }
  return runCourseQuery({
    from: [{ collectionId }],
    limit: Math.min(Math.max(limit, 1), 10_000),
  });
}

/**
 * Reads one bounded, deterministic page from a top-level collection. The
 * document-name cursor includes records whose domain sort fields are missing or
 * malformed, allowing the caller to validate and warn about each raw record.
 */
export async function listCollectionDocumentsPage(
  collectionId: string,
  options: { limit: number; afterId?: string },
): Promise<StoredDocumentPage> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId)) {
    throw new Error("Invalid document collection.");
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500) {
    throw new Error("Document page limits must be integers from 1 to 500.");
  }
  if (options.afterId !== undefined && !/^[A-Za-z0-9_-]{1,1500}$/.test(options.afterId)) {
    throw new Error("Invalid document page cursor.");
  }

  const results = await runCourseQuery({
    from: [{ collectionId }],
    orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
    ...(options.afterId
      ? {
          startAt: {
            values: [{ referenceValue: fullDocumentName(`${collectionId}/${options.afterId}`) }],
            before: false,
          },
        }
      : {}),
    limit: options.limit + 1,
  });
  const hasMore = results.length > options.limit;
  const documents = results.slice(0, options.limit);
  return {
    documents,
    inspected: documents.length,
    hasMore,
    nextAfterId: hasMore ? documents.at(-1)?.id ?? null : null,
  };
}

export function listCollectionDocumentsByRange(
  collectionId: string,
  field: string,
  from: string,
  to: string,
  limit = 1_000,
) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId) || !/^[A-Za-z0-9_.-]{1,120}$/.test(field)) {
    throw new Error("Invalid document range query.");
  }
  return runCourseQuery({
    from: [{ collectionId }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: field },
              op: "GREATER_THAN_OR_EQUAL",
              value: toDocumentValue(from),
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: field },
              op: "LESS_THAN_OR_EQUAL",
              value: toDocumentValue(to),
            },
          },
        ],
      },
    },
    orderBy: [{ field: { fieldPath: field }, direction: "DESCENDING" }],
    limit: Math.min(Math.max(limit, 1), 10_000),
  });
}

export async function countCollectionDocuments(
  collectionId: string,
  filters: Array<{ field: string; value: unknown }> = [],
) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId)) {
    throw new Error("Invalid document collection.");
  }
  const fieldFilters = filters.map(({ field, value }) => ({
    fieldFilter: {
      field: { fieldPath: field },
      op: "EQUAL",
      value: toDocumentValue(value),
    },
  }));
  const structuredQuery: Record<string, unknown> = { from: [{ collectionId }] };
  if (fieldFilters.length === 1) structuredQuery.where = fieldFilters[0];
  if (fieldFilters.length > 1) {
    structuredQuery.where = { compositeFilter: { op: "AND", filters: fieldFilters } };
  }
  const response = await documentStoreJson<DocumentAggregationResult[]>(
    "/documents:runAggregationQuery",
    {
      method: "POST",
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery,
          aggregations: [{ alias: "total", count: {} }],
        },
      }),
    },
  );
  const value = response?.[0]?.result?.aggregateFields?.total;
  return Number(fromDocumentValue(value ?? { integerValue: "0" })) || 0;
}

export async function deleteStoredDocuments(paths: string[]) {
  if (!paths.length) return;
  await commitWrites(paths.map((path) => ({ delete: fullDocumentName(path) })));
}

export async function createStoredDocument(
  collectionPath: string,
  data: Record<string, unknown>,
  documentId?: string,
) {
  const storedData = { ...data };
  delete storedData.id;
  const query = documentId ? `?documentId=${encodeURIComponent(documentId)}` : "";
  const document = await documentStoreJson<DocumentRecord>(
    `/documents/${encodeDocumentPath(collectionPath)}${query}`,
    {
      method: "POST",
      body: JSON.stringify({ fields: toDocumentFields(storedData) }),
    },
  );
  if (!document) throw new Error("The document store did not return the created document.");
  return parseDocument(document);
}

export async function runStoredDocumentTransaction<T>(
  paths: string[],
  update: (documents: Record<string, StoredDocument | null>) => {
    writes: Array<{ path: string; data: Record<string, unknown> }>; deletes?: string[]; result: T;
  },
): Promise<T> {
  let readPaths = accountFenceReadPaths(paths, {}, { writes: [] });
  if (!readPaths.length) readPaths = ["system/transaction"];
  let conflicts = 0;
  // The callback is pure: discovering additional ownership reads rolls back and
  // reruns it with the complete lock set. All locks are acquired in sorted order
  // by PostgreSQL, including absent lifecycle keys via advisory locks.
  for (let expansion = 0; expansion < 16; expansion += 1) {
    let transaction: string | undefined;
    try {
      const batch = await rawDocumentStoreJson<DocumentBatchGetResult[]>("/documents:batchGet", {
        method: "POST", body: JSON.stringify({ documents: readPaths.map(fullDocumentName), newTransaction: { readWrite: {} } }),
      });
      transaction = batch?.find((entry) => entry.transaction)?.transaction;
      if (!transaction) throw new Error("The document store did not start a transaction.");
      const documents: Record<string, StoredDocument | null> = Object.fromEntries(readPaths.map((path) => [path, null]));
      for (const entry of batch ?? []) if (entry.found) {
        const located = parseLocatedDocument(entry.found);
        if (located.path in documents) documents[located.path] = located.data;
      }
      const next = update(documents);
      const needed = accountFenceReadPaths(readPaths, documents, next);
      if (needed.some((path) => !readPaths.includes(path))) {
        await rawDocumentStoreJson("/documents:rollback", { method: "POST", body: JSON.stringify({ transaction }) });
        transaction = undefined;
        readPaths = needed;
        continue;
      }
      assertAccountMutation(documents, next);
      await rawDocumentStoreJson("/documents:commit", {
        method: "POST", body: JSON.stringify({ transaction, writes: [
          ...next.writes.map(({ path, data }) => {
            const storedData = { ...data }; delete storedData.id;
            return { update: { name: fullDocumentName(path), fields: toDocumentFields(storedData) } };
          }),
          ...(next.deletes ?? []).map((path) => ({ delete: fullDocumentName(path) })),
        ] }),
      });
      return next.result;
    } catch (error) {
      if (transaction) await rawDocumentStoreJson("/documents:rollback", { method: "POST", body: JSON.stringify({ transaction }) }).catch(() => undefined);
      if (!(error instanceof Error) || !/Document store request failed \((409|412|429|503)\)/.test(error.message) || ++conflicts >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** conflicts));
    }
  }
  throw new Error("The mutation ownership inventory could not be resolved.");
}

// Bounded full-store inventory detects unknown subcollections and dependencies.
// Returning complete=false must produce a manual/pending deletion, never success.
export async function scanStoredDocuments(maximum = 50_000): Promise<{ documents: LocatedStoredDocument[]; complete: boolean }> {
  const result = await rawDocumentStoreJson<{ documents: DocumentRecord[]; complete: boolean }>("/documents:scan", {
    method: "POST", body: JSON.stringify({ maximum }),
  });
  if (!result) throw new Error("Account inventory is unavailable.");
  return { documents: result.documents.map(parseLocatedDocument), complete: result.complete };
}

export async function updateCourseVisibility(courseId: string, isPublic: boolean) {
  const lessons = await listLessons(courseId);
  const coursePath = `courses/${courseId}`;
  const lessonPaths = lessons.map((lesson) => `courses/${courseId}/lessons/${lesson.id}`);
  const updatedAt = new Date().toISOString();
  await runStoredDocumentTransaction([coursePath, ...lessonPaths], (documents) => {
    const course = documents[coursePath];
    if (!course) throw new Error("Course not found while updating its visibility.");
    const resetsPublishedStage = !isPublic && course.pipelineStage === "published";
    return {
      writes: [
        {
          path: coursePath,
          data: {
            ...course,
            isPublic,
            lessonWriteEpoch: randomUUID(),
            ...(resetsPublishedStage ? {
              pipelineStage: "draft",
              pipelineStageUpdatedAt: updatedAt,
              lastValidationDecision: null,
              lastValidationSnapshotHash: null,
            } : {}),
            updatedAt,
          },
        },
        ...lessonPaths.map((path) => {
          const lesson = documents[path];
          if (!lesson) throw new Error("A course lesson disappeared while updating visibility.");
          return { path, data: { ...lesson, isPublic } };
        }),
      ],
      result: undefined,
    };
  });
}

export async function updateCoursePipelineStage(
  courseId: string,
  nextStage: CourseStage,
  validation?: { decision: string; snapshotHash: string },
) {
  const { assertCourseStageTransition } = await import("@/lib/course-pipeline/state");
  const path = `courses/${courseId}`;
  return runStoredDocumentTransaction([path], (documents) => {
    const course = documents[path];
    if (!course) throw new Error("Course not found while updating its pipeline stage.");
    const current = typeof course.pipelineStage === "string"
      ? course.pipelineStage as CourseStage
      : "draft";
    if (current === nextStage) return { writes: [], result: current };
    assertCourseStageTransition(current, nextStage);
    return {
      writes: [{
        path,
        data: {
          ...course,
          pipelineStage: nextStage,
          pipelineStageUpdatedAt: new Date().toISOString(),
          lastValidationDecision: validation?.decision ?? course.lastValidationDecision ?? null,
          lastValidationSnapshotHash: validation?.snapshotHash ?? course.lastValidationSnapshotHash ?? null,
          updatedAt: course.updatedAt,
        },
      }],
      result: nextStage,
    };
  });
}

export async function commitCourseValidationStage(
  courseId: string,
  expectedLessonIds: string[],
  expectedFingerprints: { course: string; lessons: Record<string, string> },
  nextStage: "needs_repair" | "ready_to_publish" | "manual_review",
  validation: { decision: string; snapshotHash: string; publicationProof?: PublicationProof },
) {
  const { assertCourseStageTransition } = await import("@/lib/course-pipeline/state");
  const coursePath = `courses/${courseId}`;
  const lessonPaths = expectedLessonIds.map((lessonId) => `${coursePath}/lessons/${lessonId}`);
  const researchPath = validation.publicationProof?.research?.artifactPath;
  return runStoredDocumentTransaction([coursePath, ...lessonPaths, ...(researchPath ? [researchPath] : [])], (documents) => {
    const course = documents[coursePath];
    if (!course) throw new Error("Course not found while committing validation.");
    if (publicationContentFingerprint(course) !== expectedFingerprints.course) {
      throw new Error("STALE_VALIDATION_SNAPSHOT: course changed during validation.");
    }
    for (const lessonId of expectedLessonIds) {
      const lesson = documents[`${coursePath}/lessons/${lessonId}`];
      if (publicationContentFingerprint(lesson) !== expectedFingerprints.lessons[lessonId]) {
        throw new Error(`STALE_VALIDATION_SNAPSHOT: lesson ${lessonId} changed during validation.`);
      }
    }
    if (validation.publicationProof && !publicationProofIsCurrent(course,
      lessonPaths.map((path) => documents[path] ?? {}), expectedLessonIds, validation.snapshotHash, validation.publicationProof)) {
      throw new Error("STALE_VALIDATION_SNAPSHOT: publication proof evidence changed during validation.");
    }
    if (validation.publicationProof) assertPublicationResearchUnchanged(course,
      researchPath ? documents[researchPath] : null, validation.publicationProof.research);
    const current = typeof course.pipelineStage === "string"
      ? course.pipelineStage as CourseStage
      : "draft";
    const manualResolution = currentManualReviewResolution({
      ...course, publicationProof: validation.publicationProof ?? course.publicationProof,
    }, validation.snapshotHash);
    if (nextStage === "manual_review"
      && manualResolution?.status === "approved"
      && manualResolution.snapshotHash === validation.snapshotHash) {
      if (current === "ready_to_publish" && !validation.publicationProof) return { writes: [], result: current };
      if (current !== "validating") assertCourseStageTransition(current, "validating");
      assertCourseStageTransition("validating", "ready_to_publish");
      const now = new Date().toISOString();
      return {
        writes: [{
          path: coursePath,
          data: {
            ...course,
            pipelineStage: "ready_to_publish",
            pipelineStageUpdatedAt: now,
            lastValidationDecision: "manual_review_approved",
            lastValidationSnapshotHash: validation.snapshotHash,
            ...(validation.publicationProof ? { publicationProof: validation.publicationProof } : {}),
            updatedAt: course.updatedAt,
          },
        }],
        result: "ready_to_publish" as const,
      };
    }
    if (current !== "validating") assertCourseStageTransition(current, "validating");
    assertCourseStageTransition("validating", nextStage);
    const now = new Date().toISOString();
    return {
      writes: [{
        path: coursePath,
        data: {
          ...course,
          pipelineStage: nextStage,
          pipelineStageUpdatedAt: now,
          lastValidationDecision: validation.decision,
          lastValidationSnapshotHash: validation.snapshotHash,
          ...(validation.publicationProof ? { publicationProof: validation.publicationProof } : {}),
          updatedAt: course.updatedAt,
        },
      }],
      result: nextStage,
    };
  });
}

export async function publishCourseWithReview(
  courseId: string,
  expectedLessonIds: string[],
  review: {
    status: "approved" | "owner_override";
    reviewedAt: string;
    outlineHash: string;
    moderationModel: string;
    reviewVersion: string;
    factualReviewStatus: "unverified";
    safetyReviewBasis: string;
    sourceUpdatedAt?: string;
    sourceFingerprint: string;
    reviews: PublicationLessonReview[];
    ownerOverride?: PublicationOwnerOverride;
    artifactSnapshotHash?: string;
    publicationProof?: PublicationProof;
    qualityContractVersion?: string;
    validationReport?: ValidationReport;
    publicationMutationKey?: string;
    manualReviewResolutionId?: string;
    publishPipelineStage?: boolean;
  },
) {
  const coursePath = `courses/${courseId}`;
  const lessonPaths = expectedLessonIds.map((lessonId) => `courses/${courseId}/lessons/${lessonId}`);
  const auditPath = review.ownerOverride
    ? `adminEvents/${review.ownerOverride.auditEventId}`
    : undefined;
  const immutableReleaseEnabled = true;
  const releaseProofHash = createHash("sha256").update(JSON.stringify({
    proof: review.publicationProof ? publicationProofApprovalFingerprint(review.publicationProof) : null,
    manualReviewResolutionId: review.manualReviewResolutionId ?? null,
  })).digest("hex");
  const releaseId = `${courseId}__${review.artifactSnapshotHash ?? review.outlineHash}__${releaseProofHash}`;
  const releasePath = `courseReleases/${releaseId}`;
  const releaseLessonPaths = expectedLessonIds.map((lessonId) => `courseReleases/${releaseId}/lessons/${lessonId}`);
  const reviewByLessonId = new Map(review.reviews.map((item) => [item.lessonId, item]));
  const researchPath = review.publicationProof?.research?.artifactPath;
  await runStoredDocumentTransaction([
    coursePath,
    ...lessonPaths,
    ...(researchPath ? [researchPath] : []),
    ...(immutableReleaseEnabled ? [releasePath, ...releaseLessonPaths] : []),
    ...(auditPath ? [auditPath] : []),
  ], (documents) => {
    const course = documents[coursePath];
    if (!course) throw new Error("Course not found.");
    const previousMutation = course.publicationMutation as { key?: string; snapshotHash?: string } | undefined;
    if (review.publicationMutationKey && previousMutation?.key === review.publicationMutationKey) {
      if (previousMutation.snapshotHash !== review.artifactSnapshotHash) {
        throw new Error("This publication retry key belongs to a different course snapshot.");
      }
      if (course.isPublic === true) return { writes: [], result: undefined };
      throw new Error("IDEMPOTENCY_RESULT_SUPERSEDED: this publication was followed by an explicit unpublish action.");
    }
    if (course.moderationStatus === "quarantined") throw new Error("A quarantined course cannot be published.");
    const reviewer = review.reviews[0];
    if (courseUsesPipelineV2(course) && (!review.publishPipelineStage || !reviewer
      || !coursePipelineFeatureFlags({ uid: reviewer.reviewedBy, isOwner: reviewer.reviewerRole === "owner" }).publicationV2)) {
      throw new Error("V2 publication is paused; this draft cannot use the legacy publication path.");
    }
    if (JSON.stringify(outlinedLessonIds(course as unknown as Course)) !== JSON.stringify(expectedLessonIds)) {
      throw new Error("Publication proof does not cover every outlined lesson.");
    }
    const orderedLessons = lessonPaths.map((path) => documents[path] ?? {});
    const snapshotHash = createHash("sha256").update(publicationCandidateContentFingerprint(course, orderedLessons)).digest("hex");
    const proof = course.publicationProof as PublicationProof | undefined;
    assertPublicationResearchUnchanged(course, researchPath ? documents[researchPath] : null, proof?.research);
    if (!publicationProofIsCurrent(course, orderedLessons, expectedLessonIds, snapshotHash, proof)
      || JSON.stringify(proof) !== JSON.stringify(review.publicationProof)
      || review.artifactSnapshotHash !== snapshotHash) {
      throw new Error("The publication proof is missing, stale, or changed during review. Validate the current draft.");
    }
    const decision = publicationDecisionFromReport(proof.validationReport);
    if (decision.decision !== "publishable" && decision.decision !== "manual_review") {
      throw new Error("The publication proof contains a non-overridable blocker.");
    }
    if (decision.decision === "manual_review") {
      const resolution = currentManualReviewResolution(course, snapshotHash);
      if (!resolution || resolution.reviewId !== review.manualReviewResolutionId) {
        throw new Error("The exact publication manual review is missing or changed before commit.");
      }
    }
    if (review.sourceUpdatedAt && course.updatedAt !== review.sourceUpdatedAt) {
      throw new Error("The course changed during publication review. Try publishing again.");
    }
    if (publicationContentFingerprint(course) !== review.sourceFingerprint) {
      throw new Error("The course content changed during publication review. Try publishing again.");
    }
    const now = new Date().toISOString();
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
    if (immutableReleaseEnabled) {
      const storedRelease = documents[releasePath];
      if (storedRelease && (storedRelease.snapshotHash !== review.artifactSnapshotHash
        || storedRelease.courseFingerprint !== review.sourceFingerprint)) {
        throw new Error("The immutable release record conflicts with this validated snapshot.");
      }
      if (!storedRelease) {
        writes.push({
          path: releasePath,
          data: {
            releaseId,
            courseId,
            snapshotHash: review.artifactSnapshotHash ?? null,
            qualityContractVersion: review.qualityContractVersion ?? null,
            courseFingerprint: review.sourceFingerprint,
            publicationProof: proof,
            publicationDecision: decision,
            manualReviewResolution: course.manualReviewResolution ?? null,
            course,
            publishedBy: review.reviews[0]?.reviewedBy ?? null,
            publishedAt: now,
          },
        });
      }
    }
    for (const lessonId of expectedLessonIds) {
      const path = `courses/${courseId}/lessons/${lessonId}`;
      const lesson = documents[path];
      const lessonReview = reviewByLessonId.get(lessonId);
      if (!lesson || !lessonReview) throw new Error("A lesson is missing from publication review.");
      if (lessonReview.sourceUpdatedAt && lesson.updatedAt !== lessonReview.sourceUpdatedAt) {
        throw new Error("A lesson changed during publication review. Try publishing again.");
      }
      if (publicationContentFingerprint(lesson) !== lessonReview.sourceFingerprint) {
        throw new Error("Lesson content changed during publication review. Try publishing again.");
      }
      if (immutableReleaseEnabled) {
        const releaseLessonPath = `courseReleases/${releaseId}/lessons/${lessonId}`;
        const storedReleaseLesson = documents[releaseLessonPath];
        if (storedReleaseLesson && storedReleaseLesson.sourceFingerprint !== lessonReview.sourceFingerprint) {
          throw new Error("An immutable released lesson conflicts with this validated snapshot.");
        }
        if (!storedReleaseLesson) {
          writes.push({
            path: releaseLessonPath,
            data: {
              releaseId,
              courseId,
              lessonId,
              sourceFingerprint: lessonReview.sourceFingerprint,
              lesson,
              publishedAt: now,
            },
          });
        }
      }
      const storedLessonReview = Object.fromEntries(
        Object.entries(lessonReview).filter(([key]) => key !== "sourceFingerprint"),
      );
      writes.push({
        path,
        data: {
          ...lesson,
          isPublic: true,
          publicationReview: storedLessonReview,
          factualReviewStatus: review.factualReviewStatus,
          updatedAt: lesson.updatedAt ?? now,
        },
      });
    }
    writes.push({
      path: coursePath,
      data: {
        ...course,
        isPublic: true,
        moderationStatus: "approved",
        quarantineReason: null,
        quarantinedAt: null,
        publicationReview: {
          status: review.status,
          reviewedAt: review.reviewedAt,
          outlineHash: review.outlineHash,
          moderationModel: review.moderationModel,
          reviewVersion: review.reviewVersion,
          factualReviewStatus: review.factualReviewStatus,
          safetyReviewBasis: review.safetyReviewBasis,
          lessonCount: review.reviews.length,
          ownerOverrideEventId: review.ownerOverride?.auditEventId ?? null,
          artifactSnapshotHash: review.artifactSnapshotHash ?? null,
          qualityContractVersion: review.qualityContractVersion ?? null,
          manualReviewResolutionId: review.manualReviewResolutionId ?? null,
          validationReport: proof.validationReport,
          publicationProof: proof,
          publicationDecision: decision,
          ...(immutableReleaseEnabled ? { releaseId } : {}),
        },
        lessonWriteEpoch: randomUUID(),
        publicationMutation: review.publicationMutationKey ? {
          key: review.publicationMutationKey,
          target: "published",
          snapshotHash: review.artifactSnapshotHash ?? null,
          completedAt: now,
        } : null,
        factualReviewStatus: review.factualReviewStatus,
        publishedAt: now,
        ...(immutableReleaseEnabled ? { publishedReleaseId: releaseId } : {}),
        ...(review.publishPipelineStage ? {
          pipelineStage: "published",
          pipelineStageUpdatedAt: now,
        } : {}),
        updatedAt: now,
      },
    });
    if (auditPath && review.ownerOverride) {
      writes.push({
        path: auditPath,
        data: {
          actorUid: review.ownerOverride.actorUid,
          courseId,
          action: "course_quality_override_published",
          reason: review.ownerOverride.reason,
          assessmentHash: review.ownerOverride.assessmentHash,
          assessmentVersion: review.ownerOverride.assessmentVersion,
          issueCodes: review.ownerOverride.issueCodes,
          courseQualityGateVersion: review.ownerOverride.courseQualityGateVersion,
          lessonQualityGateVersion: review.ownerOverride.lessonQualityGateVersion,
          outlineHash: review.outlineHash,
          lessonContentHashes: Object.fromEntries(review.reviews.map((item) => [item.lessonId, item.contentHash])),
          createdAt: review.reviewedAt,
        },
      });
    }
    return { writes, result: undefined };
  });
}

export async function saveCourseManualReviewResolution(
  courseId: string,
  expectedLessonIds: string[],
  expected: {
    courseFingerprint: string;
    proofToken: string;
    lessonFingerprints: Record<string, string>;
    manualReviewResolutionId?: string;
  },
  resolution: {
    status: "approved" | "rejected";
    snapshotHash: string;
    contractVersion: string;
    reason: string;
    reviewedAt: string;
    reviewId: string;
    reviewerUid: string;
    idempotencyKey: string;
    verifiedSourceIds: string[];
    mutationId: string;
  },
) {
  const { assertCourseStageTransition } = await import("@/lib/course-pipeline/state");
  const coursePath = `courses/${courseId}`;
  const lessonPaths = expectedLessonIds.map((lessonId) => `courses/${courseId}/lessons/${lessonId}`);
  const auditPath = `adminEvents/${resolution.reviewId}`;
  const mutationPath = `courseManualReviewMutations/${resolution.mutationId}`;
  return runStoredDocumentTransaction([coursePath, ...lessonPaths, auditPath, mutationPath], (documents) => {
    const course = documents[coursePath];
    if (!course) throw new Error("Course not found.");
    const proof = course.publicationProof as PublicationProof | undefined;
    if (!publicationProofIsCurrent(course, lessonPaths.map((path) => documents[path] ?? {}),
      expectedLessonIds, resolution.snapshotHash, proof)) {
      throw new StalePublicationProofError();
    }
    assertPublicationProofToken(proof, expected.proofToken);
    const reviewedResolution = { ...resolution, proofToken: expected.proofToken, proofPolicyVersion: PUBLICATION_PROOF_POLICY_VERSION,
      proofFingerprint: publicationProofApprovalFingerprint(proof) };
    if (course.isPublic === true) throw new Error("Unpublish this course before changing its manual-review resolution.");
    const mutation = documents[mutationPath] as { resolution?: typeof resolution & { proofToken: string } } | undefined;
    if (mutation?.resolution) {
      const stored = mutation.resolution;
      if (stored.proofToken !== expected.proofToken) throw new StalePublicationProofError();
      if (stored.snapshotHash !== resolution.snapshotHash
        || stored.status !== resolution.status
        || stored.contractVersion !== resolution.contractVersion
        || stored.reason !== resolution.reason
        || JSON.stringify(stored.verifiedSourceIds ?? []) !== JSON.stringify(resolution.verifiedSourceIds)) {
        throw new Error("This manual-review retry key belongs to a different decision or snapshot.");
      }
      const reconcilesApprovedStage = stored.status === "approved"
        && course.pipelineStage === "manual_review"
        && (course.manualReviewResolution as { reviewId?: string } | undefined)?.reviewId === stored.reviewId;
      return {
        writes: reconcilesApprovedStage ? [{
          path: coursePath,
          data: {
            ...course,
            pipelineStage: "ready_to_publish",
            pipelineStageUpdatedAt: stored.reviewedAt,
            lastValidationDecision: "manual_review_approved",
            lastValidationSnapshotHash: stored.snapshotHash,
          },
        }] : [],
        result: { recovered: true, resolution: stored },
      };
    }
    const currentResolution = course.manualReviewResolution as { reviewId?: string } | undefined;
    if ((currentResolution?.reviewId ?? undefined) !== expected.manualReviewResolutionId) {
      throw new Error("The manual-review decision changed while this decision was being saved. Reload the current review state.");
    }
    if (course.pipelineStage !== "manual_review") {
      throw new Error("Validate this exact draft before recording a manual-review decision.");
    }
    if (resolution.status === "approved") {
      assertCourseStageTransition("manual_review", "ready_to_publish");
    }
    if (publicationContentFingerprint(course) !== expected.courseFingerprint) {
      throw new Error("The course changed during manual review. Validate the current draft again.");
    }
    for (const lessonId of expectedLessonIds) {
      const lesson = documents[`courses/${courseId}/lessons/${lessonId}`];
      if (!lesson || publicationContentFingerprint(lesson) !== expected.lessonFingerprints[lessonId]) {
        throw new Error("A lesson changed during manual review. Validate the current draft again.");
      }
    }
    return {
      writes: [
        {
          path: coursePath,
          data: {
            ...course,
            manualReviewResolution: reviewedResolution,
            ...(resolution.status === "approved" ? {
              pipelineStage: "ready_to_publish",
              pipelineStageUpdatedAt: resolution.reviewedAt,
              lastValidationDecision: "manual_review_approved",
              lastValidationSnapshotHash: resolution.snapshotHash,
            } : {}),
            updatedAt: resolution.reviewedAt,
          },
        },
        {
          path: auditPath,
          data: {
            actorUid: resolution.reviewerUid,
            courseId,
            action: `course_manual_review_${resolution.status}`,
            reason: resolution.reason,
            snapshotHash: resolution.snapshotHash,
            contractVersion: resolution.contractVersion,
            proofToken: expected.proofToken,
            verifiedSourceIds: resolution.verifiedSourceIds,
            createdAt: resolution.reviewedAt,
          },
        },
        {
          path: mutationPath,
          data: {
            courseId,
            resolution: reviewedResolution,
            createdAt: resolution.reviewedAt,
          },
        },
      ],
      result: { recovered: false, resolution: reviewedResolution },
    };
  });
}

type DeterministicRepairOperation = RepairOperation & {
  operation: "add" | "remove";
};

type DeterministicRepairTarget =
  | { kind: "array"; lessonId: string; field: "interactions" | "visuals"; index: number }
  | { kind: "visualFallback"; lessonId: string };

function deterministicRepairTarget(targetPath: string): DeterministicRepairTarget {
  const arrayMatch = /^lessons\["([0-9]+-[0-9]+)"\]\.(interactions|visuals)\[(\d+)\]$/.exec(targetPath);
  if (arrayMatch) {
    return { kind: "array", lessonId: arrayMatch[1], field: arrayMatch[2] as "interactions" | "visuals", index: Number(arrayMatch[3]) };
  }
  const fallbackMatch = /^lessons\["([0-9]+-[0-9]+)"\]\.visualPlan\.accessibleFallback$/.exec(targetPath);
  if (fallbackMatch) return { kind: "visualFallback", lessonId: fallbackMatch[1] };
  throw new Error(`Unsupported deterministic repair target: ${targetPath}`);
}

export interface CourseRepairGuard { actor: { uid: string; isOwner: boolean }; publicationState: string }
function assertCourseRepairGuard(course: Record<string, unknown>, actorUid: string, guard: CourseRepairGuard | undefined) {
  const scope = currentAccountGeneration();
  if (!guard || !scope || scope.uid !== actorUid || guard.actor.uid !== actorUid) throw new LessonSaveError("REPAIR_GUARD_REQUIRED", "A current account and repair guard are required.", "reopen_course");
  if (course.authorId !== actorUid && !guard.actor.isOwner) throw new LessonSaveError("REPAIR_AUTHOR_CHANGED", "This course belongs to another account.", "reopen_course");
  const flags = coursePipelineFeatureFlags(guard.actor);
  if (!courseUsesPipelineV2(course) || !flags.repairV2 || !flags.validationV2) throw new LessonSaveError("COURSE_REPAIR_PAUSED", "Targeted repair is paused for this draft.", "reopen_course");
  if (course.moderationStatus === "quarantined") throw new LessonSaveError("COURSE_REPAIR_QUARANTINED", "Resolve this course's moderation hold before repairing.", "reopen_course");
  if (lessonPublicationState(course) !== guard.publicationState) throw new LessonSaveError("COURSE_PUBLICATION_CHANGED", "The course publication state changed. Validate its current draft again.", "reopen_course");
}

export async function applyDeterministicCourseRepair(
  courseId: string,
  expectedLessonIds: string[],
  expected: { courseFingerprint: string; lessonFingerprints: Record<string, string> },
  operations: DeterministicRepairOperation[],
  metadata: {
    repairId: string;
    idempotencyKey: string;
    actorUid: string;
    baseSnapshotHash: string;
    contractVersion: string;
    appliedAt: string;
    requestedIssueCodes: string[];
    attemptLimit: number;
  },
  guard?: CourseRepairGuard,
) {
  const coursePath = `courses/${courseId}`;
  const affectedLessonIds = Array.from(new Set(operations.map((operation) => deterministicRepairTarget(operation.targetPath).lessonId)));
  if (!affectedLessonIds.length || affectedLessonIds.some((lessonId) => !expectedLessonIds.includes(lessonId))) {
    throw new Error("The repair plan does not target a current course lesson.");
  }
  const lessonPaths = affectedLessonIds.map((lessonId) => `courses/${courseId}/lessons/${lessonId}`);
  const repairPath = `courseRepairs/${metadata.repairId}`;
  return runStoredDocumentTransaction([coursePath, ...lessonPaths, repairPath], (documents) => {
    const course = documents[coursePath];
    if (!course) throw new Error("Course not found.");
    assertCourseRepairGuard(course, metadata.actorUid, guard);
    if (course.isPublic === true) throw new Error("Unpublish this course before repairing its draft.");
    const previous = course.lastRepair as { idempotencyKey?: string; repairId?: string; baseSnapshotHash?: string; requestedIssueCodes?: string[] } | undefined;
    if (previous?.idempotencyKey === metadata.idempotencyKey) {
      if (previous.baseSnapshotHash !== metadata.baseSnapshotHash) {
        throw new Error("This repair retry key belongs to a different course snapshot.");
      }
      if (JSON.stringify(previous.requestedIssueCodes ?? []) !== JSON.stringify(metadata.requestedIssueCodes)) {
        throw new Error("This repair retry key belongs to a different issue selection.");
      }
      return { writes: [], result: { recovered: true, repairId: String(previous.repairId), attempt: 0 } };
    }
    if (publicationContentFingerprint(course) !== expected.courseFingerprint) {
      throw new Error("The course changed after repair was planned. Validate the current draft again.");
    }
    const priorAttempts = course.repairAttemptsByIssue && typeof course.repairAttemptsByIssue === "object"
      ? course.repairAttemptsByIssue as Record<string, unknown>
      : {};
    const issueCodes = Array.from(new Set(operations.map((operation) => operation.issueCode)));
    const attemptKey = (issueCode: string) => `${issueCode}:${metadata.baseSnapshotHash}`;
    const exhaustedCode = issueCodes.find((issueCode) => Number(priorAttempts[attemptKey(issueCode)] ?? 0) >= metadata.attemptLimit);
    if (exhaustedCode) {
      throw new Error(`REPAIR_ATTEMPT_LIMIT_EXHAUSTED: ${exhaustedCode} already reached its automatic repair limit.`);
    }
    const nextAttempts = {
      ...priorAttempts,
      ...Object.fromEntries(issueCodes.map((issueCode) => [attemptKey(issueCode), Number(priorAttempts[attemptKey(issueCode)] ?? 0) + 1])),
    };
    const nextLessons = new Map<string, Record<string, unknown>>();
    const undoOperations: Array<{ targetPath: string; operation: "add" | "remove"; value?: unknown }> = [];
    const appliedOperations: DeterministicRepairOperation[] = [];
    const sortedOperations = [...operations].sort((left, right) => {
      const leftTarget = deterministicRepairTarget(left.targetPath);
      const rightTarget = deterministicRepairTarget(right.targetPath);
      return leftTarget.lessonId.localeCompare(rightTarget.lessonId)
        || leftTarget.kind.localeCompare(rightTarget.kind)
        || (leftTarget.kind === "array" && rightTarget.kind === "array" ? rightTarget.index - leftTarget.index : 0);
    });
    for (const operation of sortedOperations) {
      const target = deterministicRepairTarget(operation.targetPath);
      const validArrayRemoval = target.kind === "array" && operation.operation === "remove" && (
        (operation.issueCode === "CQ_LAB_001" && target.field === "interactions")
        || (operation.issueCode === "CQ_VISUAL_003" && target.field === "visuals")
      );
      const validFallbackAddition = target.kind === "visualFallback"
        && operation.operation === "add"
        && operation.issueCode === "CQ_VISUAL_001";
      if (!validArrayRemoval && !validFallbackAddition) {
        throw new Error(`Repair rule ${operation.issueCode} cannot modify ${target.kind}.`);
      }
      const lessonPath = `courses/${courseId}/lessons/${target.lessonId}`;
      const storedLesson = documents[lessonPath];
      if (!storedLesson) throw new Error("A lesson is missing from the repair transaction.");
      if (publicationContentFingerprint(storedLesson) !== expected.lessonFingerprints[target.lessonId]) {
        throw new Error("A lesson changed after repair was planned. Validate the current draft again.");
      }
      const lesson = nextLessons.get(target.lessonId) ?? { ...storedLesson };
      if (target.kind === "array") {
        const items = Array.isArray(lesson[target.field]) ? [...lesson[target.field] as unknown[]] : [];
        if (target.index < 0 || target.index >= items.length) throw new Error("The diagnosed repair target no longer exists.");
        const [removed] = items.splice(target.index, 1);
        undoOperations.push({ targetPath: operation.targetPath, operation: "add", value: removed });
        appliedOperations.push({ ...operation, beforeHash: publicationContentFingerprint(removed) });
        lesson[target.field] = items;
      } else {
        const visualPlan = lesson.visualPlan && typeof lesson.visualPlan === "object"
          ? { ...lesson.visualPlan as Record<string, unknown> }
          : null;
        if (!visualPlan || visualPlan.accessibleFallback !== undefined || !operation.value) {
          throw new Error("The diagnosed visual fallback target is no longer repairable.");
        }
        visualPlan.accessibleFallback = operation.value;
        undoOperations.push({ targetPath: operation.targetPath, operation: "remove" });
        appliedOperations.push({ ...operation });
        lesson.visualPlan = visualPlan;
      }
      lesson.updatedAt = metadata.appliedAt;
      nextLessons.set(target.lessonId, lesson);
    }
    const afterFingerprints = Object.fromEntries([...nextLessons].map(([lessonId, lesson]) => [
      lessonId,
      publicationContentFingerprint(lesson),
    ]));
    return {
      writes: [
        ...[...nextLessons].map(([lessonId, lesson]) => ({
          path: `courses/${courseId}/lessons/${lessonId}`,
          data: lesson,
        })),
        {
          path: coursePath,
          data: {
            ...course,
            lastRepair: {
              repairId: metadata.repairId,
              idempotencyKey: metadata.idempotencyKey,
              baseSnapshotHash: metadata.baseSnapshotHash,
              requestedIssueCodes: metadata.requestedIssueCodes,
              status: "applied",
              appliedAt: metadata.appliedAt,
            },
            repairAttemptsByIssue: nextAttempts,
            updatedAt: metadata.appliedAt,
          },
        },
        {
          path: repairPath,
          data: {
            courseId,
            actorUid: metadata.actorUid,
            status: "applied",
            baseSnapshotHash: metadata.baseSnapshotHash,
            contractVersion: metadata.contractVersion,
            idempotencyKey: metadata.idempotencyKey,
            requestedIssueCodes: metadata.requestedIssueCodes,
            operations: appliedOperations,
            undoOperations,
            afterFingerprints,
            appliedAt: metadata.appliedAt,
          },
        },
      ],
      result: {
        recovered: false,
        repairId: metadata.repairId,
        attempt: Math.max(...issueCodes.map((issueCode) => Number(nextAttempts[attemptKey(issueCode)] ?? 1))),
      },
    };
  });
}

export async function undoDeterministicCourseRepair(
  courseId: string,
  expectedLessonIds: string[],
  repairId: string,
  idempotencyKey: string,
  actorUid: string,
  undoneAt: string,
  guard?: CourseRepairGuard,
) {
  const coursePath = `courses/${courseId}`;
  const repairPath = `courseRepairs/${repairId}`;
  const repair = await getStoredDocument(repairPath);
  if (!repair || repair.courseId !== courseId) throw new Error("Repair record not found.");
  const afterFingerprints = repair.afterFingerprints as Record<string, string> | undefined;
  const undoOperations = Array.isArray(repair.undoOperations)
    ? repair.undoOperations as Array<{ targetPath: string; operation: "add" | "remove"; value?: unknown }>
    : [];
  const affectedLessonIds = Array.from(new Set(undoOperations.map((operation) => deterministicRepairTarget(operation.targetPath).lessonId)));
  if (!afterFingerprints || !affectedLessonIds.length || affectedLessonIds.some((lessonId) => !expectedLessonIds.includes(lessonId))) {
    throw new Error("Repair record cannot be undone safely.");
  }
  const lessonPaths = affectedLessonIds.map((lessonId) => `courses/${courseId}/lessons/${lessonId}`);
  return runStoredDocumentTransaction([coursePath, ...lessonPaths, repairPath], (documents) => {
    const course = documents[coursePath];
    const currentRepair = documents[repairPath];
    if (!course || !currentRepair) throw new Error("Repair record not found.");
    assertCourseRepairGuard(course, actorUid, guard);
    if (course.isPublic === true) throw new Error("Unpublish this course before undoing a repair.");
    if (currentRepair.status === "undone") {
      if (currentRepair.undoIdempotencyKey !== idempotencyKey) throw new Error("This repair was already undone by another request.");
      return { writes: [], result: true };
    }
    if (currentRepair.status !== "applied") throw new Error("Only an applied repair can be undone.");
    const nextLessons = new Map<string, Record<string, unknown>>();
    const sortedUndo = [...undoOperations].sort((left, right) => {
      const leftTarget = deterministicRepairTarget(left.targetPath);
      const rightTarget = deterministicRepairTarget(right.targetPath);
      return leftTarget.lessonId.localeCompare(rightTarget.lessonId)
        || leftTarget.kind.localeCompare(rightTarget.kind)
        || (leftTarget.kind === "array" && rightTarget.kind === "array" ? leftTarget.index - rightTarget.index : 0);
    });
    for (const operation of sortedUndo) {
      const target = deterministicRepairTarget(operation.targetPath);
      const path = `courses/${courseId}/lessons/${target.lessonId}`;
      const storedLesson = documents[path];
      if (!storedLesson || publicationContentFingerprint(storedLesson) !== afterFingerprints[target.lessonId]) {
        throw new Error("A repaired lesson changed after the repair. Undo cannot overwrite newer edits.");
      }
      const lesson = nextLessons.get(target.lessonId) ?? { ...storedLesson };
      if (target.kind === "array" && operation.operation === "add") {
        const items = Array.isArray(lesson[target.field]) ? [...lesson[target.field] as unknown[]] : [];
        items.splice(target.index, 0, operation.value);
        lesson[target.field] = items;
      } else if (target.kind === "visualFallback" && operation.operation === "remove") {
        const visualPlan = lesson.visualPlan && typeof lesson.visualPlan === "object"
          ? { ...lesson.visualPlan as Record<string, unknown> }
          : null;
        if (!visualPlan?.accessibleFallback) throw new Error("The repaired visual fallback no longer exists.");
        delete visualPlan.accessibleFallback;
        lesson.visualPlan = visualPlan;
      } else {
        throw new Error("Repair record contains an unsupported undo operation.");
      }
      lesson.updatedAt = undoneAt;
      nextLessons.set(target.lessonId, lesson);
    }
    return {
      writes: [
        ...[...nextLessons].map(([lessonId, lesson]) => ({ path: `courses/${courseId}/lessons/${lessonId}`, data: lesson })),
        {
          path: coursePath,
          data: {
            ...course,
            lastRepair: { repairId, idempotencyKey, status: "undone", undoneAt },
            updatedAt: undoneAt,
          },
        },
        {
          path: repairPath,
          data: {
            ...currentRepair,
            status: "undone",
            undoneAt,
            undoneBy: actorUid,
            undoIdempotencyKey: idempotencyKey,
          },
        },
      ],
      result: false,
    };
  });
}

export async function quarantineCourse(courseId: string, reason: string) {
  const course = await getCourse(courseId);
  if (!course) return false;
  const lessons = await listLessons(courseId);
  const now = new Date().toISOString();
  await commitWrites([
    {
      update: {
        name: fullDocumentName(`courses/${courseId}`),
        fields: toDocumentFields({
          isPublic: false,
          moderationStatus: "quarantined",
          quarantineReason: reason.slice(0, 240),
          quarantinedAt: now,
          updatedAt: new Date(),
        }),
      },
      updateMask: {
        fieldPaths: ["isPublic", "moderationStatus", "quarantineReason", "quarantinedAt", "updatedAt"],
      },
    },
    ...lessons.map((lesson) => ({
      update: {
        name: fullDocumentName(`courses/${courseId}/lessons/${lesson.id}`),
        fields: toDocumentFields({ isPublic: false }),
      },
      updateMask: { fieldPaths: ["isPublic"] },
    })),
  ]);
  return true;
}

export async function getCoursePublishReadiness(
  courseId: string,
  expectedLessonIds: string[],
  topic: string,
  expectedModesByLessonId: Readonly<Record<string, LessonMode | undefined>> = {},
  instructionLanguage = "English",
) {
  const lessons = await listLessons(courseId);
  return inspectCoursePublishReadiness(lessons, expectedLessonIds, topic, expectedModesByLessonId, instructionLanguage);
}

export async function deleteCourse(courseId: string) {
  const notePrefix = `${courseId}:`;
  const courseScopedDocuments = (collectionId: string) => runLocatedQuery({
    from: collectionGroupFrom(collectionId),
    where: {
      fieldFilter: {
        field: { fieldPath: "courseId" },
        op: "EQUAL",
        value: toDocumentValue(courseId),
      },
    },
  });
  const [
    lessons,
    progressDocuments,
    preferenceDocuments,
    noteDocuments,
    learningOutcomeDocuments,
    masteryEvidenceDocuments,
    contentReportDocuments,
    outcomeFeedbackDocuments,
    releaseDocuments,
    releasedLessonDocuments,
    repairDocuments,
    pipelineEventDocuments,
    manualReviewMutationDocuments,
    lessonInteractionDocuments,
    lessonInteractionMutationDocuments,
    evidenceShareDocuments,
    evidenceShareReferenceDocuments,
    flashcardDeckDocuments,
    flashcardDocuments,
    flashcardReviewDocuments,
  ] = await Promise.all([
    listLessons(courseId),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.progress),
    runLocatedQuery({
      from: collectionGroupFrom("learningData"),
    }),
    runLocatedQuery({
      from: collectionGroupFrom("lessonNotes"),
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "key" },
                op: "GREATER_THAN_OR_EQUAL",
                value: toDocumentValue(notePrefix),
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "key" },
                op: "LESS_THAN_OR_EQUAL",
                value: toDocumentValue(`${notePrefix}\uf8ff`),
              },
            },
          ],
        },
      },
    }),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.learningOutcomes),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.masteryEvidence),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.contentReports),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.outcomeFeedback),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.releases),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.releasedLessons),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.repairs),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.pipelineEvents),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.manualReviewMutations),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.lessonInteractions),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.lessonInteractionMutations),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.evidenceShares),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.evidenceShareRefs),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.flashcardDecks),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.flashcards),
    courseScopedDocuments(COURSE_SCOPED_COLLECTION_GROUPS.flashcardReviewState),
  ]);

  const updatedAt = new Date().toISOString();
  const preferenceUpdates = preferenceDocuments.flatMap(({ path, data }) => {
    if (!path.endsWith("/learningData/preferences")) return [];
    const cleaned = removeCourseReferences(data, courseId);
    if (!cleaned.changed) return [];
    const storedData: Record<string, unknown> = { ...cleaned.value, updatedAt };
    delete storedData.id;
    return [{
      update: {
        name: fullDocumentName(path),
        fields: toDocumentFields(storedData),
      },
    }];
  });

  const flashcardRecoveryWrites = flashcardDeckDocuments.flatMap(({ path: deckPath, data: deck }) => {
    const deckId = typeof deck.id === "string" ? deck.id : deckPath.split("/").at(-1) ?? "";
    const cards = flashcardDocuments.filter(({ data }) => data.deckId === deckId);
    const retainedCards = cards.filter(({ data }) => data.origin === "manual" || data.origin === "generated-edited");
    const retainedCardIds = new Set(retainedCards.flatMap(({ data }) => typeof data.id === "string" ? [data.id] : []));
    const reviewRecords = flashcardReviewDocuments.filter(({ data }) => data.deckId === deckId);
    if (!retainedCards.length) {
      return [
        { delete: fullDocumentName(deckPath) },
        ...cards.map(({ path }) => ({ delete: fullDocumentName(path) })),
        ...reviewRecords.map(({ path }) => ({ delete: fullDocumentName(path) })),
      ];
    }

    const nextDeck: Record<string, unknown> = {
      ...deck,
      kind: "recovered",
      courseId: null,
      moduleIndex: null,
      lessonIds: [],
      generationSettings: null,
      sourceFingerprint: null,
      cardCount: retainedCards.length,
      dueCount: Math.min(Number(deck.dueCount) || retainedCards.length, retainedCards.length),
      revision: (Number(deck.revision) || 1) + 1,
      updatedAt,
    };
    delete nextDeck.id;
    return [
      { update: { name: fullDocumentName(deckPath), fields: toDocumentFields(nextDeck) } },
      ...cards.map(({ path, data }) => {
        const cardId = typeof data.id === "string" ? data.id : path.split("/").at(-1) ?? "";
        if (!retainedCardIds.has(cardId)) return { delete: fullDocumentName(path) };
        const nextCard: Record<string, unknown> = {
          ...data,
          courseId: null,
          sourceRefs: [],
          sourceFingerprint: null,
          updatedAt,
        };
        delete nextCard.id;
        return { update: { name: fullDocumentName(path), fields: toDocumentFields(nextCard) } };
      }),
      ...reviewRecords.map(({ path, data }) => {
        if (!retainedCardIds.has(String(data.cardId ?? ""))) return { delete: fullDocumentName(path) };
        const nextReview: Record<string, unknown> = { ...data, courseId: null, updatedAt };
        delete nextReview.id;
        return { update: { name: fullDocumentName(path), fields: toDocumentFields(nextReview) } };
      }),
    ];
  });

  const dependentWrites: Array<Record<string, unknown>> = [
    { delete: fullDocumentName(`courseResearchArtifacts/${courseId}`) },
    ...lessons.map((lesson) => ({
      delete: fullDocumentName(`courses/${courseId}/lessons/${lesson.id}`),
    })),
    ...progressDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...noteDocuments
      .filter(({ data }) => typeof data.key === "string" && data.key.startsWith(notePrefix))
      .map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...learningOutcomeDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...masteryEvidenceDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...contentReportDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...outcomeFeedbackDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...releasedLessonDocuments
      .filter(({ path }) => path.startsWith("courseReleases/"))
      .map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...releaseDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...repairDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...pipelineEventDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...manualReviewMutationDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...lessonInteractionDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...lessonInteractionMutationDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...evidenceShareDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...evidenceShareReferenceDocuments.map(({ path }) => ({ delete: fullDocumentName(path) })),
    ...flashcardRecoveryWrites,
    ...preferenceUpdates,
  ];

  // Delete dependents first and the course record last. If cleanup is
  // interrupted, retrying the operation safely completes the remaining work.
  await commitWrites(dependentWrites);
  await commitWrites([{ delete: fullDocumentName(`courses/${courseId}`) }]);

  return {
    lessons: lessons.length,
    progressRecords: progressDocuments.length,
    notes: noteDocuments.length,
    learnerStates: preferenceUpdates.length,
    learningOutcomes: learningOutcomeDocuments.length,
    masteryEvidence: masteryEvidenceDocuments.length,
    contentReports: contentReportDocuments.length,
    outcomeFeedback: outcomeFeedbackDocuments.length,
    releases: releaseDocuments.length,
    releasedLessons: releasedLessonDocuments.filter(({ path }) => path.startsWith("courseReleases/")).length,
    repairs: repairDocuments.length,
    pipelineEvents: pipelineEventDocuments.length,
    manualReviewMutations: manualReviewMutationDocuments.length,
    lessonInteractions: lessonInteractionDocuments.length,
    lessonInteractionMutations: lessonInteractionMutationDocuments.length,
    evidenceShares: evidenceShareDocuments.length,
    evidenceShareReferences: evidenceShareReferenceDocuments.length,
    flashcardDecks: flashcardDeckDocuments.length,
    flashcardCards: flashcardDocuments.length,
    flashcardReviewStates: flashcardReviewDocuments.length,
  };
}
