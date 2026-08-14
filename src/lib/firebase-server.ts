import "server-only";

import {
  fromFirestoreFields,
  toFirestoreFields,
  toFirestoreValue,
  fromFirestoreValue,
  type FirestoreDocument,
  type FirestoreValue,
} from "@/lib/firestore-values";
import { isLocalMode } from "@/lib/local-mode";
import { COURSE_SCOPED_COLLECTION_GROUPS, removeCourseReferences } from "@/lib/course-deletion";
import type { PublicationLessonReview, PublicationOwnerOverride } from "@/lib/publication-review";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { buildGuardedLessonSave, type LessonSavePipelineGuard } from "@/lib/course-pipeline/lesson-save";
import { inspectCoursePublishReadiness } from "@/lib/publication-readiness";
import { serverEnvironment } from "@/lib/runtime-environment";

export interface StoredDocument extends Record<string, unknown> {
  id: string;
  authorId?: string;
  isPublic?: boolean;
  topic?: string;
}

interface FirestoreBatchGetResult {
  found?: FirestoreDocument;
  missing?: string;
  transaction?: string;
}

interface FirestoreDocumentList {
  documents?: FirestoreDocument[];
  nextPageToken?: string;
}

interface FirestoreAggregationResult {
  result?: {
    aggregateFields?: Record<string, FirestoreValue>;
  };
}

interface LocatedStoredDocument {
  path: string;
  data: StoredDocument;
}

export class CourseBannerRegenerationError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "NOT_OWNED" | "ALREADY_USED" | "IN_PROGRESS" | "CLAIM_LOST",
    message: string,
  ) {
    super(message);
  }
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

let accessToken: { value: string; expiresAt: number } | null = null;
let accessTokenRequest: Promise<string> | null = null;

function requiredEnvironment() {
  if (isLocalMode()) return { projectId: "local", clientEmail: "local", privateKey: "local" };
  const projectId = serverEnvironment.FIREBASE_PROJECT_ID;
  const clientEmail = serverEnvironment.FIREBASE_CLIENT_EMAIL;
  const privateKey = serverEnvironment.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase server credentials are not configured.");
  }

  return { projectId, clientEmail, privateKey };
}

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createServiceAccountJwt() {
  const { clientEmail, privateKey } = requiredEnvironment();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const keyBody = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(keyBody);
  const keyBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function requestAccessToken() {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;
  if (accessTokenRequest) return accessTokenRequest;

  accessTokenRequest = (async () => {
    const assertion = await createServiceAccountJwt();
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) throw new Error(`Firebase token request failed (${response.status}).`);

    const token = (await response.json()) as TokenResponse;
    accessToken = {
      value: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return token.access_token;
  })();

  try {
    return await accessTokenRequest;
  } finally {
    accessTokenRequest = null;
  }
}

function firestoreBaseUrl() {
  const { projectId } = requiredEnvironment();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
}

function encodeDocumentPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function firestoreJson<T>(
  path: string,
  init: RequestInit = {},
  allowNotFound = false,
): Promise<T | null> {
  if (process.env.NODE_ENV !== "production" && isLocalMode()) {
    const { localFirestoreJson } = await import("@/lib/local-store");
    return localFirestoreJson<T>(path, init, allowNotFound);
  }
  if (serverEnvironment.DATABASE_URL?.trim()) {
    const { postgresDocumentStoreJson } = await import("@/lib/postgres-document-store");
    return postgresDocumentStoreJson<T>(path, init, allowNotFound);
  }
  if (serverEnvironment.NODE_ENV === "production") {
    throw new Error("Azure PostgreSQL is required in production.");
  }
  // Temporary source compatibility for the one-time migration rehearsal. The
  // production release contract above cannot fall back to Firebase.
  const token = await requestAccessToken();
  const response = await fetch(`${firestoreBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text();
    console.error("Firestore request failed", response.status, detail.slice(0, 500));
    throw new Error(`Firestore request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

function parseDocument(document: FirestoreDocument): StoredDocument {
  const id = document.name.split("/").pop() ?? "";
  const fields = fromFirestoreFields(document.fields ?? {});
  if (typeof fields.authorName === "string" && (fields.authorName.includes("@") || fields.authorName === "Teach")) {
    fields.authorName = "Filosage";
  }
  return { id, ...fields };
}

function parseLocatedDocument(document: FirestoreDocument): LocatedStoredDocument {
  const marker = "/documents/";
  const markerIndex = document.name.indexOf(marker);
  if (markerIndex < 0) throw new Error("Firestore returned an invalid document path.");
  return {
    path: document.name.slice(markerIndex + marker.length),
    data: parseDocument(document),
  };
}

function fullDocumentName(path: string) {
  const projectId = serverEnvironment.DATABASE_URL?.trim()
    ? "azure"
    : requiredEnvironment().projectId;
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

async function runCourseQuery(structuredQuery: Record<string, unknown>) {
  const results = await firestoreJson<Array<{ document?: FirestoreDocument }>>(
    "/documents:runQuery",
    { method: "POST", body: JSON.stringify({ structuredQuery }) },
  );
  return (results ?? []).flatMap((result) =>
    result.document ? [parseDocument(result.document)] : [],
  );
}

async function runLocatedQuery(structuredQuery: Record<string, unknown>) {
  const results = await firestoreJson<Array<{ document?: FirestoreDocument }>>(
    "/documents:runQuery",
    { method: "POST", body: JSON.stringify({ structuredQuery }) },
  );
  return (results ?? []).flatMap((result) =>
    result.document ? [parseLocatedDocument(result.document)] : [],
  );
}

function collectionGroupFrom(collectionId: string) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId)) {
    throw new Error("Invalid Firestore collection.");
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
      value: toFirestoreValue(value),
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
  const document = await firestoreJson<FirestoreDocument>(
    `/documents/${encodeDocumentPath(`courses/${courseId}`)}`,
    {},
    true,
  );
  return document ? parseDocument(document) : null;
}

export async function createCourse(data: Record<string, unknown>, courseId?: string) {
  const now = new Date();
  const document = courseId
    ? await firestoreJson<FirestoreDocument>(
        `/documents/${encodeDocumentPath(`courses/${courseId}`)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fields: toFirestoreFields({ ...data, createdAt: now, updatedAt: now }),
          }),
        },
      )
    : await firestoreJson<FirestoreDocument>("/documents/courses", {
        method: "POST",
        body: JSON.stringify({
          fields: toFirestoreFields({ ...data, createdAt: now, updatedAt: now }),
        }),
      });
  if (!document) throw new Error("Firestore did not return the new course.");
  return parseDocument(document);
}

export async function updateCourseBanner(
  courseId: string,
  banner: { assetId: string; version: 1; generatedAt: string },
) {
  const updatedAt = new Date();
  const document = await firestoreJson<FirestoreDocument>(
    `/documents/${encodeDocumentPath(`courses/${courseId}`)}?updateMask.fieldPaths=banner&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: toFirestoreFields({ banner, updatedAt }),
      }),
    },
  );
  if (!document) throw new Error("Firestore did not return the updated course.");
  return parseDocument(document);
}

export async function claimCourseBannerRegeneration(
  courseId: string,
  uid: string,
  ownerOverride: boolean,
  claimId: string,
) {
  const path = `courses/${courseId}`;
  const now = new Date();
  return runStoredDocumentTransaction([path], (documents) => {
    const course = documents[path];
    if (!course) throw new CourseBannerRegenerationError("NOT_FOUND", "Course not found.");
    if (course.authorId !== uid && !ownerOverride) {
      throw new CourseBannerRegenerationError("NOT_OWNED", "You do not own this course.");
    }
    const leaseUntil = typeof course.bannerRegenerationLeaseUntil === "string"
      ? Date.parse(course.bannerRegenerationLeaseUntil)
      : 0;
    if (course.bannerRegenerationStatus === "generating" && leaseUntil > now.getTime()) {
      throw new CourseBannerRegenerationError(
        "IN_PROGRESS",
        "A new course banner is already being generated.",
      );
    }
    return {
      writes: [{
        path,
        data: {
          ...course,
          bannerRegenerationStatus: "generating",
          bannerRegenerationClaimId: claimId,
          bannerRegenerationLeaseUntil: new Date(now.getTime() + 120_000).toISOString(),
          updatedAt: now,
        },
      }],
      result: course,
    };
  });
}

export async function finishCourseBannerRegeneration(
  courseId: string,
  claimId: string,
  banner: { assetId: string; version: 1; generatedAt: string },
) {
  const path = `courses/${courseId}`;
  return runStoredDocumentTransaction([path], (documents) => {
    const course = documents[path];
    if (!course) throw new CourseBannerRegenerationError("NOT_FOUND", "Course not found.");
    if (course.bannerRegenerationClaimId !== claimId) {
      throw new CourseBannerRegenerationError("CLAIM_LOST", "The banner generation claim expired.");
    }
    return {
      writes: [{
        path,
        data: {
          ...course,
          banner,
          bannerRegenerationCount: Number(course.bannerRegenerationCount ?? 0) + 1,
          bannerRegenerationStatus: null,
          bannerRegenerationClaimId: null,
          bannerRegenerationLeaseUntil: null,
          updatedAt: new Date(),
        },
      }],
      result: undefined,
    };
  });
}

export async function releaseCourseBannerRegeneration(courseId: string, claimId: string) {
  const path = `courses/${courseId}`;
  await runStoredDocumentTransaction([path], (documents) => {
    const course = documents[path];
    if (!course || course.bannerRegenerationClaimId !== claimId) {
      return { writes: [], result: undefined };
    }
    return {
      writes: [{
        path,
        data: {
          ...course,
          bannerRegenerationStatus: null,
          bannerRegenerationClaimId: null,
          bannerRegenerationLeaseUntil: null,
          updatedAt: new Date(),
        },
      }],
      result: undefined,
    };
  });
}

export async function listLessons(courseId: string) {
  const response = await firestoreJson<{ documents?: FirestoreDocument[] }>(
    `/documents/${encodeDocumentPath(`courses/${courseId}/lessons`)}?pageSize=300`,
  );
  return (response?.documents ?? []).map(parseDocument);
}

export async function getLesson(courseId: string, lessonId: string) {
  const document = await firestoreJson<FirestoreDocument>(
    `/documents/${encodeDocumentPath(`courses/${courseId}/lessons/${lessonId}`)}`,
    {},
    true,
  );
  return document ? parseDocument(document) : null;
}

export async function saveLesson(
  courseId: string,
  lessonId: string,
  data: Record<string, unknown>,
  pipelineGuard?: LessonSavePipelineGuard,
) {
  if (pipelineGuard) {
    const coursePath = `courses/${courseId}`;
    const lessonPath = `${coursePath}/lessons/${lessonId}`;
    return runStoredDocumentTransaction([coursePath, lessonPath], (documents) => {
      const now = new Date().toISOString();
      return buildGuardedLessonSave(
        courseId,
        lessonId,
        documents[coursePath] ?? undefined,
        documents[lessonPath] ?? undefined,
        data,
        pipelineGuard,
        now,
      );
    });
  }
  const existing = await getLesson(courseId, lessonId);
  const now = new Date();
  const document = await firestoreJson<FirestoreDocument>(
    `/documents/${encodeDocumentPath(`courses/${courseId}/lessons/${lessonId}`)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: toFirestoreFields({
          ...data,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }),
      }),
    },
  );
  if (!document) throw new Error("Firestore did not return the saved lesson.");
  return parseDocument(document);
}

async function commitWrites(writes: Array<Record<string, unknown>>) {
  for (let index = 0; index < writes.length; index += 500) {
    await firestoreJson("/documents:commit", {
      method: "POST",
      body: JSON.stringify({ writes: writes.slice(index, index + 500) }),
    });
  }
}

export async function getStoredDocument(path: string) {
  const document = await firestoreJson<FirestoreDocument>(
    `/documents/${encodeDocumentPath(path)}`,
    {},
    true,
  );
  return document ? parseDocument(document) : null;
}

export async function putStoredDocument(path: string, data: Record<string, unknown>) {
  const storedData = { ...data };
  delete storedData.id;
  const document = await firestoreJson<FirestoreDocument>(
    `/documents/${encodeDocumentPath(path)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields: toFirestoreFields(storedData) }),
    },
  );
  if (!document) throw new Error("Firestore did not return the saved document.");
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
        fields: toFirestoreFields(storedData),
      },
    };
  }));
}

export async function listStoredDocuments(path: string, pageSize = 100) {
  const response = await firestoreJson<FirestoreDocumentList>(
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
    const response = await firestoreJson<FirestoreDocumentList>(
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
        value: toFirestoreValue(value),
      },
    },
    limit: Math.min(Math.max(limit, 1), 10_000),
  });
}

export function listCollectionDocuments(collectionId: string, limit = 1_000) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId)) {
    throw new Error("Invalid Firestore collection.");
  }
  return runCourseQuery({
    from: [{ collectionId }],
    limit: Math.min(Math.max(limit, 1), 10_000),
  });
}

export function listCollectionDocumentsByRange(
  collectionId: string,
  field: string,
  from: string,
  to: string,
  limit = 1_000,
) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId) || !/^[A-Za-z0-9_.-]{1,120}$/.test(field)) {
    throw new Error("Invalid Firestore range query.");
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
              value: toFirestoreValue(from),
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: field },
              op: "LESS_THAN_OR_EQUAL",
              value: toFirestoreValue(to),
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
    throw new Error("Invalid Firestore collection.");
  }
  const fieldFilters = filters.map(({ field, value }) => ({
    fieldFilter: {
      field: { fieldPath: field },
      op: "EQUAL",
      value: toFirestoreValue(value),
    },
  }));
  const structuredQuery: Record<string, unknown> = { from: [{ collectionId }] };
  if (fieldFilters.length === 1) structuredQuery.where = fieldFilters[0];
  if (fieldFilters.length > 1) {
    structuredQuery.where = { compositeFilter: { op: "AND", filters: fieldFilters } };
  }
  const response = await firestoreJson<FirestoreAggregationResult[]>(
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
  return Number(fromFirestoreValue(value ?? { integerValue: "0" })) || 0;
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
  const document = await firestoreJson<FirestoreDocument>(
    `/documents/${encodeDocumentPath(collectionPath)}${query}`,
    {
      method: "POST",
      body: JSON.stringify({ fields: toFirestoreFields(storedData) }),
    },
  );
  if (!document) throw new Error("Firestore did not return the created document.");
  return parseDocument(document);
}

export async function runStoredDocumentTransaction<T>(
  paths: string[],
  update: (
    documents: Record<string, StoredDocument | null>,
  ) => { writes: Array<{ path: string; data: Record<string, unknown> }>; result: T },
): Promise<T> {
  let lastError: unknown;
  let retryTransaction: string | undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const batch = await firestoreJson<FirestoreBatchGetResult[]>("/documents:batchGet", {
        method: "POST",
        body: JSON.stringify({
          documents: paths.map(fullDocumentName),
          newTransaction: {
            readWrite: retryTransaction ? { retryTransaction } : {},
          },
        }),
      });
      const transaction = batch?.find((entry) => entry.transaction)?.transaction;
      if (!transaction) throw new Error("Firestore did not start a transaction.");
      retryTransaction = transaction;

      const documents: Record<string, StoredDocument | null> = Object.fromEntries(
        paths.map((path) => [path, null]),
      );
      for (const entry of batch ?? []) {
        if (entry.found) {
          const located = parseLocatedDocument(entry.found);
          if (located.path in documents) documents[located.path] = located.data;
        }
      }

      let next: ReturnType<typeof update>;
      try {
        next = update(documents);
      } catch (error) {
        await firestoreJson("/documents:rollback", {
          method: "POST",
          body: JSON.stringify({ transaction }),
        });
        throw error;
      }
      await firestoreJson("/documents:commit", {
        method: "POST",
        body: JSON.stringify({
          transaction,
          writes: next.writes.map((write) => {
            const storedData = { ...write.data };
            delete storedData.id;
            return {
              update: {
                name: fullDocumentName(write.path),
                fields: toFirestoreFields(storedData),
              },
            };
          }),
        }),
      });
      return next.result;
    } catch (error) {
      lastError = error;
      const isRetryableFirestoreConflict = error instanceof Error
        && /Firestore request failed \((409|412|429|503)\)/.test(error.message);
      if (!isRetryableFirestoreConflict) throw error;
      if (attempt < 4) {
        const exponentialDelayMs = 100 * (2 ** attempt);
        const jitterMs = Math.floor(Math.random() * 100);
        await new Promise((resolve) => setTimeout(resolve, exponentialDelayMs + jitterMs));
      }
    }
  }

  throw lastError;
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
  nextStage: import("@/lib/course-pipeline/contract").CourseStage,
  validation?: { decision: string; snapshotHash: string },
) {
  const { assertCourseStageTransition } = await import("@/lib/course-pipeline/state");
  const path = `courses/${courseId}`;
  return runStoredDocumentTransaction([path], (documents) => {
    const course = documents[path];
    if (!course) throw new Error("Course not found while updating its pipeline stage.");
    const current = typeof course.pipelineStage === "string"
      ? course.pipelineStage as import("@/lib/course-pipeline/contract").CourseStage
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
  validation: { decision: string; snapshotHash: string },
) {
  const { assertCourseStageTransition } = await import("@/lib/course-pipeline/state");
  const coursePath = `courses/${courseId}`;
  const lessonPaths = expectedLessonIds.map((lessonId) => `${coursePath}/lessons/${lessonId}`);
  return runStoredDocumentTransaction([coursePath, ...lessonPaths], (documents) => {
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
    const current = typeof course.pipelineStage === "string"
      ? course.pipelineStage as import("@/lib/course-pipeline/contract").CourseStage
      : "draft";
    const manualResolution = course.manualReviewResolution as { status?: string; snapshotHash?: string } | undefined;
    if (nextStage === "manual_review"
      && manualResolution?.status === "approved"
      && manualResolution.snapshotHash === validation.snapshotHash) {
      if (current === "ready_to_publish") return { writes: [], result: current };
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
    qualityContractVersion?: string;
    validationReport?: import("@/lib/course-pipeline/contract").ValidationReport;
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
  const immutableReleaseEnabled = review.publishPipelineStage === true;
  const releaseId = `${courseId}__${review.artifactSnapshotHash ?? review.outlineHash}`;
  const releasePath = `courseReleases/${releaseId}`;
  const releaseLessonPaths = expectedLessonIds.map((lessonId) => `courseReleases/${releaseId}/lessons/${lessonId}`);
  const reviewByLessonId = new Map(review.reviews.map((item) => [item.lessonId, item]));
  await runStoredDocumentTransaction([
    coursePath,
    ...lessonPaths,
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
          validationReport: review.validationReport ?? null,
          ...(immutableReleaseEnabled ? { releaseId } : {}),
        },
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
    if (course.isPublic === true) throw new Error("Unpublish this course before changing its manual-review resolution.");
    const mutation = documents[mutationPath] as { resolution?: typeof resolution } | undefined;
    if (mutation?.resolution) {
      const stored = mutation.resolution;
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
            manualReviewResolution: resolution,
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
            verifiedSourceIds: resolution.verifiedSourceIds,
            createdAt: resolution.reviewedAt,
          },
        },
        {
          path: mutationPath,
          data: {
            courseId,
            resolution,
            createdAt: resolution.reviewedAt,
          },
        },
      ],
      result: { recovered: false, resolution },
    };
  });
}

type DeterministicRepairOperation = import("@/lib/course-pipeline/contract").RepairOperation & {
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
        fields: toFirestoreFields({
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
        fields: toFirestoreFields({ isPublic: false }),
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
  expectedModesByLessonId: Readonly<Record<string, import("@/lib/course-types").LessonMode | undefined>> = {},
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
        value: toFirestoreValue(courseId),
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
                value: toFirestoreValue(notePrefix),
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "key" },
                op: "LESS_THAN_OR_EQUAL",
                value: toFirestoreValue(`${notePrefix}\uf8ff`),
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
        fields: toFirestoreFields(storedData),
      },
    }];
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
  };
}
