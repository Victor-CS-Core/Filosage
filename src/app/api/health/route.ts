import { missingRuntimeConfiguration } from "@/lib/runtime-config";

export function GET() {
  const missing = missingRuntimeConfiguration();
  // Configuration names are operational detail: log them for the operator
  // instead of listing them in the public response.
  if (missing.length) console.error("Runtime configuration incomplete:", missing.join(", "));
  return Response.json(
    { ok: missing.length === 0 },
    { status: missing.length ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
