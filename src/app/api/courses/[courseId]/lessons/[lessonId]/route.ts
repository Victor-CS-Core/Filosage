import { withAccountRequest } from "@/lib/auth-server";
import { NextResponse } from "next/server";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { getCourse } from "@/lib/document-store";
import { toLessonDto } from "@/lib/course-dto";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import { getLessonRuntimeArtifact, publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";
import type { Course } from "@/lib/course-types";

interface RouteParams {
  params: Promise<{ courseId: string; lessonId: string }>;
}

async function handleGET(request: Request, { params }: RouteParams) {
  const { courseId, lessonId } = await params;
  try {
    const account = await requireAcceptedAccount(request);
    const course = await getCourse(courseId) as (Course & Record<string, unknown>) | null;
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    if (!course.isPublic) {
      if (account.uid !== course.authorId && !account.isOwner) {
        return NextResponse.json({ error: "You do not have access to this lesson." }, { status: 403 });
      }
    }

    const lesson = await getLessonRuntimeArtifact(courseId, lessonId, course);
    if (!lesson) {
      return NextResponse.json({ error: "This lesson has not been published yet." }, { status: 404 });
    }

    return NextResponse.json(
      toLessonDto(
        lesson as unknown as Record<string, unknown>,
        course.aiAssisted === true || !String(course.id ?? "").startsWith("catalog-"),
        String(course.topic ?? ""),
        String(course.language ?? "English"),
        course,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    console.error(JSON.stringify({ event: "lesson_fetch_failed", courseId, lessonId, ...safeModelErrorDetails(error) }));
    return NextResponse.json({ error: "The lesson is temporarily unavailable." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);
