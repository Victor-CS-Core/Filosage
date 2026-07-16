import { NextResponse } from "next/server";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { getAdminDb } from "@/lib/firebase-admin";

interface RouteParams {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { courseId, lessonId } = await params;
  try {
    const db = getAdminDb();
    const course = await db.collection("courses").doc(courseId).get();
    if (!course.exists) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    const courseData = course.data()!;
    if (!courseData.isPublic) {
      const owner = await requireOwner(request);
      if (owner.uid !== courseData.authorId) {
        return NextResponse.json({ error: "You do not have access to this lesson." }, { status: 403 });
      }
    }

    const lesson = await course.ref.collection("lessons").doc(lessonId).get();
    if (!lesson.exists) {
      return NextResponse.json({ error: "This lesson has not been published yet." }, { status: 404 });
    }

    return NextResponse.json(
      lesson.data(),
      courseData.isPublic
        ? { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" } }
        : undefined,
    );
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Lesson fetch failed:", error);
    return NextResponse.json({ error: "The lesson is temporarily unavailable." }, { status: 500 });
  }
}
