import { createSign } from "node:crypto";

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

export function firestoreEnvironment() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const bucket = process.env.FIRESTORE_BACKUP_BUCKET?.trim();
  const missing = [
    ["FIREBASE_PROJECT_ID", projectId],
    ["FIREBASE_CLIENT_EMAIL", clientEmail],
    ["FIREBASE_PRIVATE_KEY", privateKey],
    ["FIRESTORE_BACKUP_BUCKET", bucket],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) {
    throw new Error("FIRESTORE_BACKUP_BUCKET must be a bucket name, not a gs:// URL.");
  }
  return { projectId, clientEmail, privateKey, bucket };
}

export async function accessToken(environment) {
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
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status}).`);
  const body = await response.json();
  if (!body.access_token) throw new Error("Google authentication did not return an access token.");
  return body.access_token;
}

export async function firestoreOperation(environment, action, body) {
  const token = await accessToken(environment);
  const database = `projects/${environment.projectId}/databases/(default)`;
  const response = await fetch(`https://firestore.googleapis.com/v1/${database}:${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore ${action} failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return { operation: await response.json(), token };
}

export async function waitForOperation(operationName, token) {
  for (;;) {
    const response = await fetch(`https://firestore.googleapis.com/v1/${operationName}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Operation status check failed (${response.status}).`);
    const operation = await response.json();
    if (operation.done) {
      if (operation.error) throw new Error(`Firestore operation failed: ${operation.error.message ?? "unknown error"}`);
      return operation;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

export function hasFlag(name) {
  return process.argv.includes(name);
}

export function argument(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
