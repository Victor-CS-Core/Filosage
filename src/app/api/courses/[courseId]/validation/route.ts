import { withAccountRequest } from "@/lib/auth-server";
import { publicationProofToken } from "@/lib/publication-proofs";
import { buildPublicationValidationProof } from "@/lib/publication-review";
import { ContentSafetyError } from "@/lib/content-safety";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import type { Course } from "@/lib/course-types";
import { expectedLessonIds } from "@/lib/course-progress";
import { commitCourseValidationStage, getCourse, listLessons } from "@/lib/document-store";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { publicationDecisionFromReport } from "@/lib/course-pipeline/validation";
import { recordCoursePipelineEvent } from "@/lib/course-pipeline/observability";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";

async function handleGET(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await context.params;
  try {
    const account = await requireAcceptedAccount(request);
    const flags = coursePipelineFeatureFlags(account);
    const course = await getCourse(courseId) as (Course & Record<string, unknown>) | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not own this course." }, { status: 403 });
    }
    const pipelineV2Artifact = courseUsesPipelineV2(course);
    const validationActive = !pipelineV2Artifact || flags.validationV2;
    if (!validationActive && !flags.shadowMode) {
      return Response.json(
        { error: "V2 validation is not active for this course artifact." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const lessonIds = expectedLessonIds(course);
    const lessons = await listLessons(courseId);
    const publicationProof = await buildPublicationValidationProof(course, lessons, lessonIds, account);
    const report = publicationProof.validationReport;
    const decision = publicationDecisionFromReport(report);
    if (!course.isPublic && validationActive) {
      const nextStage = decision.decision === "publishable"
        ? "ready_to_publish"
        : decision.decision === "manual_review"
          ? "manual_review"
          : "needs_repair";
      const lessonById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
      await commitCourseValidationStage(
        courseId,
        lessonIds,
        {
          course: publicationContentFingerprint(course),
          lessons: Object.fromEntries(lessonIds.map((lessonId) => [
            lessonId,
            publicationContentFingerprint(lessonById.get(lessonId)),
          ])),
        },
        nextStage,
        { decision: decision.decision, snapshotHash: report.snapshotHash, publicationProof },
      );
    }
    await recordCoursePipelineEvent({
      event: "course_validation_completed",
      correlationId: String(course.pipelineCorrelationId ?? courseId),
      courseId,
      actorHash: await openAiSafetyIdentifier(account.uid),
      stage: "validating",
      outcome: decision.decision,
      ruleCodes: [...report.issues, ...report.warnings].map((issue) => issue.code),
      contractVersion: report.contractVersion,
      snapshotHash: report.snapshotHash,
      featureFlags: flags,
    });
    return Response.json(
      { validationReport: report, decision, proofToken: publicationProofToken(publicationProof) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ContentSafetyError) return Response.json(
      { error: "The current draft failed the safety scan.", code: "PUBLICATION_SAFETY_BLOCK" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof Error && error.message.startsWith("STALE_VALIDATION_SNAPSHOT:")) {
      return Response.json(
        { error: "The course changed during validation. Validate the current draft again.", code: "STALE_VALIDATION_SNAPSHOT" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(JSON.stringify({
      event: "course_validation_failed",
      courseId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    return Response.json(
      { error: "The course validation report is temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const GET = withAccountRequest(handleGET);
