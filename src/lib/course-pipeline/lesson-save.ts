import { publicationContentFingerprint } from "@/lib/publication-content";

export interface LessonSavePipelineGuard {
  courseFingerprint: string;
  lessonFingerprint?: string;
  invalidateReadiness: boolean;
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
  if (course.isPublic === true) throw new Error("Unpublish this course before changing a lesson.");
  if (publicationContentFingerprint(course) !== guard.courseFingerprint) {
    throw new Error("The course changed while this lesson was generated. Regenerate against the current draft.");
  }
  if (guard.lessonFingerprint) {
    if (!existing || publicationContentFingerprint(existing) !== guard.lessonFingerprint) {
      throw new Error("This lesson changed while its replacement was generated. The newer edit was preserved.");
    }
  } else if (existing) {
    throw new Error("This lesson was created by another request. The duplicate generation was not saved.");
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
