import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import type { Course } from "@/lib/course-types";
import { expectedLessonIds, expectedLessonModes } from "@/lib/course-progress";
import { commitCourseValidationStage, getCourse, listLessons } from "@/lib/firebase-server";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { publicationDecisionFromReport, validateCourseCandidateV2 } from "@/lib/course-pipeline/validation";
import { recordCoursePipelineEvent } from "@/lib/course-pipeline/observability";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await context.params;
  try {
    const account = await requireAcceptedAccount(request);
    const flags = coursePipelineFeatureFlags(account);
    if (!flags.validationV2 && !flags.shadowMode) {
      return Response.json(
        { error: "V2 validation is disabled." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const course = await getCourse(courseId) as (Course & Record<string, unknown>) | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not own this course." }, { status: 403 });
    }
    const validationV2Active = flags.validationV2 && courseUsesPipelineV2(course);
    if (!validationV2Active && !flags.shadowMode) {
      return Response.json(
        { error: "V2 validation is not active for this course artifact." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const lessonIds = expectedLessonIds(course);
    const lessons = await listLessons(courseId);
    const report = await validateCourseCandidateV2(course, lessons, lessonIds, expectedLessonModes(course));
    const decision = publicationDecisionFromReport(report);
    if (!course.isPublic && validationV2Active) {
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
        { decision: decision.decision, snapshotHash: report.snapshotHash },
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
      { validationReport: report, decision },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
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
