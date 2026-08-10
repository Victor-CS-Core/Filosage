import { NextResponse } from "next/server";
import { aiClient } from "@/lib/local-ai";
import { authorizationResponse, requirePlanCapability } from "@/lib/auth-server";
import {
  claimCourseBannerRegeneration,
  CourseBannerRegenerationError,
  finishCourseBannerRegeneration,
  getCourse,
  releaseCourseBannerRegeneration,
} from "@/lib/firebase-server";
import {
  AiQuotaError,
  aiQuotaResponse,
  finalizeAiUsage,
  openAiSafetyIdentifier,
  reserveAiUsage,
  type AiReservation,
  getAiQuotaSummaries,
} from "@/lib/ai-usage";
import { createOrReuseCourseBanner } from "@/lib/course-banners";
import { toCourseDto } from "@/lib/course-dto";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  const claimId = crypto.randomUUID();
  let claimed = false;
  let reservation: AiReservation | null = null;

  try {
    assertTrustedMutation(request);
    const account = await requirePlanCapability(request, "generate_course_banner");
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }

    await claimCourseBannerRegeneration(courseId, account.uid, account.isOwner, claimId);
    claimed = true;
    reservation = await reserveAiUsage(account, "course_banner", request.headers.get("idempotency-key"));

    const result = await createOrReuseCourseBanner(aiClient(), {
      topic: String(course.topic ?? ""),
      category: typeof course.category === "string" ? course.category : undefined,
      safetyIdentifier: await openAiSafetyIdentifier(account.uid),
      variant: 1,
    });
    if (!result) {
      throw new Error("A new banner could not be generated.");
    }

    const banner = {
      ...result.banner,
      generatedAt: result.banner.generatedAt ?? new Date().toISOString(),
    };
    await finalizeAiUsage(reservation, {
      usageSamples: [{
        model: result.model,
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        fixedCostMicros: result.generated ? result.costMicros : 0,
      }],
      resultId: courseId,
    });
    reservation = null;
    await finishCourseBannerRegeneration(courseId, claimId, banner);
    claimed = false;

    const updatedCourse = await getCourse(courseId);
    const canGenerateBanner = account.isOwner || (await getAiQuotaSummaries(account))
      .some((quota) => quota.feature === "course_banner" && quota.remaining !== 0);
    return NextResponse.json(
      toCourseDto(updatedCourse ?? { ...course, banner, bannerRegenerationCount: Number(course.bannerRegenerationCount ?? 0) + 1 }, true, canGenerateBanner),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    if (reservation) {
      await finalizeAiUsage(reservation, { failed: true }).catch((usageError) => {
        console.error("Failed course banner usage finalization failed:", usageError);
      });
    }
    if (claimed) {
      await releaseCourseBannerRegeneration(courseId, claimId).catch(() => undefined);
    }
    if (error instanceof CourseBannerRegenerationError) {
      const status = error.code === "NOT_FOUND"
        ? 404
        : error.code === "NOT_OWNED"
          ? 403
          : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof AiQuotaError) {
      const quotaResponse = aiQuotaResponse(error);
      if (quotaResponse) return quotaResponse;
    }
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course banner regeneration failed:", error);
    return NextResponse.json(
      { error: "A new banner could not be generated. The current cover is still in place." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
