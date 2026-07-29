import { NextResponse } from "next/server";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { getCourse, getLesson } from "@/lib/firebase-server";
import { toLessonDto } from "@/lib/course-dto";

interface RouteParams {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { courseId, lessonId } = await params;
  try {
    const account = await requireAcceptedAccount(request);
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    if (!course.isPublic) {
      if (account.uid !== course.authorId && !account.isOwner) {
        return NextResponse.json({ error: "You do not have access to this lesson." }, { status: 403 });
      }
    }

    const lesson = await getLesson(courseId, lessonId);
    if (!lesson) {
      return NextResponse.json({ error: "This lesson has not been published yet." }, { status: 404 });
    }

    return NextResponse.json(
      toLessonDto(
        lesson,
        course.aiAssisted === true || !String(course.id ?? "").startsWith("catalog-"),
        String(course.topic ?? ""),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Lesson fetch failed:", error);
    return NextResponse.json({ error: "The lesson is temporarily unavailable." }, { status: 500 });
  }
}
