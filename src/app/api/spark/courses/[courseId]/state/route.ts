import { withAccountRequest, authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { getAiQuotaSummaries } from "@/lib/ai-usage";
import { getStoredDocument, listAllStoredDocuments } from "@/lib/document-store";
import { publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";
import { readSparkOperationalControl } from "@/lib/spark/budget";
import { sparkAccessErrorResponse, requireSparkLessonAccess } from "@/lib/spark/access";
import { sparkFeaturePolicy } from "@/lib/spark/config";
import { readSparkManifest } from "@/lib/spark/preparation";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

async function handleGET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const account = await requireAcceptedAccount(request);
    const url = new URL(request.url);
    const lessonId = url.searchParams.get("lessonId")?.trim() ?? "";
    const locale = url.searchParams.get("locale")?.trim() || "en";
    if (!/^\d+-\d+$/.test(lessonId) || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) {
      return Response.json({ error: "Choose a valid lesson and locale." }, { status: 400 });
    }
    const context = await requireSparkLessonAccess(account, courseId, lessonId);
    const policy = sparkFeaturePolicy();
    const [manifest, progress, evidence, quotas, operationalControl] = await Promise.all([
      readSparkManifest(context, locale),
      getStoredDocument(`users/${account.uid}/courseProgress/${courseId}`),
      listAllStoredDocuments(`users/${account.uid}/masteryEvidence`, 500),
      getAiQuotaSummaries(account),
      policy.sparkEnabled
        ? readSparkOperationalControl().catch(() => ({ mode: "halted" as const, liveAiEnabled: false, preparationEnabled: false }))
        : Promise.resolve({ mode: "halted" as const, liveAiEnabled: false, preparationEnabled: false }),
    ]);
    const tutorQuota = quotas.find((quota) => quota.feature === "tutor");
    const lessonProgress = progress?.lessons && typeof progress.lessons === "object"
      ? (progress.lessons as Record<string, Record<string, unknown>>)[lessonId]
      : undefined;
    const lessonEvidence = evidence.filter((item) => item.courseId === courseId && item.lessonId === lessonId);
    const availability = !policy.sparkEnabled
      ? "saved_only"
      : policy.liveAiEnabled && operationalControl.liveAiEnabled ? "live" : "practice_only";
    return Response.json({
      featureEnabled: policy.sparkEnabled,
      availability,
      course: { id: courseId, topic: context.course.topic },
      lesson: {
        id: lessonId,
        title: context.summary.title,
        version: context.lessonVersion,
        content: context.lesson.content,
      },
      currentStage: typeof lessonProgress?.status === "string" && lessonProgress.status === "mastered" ? "return" : "define",
      manifest,
      preparation: manifest ? "ready" : "not_prepared",
      evidence: {
        records: lessonEvidence.length,
        demonstrated: lessonEvidence.filter((item) => item.result === "passed" && item.authority === "server-verified").length,
      },
      review: {
        due: typeof lessonProgress?.nextReviewAt === "string" && Date.parse(lessonProgress.nextReviewAt) <= Date.now(),
        nextReviewAt: typeof lessonProgress?.nextReviewAt === "string" ? lessonProgress.nextReviewAt : null,
      },
      entitlement: {
        questionsRemaining: tutorQuota?.remaining ?? null,
        resetAt: tutorQuota?.resetAt ?? null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return sparkAccessErrorResponse(error)
      ?? publishedReleaseUnavailableResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Spark course state is temporarily unavailable." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);