import { withAccountRequest } from "@/lib/auth-server";
import { z } from "zod";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import type { Course } from "@/lib/course-types";
import { expectedLessonIds, expectedLessonModes } from "@/lib/course-progress";
import {
  applyDeterministicCourseRepair,
  commitCourseValidationStage,
  getCourse,
  getStoredDocument,
  listLessons,
  undoDeterministicCourseRepair,
  updateCoursePipelineStage,
} from "@/lib/document-store";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { COURSE_PIPELINE_VERSIONS, type RepairOperation } from "@/lib/course-pipeline/contract";
import { assertRepairBaseSnapshot, buildRepairPlan, REPAIR_ATTEMPT_LIMITS } from "@/lib/course-pipeline/repair";
import { publicationDecisionFromReport, validateCourseCandidateV2 } from "@/lib/course-pipeline/validation";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { recordCoursePipelineEvent } from "@/lib/course-pipeline/observability";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";
import { accessibleVisualFallbackFromLesson } from "@/lib/course-pipeline/visuals/registry";

const common = {
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  contractVersion: z.literal(COURSE_PIPELINE_VERSIONS.qualityContract),
};

const repairRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply"),
    ...common,
    issueCodes: z.array(z.string().regex(/^CQ_[A-Z]+_\d{3}$/)).max(20).optional(),
  }).strict(),
  z.object({
    action: z.literal("undo"),
    ...common,
    repairId: z.string().uuid(),
  }).strict(),
]);

async function finishRepairStage(
  courseId: string,
  course: Course & Record<string, unknown>,
  lessons: Array<Record<string, unknown>>,
  lessonIds: string[],
  report: Awaited<ReturnType<typeof validateCourseCandidateV2>>,
) {
  const decision = publicationDecisionFromReport(report);
  const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
  await commitCourseValidationStage(
    courseId,
    lessonIds,
    {
      course: publicationContentFingerprint(course),
      lessons: Object.fromEntries(lessonIds.map((lessonId) => [
        lessonId,
        publicationContentFingerprint(lessonsById.get(lessonId)),
      ])),
    },
    decision.decision === "publishable" ? "ready_to_publish" : decision.decision === "manual_review" ? "manual_review" : "needs_repair",
    { decision: decision.decision, snapshotHash: report.snapshotHash },
  );
}

async function handlePOST(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await context.params;
  let pipelineCorrelationId = courseId;
  let pipelineActorHash: string | undefined;
  let repairStageAdvanced = false;
  let repairStageRollback: "needs_repair" | "ready_to_publish" | undefined;
  let flags = coursePipelineFeatureFlags();
  try {
    const account = await requireAcceptedAccount(request);
    flags = coursePipelineFeatureFlags(account);
    if (!flags.repairV2 || !flags.validationV2) {
      return Response.json(
        { error: "Targeted repair is available only in the disabled V2 repair and validation path." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    pipelineActorHash = await openAiSafetyIdentifier(account.uid);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
      return Response.json(
        { error: "Retry-safe repair requires an idempotency key.", code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const parsed = repairRequestSchema.safeParse(await readJsonBody(request, 8_192));
    if (!parsed.success) {
      return Response.json(
        { error: "Provide the exact V2 validation snapshot and a supported repair action." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const course = await getCourse(courseId) as (Course & Record<string, unknown>) | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not own this course." }, { status: 403 });
    }
    if (!courseUsesPipelineV2(course)) {
      return Response.json(
        { error: "Targeted V2 repair is not active for this course artifact." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (course.isPublic) {
      return Response.json(
        { error: "Unpublish this course before repairing its draft." },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    pipelineCorrelationId = String(course.pipelineCorrelationId ?? courseId);
    const lessonIds = expectedLessonIds(course);
    const lessons = await listLessons(courseId);
    const currentReport = await validateCourseCandidateV2(course, lessons, lessonIds, expectedLessonModes(course));
    const requestedIssueCodes = parsed.data.action === "apply" ? [...(parsed.data.issueCodes ?? [])].sort() : [];
    const previousRepair = course.lastRepair as {
      idempotencyKey?: string;
      repairId?: string;
      baseSnapshotHash?: string;
      requestedIssueCodes?: string[];
    } | undefined;
    if (parsed.data.action === "apply" && previousRepair?.idempotencyKey === idempotencyKey) {
      if (previousRepair.baseSnapshotHash !== parsed.data.snapshotHash
        || JSON.stringify(previousRepair.requestedIssueCodes ?? []) !== JSON.stringify(requestedIssueCodes)) {
        return Response.json(
          { error: "This repair retry key belongs to a different snapshot or issue selection.", code: "IDEMPOTENCY_CONFLICT" },
          { status: 409, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      const storedRepair = previousRepair.repairId
        ? await getStoredDocument(`courseRepairs/${previousRepair.repairId}`)
        : null;
      if (!storedRepair || storedRepair.courseId !== courseId) throw new Error("The completed repair record is missing.");
      if (course.pipelineStage === "repairing" || course.pipelineStage === "validating") {
        await finishRepairStage(courseId, course, lessons, lessonIds, currentReport);
      }
      return Response.json({
        success: true,
        recovered: true,
        repairId: previousRepair.repairId,
        operations: storedRepair.operations ?? [],
        undoAvailable: storedRepair.status === "applied",
        validationReport: currentReport,
        publicationDecision: publicationDecisionFromReport(currentReport),
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (parsed.data.action === "undo") {
      const storedRepair = await getStoredDocument(`courseRepairs/${parsed.data.repairId}`);
      if (!storedRepair || storedRepair.courseId !== courseId) {
        return Response.json({ error: "Repair record not found." }, { status: 404 });
      }
      if (storedRepair?.status === "undone") {
        if (storedRepair.undoIdempotencyKey !== idempotencyKey) {
          return Response.json(
            { error: "This repair was already undone by another request.", code: "IDEMPOTENCY_CONFLICT" },
            { status: 409, headers: { "Cache-Control": "private, no-store" } },
          );
        }
        if (course.pipelineStage === "repairing" || course.pipelineStage === "validating") {
          await finishRepairStage(courseId, course, lessons, lessonIds, currentReport);
        }
        return Response.json({
          success: true,
          recovered: true,
          undone: true,
          repairId: parsed.data.repairId,
          validationReport: currentReport,
          publicationDecision: publicationDecisionFromReport(currentReport),
        }, { headers: { "Cache-Control": "private, no-store" } });
      }
    }
    if (currentReport.snapshotHash !== parsed.data.snapshotHash) {
      return Response.json(
        { error: "The course changed after this repair was planned.", code: "STALE_REPAIR_SNAPSHOT", validationReport: currentReport },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    await recordCoursePipelineEvent({
      event: "course_repair_planned",
      correlationId: pipelineCorrelationId,
      courseId,
      actorHash: pipelineActorHash,
      stage: "repairing",
      outcome: parsed.data.action,
      contractVersion: parsed.data.contractVersion,
      snapshotHash: parsed.data.snapshotHash,
      featureFlags: flags,
    });
    if (parsed.data.action === "undo" && ["needs_repair", "ready_to_publish", "repairing"].includes(String(course.pipelineStage))) {
      repairStageRollback = course.pipelineStage === "ready_to_publish" ? "ready_to_publish" : "needs_repair";
      if (course.pipelineStage !== "repairing") await updateCoursePipelineStage(courseId, "repairing");
      repairStageAdvanced = true;
    }

    if (parsed.data.action === "undo") {
      const recovered = await undoDeterministicCourseRepair(
        courseId,
        lessonIds,
        parsed.data.repairId,
        idempotencyKey,
        account.uid,
        new Date().toISOString(),
      );
      const [nextCourse, nextLessons] = await Promise.all([getCourse(courseId), listLessons(courseId)]);
      if (!nextCourse) throw new Error("Course not found after repair undo.");
      const validationReport = await validateCourseCandidateV2(
        nextCourse as Course & Record<string, unknown>,
        nextLessons,
        lessonIds,
        expectedLessonModes(nextCourse as unknown as Course),
      );
      if (repairStageAdvanced) {
        await finishRepairStage(
          courseId,
          nextCourse as Course & Record<string, unknown>,
          nextLessons,
          lessonIds,
          validationReport,
        );
      }
      await recordCoursePipelineEvent({
        event: "course_repair_completed",
        correlationId: pipelineCorrelationId,
        courseId,
        actorHash: pipelineActorHash,
        stage: "repairing",
        outcome: "undo",
        contractVersion: parsed.data.contractVersion,
        snapshotHash: validationReport.snapshotHash,
        featureFlags: flags,
      });
      return Response.json({
        success: true,
        recovered,
        undone: true,
        repairId: parsed.data.repairId,
        validationReport,
        publicationDecision: publicationDecisionFromReport(validationReport),
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const plan = buildRepairPlan(currentReport);
    assertRepairBaseSnapshot(plan, parsed.data.snapshotHash);
    const requestedCodes = parsed.data.issueCodes?.length ? new Set(parsed.data.issueCodes) : null;
    const selected = plan.operations.filter((operation) => !requestedCodes || requestedCodes.has(operation.issueCode));
    const lessonsById = new Map(lessons.map((lesson) => [String(lesson.id ?? ""), lesson]));
    const deterministic = selected.flatMap((operation): Array<RepairOperation & { operation: "add" | "remove" }> => {
      if (operation.operation === "remove" && (operation.issueCode === "CQ_LAB_001" || operation.issueCode === "CQ_VISUAL_003")) {
        return [{ ...operation, operation: "remove" }];
      }
      if (operation.operation === "add" && operation.issueCode === "CQ_VISUAL_001") {
        const target = /^lessons\["([0-9]+-[0-9]+)"\]\.visualPlan\.accessibleFallback$/.exec(operation.targetPath);
        const lesson = target ? lessonsById.get(target[1]) : undefined;
        if (!lesson) return [];
        return [{ ...operation, operation: "add", value: accessibleVisualFallbackFromLesson(lesson) }];
      }
      return [];
    });
    const generationRequired = selected.filter((operation) => operation.operation === "regenerate_subtree");
    if (!deterministic.length) {
      return Response.json({
        error: generationRequired.length
          ? "The diagnosed missing lesson must be generated; no existing author content will be replaced."
          : "No selected issue has a safe deterministic patch.",
        code: generationRequired.length ? "LESSON_GENERATION_REQUIRED" : "NO_SAFE_AUTOMATIC_REPAIR",
        repairPlan: plan,
        generationRequired,
      }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    if (course.pipelineStage === "needs_repair" || course.pipelineStage === "repairing") {
      repairStageRollback = "needs_repair";
      if (course.pipelineStage !== "repairing") await updateCoursePipelineStage(courseId, "repairing");
      repairStageAdvanced = true;
    }
    const repairResult = await applyDeterministicCourseRepair(
      courseId,
      lessonIds,
      {
        courseFingerprint: publicationContentFingerprint(course),
        lessonFingerprints: Object.fromEntries(lessonIds.flatMap((lessonId) => {
          const lesson = lessonsById.get(lessonId);
          return lesson ? [[lessonId, publicationContentFingerprint(lesson)]] : [];
        })),
      },
      deterministic,
      {
        repairId: crypto.randomUUID(),
        idempotencyKey,
        actorUid: account.uid,
        baseSnapshotHash: currentReport.snapshotHash,
        contractVersion: currentReport.contractVersion,
        appliedAt: new Date().toISOString(),
        requestedIssueCodes,
        attemptLimit: REPAIR_ATTEMPT_LIMITS.deterministic,
      },
    );
    const [nextCourse, nextLessons] = await Promise.all([getCourse(courseId), listLessons(courseId)]);
    if (!nextCourse) throw new Error("Course not found after repair.");
    const validationReport = await validateCourseCandidateV2(
      nextCourse as Course & Record<string, unknown>,
      nextLessons,
      lessonIds,
      expectedLessonModes(nextCourse as unknown as Course),
    );
    if (repairStageAdvanced) {
      await finishRepairStage(
        courseId,
        nextCourse as Course & Record<string, unknown>,
        nextLessons,
        lessonIds,
        validationReport,
      );
    }
    await recordCoursePipelineEvent({
      event: "course_repair_completed",
      correlationId: pipelineCorrelationId,
      courseId,
      actorHash: pipelineActorHash,
      stage: "repairing",
      outcome: repairResult.recovered ? "idempotent_replay" : "applied",
      ruleCodes: deterministic.map((operation) => operation.issueCode),
      contractVersion: currentReport.contractVersion,
      snapshotHash: validationReport.snapshotHash,
      featureFlags: flags,
      repairAttempt: repairResult.attempt,
    });
    return Response.json({
      success: true,
      recovered: repairResult.recovered,
      repairId: repairResult.repairId,
      operations: deterministic,
      generationRequired,
      undoAvailable: true,
      validationReport,
      publicationDecision: publicationDecisionFromReport(validationReport),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (repairStageAdvanced && repairStageRollback) {
      await updateCoursePipelineStage(courseId, repairStageRollback).catch(() => undefined);
    }
    if (flags.repairV2) {
      await recordCoursePipelineEvent({
        event: "course_repair_exhausted",
        correlationId: pipelineCorrelationId,
        courseId,
        actorHash: pipelineActorHash,
        stage: "repairing",
        outcome: error instanceof Error ? error.name : "UnknownError",
        featureFlags: flags,
      });
    }
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    if (error instanceof Error && error.message.startsWith("REPAIR_ATTEMPT_LIMIT_EXHAUSTED:")) {
      const issueCode = error.message.match(/(CQ_[A-Z]+_\d{3})/)?.[1];
      return Response.json(
        {
          error: "Automatic repair stopped at the configured attempt limit. Review the remaining issue manually.",
          code: "REPAIR_ATTEMPT_LIMIT_EXHAUSTED",
          issueCode,
          attemptLimit: REPAIR_ATTEMPT_LIMITS.deterministic,
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(JSON.stringify({
      event: "course_repair_failed",
      courseId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    return Response.json(
      { error: error instanceof Error ? error.message : "The course repair could not be completed." },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const POST = withAccountRequest(handlePOST);
