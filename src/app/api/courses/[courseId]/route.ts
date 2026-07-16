import { NextResponse } from "next/server";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import {
  deleteCourse,
  getCourse,
  updateCourseVisibility,
} from "@/lib/firebase-server";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}
export async function GET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    if (!course.isPublic) {
      const owner = await requireOwner(request);
      if (owner.uid !== course.authorId) {
        return NextResponse.json({ error: "You do not have access to this course." }, { status: 403 });
      }
    }

    return NextResponse.json(
      { courseId: course.id, ...course },
      course.isPublic
        ? { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
        : undefined,
    );
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course fetch failed:", error);
    return NextResponse.json({ error: "The course is temporarily unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const owner = await requireOwner(request);
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== owner.uid) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }

    const body = await request.json();
    if (typeof body.isPublic !== "boolean") {
      return NextResponse.json({ error: "Visibility must be true or false." }, { status: 400 });
    }

    await updateCourseVisibility(courseId, body.isPublic);

    return NextResponse.json({ success: true, isPublic: body.isPublic });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course visibility update failed:", error);
    return NextResponse.json({ error: "Visibility could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const owner = await requireOwner(request);
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== owner.uid) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }

    await deleteCourse(courseId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course deletion failed:", error);
    return NextResponse.json({ error: "The course could not be deleted." }, { status: 500 });
  }
}
