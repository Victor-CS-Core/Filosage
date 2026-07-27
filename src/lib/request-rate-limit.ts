import "server-only";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Requests without a platform-verified client IP cannot be attributed, so
// header-derived addresses (x-forwarded-for and friends are spoofable when the
// origin is reached directly) share the aggregate namespace cap instead of
// getting a per-caller allowance each.
function clientKey(request: Request, namespace: string) {
  const platformIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
  if (platformIp) return `${namespace}:${platformIp}`;
  return null;
}

function consume(key: string, limit: number, windowMs: number, now: number) {
  const previous = buckets.get(key);
  const bucket = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + windowMs } : previous;
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket;
}

const GLOBAL_MULTIPLIER = 40;

export function enforceBestEffortRateLimit(request: Request, namespace: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [candidate, value] of buckets) if (value.resetAt <= now) buckets.delete(candidate);
  }

  // The aggregate bucket bounds total throughput per namespace even when
  // per-client attribution is spoofed or unavailable.
  const globalBucket = consume(`${namespace}:*`, limit * GLOBAL_MULTIPLIER, windowMs, now);
  const key = clientKey(request, namespace);
  const clientBucket = key ? consume(key, limit, windowMs, now) : null;
  const limited = globalBucket.count > limit * GLOBAL_MULTIPLIER
    || (clientBucket !== null && clientBucket.count > limit);
  if (!limited) return null;

  const resetAt = clientBucket && clientBucket.count > limit ? clientBucket.resetAt : globalBucket.resetAt;
  return Response.json(
    { error: "Too many requests. Please wait a moment and try again." },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(Math.ceil((resetAt - now) / 1000)) } },
  );
}
