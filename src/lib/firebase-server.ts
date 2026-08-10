import "server-only";

import {
  fromFirestoreFields,
  toFirestoreFields,
  toFirestoreValue,
  fromFirestoreValue,
  type FirestoreDocument,
  type FirestoreValue,
} from "@/lib/firestore-values";
import { isLocalMode, LOCAL_OWNER_EMAIL, LOCAL_OWNER_UID } from "@/lib/local-mode";
import { COURSE_SCOPED_COLLECTION_GROUPS, removeCourseReferences } from "@/lib/course-deletion";
import type { PublicationLessonReview, PublicationOwnerOverride } from "@/lib/publication-review";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { inspectCoursePublishReadiness } from "@/lib/publication-readiness";
import { firebaseAuthenticationClaimsFromIdToken } from "@/lib/recent-auth";
import { serverEnvironment } from "@/lib/runtime-environment";

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  email_verified: boolean;
  auth_time?: number;
  name?: string;
  picture?: string;
}

const LOCAL_PLAYWRIGHT_LEARNERS = new Map<string, { uid: string; email: string }>([
  ["playwright-free-learner", {
    uid: "local-free-learner",
    email: "learner@erudoza.local",
  }],
  ["playwright-free-learner-mobile-chromium", {
    uid: "local-free-learner-mobile-chromium",
    email: "learner-mobile-chromium@erudoza.local",
  }],
  ["playwright-free-learner-mobile-webkit", {
    uid: "local-free-learner-mobile-webkit",
    email: "learner-mobile-webkit@erudoza.local",
  }],
  ["playwright-plus-learner", {
    uid: "local-plus-learner",
    email: "plus-learner@erudoza.local",
  }],
]);

export interface StoredDocument extends Record<string, unknown> {
  id: string;
  authorId?: string;
  isPublic?: boolean;
  topic?: string;
}

interface TransactionStart {
  transaction: string;
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
  const { projectId } = requiredEnvironment();
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

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (isLocalMode()) {
    const auth_time = Math.floor(Date.now() / 1_000);
    if (idToken === "local-dev-token" || idToken === "playwright-local-owner") {
      return {
        uid: LOCAL_OWNER_UID,
        email: serverEnvironment.OWNER_EMAIL?.trim().toLowerCase() || LOCAL_OWNER_EMAIL,
        email_verified: true,
        auth_time,
        name: "Local Owner",
      };
    }
    const playwrightLearner = LOCAL_PLAYWRIGHT_LEARNERS.get(idToken);
    if (playwrightLearner) {
      return {
        ...playwrightLearner,
        email_verified: true,
        auth_time,
        name: "Playwright Learner",
      };
    }
    if (idToken === "playwright-preaccount-learner") {
      return {
        uid: "local-preaccount-learner",
        email: "preaccount@erudoza.local",
        email_verified: true,
        auth_time,
        name: "Pre-account Learner",
      };
    }
    return null;
  }
  const apiKey = serverEnvironment.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("Firebase web authentication is not configured.");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) return null;

  const body = (await response.json()) as {
    users?: Array<{
      localId: string;
      email?: string;
      emailVerified?: boolean;
      displayName?: string;
      photoUrl?: string;
    }>;
  };
  const user = body.users?.[0];
  if (!user) return null;
  const authentication = firebaseAuthenticationClaimsFromIdToken(idToken);
  if (authentication.subject && authentication.subject !== user.localId) return null;

  return {
    uid: user.localId,
    email: user.email,
    email_verified: user.emailVerified === true,
    auth_time: authentication.authTime,
    name: user.displayName,
    picture: user.photoUrl,
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
) {
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const started = await firestoreJson<TransactionStart>("/documents:beginTransaction", {
        method: "POST",
        body: JSON.stringify({ options: { readWrite: {} } }),
      });
      if (!started?.transaction) throw new Error("Firestore did not start a transaction.");

      const documents: Record<string, StoredDocument | null> = {};
      for (const path of paths) {
        const document = await firestoreJson<FirestoreDocument>(
          `/documents/${encodeDocumentPath(path)}?transaction=${encodeURIComponent(started.transaction)}`,
          {},
          true,
        );
        documents[path] = document ? parseDocument(document) : null;
      }

      const next = update(documents);
      await firestoreJson("/documents:commit", {
        method: "POST",
        body: JSON.stringify({
          transaction: started.transaction,
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
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }

  throw lastError;
}

export async function updateCourseVisibility(courseId: string, isPublic: boolean) {
  const lessons = await listLessons(courseId);
  const updatedAt = new Date();
  const writes: Array<Record<string, unknown>> = [
    {
      update: {
        name: fullDocumentName(`courses/${courseId}`),
        fields: toFirestoreFields({ isPublic, updatedAt }),
      },
      updateMask: { fieldPaths: ["isPublic", "updatedAt"] },
    },
    ...lessons.map((lesson) => ({
      update: {
        name: fullDocumentName(`courses/${courseId}/lessons/${lesson.id}`),
        fields: toFirestoreFields({ isPublic }),
      },
      updateMask: { fieldPaths: ["isPublic"] },
    })),
  ];
  await commitWrites(writes);
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
  },
) {
  const coursePath = `courses/${courseId}`;
  const lessonPaths = expectedLessonIds.map((lessonId) => `courses/${courseId}/lessons/${lessonId}`);
  const auditPath = review.ownerOverride
    ? `adminEvents/${review.ownerOverride.auditEventId}`
    : undefined;
  const reviewByLessonId = new Map(review.reviews.map((item) => [item.lessonId, item]));
  await runStoredDocumentTransaction([coursePath, ...lessonPaths, ...(auditPath ? [auditPath] : [])], (documents) => {
    const course = documents[coursePath];
    if (!course) throw new Error("Course not found.");
    if (review.sourceUpdatedAt && course.updatedAt !== review.sourceUpdatedAt) {
      throw new Error("The course changed during publication review. Try publishing again.");
    }
    if (publicationContentFingerprint(course) !== review.sourceFingerprint) {
      throw new Error("The course content changed during publication review. Try publishing again.");
    }
    const now = new Date().toISOString();
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
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
        },
        factualReviewStatus: review.factualReviewStatus,
        publishedAt: now,
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
) {
  const lessons = await listLessons(courseId);
  return inspectCoursePublishReadiness(lessons, expectedLessonIds, topic, expectedModesByLessonId);
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
  };
}
