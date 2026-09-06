import { withAccountRequest } from "@/lib/auth-server";
import { z } from "zod";
import { assertPublicationProofToken, publicationProofIsCurrent, StalePublicationProofError, validationEvidenceFingerprint, type PublicationProof } from "@/lib/publication-proofs";
import { authorizationResponse, requireRecentlyAuthenticatedOwner } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import type { Course } from "@/lib/course-types";
import { expectedLessonIds, expectedLessonModes } from "@/lib/course-progress";
import {
  getCourse,
  listLessons,
  saveCourseManualReviewResolution,
} from "@/lib/document-store";
import { publicationContentFingerprint, publicationContentHash } from "@/lib/publication-content";
import { publicationDecisionFromReport, validateCourseCandidateV2 } from "@/lib/course-pipeline/validation";
import { COURSE_PIPELINE_VERSIONS } from "@/lib/course-pipeline/contract";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { effectiveCourseReviewPolicy } from "@/lib/course-pipeline/review-policy";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";
import { isSafePublicSourceUrl } from "@/lib/source-safety";
import { isServerClassifiedResearchSource } from "@/lib/source-research";

const manualReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(20).max(1_000),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  proofToken: z.string().regex(/^[a-f0-9]{64}$/),
  contractVersion: z.literal(COURSE_PIPELINE_VERSIONS.qualityContract),
  verifiedSourceIds: z.array(z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/)).max(5).default([]),
  confirmation: z.enum(["APPROVE MANUAL REVIEW", "REJECT MANUAL REVIEW"]),
}).strict().superRefine((value, context) => {
  const expected = value.decision === "approved" ? "APPROVE MANUAL REVIEW" : "REJECT MANUAL REVIEW";
  if (value.confirmation !== expected) {
    context.addIssue({ code: "custom", path: ["confirmation"], message: "Confirm the selected manual-review decision." });
  }
});

async function handlePOST(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await context.params;
  try {
    const owner = await requireRecentlyAuthenticatedOwner(request);
    const flags = coursePipelineFeatureFlags(owner);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
      return Response.json(
        { error: "Retry-safe manual review requires an idempotency key.", code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const parsed = manualReviewSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      return Response.json(
        { error: "Provide a reason, the exact validation snapshot and proof token, and the matching decision confirmation." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const course = await getCourse(courseId) as (Course & Record<string, unknown>) | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (courseUsesPipelineV2(course) && !flags.publicationV2) {
      return Response.json(
        { error: "V2 manual-review resolution is paused." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (course.isPublic) {
      return Response.json(
        { error: "Unpublish this course before changing its manual-review resolution." },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const lessonIds = expectedLessonIds(course);
    const lessons = await listLessons(courseId);
    const report = await validateCourseCandidateV2(course, lessons, lessonIds, expectedLessonModes(course));
    const publicationDecision = publicationDecisionFromReport(report);
    if (report.snapshotHash !== parsed.data.snapshotHash) {
      return Response.json(
        { error: "The course changed after this manual review began. Validate the current draft again.", code: "STALE_VALIDATION_SNAPSHOT", validationReport: report },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const proof = course.publicationProof as PublicationProof | undefined;
    const proofLessons = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
    if (!publicationProofIsCurrent(course, lessonIds.map((id) => proofLessons.get(id) ?? {}), lessonIds, report.snapshotHash, proof)
      || validationEvidenceFingerprint(proof.validationReport) !== validationEvidenceFingerprint(report)) {
      throw new StalePublicationProofError();
    }
    assertPublicationProofToken(proof, parsed.data.proofToken);
    if (publicationDecision.decision !== "manual_review") {
      return Response.json(
        { error: "This snapshot is not eligible for a manual-review decision.", code: "MANUAL_REVIEW_NOT_APPLICABLE", publicationDecision },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const storedResolution = course.manualReviewResolution as {
      idempotencyKey?: string;
    } | undefined;
    const replayingResolution = course.pipelineStage === "ready_to_publish"
      && storedResolution?.idempotencyKey === idempotencyKey;
    if (course.pipelineStage !== "manual_review" && !replayingResolution) {
      return Response.json(
        { error: "Validate this exact draft before recording a manual-review decision.", code: "COURSE_NOT_AWAITING_MANUAL_REVIEW" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const effectiveReviewPolicy = effectiveCourseReviewPolicy(course);
    const highStakesEvidenceRequired = effectiveReviewPolicy.reasonCodes.some((code) =>
      ["medical", "legal", "financial", "physical_safety", "freshness"].includes(code),
    );
    const citedSourceIds = new Set(lessons.flatMap((lesson) =>
      Array.isArray(lesson.citations)
        ? lesson.citations.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).sourceId === "string"
            ? [String((item as Record<string, unknown>).sourceId)]
            : [])
        : [],
    ));
    const plannedSourceIds = new Set(course.modules.flatMap((courseModule) =>
      courseModule.lessons.flatMap((lesson) => lesson.sourceIds ?? []),
    ));
    const requiredSourceIds = new Set([...plannedSourceIds, ...citedSourceIds]);
    const eligibleSources = new Set((course.sourcePack ?? [])
      .filter((source) => Boolean(source.url) && isSafePublicSourceUrl(String(source.url)))
      .map((source) => source.id));
    const authoritativeSources = new Set((course.sourcePack ?? [])
      .filter((source) => isServerClassifiedResearchSource(source))
      .map((source) => source.id));
    const verifiedSourceIds = new Set(parsed.data.verifiedSourceIds);
    const selectedSourcesAreEligible = parsed.data.verifiedSourceIds.every((sourceId) => eligibleSources.has(sourceId));
    const everyRequiredSourceVerified = [...requiredSourceIds].every((sourceId) => verifiedSourceIds.has(sourceId));
    const authoritativeEvidenceSelected = parsed.data.verifiedSourceIds.some((sourceId) => authoritativeSources.has(sourceId));
    if (parsed.data.decision === "approved"
      && (!selectedSourcesAreEligible
        || !everyRequiredSourceVerified
        || (highStakesEvidenceRequired && !authoritativeEvidenceSelected))) {
      return Response.json(
        {
          error: !selectedSourcesAreEligible
            ? "Every selected source must resolve to a safe public HTTPS destination in this exact course snapshot."
            : !everyRequiredSourceVerified
              ? "Approval requires every source assigned to or cited by a lesson to be personally verified for this exact snapshot."
              : "High-stakes approval requires at least one explicitly verified primary or official source from this exact course snapshot.",
          code: "MANUAL_REVIEW_EVIDENCE_REQUIRED",
          eligibleSourceIds: [...eligibleSources],
          requiredSourceIds: [...requiredSourceIds],
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
    const reviewedAt = new Date().toISOString();
    const reviewId = crypto.randomUUID();
    const savedResolution = await saveCourseManualReviewResolution(
      courseId,
      lessonIds,
      {
        courseFingerprint: publicationContentFingerprint(course),
        proofToken: parsed.data.proofToken,
        lessonFingerprints: Object.fromEntries(lessonIds.map((lessonId) => [
          lessonId,
          publicationContentFingerprint(lessonsById.get(lessonId)),
        ])),
        manualReviewResolutionId: course.manualReviewResolution?.reviewId,
      },
      {
        status: parsed.data.decision,
        snapshotHash: report.snapshotHash,
        contractVersion: report.contractVersion,
        reason: parsed.data.reason,
        reviewedAt,
        reviewId,
        reviewerUid: owner.uid,
        idempotencyKey,
        verifiedSourceIds: parsed.data.verifiedSourceIds,
        mutationId: await publicationContentHash({ courseId, idempotencyKey }),
      },
    );
    console.info(JSON.stringify({
      event: "course_manual_review_resolved",
      courseId,
      decision: parsed.data.decision,
      snapshotHash: report.snapshotHash,
      reviewId: savedResolution.resolution.reviewId,
      recovered: savedResolution.recovered,
    }));
    return Response.json(
      {
        success: true,
        recovered: savedResolution.recovered,
        manualReviewResolution: {
          status: savedResolution.resolution.status,
          proofToken: savedResolution.resolution.proofToken,
          snapshotHash: savedResolution.resolution.snapshotHash,
          contractVersion: savedResolution.resolution.contractVersion,
          reason: savedResolution.resolution.reason,
          reviewedAt: savedResolution.resolution.reviewedAt,
          reviewId: savedResolution.resolution.reviewId,
          verifiedSourceIds: savedResolution.resolution.verifiedSourceIds,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof StalePublicationProofError) return Response.json(
      { error: error.message, code: "STALE_PUBLICATION_PROOF" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    console.error(JSON.stringify({
      event: "course_manual_review_failed",
      courseId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    return Response.json(
      { error: "The manual-review decision could not be saved." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const POST = withAccountRequest(handlePOST);
