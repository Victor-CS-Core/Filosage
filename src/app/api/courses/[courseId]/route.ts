import { NextResponse } from "next/server";
import { authorizationResponse, getVerifiedUser, requireAccount, requireAcceptedAccount, requirePremium } from "@/lib/auth-server";
import {
  deleteCourse,
  getCoursePublishReadiness,
  getCourse,
  listLessons,
  publishCourseWithReview,
  updateCourseVisibility,
} from "@/lib/firebase-server";
import { expectedLessonIds } from "@/lib/course-progress";
import type { Course } from "@/lib/course-types";
import { toCourseDto } from "@/lib/course-dto";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";
import { ContentSafetyError } from "@/lib/content-safety";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import { PublicationReviewError, reviewCourseForPublication } from "@/lib/publication-review";

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
      if (user) {
        const account = await requireAccount(request);
        canManage = account.uid === course.authorId || account.isOwner;
      }
    }

    const manageableCourse = canManage
      ? {
          ...course,
          generatedLessonIds: (await listLessons(courseId)).map((lesson) => String(lesson.id ?? "")),
        }
      : course;
    return NextResponse.json(
      toCourseDto(manageableCourse, canManage),
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
  let visibilityUpdateStage = "authorization";
  try {
    const account = await requirePremium(request);
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }

    const body = await readJsonBody(request, 2_048) as Record<string, unknown>;
    if (typeof body.isPublic !== "boolean") {
      return NextResponse.json({ error: "Visibility must be true or false." }, { status: 400 });
    }

    if (body.isPublic) {
      visibilityUpdateStage = "publication-readiness";
      if (body.attested !== true) {
        return NextResponse.json(
          { error: "Confirm that you reviewed every lesson before publishing." },
          { status: 400 },
        );
      }
      if (course.moderationStatus === "quarantined" && !account.isOwner) {
        return NextResponse.json(
          { error: "This course is quarantined for owner review and cannot be republished yet." },
          { status: 403 },
        );
      }
      const lessonIds = expectedLessonIds(course as unknown as Course);
      const expectedModesByLessonId = Object.fromEntries(
        (course as unknown as Course).modules.flatMap((courseModule, moduleIndex) =>
          courseModule.lessons.map((lesson, lessonIndex) => [`${moduleIndex}-${lessonIndex}`, lesson.lessonMode]),
        ),
      );
      const readiness = await getCoursePublishReadiness(
        courseId,
        lessonIds,
        course.topic ?? "",
        expectedModesByLessonId,
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
      const lessons = await listLessons(courseId);
      visibilityUpdateStage = "publication-review";
      const review = await reviewCourseForPublication(
        course as Course & Record<string, unknown>,
        lessons,
        lessonIds,
        { uid: account.uid, isOwner: account.isOwner },
      );
      visibilityUpdateStage = "publication-transaction";
      await publishCourseWithReview(courseId, lessonIds, review);
    } else {
      visibilityUpdateStage = "visibility-transaction";
      await updateCourseVisibility(courseId, false);
    }

    return NextResponse.json(
      {
        success: true,
        isPublic: body.isPublic,
        publicationReview: body.isPublic ? { status: "approved" } : undefined,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof PublicationReviewError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "PUBLICATION_REVIEW_FAILED",
          invalidLessonIds: error.invalidLessonIds,
          invalidLessons: error.invalidLessons,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error instanceof ContentSafetyError) {
      return NextResponse.json(
        { error: "Publication was blocked because the course did not pass the safety review.", code: "PUBLICATION_SAFETY_BLOCK" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const modelError = safeModelErrorDetails(error);
    if (modelError.status === 429) {
      console.error(JSON.stringify({
        event: "course_publication_safety_rate_limited",
        courseId,
        ...modelError,
      }));
      return NextResponse.json(
        {
          error: "The publication safety review is temporarily busy. Wait one minute, then try again.",
          code: "PUBLICATION_REVIEW_RATE_LIMITED",
          retryAfterSeconds: 60,
        },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
      );
    }
    console.error(JSON.stringify({
      event: "course_visibility_update_failed",
      courseId,
      stage: visibilityUpdateStage,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json(
      { error: "Visibility could not be updated.", code: "VISIBILITY_UPDATE_FAILED" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
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
