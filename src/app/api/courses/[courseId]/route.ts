import { NextResponse } from "next/server";
import { authorizationResponse, getVerifiedUser, requireAccount, requireAcceptedAccount } from "@/lib/auth-server";
import {
  deleteCourse,
  getCourse,
  listLessons,
  publishCourseWithReview,
  updateCourseVisibility,
  updateCoursePipelineStage,
} from "@/lib/document-store";
import { expectedLessonIds } from "@/lib/course-progress";
import type { Course } from "@/lib/course-types";
import { toCourseDto } from "@/lib/course-dto";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";
import { ContentSafetyError } from "@/lib/content-safety";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import {
  buildGeneratedCoursePublication,
  PublicationReviewError,
  reviewCourseForPublication,
} from "@/lib/publication-review";
import { planAllows } from "@/lib/membership-plans";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { recordCoursePipelineEvent } from "@/lib/course-pipeline/observability";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";
import { getCourseRuntimeArtifact, publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";

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

    let displayCourse: Course | Record<string, unknown> = course;
    if (course.isPublic && !canManage) {
      displayCourse = await getCourseRuntimeArtifact(courseId) ?? course;
    }
    const manageableCourse = canManage
      ? {
          ...displayCourse,
          generatedLessonIds: (await listLessons(courseId)).map((lesson) => String(lesson.id ?? "")),
        }
      : displayCourse;
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
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    console.error(JSON.stringify({ event: "course_fetch_failed", courseId, ...safeModelErrorDetails(error) }));
    return NextResponse.json({ error: "The course is temporarily unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  let visibilityUpdateStage = "authorization";
  let pipelineCorrelationId = courseId;
  let pipelineActorHash: string | undefined;
  let v2PublishingStageAdvanced = false;
  let publicationV2Active: boolean | undefined;
  let flags = coursePipelineFeatureFlags();
  try {
    const account = await requireAcceptedAccount(request);
    flags = coursePipelineFeatureFlags(account);
    pipelineActorHash = await openAiSafetyIdentifier(account.uid);
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    pipelineCorrelationId = String(course.pipelineCorrelationId ?? courseId);
    if (course.authorId !== account.uid && !account.isOwner) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }
    publicationV2Active = flags.publicationV2 && courseUsesPipelineV2(course);

    const body = await readJsonBody(request, 2_048) as Record<string, unknown>;
    if (typeof body.isPublic !== "boolean") {
      return NextResponse.json({ error: "Visibility must be true or false." }, { status: 400 });
    }
    const mutationKey = request.headers.get("idempotency-key");
    if (body.isPublic && courseUsesPipelineV2(course) && !flags.publicationV2) {
      return NextResponse.json(
        { error: "V2 publication is paused. This draft was preserved and cannot be published through the legacy path.", code: "COURSE_PUBLICATION_V2_PAUSED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (body.isPublic && publicationV2Active && (!mutationKey || mutationKey.length < 12 || mutationKey.length > 200)) {
      return NextResponse.json(
        { error: "Retry-safe publication requires an idempotency key.", code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const priorMutation = course.publicationMutation as { key?: string } | undefined;
    if (body.isPublic && course.isPublic === true && mutationKey && priorMutation?.key === mutationKey) {
      if (publicationV2Active && course.pipelineStage === "publishing") {
        await updateCoursePipelineStage(courseId, "published");
      }
      return NextResponse.json(
        { success: true, isPublic: true, publicationReview: course.publicationReview, recovered: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.isPublic && course.isPublic !== true && mutationKey && priorMutation?.key === mutationKey) {
      return NextResponse.json(
        { error: "This publication retry was superseded by a later unpublish action.", code: "IDEMPOTENCY_RESULT_SUPERSEDED" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (body.isPublic) {
      if (!account.isOwner && !planAllows(account.plan, "publish_course")) {
        return NextResponse.json(
          { error: "Course publishing is included with Filosage Pro.", code: "PLAN_CAPABILITY_REQUIRED" },
          { status: 403, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      visibilityUpdateStage = "publication-readiness";
      if (course.moderationStatus === "quarantined") {
        return NextResponse.json(
          { error: "This course is quarantined and cannot be published." },
          { status: 403 },
        );
      }
      const generatedPublication = course.aiAssisted === true;
      if (publicationV2Active && course.pipelineStage !== "ready_to_publish" && course.pipelineStage !== "publishing") {
        return NextResponse.json(
          { error: "Validate this exact draft before publishing it.", code: "COURSE_NOT_READY_TO_PUBLISH" },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      const lessonIds = expectedLessonIds(course as unknown as Course);
      const lessons = await listLessons(courseId);
      visibilityUpdateStage = generatedPublication ? "publication-generated-snapshot" : "publication-review";
      const review = generatedPublication
        ? await buildGeneratedCoursePublication(
            course as Course & Record<string, unknown>,
            lessons,
            lessonIds,
            { uid: account.uid, isOwner: account.isOwner },
          )
        : await reviewCourseForPublication(
            course as Course & Record<string, unknown>,
            lessons,
            lessonIds,
            { uid: account.uid, isOwner: account.isOwner },
          );
      if (publicationV2Active && course.pipelineStage === "ready_to_publish") {
        await updateCoursePipelineStage(courseId, "publishing");
        v2PublishingStageAdvanced = true;
      }
      visibilityUpdateStage = "publication-transaction";
      await publishCourseWithReview(courseId, lessonIds, {
        ...review,
        publicationMutationKey: mutationKey ?? undefined,
        publishPipelineStage: publicationV2Active,
      });
      if (publicationV2Active) {
        await recordCoursePipelineEvent({
          event: "course_published",
          correlationId: pipelineCorrelationId,
          courseId,
          actorHash: pipelineActorHash,
          stage: "published",
          outcome: "published",
          contractVersion: review.validationReport?.contractVersion,
          snapshotHash: review.artifactSnapshotHash,
          featureFlags: flags,
        });
      }
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
    if (v2PublishingStageAdvanced) {
      await updateCoursePipelineStage(courseId, "ready_to_publish").catch(() => undefined);
    }
    if (publicationV2Active && visibilityUpdateStage.startsWith("publication")) {
      await recordCoursePipelineEvent({
        event: "course_publish_failed",
        correlationId: pipelineCorrelationId,
        courseId,
        actorHash: pipelineActorHash,
        stage: "publishing",
        outcome: error instanceof Error ? error.name : "UnknownError",
        featureFlags: flags,
      });
    }
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    if (error instanceof PublicationReviewError) {
      console.info(JSON.stringify({
        event: "course_publication_review_rejected",
        courseId,
        assessmentVersion: error.assessment?.assessmentVersion,
        overrideEligible: error.assessment?.overrideEligible ?? false,
        issueCount: error.assessment?.issues.length ?? error.invalidLessonIds.length,
        nonOverridableIssueCount: error.assessment?.nonOverridableIssues.length ?? 0,
      }));
      return NextResponse.json(
        {
          error: error.message,
          code: "PUBLICATION_REVIEW_FAILED",
          invalidLessonIds: error.invalidLessonIds,
          invalidLessons: error.invalidLessons,
          assessmentHash: error.assessmentHash,
        assessment: error.assessment,
          validationReport: error.validationReport,
          decision: error.publicationDecision,
          snapshotHash: error.validationReport?.snapshotHash,
          qualityContractVersion: error.validationReport?.contractVersion,
          overrideEligible: error.assessment?.overrideEligible ?? false,
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
      errorDetails: safeModelErrorDetails(error),
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
    console.error(JSON.stringify({ event: "course_deletion_failed", courseId, ...safeModelErrorDetails(error) }));
    return NextResponse.json({ error: "The course could not be deleted." }, { status: 500 });
  }
}
