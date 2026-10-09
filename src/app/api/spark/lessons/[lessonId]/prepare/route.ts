import { withAccountRequest, authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { sparkAccessErrorResponse } from "@/lib/spark/access";
import { sparkFeaturePolicy } from "@/lib/spark/config";
import { sparkPrepareRequestSchema } from "@/lib/spark/contracts";
import { prepareSparkLesson } from "@/lib/spark/preparation";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

async function handlePOST(request: Request, { params }: RouteParams) {
  try {
    const account = await requireAcceptedAccount(request);
    if (!sparkFeaturePolicy().prepareEnabled) {
      return Response.json({ error: "Spark preparation is paused.", code: "SPARK_PREPARATION_DISABLED" }, { status: 503 });
    }
    const limited = await enforceDurableRateLimit(request, "spark-prepare", 12, 60_000, account.uid);
    if (limited) return limited;
    const parsed = sparkPrepareRequestSchema.safeParse(await readJsonBody(request, 8_192));
    const { lessonId } = await params;
    if (!parsed.success || parsed.data.lessonId !== lessonId) {
      return Response.json({ error: "This preparation request is not valid." }, { status: 400 });
    }
    const result = await prepareSparkLesson(account, parsed.data.courseId, lessonId, parsed.data.locale);
    return Response.json(result, {
      status: result.prepared ? 201 : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SPARK_PREPARATION_FORBIDDEN") {
      return Response.json({ error: "Only the course creator can prepare this lesson." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "SPARK_PREPARATION_DISABLED") {
      return Response.json({ error: "Spark preparation is paused.", code: "SPARK_PREPARATION_DISABLED" }, { status: 503 });
    }
    return sparkAccessErrorResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Spark preparation could not be completed." }, { status: 500 });
  }
}

export const POST = withAccountRequest(handlePOST);