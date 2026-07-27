import "server-only";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: 400 | 403 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}

function allowedOrigins(request: Request) {
  const url = new URL(request.url);
  const values = new Set([url.origin]);
  const configured = [process.env.NEXT_PUBLIC_SITE_URL, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")];
  for (const candidate of configured) {
    const value = candidate?.trim();
    if (!value) continue;
    try { values.add(new URL(value).origin); } catch { /* Ignore malformed optional configuration. */ }
  }
  return values;
}

export function assertTrustedMutation(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiRequestError(403, "This request did not originate from Erudoza.");
  }
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins(request).has(origin)) {
    throw new ApiRequestError(403, "This request did not originate from Erudoza.");
  }
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  assertTrustedMutation(request);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiRequestError(415, "Send this request as application/json.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiRequestError(413, "This request is too large.");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ApiRequestError(400, "A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiRequestError(413, "This request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiRequestError(400, "The request body is not valid JSON.");
  }
}

export function apiRequestErrorResponse(error: unknown) {
  if (!(error instanceof ApiRequestError)) return null;
  return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
}
