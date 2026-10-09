import { withAccountRequest, authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { requireSparkLessonAccess, sparkAccessErrorResponse } from "@/lib/spark/access";
import { sparkFeaturePolicy, sparkRuntimeLimits } from "@/lib/spark/config";
import { sparkTurnRequestSchema } from "@/lib/spark/contracts";
import { orchestrateSparkTurn, sparkOrchestrationErrorResponse } from "@/lib/spark/orchestration";
import { requireSparkSession, sparkRepositoryErrorResponse } from "@/lib/spark/repository";
import { safeModelErrorDetails } from "@/lib/model-fallback";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

async function handlePOST(request: Request, { params }: RouteParams) {
  try {
    const account = await requireAcceptedAccount(request);
    const policy = sparkFeaturePolicy();
    if (!policy.liveAiEnabled) {
      return Response.json({
        error: "Spark live tutoring is paused. Your saved lessons and practice are available.",
        code: "SPARK_LIVE_AI_DISABLED",
        availability: "practice_only",
      }, { status: 503 });
    }
    const limited = await enforceDurableRateLimit(
      request,
      "spark-turn",
      sparkRuntimeLimits().turnsPerMinute,
      60_000,
      account.uid,
    );
    if (limited) return limited;
    const parsed = sparkTurnRequestSchema.safeParse(await readJsonBody(request, 10_240));
    if (!parsed.success) return Response.json({ error: "This Spark turn is not valid." }, { status: 400 });
    const { sessionId } = await params;
    const session = await requireSparkSession(account, sessionId);
    const context = await requireSparkLessonAccess(
      account,
      session.courseId,
      session.lessonId,
      parsed.data.lessonVersion,
    );
    const result = await orchestrateSparkTurn({
      request,
      account,
      context,
      session,
      requestId: parsed.data.requestId,
      action: parsed.data.action,
      message: parsed.data.message,
    });
    return Response.json(result.response, {
      headers: {
        "Cache-Control": "private, no-store",
        ...(result.replayed ? { "Idempotent-Replay": "true" } : {}),
        ...(result.validationFallback ? { "Spark-Validation-Fallback": "true" } : {}),
      },
    });
  } catch (error) {
    const known = sparkOrchestrationErrorResponse(error)
      ?? sparkRepositoryErrorResponse(error)
      ?? sparkAccessErrorResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? authorizationResponse(error);
    if (known) return known;
    console.error(JSON.stringify({ event: "spark_turn_failed", ...safeModelErrorDetails(error) }));
    return Response.json({
      error: "Spark could not complete that response. Your saved lessons and practice are available.",
      code: "SPARK_PROVIDER_UNAVAILABLE",
      availability: "practice_only",
    }, { status: 503 });
  }
}

export const POST = withAccountRequest(handlePOST);