import "server-only";

import { runStoredDocumentTransaction } from "@/lib/document-store";
import { serverEnvironment } from "@/lib/runtime-environment";

interface RateLimitBucket extends Record<string, unknown> {
  count: number;
  resetAt: number;
}

const GLOBAL_MULTIPLIER = 40;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function requestIdentity(
  request: Request,
  callerKey?: string,
  callerScope: "account" | "identity" = "account",
) {
  if (callerKey) return `${callerScope}:${callerKey}`;
  // Azure ingress has not been proven to strip/replace a client-address header
  // on every path to this app. Neither a Cloudflare-named header nor XFF proves
  // that boundary. Keep anonymous production requests in a conservative shared
  // bucket until a separately verified ingress adapter can supply identity.
  // x-real-ip is only a local test/reverse-proxy convenience.
  const platformIp = serverEnvironment.NODE_ENV === "production"
    ? null : request.headers.get("x-real-ip");
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
  callerKey?: string,
  callerScope: "account" | "identity" = "account",
) {
  try {
    const now = Date.now();
    const identity = requestIdentity(request, callerKey, callerScope);
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
        const resetAt = callerLimited && globalLimited
          ? Math.max(callerBucket.resetAt, globalBucket.resetAt)
          : callerLimited ? callerBucket.resetAt : globalBucket.resetAt;
        // Reserve capacity only for admitted work. Rejected retries must not
        // consume other accounts' global allowance or extend either window.
        if (globalLimited || callerLimited) {
          return { writes: [], result: { limited: true, resetAt } };
        }
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
                scope: callerKey ? callerScope : "client",
                ...callerBucket,
                expiresAt,
                updatedAt: new Date(now).toISOString(),
              },
            },
          ],
          result: { limited: false, resetAt },
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
