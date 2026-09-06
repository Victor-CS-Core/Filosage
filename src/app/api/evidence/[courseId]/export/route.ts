import { withAccountRequest } from "@/lib/auth-server";
import { authorizationResponse, requirePlanCapability } from "@/lib/auth-server";
import { publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";
import { buildEvidenceReport, renderEvidenceReportHtml } from "@/lib/evidence-report";
import { safeModelErrorDetails } from "@/lib/model-fallback";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

async function handleGET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const account = await requirePlanCapability(request, "export_evidence_report");
    if (!courseId || courseId.length > 200) return Response.json({ error: "Choose a valid course." }, { status: 400 });
    const result = await buildEvidenceReport(account.uid, courseId, { includeAdvancedCapstoneAnalysis: true });
    if (!result) return Response.json({ error: "Report unavailable." }, { status: 404 });
    if (!result.course.isPublic && result.course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "Report unavailable." }, { status: 404 });
    }
    const filename = result.report.course.topic
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "course";
    return new Response(renderEvidenceReportHtml(result.report), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="filosage-${filename}-evidence.html"`,
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const releaseResponse = publishedReleaseUnavailableResponse(error);
    if (releaseResponse) return releaseResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({ event: "evidence_report_export_failed", ...safeModelErrorDetails(error) }));
    return Response.json({ error: "The evidence report could not be prepared." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);
