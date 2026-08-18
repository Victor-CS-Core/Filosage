import { NextResponse } from "next/server";
import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { getStoredDocument, listOwnerCourses, listPublicCourses } from "@/lib/firebase-server";
import { toCourseDto } from "@/lib/course-dto";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";
import { courseAuthorIdsForAccount } from "@/lib/course-owner-identity";
import { configuredFlagshipCourseId } from "@/lib/marketing-merchandising";
import { serverEnvironment } from "@/lib/runtime-environment";

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
      const publicCourses = releaseCourses
        .filter((course): course is NonNullable<typeof course> => Boolean(course))
        .map((course) => toCourseDto(course));
      const featuredCourseId = configuredFlagshipCourseId(
        publicCourses,
        serverEnvironment.LANDING_FEATURED_COURSE_ID?.trim(),
      );
      return NextResponse.json(
        { courses: publicCourses, ...(featuredCourseId ? { featuredCourseId } : {}) },
        { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
      );
    }

    if (scope !== "mine") {
      return NextResponse.json({ error: "Unknown course scope." }, { status: 400 });
    }

    const account = await requireAccount(request);
    const courseGroups = await Promise.all(
      courseAuthorIdsForAccount(account).map((authorId) => listOwnerCourses(authorId)),
    );
    const courses = [...new Map(
      courseGroups.flat().map((course) => [course.id, course] as const),
    ).values()].sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
    return NextResponse.json({ courses: courses.map((course) => toCourseDto(course, true)) });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error(JSON.stringify({ event: "course_listing_failed", ...safeModelErrorDetails(error) }));
    return NextResponse.json({ error: "Courses are temporarily unavailable." }, { status: 500 });
  }
}
