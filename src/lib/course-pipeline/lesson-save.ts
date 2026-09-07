import { publicationContentFingerprint } from "@/lib/publication-content";
import type { Course, CourseSource } from "@/lib/course-types";
import { courseGroundingFingerprint } from "@/lib/source-grounding";

export class LessonSaveError extends Error {
  readonly status = 409;
  constructor(public readonly code: string, message: string, public readonly recovery: string) { super(message); }
}
export function lessonPublicationState(course: Record<string, unknown>) {
  return publicationContentFingerprint({ state: { isPublic: course.isPublic === true, epoch: course.lessonWriteEpoch ?? null,
    mutation: course.publicationMutation ?? null, releaseId: course.publishedReleaseId ?? null } });
}

/** Other lessons may downgrade their evidence without changing this curriculum. */
export function lessonCourseFingerprint(course: Record<string, unknown>, lessonId: string) {
  const value = structuredClone(course);
  delete value.evidenceProfile;
  delete value.sourceGroundingFingerprint;
  delete value.sourceGroundingEvaluatorStatus;
  if (Array.isArray(value.sourceGroundingAssessments)) {
    value.sourceGroundingAssessments = value.sourceGroundingAssessments.filter((assessment) => {
      const item = assessment as Record<string, unknown>;
      return `${item.moduleIndex}-${item.lessonIndex}` === lessonId;
    });
    // Absence and empty both mean no retained target claim assessment.
    if (!(value.sourceGroundingAssessments as unknown[]).length) delete value.sourceGroundingAssessments;
  }
  if (Array.isArray(value.modules)) value.modules = value.modules.map((module, mi) => {
    const item = module as Record<string, unknown>;
    return { ...item, lessons: Array.isArray(item.lessons) ? item.lessons.map((lesson, li) => {
      const next = { ...lesson as Record<string, unknown> };
      if (`${mi}-${li}` !== lessonId) { delete next.contentBasis; delete next.sourceIds; }
      return next;
    }) : item.lessons };
  });
  if (value.learningDesign && typeof value.learningDesign === "object") {
    const design = value.learningDesign as Record<string, unknown>;
    if (Array.isArray(design.lessonPlans)) design.lessonPlans = design.lessonPlans.map((plan) => {
      const next = { ...plan as Record<string, unknown> };
      if (next.lessonId !== lessonId) delete next.resources;
      return next;
    });
  }
  return publicationContentFingerprint(value);
}

export interface LessonSavePipelineGuard {
  courseFingerprint: string;
  lessonFingerprint?: string;
  invalidateReadiness: boolean;
  publicationState?: string;
  scopeVersion?: 1;
}

export interface LessonEvidenceDowngradeGuard extends LessonSavePipelineGuard {
  actorId: string;
  ownerOverride: boolean;
}

export function buildGuardedLessonSave(
  courseId: string,
  lessonId: string,
  course: Record<string, unknown> | undefined,
  existing: Record<string, unknown> | undefined,
  data: Record<string, unknown>,
  guard: LessonSavePipelineGuard,
  now: string,
) {
  if (!course) throw new Error("Course not found while saving the generated lesson.");
  if (course.isPublic === true) throw new LessonSaveError("LESSON_PUBLICATION_CHANGED", "Unpublish this course before changing a lesson.", "reopen_course");
  if (guard.publicationState !== undefined && lessonPublicationState(course) !== guard.publicationState) {
    throw new LessonSaveError("LESSON_PUBLICATION_CHANGED", "The course publication state changed while this lesson was generated. Reopen the current draft.", "reopen_course");
  }
  if ((guard.scopeVersion === 1 ? lessonCourseFingerprint(course, lessonId) : publicationContentFingerprint(course)) !== guard.courseFingerprint) {
    throw new LessonSaveError("LESSON_COURSE_CHANGED", "The course changed while this lesson was generated. Regenerate against the current draft.", "reopen_course");
  }
  if (guard.lessonFingerprint) {
    if (!existing || publicationContentFingerprint(existing) !== guard.lessonFingerprint) {
      throw new LessonSaveError("LESSON_CONTENT_CHANGED", "This lesson changed while its replacement was generated. The newer edit was preserved.", "reopen_lesson");
    }
  } else if (existing) {
    throw new LessonSaveError("LESSON_CONTENT_CHANGED", "This lesson was created by another request. The duplicate generation was not saved.", "reopen_lesson");
  }
  const nextLesson = {
    ...data,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const invalidatesStage = guard.invalidateReadiness
    && ["needs_repair", "ready_to_publish", "manual_review"].includes(String(course.pipelineStage ?? ""));
  return {
    writes: [
      { path: `courses/${courseId}/lessons/${lessonId}`, data: nextLesson },
      ...(invalidatesStage ? [{
        path: `courses/${courseId}`,
        data: {
          ...course,
          pipelineStage: "validating",
          pipelineStageUpdatedAt: now,
          lastValidationDecision: null,
          lastValidationSnapshotHash: null,
        },
      }] : []),
    ],
    result: { id: lessonId, ...nextLesson },
  };
}

export function buildGuardedLessonEvidenceDowngrade(
  courseId: string,
  lessonId: string,
  course: Record<string, unknown> | undefined,
  existing: Record<string, unknown> | undefined,
  data: Record<string, unknown>,
  guard: LessonEvidenceDowngradeGuard,
  now: string,
) {
  const guardedLessonSave = buildGuardedLessonSave(
    courseId,
    lessonId,
    course,
    existing,
    data,
    guard,
    now,
  );
  if (!course) throw new Error("Course not found while downgrading lesson evidence.");
  if (data.contentBasis !== "model-knowledge"
    || data.claimSupportEvaluatorStatus !== "not_applicable"
    || (Array.isArray(data.citations) && data.citations.length > 0)
    || (Array.isArray(data.sourceReferences) && data.sourceReferences.length > 0)
    || data.claimSupportFingerprint !== undefined) {
    throw new Error("An evidence downgrade must save a citation-free model-knowledge lesson with claim grounding marked not applicable.");
  }
  if (course.authorId !== guard.actorId && !guard.ownerOverride) {
    throw new Error("Only the course author or verified owner can downgrade lesson evidence.");
  }
  if (typeof course.sourcePolicyVersion !== "string" || !course.sourcePolicyVersion.startsWith("source-integrity-v5.")) {
    throw new Error("Only layered-evidence courses can downgrade a lesson to model knowledge.");
  }
  const match = lessonId.match(/^(\d+)-(\d+)$/);
  if (!match) throw new Error("Invalid lesson ID for evidence downgrade.");
  const moduleIndex = Number(match[1]);
  const lessonIndex = Number(match[2]);
  const modules = Array.isArray(course.modules) ? course.modules as Course["modules"] : [];
  const target = modules[moduleIndex]?.lessons[lessonIndex];
  if (!target) throw new Error("The lesson is not present in the course outline.");

  const nextModules = modules.map((courseModule, currentModuleIndex) => ({
    ...courseModule,
    lessons: courseModule.lessons.map((lessonSummary, currentLessonIndex) =>
      currentModuleIndex === moduleIndex && currentLessonIndex === lessonIndex
        ? { ...lessonSummary, contentBasis: "model-knowledge" as const, sourceIds: [] }
        : lessonSummary),
  }));
  const currentLearningDesign = course.learningDesign && typeof course.learningDesign === "object"
    ? course.learningDesign as NonNullable<Course["learningDesign"]>
    : undefined;
  const nextLearningDesign = currentLearningDesign && Array.isArray(currentLearningDesign.lessonPlans)
    ? {
        ...currentLearningDesign,
        lessonPlans: currentLearningDesign.lessonPlans.map((plan) => plan.lessonId === lessonId
          ? {
              ...plan,
              resources: {
                status: "unavailable" as const,
                evidenceSourceIds: [],
                furtherReadingIds: [],
                rationale: "Automatic claim verification did not retain a lesson-specific resource; the lesson continues with disclosed model knowledge.",
              },
            }
          : plan),
      }
    : undefined;
  const outlinedLessons = nextModules.flatMap((courseModule) => courseModule.lessons);
  const verifiedLessonCount = outlinedLessons.filter((lessonSummary) => lessonSummary.contentBasis === "verified-source").length;
  const modelKnowledgeLessonCount = outlinedLessons.length - verifiedLessonCount;
  const sourcePack = Array.isArray(course.sourcePack) ? course.sourcePack as CourseSource[] : [];
  const existingAssessments = Array.isArray(course.sourceGroundingAssessments)
    ? course.sourceGroundingAssessments.filter((assessment): assessment is NonNullable<Course["sourceGroundingAssessments"]>[number] => {
        if (!assessment || typeof assessment !== "object") return false;
        const value = assessment as Record<string, unknown>;
        return Number(value.moduleIndex) !== moduleIndex || Number(value.lessonIndex) !== lessonIndex;
      })
    : [];
  const previousProfile = course.evidenceProfile && typeof course.evidenceProfile === "object"
    ? course.evidenceProfile as Record<string, unknown>
    : {};
  const fallbackReasonCodes = new Set(Array.isArray(previousProfile.fallbackReasonCodes)
    ? previousProfile.fallbackReasonCodes.filter((value): value is string => typeof value === "string")
    : []);
  fallbackReasonCodes.add("lesson-grounding-downgraded");
  const invalidatesStage = guard.invalidateReadiness
    && ["needs_repair", "ready_to_publish", "manual_review"].includes(String(course.pipelineStage ?? ""));
  const courseWithoutGrounding = { ...course };
  delete courseWithoutGrounding.sourceGroundingFingerprint;
  delete courseWithoutGrounding.sourceGroundingAssessments;
  const nextCourse = {
    ...courseWithoutGrounding,
    modules: nextModules,
    ...(nextLearningDesign ? { learningDesign: nextLearningDesign } : {}),
    evidenceProfile: {
      ...previousProfile,
      mode: verifiedLessonCount ? "hybrid" : "model-knowledge",
      verifiedSourceCount: sourcePack.length,
      verifiedLessonCount,
      modelKnowledgeLessonCount,
      fallbackReasonCodes: [...fallbackReasonCodes],
      generatedAt: now,
    },
    sourceGroundingEvaluatorStatus: verifiedLessonCount ? "executed" : "not_applicable",
    ...(verifiedLessonCount ? { sourceGroundingAssessments: existingAssessments } : {}),
    lastValidationDecision: null,
    lastValidationSnapshotHash: null,
    pipelineStage: invalidatesStage
      ? "validating"
      : course.pipelineStage === "published"
        ? "draft"
        : course.pipelineStage,
    pipelineStageUpdatedAt: now,
    updatedAt: now,
  };
  const finalCourse = {
    ...nextCourse,
    ...(verifiedLessonCount ? {
      sourceGroundingFingerprint: courseGroundingFingerprint(
        nextCourse as unknown as Course,
        sourcePack,
        typeof course.sourceGroundingEvaluatorVersion === "string" ? course.sourceGroundingEvaluatorVersion : undefined,
      ),
    } : {}),
  };
  const lessonPath = `courses/${courseId}/lessons/${lessonId}`;
  const lessonWrite = guardedLessonSave.writes.find((write) => write.path === lessonPath);
  if (!lessonWrite) throw new Error("The guarded lesson save did not produce a lesson write.");
  return {
    writes: [
      lessonWrite,
      { path: `courses/${courseId}`, data: finalCourse },
    ],
    result: guardedLessonSave.result,
  };
}
