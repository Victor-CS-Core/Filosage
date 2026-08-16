import { authorizationResponse, requireAcceptedAccount, requirePlanCapability } from "@/lib/auth-server";
import { assertTrustedMutation } from "@/lib/api-security";
import { publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";
import { buildEvidenceReport, evidenceReportHasMeaningfulEvidence } from "@/lib/evidence-report";
import { createEvidenceShare, listEvidenceShares, revokeEvidenceShare } from "@/lib/evidence-shares";
import { safeModelErrorDetails } from "@/lib/model-fallback";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

function validCourseId(courseId: string) {
  return Boolean(courseId) && courseId.length <= 200;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const account = await requireAcceptedAccount(request);
    if (!validCourseId(courseId)) return Response.json({ error: "Choose a valid course." }, { status: 400 });
    const shares = await listEvidenceShares(account.uid, courseId);
    return Response.json({ shares }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return authorizationResponse(error)
      ?? Response.json({ error: "Evidence-share links could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    assertTrustedMutation(request);
    const account = await requirePlanCapability(request, "share_evidence_report");
    if (!validCourseId(courseId)) return Response.json({ error: "Choose a valid course." }, { status: 400 });
    const result = await buildEvidenceReport(account.uid, courseId, { includeAdvancedCapstoneAnalysis: true });
    if (!result || (!result.course.isPublic && result.course.authorId !== account.uid && !account.isOwner)) {
      return Response.json({ error: "Report unavailable." }, { status: 404 });
    }
    if (!evidenceReportHasMeaningfulEvidence(result.report)) {
      return Response.json({ error: "Complete a lesson or assessment before creating a professional evidence link." }, { status: 409 });
    }
    const share = await createEvidenceShare(account.uid, courseId, result.report);
    return Response.json({ share }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const releaseResponse = publishedReleaseUnavailableResponse(error);
    if (releaseResponse) return releaseResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({ event: "evidence_share_creation_failed", ...safeModelErrorDetails(error) }));
    return Response.json({ error: "The evidence-share link could not be created." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    assertTrustedMutation(request);
    const account = await requireAcceptedAccount(request);
    if (!validCourseId(courseId)) return Response.json({ error: "Choose a valid course." }, { status: 400 });
    const shareId = new URL(request.url).searchParams.get("shareId")?.trim() ?? "";
    const shares = await listEvidenceShares(account.uid, courseId);
    if (!shares.some((share) => share.id === shareId)) {
      return Response.json({ error: "Share link unavailable." }, { status: 404 });
    }
    const revoked = await revokeEvidenceShare(account.uid, shareId);
    return revoked
      ? Response.json({ revoked: true }, { headers: { "Cache-Control": "private, no-store" } })
      : Response.json({ error: "Share link unavailable." }, { status: 404 });
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({ event: "evidence_share_revocation_failed", ...safeModelErrorDetails(error) }));
    return Response.json({ error: "The evidence-share link could not be revoked." }, { status: 500 });
  }
}
