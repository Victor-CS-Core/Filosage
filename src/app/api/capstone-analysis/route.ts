import { authorizationResponse, requirePlanCapability } from "@/lib/auth-server";
import { buildAdvancedCapstoneAnalysis } from "@/lib/capstone-analysis";
import { normalizeSuccessCriteria } from "@/lib/course-criteria";
import { getCourseRuntimeArtifact, publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";
import { getStoredDocument } from "@/lib/document-store";
import type { Course } from "@/lib/course-types";
import type { CapstoneAssessment } from "@/lib/learning-types";
import { safeModelErrorDetails } from "@/lib/model-fallback";

export async function GET(request: Request) {
  try {
    const account = await requirePlanCapability(request, "advanced_capstone_analysis");
    const courseId = new URL(request.url).searchParams.get("courseId")?.trim();
    if (!courseId || courseId.length > 200) {
      return Response.json({ error: "Choose a valid course." }, { status: 400 });
    }
    const course = await getCourseRuntimeArtifact(courseId) as Course | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }
    const progress = await getStoredDocument(`users/${account.uid}/courseProgress/${courseId}`);
    const assessment = progress?.capstone && typeof progress.capstone === "object"
      ? progress.capstone as unknown as CapstoneAssessment
      : null;
    return Response.json({
      analysis: assessment
        ? buildAdvancedCapstoneAnalysis(assessment, normalizeSuccessCriteria(course.capstone?.successCriteria))
        : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const releaseResponse = publishedReleaseUnavailableResponse(error);
    if (releaseResponse) return releaseResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({ event: "capstone_analysis_failed", ...safeModelErrorDetails(error) }));
    return Response.json({ error: "Advanced capstone analysis is temporarily unavailable." }, { status: 500 });
  }
}
