import { missingRuntimeConfiguration } from "@/lib/runtime-config";

export function GET() {
  const missing = missingRuntimeConfiguration();
  const version = (
    process.env.SITE_VERSION
    || process.env.CF_PAGES_COMMIT_SHA
    || process.env.GITHUB_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || ""
  ).trim().slice(0, 40) || null;
  // Configuration names are operational detail: log them for the operator
  // instead of listing them in the public response.
  if (missing.length) console.error("Runtime configuration incomplete:", missing.join(", "));
  return Response.json(
    { ok: missing.length === 0, version },
    {
      status: missing.length ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
        ...(version ? { "X-Erudoza-Version": version } : {}),
      },
    },
  );
}
