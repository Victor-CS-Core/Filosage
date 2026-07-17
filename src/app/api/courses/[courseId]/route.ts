import { NextResponse } from "next/server";
import { authorizationResponse, requireAccount, requireOwner } from "@/lib/auth-server";
import {
  deleteCourse,
  getCoursePublishReadiness,
  getCourse,
  updateCourseVisibility,
} from "@/lib/firebase-server";
import { expectedLessonIds } from "@/lib/course-progress";
import type { Course } from "@/lib/course-types";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}
export async function GET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    if (!course.isPublic) {
      const account = await requireAccount(request);
      if (account.uid !== course.authorId && !account.isOwner) {
        return NextResponse.json({ error: "You do not have access to this course." }, { status: 403 });
      }
    }

    return NextResponse.json(
      { courseId: course.id, ...course },
      course.isPublic
        ? { headers: { "Cache-Control": "no-store" } }
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

    if (body.isPublic) {
      const readiness = await getCoursePublishReadiness(
        courseId,
        expectedLessonIds(course as unknown as Course),
      );
      if (!readiness.ready) {
        return NextResponse.json(
          {
            error: `Generate every lesson before publishing. ${readiness.readyCount} of ${readiness.totalCount} lessons are ready.`,
            code: "COURSE_NOT_READY",
            ...readiness,
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    await updateCourseVisibility(courseId, body.isPublic);

    return NextResponse.json(
      { success: true, isPublic: body.isPublic },
      { headers: { "Cache-Control": "no-store" } },
    );
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
    const account = await requireAccount(request);
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
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
