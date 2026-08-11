export interface ActivityReceiptClaims {
  version: 2;
  uid: string;
  courseId: string;
  lessonId: string;
  quizIndex: number;
  artifactHash: string;
  attempts: number;
  firstAttemptCorrect: boolean;
  issuedAt: number;
}

const MAX_RECEIPT_AGE_MS = 24 * 60 * 60 * 1_000;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function activityDocumentId(courseId: string, lessonId: string, quizIndex: number, artifactHash: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${courseId}:${lessonId}:${quizIndex}:${artifactHash}`),
  );
  return base64Url(new Uint8Array(digest));
}

export async function signActivityReceipt(secret: string, claims: ActivityReceiptClaims) {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function validateActivityReceipt(
  secret: string,
  receipt: string,
  expected: Pick<ActivityReceiptClaims, "uid" | "courseId" | "lessonId" | "quizIndex" | "artifactHash">,
  now = Date.now(),
) {
  const [payload, signature, extra] = receipt.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const signatureBytes = decodeBase64Url(signature);
    if (base64Url(signatureBytes) !== signature) return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      signatureBytes,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as ActivityReceiptClaims;
    if (
      claims.version !== 2
      || claims.uid !== expected.uid
      || claims.courseId !== expected.courseId
      || claims.lessonId !== expected.lessonId
      || claims.quizIndex !== expected.quizIndex
      || claims.artifactHash !== expected.artifactHash
      || !Number.isInteger(claims.attempts)
      || claims.attempts < 1
      || typeof claims.firstAttemptCorrect !== "boolean"
      || !Number.isFinite(claims.issuedAt)
      || claims.issuedAt > now + 60_000
      || now - claims.issuedAt > MAX_RECEIPT_AGE_MS
    ) return null;
    return claims;
  } catch {
    return null;
  }
}
