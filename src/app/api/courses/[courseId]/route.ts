import { NextResponse } from "next/server";
import { authorizationResponse, getVerifiedUser, requireAccount, requireAcceptedAccount, requireOwner } from "@/lib/auth-server";
import {
  deleteCourse,
  getCoursePublishReadiness,
  getCourse,
  updateCourseVisibility,
} from "@/lib/firebase-server";
import { expectedLessonIds } from "@/lib/course-progress";
import type { Course } from "@/lib/course-types";
import { toCourseDto } from "@/lib/course-dto";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}
export async function GET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    let canManage = false;
    if (!course.isPublic) {
      const account = await requireAccount(request);
      if (account.uid !== course.authorId && !account.isOwner) {
        return NextResponse.json({ error: "You do not have access to this course." }, { status: 403 });
      }
      canManage = true;
    } else {
      const user = await getVerifiedUser(request);
      canManage = Boolean(user && (user.uid === course.authorId));
    }

    return NextResponse.json(
      toCourseDto(course, canManage),
      { headers: course.isPublic && !canManage
        ? {
            "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
            Vary: "Authorization",
          }
        : { "Cache-Control": "private, no-store" } },
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

    const body = await readJsonBody(request, 2_048) as Record<string, unknown>;
    if (typeof body.isPublic !== "boolean") {
      return NextResponse.json({ error: "Visibility must be true or false." }, { status: 400 });
    }

    if (body.isPublic) {
      const readiness = await getCoursePublishReadiness(
        courseId,
        expectedLessonIds(course as unknown as Course),
      );
      if (!readiness.ready) {
        const qualityMessage = readiness.invalidLessonIds.length > 0
          ? ` ${readiness.invalidLessonIds.length} ${readiness.invalidLessonIds.length === 1 ? "lesson needs" : "lessons need"} regeneration to meet the current teaching standard.`
          : "";
        return NextResponse.json(
          {
            error: `Complete every lesson before publishing. ${readiness.readyCount} of ${readiness.totalCount} lessons are ready.${qualityMessage}`,
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
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course visibility update failed:", error);
    return NextResponse.json({ error: "Visibility could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    assertTrustedMutation(request);
    const account = await requireAcceptedAccount(request);
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }

    await deleteCourse(courseId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course deletion failed:", error);
    return NextResponse.json({ error: "The course could not be deleted." }, { status: 500 });
  }
}
