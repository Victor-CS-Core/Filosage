import "server-only";

import { runStoredDocumentTransaction } from "@/lib/firebase-server";
import { serverEnvironment } from "@/lib/runtime-environment";

interface RateLimitBucket extends Record<string, unknown> {
  count: number;
  resetAt: number;
}

const GLOBAL_MULTIPLIER = 40;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function requestIdentity(request: Request, accountUid?: string) {
  if (accountUid) return `account:${accountUid}`;
  // The runtime proxy owns forwarded client-address headers. Never trust
  // caller-controlled forwarding headers in production. x-real-ip remains a
  // local/reverse-proxy convenience outside production only.
  const platformIp = request.headers.get("cf-connecting-ip")
    ?? (serverEnvironment.NODE_ENV === "production" ? null : request.headers.get("x-real-ip"));
  return platformIp ? `ip:${platformIp}` : "unattributed";
}

async function opaqueDocumentId(value: string) {
  const secret = serverEnvironment.ACTIVITY_RECEIPT_SECRET?.trim()
    || "filosage-local-durable-rate-limit";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  ));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nextBucket(
  previous: Record<string, unknown> | null,
  now: number,
  windowMs: number,
): RateLimitBucket {
  const previousReset = numberValue(previous?.resetAt);
  if (!previous || previousReset <= now) return { count: 1, resetAt: now + windowMs };
  return {
    count: Math.min(Number.MAX_SAFE_INTEGER, numberValue(previous.count) + 1),
    resetAt: previousReset,
  };
}

export async function enforceDurableRateLimit(
  request: Request,
  namespace: string,
  limit: number,
  windowMs = 60_000,
  accountUid?: string,
) {
  try {
    const now = Date.now();
    const identity = requestIdentity(request, accountUid);
    const [globalId, callerId] = await Promise.all([
      opaqueDocumentId(`global:${namespace}`),
      opaqueDocumentId(`caller:${namespace}:${identity}`),
    ]);
    const globalPath = `systemRateLimits/global-${globalId}`;
    const callerPath = `systemRateLimits/caller-${callerId}`;
    const outcome = await runStoredDocumentTransaction(
      [globalPath, callerPath],
      (documents) => {
        const globalBucket = nextBucket(documents[globalPath], now, windowMs);
        const callerBucket = nextBucket(documents[callerPath], now, windowMs);
        const globalLimited = globalBucket.count > limit * GLOBAL_MULTIPLIER;
        const callerLimited = callerBucket.count > limit;
        const resetAt = callerLimited ? callerBucket.resetAt : globalBucket.resetAt;
        const expiresAt = new Date(Math.max(globalBucket.resetAt, callerBucket.resetAt) + windowMs).toISOString();
        return {
          writes: [
            {
              path: globalPath,
              data: {
                namespace,
                scope: "global",
                ...globalBucket,
                expiresAt,
                updatedAt: new Date(now).toISOString(),
              },
            },
            {
              path: callerPath,
              data: {
                namespace,
                scope: accountUid ? "account" : "client",
                ...callerBucket,
                expiresAt,
                updatedAt: new Date(now).toISOString(),
              },
            },
          ],
          result: { limited: globalLimited || callerLimited, resetAt },
        };
      },
    );
    if (!outcome.limited) return null;
    return Response.json(
      { error: "Too many requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.max(1, Math.ceil((outcome.resetAt - now) / 1_000))),
        },
      },
    );
  } catch (error) {
    console.error("Durable request limiter failed:", namespace, error instanceof Error ? error.name : "UnknownError");
    // A failed limiter must not turn an expensive or state-changing endpoint
    // into an unbounded path.
    return Response.json(
      { error: "Request protection is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}
