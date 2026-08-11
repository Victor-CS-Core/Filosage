import { NextResponse } from "next/server";
import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { getStoredDocument, listOwnerCourses, listPublicCourses } from "@/lib/firebase-server";
import { toCourseDto } from "@/lib/course-dto";
import { planAllows } from "@/lib/membership-plans";
import { getAiQuotaSummaries } from "@/lib/ai-usage";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "public";

  try {
    if (scope === "public") {
      const courses = await listPublicCourses();
      const releaseCourses = await Promise.all(courses.map(async (course) => {
        if (typeof course.publishedReleaseId !== "string") {
          return courseUsesPipelineV2(course) ? null : course;
        }
        const release = await getStoredDocument(`courseReleases/${course.publishedReleaseId}`);
        if (!release?.course || typeof release.course !== "object") return null;
        return {
          ...(release.course as Record<string, unknown>),
          id: course.id,
          isPublic: true,
          publishedAt: release.publishedAt ?? course.publishedAt,
        };
      }));
      return NextResponse.json(
        { courses: releaseCourses.filter((course): course is NonNullable<typeof course> => Boolean(course)).map((course) => toCourseDto(course)) },
        { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
      );
    }

    if (scope !== "mine") {
      return NextResponse.json({ error: "Unknown course scope." }, { status: 400 });
    }

    const account = await requireAccount(request);
    const courses = await listOwnerCourses(account.uid);
    const canGenerateBanner = account.isOwner || (planAllows(account.plan, "generate_course_banner")
      && (await getAiQuotaSummaries(account)).some((quota) => quota.feature === "course_banner" && quota.remaining !== 0));
    return NextResponse.json({ courses: courses.map((course) => toCourseDto(course, true, canGenerateBanner)) });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({ event: "course_listing_failed", ...safeModelErrorDetails(error) }));
    return NextResponse.json({ error: "Courses are temporarily unavailable." }, { status: 500 });
  }
}
