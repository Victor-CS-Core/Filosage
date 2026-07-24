import "server-only";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientKey(request: Request, namespace: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${namespace}:${forwarded || request.headers.get("x-real-ip") || "unknown"}`;
}

export function enforceBestEffortRateLimit(request: Request, namespace: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = clientKey(request, namespace);
  const previous = buckets.get(key);
  const bucket = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + windowMs } : previous;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 5000) {
    for (const [candidate, value] of buckets) if (value.resetAt <= now) buckets.delete(candidate);
  }
  return bucket.count <= limit
    ? null
    : Response.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) } });
}
