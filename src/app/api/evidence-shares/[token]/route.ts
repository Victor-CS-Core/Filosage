import { readEvidenceShare } from "@/lib/evidence-shares";
import { safeModelErrorDetails } from "@/lib/model-fallback";

interface RouteParams {
  params: Promise<{ token: string }>;
}

const PUBLIC_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;
  try {
    const report = await readEvidenceShare(token);
    return report
      ? Response.json({ available: true, report }, { headers: PUBLIC_HEADERS })
      : Response.json({ available: false, report: null }, { status: 404, headers: PUBLIC_HEADERS });
  } catch (error) {
    console.error(JSON.stringify({ event: "public_evidence_share_failed", ...safeModelErrorDetails(error) }));
    return Response.json({ available: false, report: null }, { status: 404, headers: PUBLIC_HEADERS });
  }
}
