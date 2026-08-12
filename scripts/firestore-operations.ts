import { createSign } from "node:crypto";

interface FirestoreEnvironment {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  bucket?: string;
}

interface GoogleOperation {
  name: string;
  done?: boolean;
  error?: { message?: string };
  metadata?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>();

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function firestoreEnvironment(options: { requireBucket?: boolean } = {}): FirestoreEnvironment {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const bucket = process.env.FIRESTORE_BACKUP_BUCKET?.trim();
  const missing = [
    ["FIREBASE_PROJECT_ID", projectId],
    ["FIREBASE_CLIENT_EMAIL", clientEmail],
    ["FIREBASE_PRIVATE_KEY", privateKey],
    ...(options.requireBucket === false ? [] : [["FIRESTORE_BACKUP_BUCKET", bucket]]),
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (bucket && !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) {
    throw new Error("FIRESTORE_BACKUP_BUCKET must be a bucket name, not a gs:// URL.");
  }
  return { projectId: projectId!, clientEmail: clientEmail!, privateKey: privateKey!, bucket };
}

async function retryingFetch(url: string, init: RequestInit, attempts = 3) {
  let lastResponse: Response | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      lastResponse = response;
      if (response.ok || (response.status < 500 && response.status !== 408 && response.status !== 429)) return response;
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
  }
  return lastResponse!;
}

export async function accessToken(environment: FirestoreEnvironment) {
  const cacheKey = `${environment.projectId}:${environment.clientEmail}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const now = Math.floor(Date.now() / 1_000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: environment.clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3_600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(environment.privateKey).toString("base64url")}`;
  const response = await retryingFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status}).`);
  const body = await response.json() as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Google authentication did not return an access token.");
  tokenCache.set(cacheKey, {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3_600) * 1_000,
  });
  return body.access_token;
}

async function googleJson<T>(environment: FirestoreEnvironment, url: string, init: RequestInit = {}) {
  const token = await accessToken(environment);
  const response = await retryingFetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google API request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return await response.json() as T;
}

export async function firestoreOperation(
  environment: FirestoreEnvironment,
  action: "exportDocuments" | "importDocuments",
  body: Record<string, unknown>,
) {
  const database = `projects/${environment.projectId}/databases/(default)`;
  return googleJson<GoogleOperation>(environment, `https://firestore.googleapis.com/v1/${database}:${action}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function waitForOperation(
  environment: FirestoreEnvironment,
  operationName: string,
  options: { timeoutMinutes?: number; pollMilliseconds?: number } = {},
) {
  const deadline = Date.now() + Math.max(1, options.timeoutMinutes ?? 180) * 60_000;
  const pollMilliseconds = Math.max(1_000, options.pollMilliseconds ?? 5_000);
  while (Date.now() < deadline) {
    const operation = await googleJson<GoogleOperation>(
      environment,
      `https://firestore.googleapis.com/v1/${operationName}`,
    );
    if (operation.done) {
      if (operation.error) throw new Error(`Firestore operation failed: ${operation.error.message ?? "unknown error"}`);
      return operation;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
  }
  throw new Error(`Firestore operation did not finish within ${options.timeoutMinutes ?? 180} minutes.`);
}

type FirestoreValue = Record<string, unknown>;

function firestoreValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: firestoreFields(value as Record<string, unknown>) } };
  throw new Error(`Unsupported operational evidence value: ${typeof value}`);
}

function firestoreFields(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, firestoreValue(value)]),
  );
}

export async function putOperationalEvidence(
  environment: FirestoreEnvironment,
  documentId: "firestore-backup-latest" | "firestore-restore-latest" | "alert-test-latest",
  data: Record<string, unknown>,
) {
  const database = `projects/${environment.projectId}/databases/(default)`;
  const url = `https://firestore.googleapis.com/v1/${database}/documents/operationalEvidence/${documentId}`;
  await googleJson(environment, url, {
    method: "PATCH",
    body: JSON.stringify({ fields: firestoreFields(data) }),
  });
}

export function argument(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

export function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown operation failure.";
}
