import "server-only";

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

interface FirestoreValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

export interface StoredDocument extends Record<string, unknown> {
  id: string;
  authorId?: string;
  isPublic?: boolean;
  topic?: string;
}

interface TransactionStart {
  transaction: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

let accessToken: { value: string; expiresAt: number } | null = null;
let accessTokenRequest: Promise<string> | null = null;

function requiredEnvironment() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

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

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
  }
  throw new Error(`Unsupported Firestore value: ${typeof value}`);
}

function toFirestoreFields(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)]),
  );
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  }
  if (value.mapValue !== undefined) return fromFirestoreFields(value.mapValue.fields ?? {});
  return null;
}

function fromFirestoreFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]),
  );
}

function parseDocument(document: FirestoreDocument): StoredDocument {
  const id = document.name.split("/").pop() ?? "";
  const fields = fromFirestoreFields(document.fields ?? {});
  if (typeof fields.authorName === "string" && (fields.authorName.includes("@") || fields.authorName === "Teach")) {
    fields.authorName = "Erudoza";
  }
  return { id, ...fields };
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
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
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

  return {
    uid: user.localId,
    email: user.email,
    email_verified: user.emailVerified === true,
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

export async function createCourse(data: Record<string, unknown>) {
  const now = new Date();
  const document = await firestoreJson<FirestoreDocument>("/documents/courses", {
    method: "POST",
    body: JSON.stringify({
      fields: toFirestoreFields({ ...data, createdAt: now, updatedAt: now }),
    }),
  });
  if (!document) throw new Error("Firestore did not return the new course.");
  return parseDocument(document);
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

export async function listStoredDocuments(path: string, pageSize = 100) {
  const response = await firestoreJson<{ documents?: FirestoreDocument[] }>(
    `/documents/${encodeDocumentPath(path)}?pageSize=${Math.min(Math.max(pageSize, 1), 300)}`,
  );
  return (response?.documents ?? []).map(parseDocument);
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
    limit: Math.min(Math.max(limit, 1), 1_000),
  });
}

export function listCollectionDocuments(collectionId: string, limit = 1_000) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(collectionId)) {
    throw new Error("Invalid Firestore collection.");
  }
  return runCourseQuery({
    from: [{ collectionId }],
    limit: Math.min(Math.max(limit, 1), 2_000),
  });
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

export async function getCoursePublishReadiness(
  courseId: string,
  expectedLessonIds: string[],
) {
  const lessons = await listLessons(courseId);
  const generatedIds = new Set(lessons.map((lesson) => String(lesson.id ?? "")));
  const missingLessonIds = expectedLessonIds.filter((lessonId) => !generatedIds.has(lessonId));
  return {
    ready: missingLessonIds.length === 0,
    readyCount: expectedLessonIds.length - missingLessonIds.length,
    totalCount: expectedLessonIds.length,
    missingLessonIds,
  };
}

export async function deleteCourse(courseId: string) {
  const lessons = await listLessons(courseId);
  await commitWrites([
    ...lessons.map((lesson) => ({
      delete: fullDocumentName(`courses/${courseId}/lessons/${lesson.id}`),
    })),
    { delete: fullDocumentName(`courses/${courseId}`) },
  ]);
}
