import { missingRuntimeConfiguration } from "@/lib/runtime-config";

export function GET() {
  const missing = missingRuntimeConfiguration();
  return Response.json({ ok: missing.length === 0, environment: process.env.NODE_ENV, missing }, { status: missing.length ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
