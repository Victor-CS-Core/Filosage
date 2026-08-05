import { z } from "zod";
import { authorizationResponse, requireRecentlyAuthenticatedOwner } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { ContentSafetyError } from "@/lib/content-safety";
import type { Course } from "@/lib/course-types";
import { expectedLessonIds } from "@/lib/course-progress";
import { getCourse, listLessons, publishCourseWithReview } from "@/lib/firebase-server";
import {
  PublicationReviewError,
  reviewCourseForOwnerOverride,
} from "@/lib/publication-review";

const overrideSchema = z.object({
  reason: z.string().trim().min(20).max(500),
  assessmentHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.literal("PUBLISH WITH QUALITY OVERRIDE"),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await context.params;
  try {
    const owner = await requireRecentlyAuthenticatedOwner(request);
    const parsed = overrideSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return Response.json(
        { error: "Provide a 20 to 500 character reason and complete the override confirmation." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const course = await getCourse(courseId) as (Course & Record<string, unknown>) | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (course.isPublic) {
      return Response.json({ error: "This course is already public." }, { status: 409 });
    }
    if (course.moderationStatus === "quarantined") {
      return Response.json(
        { error: "A quarantined course requires safety review and cannot use a quality override." },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const lessonIds = expectedLessonIds(course);
    const lessons = await listLessons(courseId);
    const review = await reviewCourseForOwnerOverride(
      course,
      lessons,
      lessonIds,
      { uid: owner.uid, isOwner: true },
      {
        reason: parsed.data.reason,
        expectedAssessmentHash: parsed.data.assessmentHash,
      },
    );
    await publishCourseWithReview(courseId, lessonIds, review);

    console.info(JSON.stringify({
      event: "course_quality_override_published",
      courseId,
      actorUid: owner.uid,
      assessmentVersion: review.assessment.assessmentVersion,
      issueCount: review.assessment.overridableIssues.length,
      auditEventId: review.ownerOverride?.auditEventId,
    }));
    return Response.json(
      {
        success: true,
        isPublic: true,
        publicationReview: { status: "owner_override" },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    if (error instanceof ContentSafetyError) {
      return Response.json(
        {
          error: "Publication was blocked because the course did not pass the safety review. This cannot be overridden.",
          code: "PUBLICATION_SAFETY_BLOCK",
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (error instanceof PublicationReviewError) {
      return Response.json(
        {
          error: error.message,
          code: "PUBLICATION_OVERRIDE_REJECTED",
          assessmentHash: error.assessmentHash,
          assessment: error.assessment,
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(JSON.stringify({
      event: "course_quality_override_failed",
      courseId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    return Response.json(
      { error: "The publication override could not be completed." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
