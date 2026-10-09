import { withAccountRequest, authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { requireSparkLessonAccess, sparkAccessErrorResponse } from "@/lib/spark/access";
import { sparkFeaturePolicy } from "@/lib/spark/config";
import { sparkAttemptRequestSchema } from "@/lib/spark/contracts";
import { assessSparkAttempt } from "@/lib/spark/assessment";
import { commitSparkAttempt, requireSparkSession, sparkRepositoryErrorResponse } from "@/lib/spark/repository";

interface RouteParams {
  params: Promise<{ attemptId: string }>;
}

async function handlePOST(request: Request, { params }: RouteParams) {
  try {
    const account = await requireAcceptedAccount(request);
    if (!sparkFeaturePolicy().sparkEnabled) {
      return Response.json({ error: "Spark is not enabled.", code: "SPARK_DISABLED" }, { status: 503 });
    }
    const limited = await enforceDurableRateLimit(request, "spark-revision", 60, 60_000, account.uid);
    if (limited) return limited;
    const parsed = sparkAttemptRequestSchema.safeParse(await readJsonBody(request, 16_384));
    const { attemptId } = await params;
    if (!parsed.success || !/^attempt-[a-f0-9]{24}$/.test(attemptId)) {
      return Response.json({ error: "This Spark revision is not valid." }, { status: 400 });
    }
    const session = await requireSparkSession(account, parsed.data.sessionId);
    const context = await requireSparkLessonAccess(account, session.courseId, session.lessonId, parsed.data.lessonVersion);
    const result = await commitSparkAttempt({ account, request: parsed.data, revisesAttemptId: attemptId });
    let assessment: Record<string, unknown> | null = null;
    let assessmentStatus: "not_required" | "completed" | "pending" = "not_required";
    if (result.grade.gradingMethod === "pending_ai") {
      assessmentStatus = "pending";
      if (sparkFeaturePolicy().liveAiEnabled) {
        try {
          assessment = await assessSparkAttempt({ request, account, context, session, attempt: result.attempt });
          assessmentStatus = "completed";
        } catch {
          assessmentStatus = "pending";
        }
      }
    }
    return Response.json({ ...result, assessment, assessmentStatus }, {
      status: result.recovered ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return sparkRepositoryErrorResponse(error)
      ?? sparkAccessErrorResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "This Spark revision could not be saved." }, { status: 500 });
  }
}

export const POST = withAccountRequest(handlePOST);