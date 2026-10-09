import { withAccountRequest, authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { requireSparkLessonAccess, sparkAccessErrorResponse } from "@/lib/spark/access";
import { sparkFeaturePolicy } from "@/lib/spark/config";
import { sparkSessionRequestSchema } from "@/lib/spark/contracts";
import { prepareSparkLesson, readSparkManifest } from "@/lib/spark/preparation";
import { createOrResumeSparkSession, sparkRepositoryErrorResponse } from "@/lib/spark/repository";

async function handlePOST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    if (!sparkFeaturePolicy().sparkEnabled) {
      return Response.json({ error: "Spark is not enabled.", code: "SPARK_DISABLED" }, { status: 503 });
    }
    const limited = await enforceDurableRateLimit(request, "spark-session", 30, 60_000, account.uid);
    if (limited) return limited;
    const parsed = sparkSessionRequestSchema.safeParse(await readJsonBody(request, 8_192));
    if (!parsed.success) return Response.json({ error: "This Spark session request is not valid." }, { status: 400 });
    const context = await requireSparkLessonAccess(
      account,
      parsed.data.courseId,
      parsed.data.lessonId,
      parsed.data.lessonVersion,
    );
    let manifest = await readSparkManifest(context, parsed.data.locale);
    if (!manifest && sparkFeaturePolicy().prepareEnabled
      && (context.course.authorId === account.uid || account.isOwner)) {
      manifest = (await prepareSparkLesson(account, context.courseId, context.lessonId, parsed.data.locale)).manifest;
    }
    if (!manifest) {
      return Response.json({
        error: "Spark preparation is not ready. The saved lesson remains available.",
        code: "SPARK_PREPARATION_REQUIRED",
        availability: "saved_only",
      }, { status: 503 });
    }
    const result = await createOrResumeSparkSession(account, context, manifest, parsed.data.locale);
    return Response.json({ ...result, manifest }, {
      status: result.resumed ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return sparkRepositoryErrorResponse(error)
      ?? sparkAccessErrorResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? publishedReleaseUnavailableResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Spark could not start this session." }, { status: 500 });
  }
}

export const POST = withAccountRequest(handlePOST);