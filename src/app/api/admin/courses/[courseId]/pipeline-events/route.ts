import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { listStoredDocumentsByField } from "@/lib/document-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await context.params;
  try {
    await requireOwner(request);
    const events = await listStoredDocumentsByField("coursePipelineEvents", "courseId", courseId, 200);
    events.sort((left, right) => String(left.recordedAt ?? "").localeCompare(String(right.recordedAt ?? "")));
    return Response.json(
      { courseId, events },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({
      event: "course_pipeline_timeline_failed",
      courseId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    return Response.json(
      { error: "The course pipeline timeline is temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
