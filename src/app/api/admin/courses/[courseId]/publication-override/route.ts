import { PublicationResearchChangedError } from "@/lib/publication-research";
import { withAccountRequest } from "@/lib/auth-server";
import { z } from "zod";
import { authorizationResponse, requireRecentlyAuthenticatedOwner } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { ContentSafetyError } from "@/lib/content-safety";
import type { Course } from "@/lib/course-types";
import { expectedLessonIds } from "@/lib/course-progress";
import { getCourse, listLessons, publishCourseWithReview, updateCoursePipelineStage } from "@/lib/document-store";
import {
  PublicationReviewError,
  reviewCourseForOwnerOverride,
} from "@/lib/publication-review";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";

const overrideSchema = z.object({
  reason: z.string().trim().min(20).max(500),
  assessmentHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.literal("PUBLISH WITH QUALITY OVERRIDE"),
}).strict();

async function handlePOST(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await context.params;
  let v2PublishingStageAdvanced = false;
  let publicationV2Active: boolean | undefined;
  try {
    const owner = await requireRecentlyAuthenticatedOwner(request);
    const flags = coursePipelineFeatureFlags(owner);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    const parsed = overrideSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return Response.json(
        { error: "Provide a 20 to 500 character reason and complete the override confirmation." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const course = await getCourse(courseId) as (Course & Record<string, unknown>) | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    publicationV2Active = flags.publicationV2 && courseUsesPipelineV2(course);
    if (publicationV2Active && (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 200)) {
      return Response.json(
        { error: "Retry-safe publication override requires an idempotency key.", code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (courseUsesPipelineV2(course) && !flags.publicationV2) {
      return Response.json(
        { error: "V2 publication is paused. This draft was preserved and cannot use the legacy override path.", code: "COURSE_PUBLICATION_V2_PAUSED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const priorMutation = course.publicationMutation as { key?: string } | undefined;
    if (course.isPublic && idempotencyKey && priorMutation?.key === idempotencyKey) {
      if (publicationV2Active && course.pipelineStage === "publishing") {
        await updateCoursePipelineStage(courseId, "published");
      }
      return Response.json(
        { success: true, isPublic: true, publicationReview: { status: "owner_override" }, recovered: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (!course.isPublic && idempotencyKey && priorMutation?.key === idempotencyKey) {
      return Response.json(
        { error: "This publication retry was superseded by a later unpublish action.", code: "IDEMPOTENCY_RESULT_SUPERSEDED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (course.isPublic) {
      return Response.json({ error: "This course is already public." }, { status: 409 });
    }
    if (course.moderationStatus === "quarantined") {
      return Response.json(
        { error: "A quarantined course requires safety review and cannot use a quality override." },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (publicationV2Active && course.pipelineStage !== "ready_to_publish" && course.pipelineStage !== "publishing") {
      return Response.json(
        { error: "Validate this exact draft before publishing it.", code: "COURSE_NOT_READY_TO_PUBLISH" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
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
    if (publicationV2Active) {
      if (course.pipelineStage === "ready_to_publish") {
        await updateCoursePipelineStage(courseId, "publishing");
      }
      v2PublishingStageAdvanced = true;
    }
    await publishCourseWithReview(courseId, lessonIds, {
      ...review,
      publicationMutationKey: idempotencyKey,
      publishPipelineStage: publicationV2Active,
    });

    console.info(JSON.stringify({
      event: "course_quality_override_published",
      courseId,
      actorHash: await openAiSafetyIdentifier(owner.uid),
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
    if (v2PublishingStageAdvanced) {
      await updateCoursePipelineStage(courseId, "ready_to_publish").catch(() => undefined);
    }
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
    if (error instanceof PublicationResearchChangedError) {
      return Response.json({ error: "Source evidence changed or expired. Validate the draft to review the required next step.", code: "STALE_PUBLICATION_PROOF" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } });
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
      errorDetails: safeModelErrorDetails(error),
    }));
    return Response.json(
      { error: "The publication override could not be completed." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const POST = withAccountRequest(handlePOST);
