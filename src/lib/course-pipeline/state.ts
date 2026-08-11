import type { CourseStage } from "@/lib/course-pipeline/contract";

const COURSE_STAGE_TRANSITIONS: Readonly<Record<CourseStage, readonly CourseStage[]>> = {
  draft: ["planning", "generating", "validating", "failed"],
  planning: ["generating", "failed"],
  generating: ["enriching", "validating", "failed"],
  enriching: ["validating", "failed"],
  validating: ["needs_repair", "ready_to_publish", "manual_review", "failed"],
  needs_repair: ["repairing", "validating", "manual_review", "failed"],
  repairing: ["validating", "needs_repair", "manual_review", "failed"],
  ready_to_publish: ["publishing", "validating", "repairing", "failed"],
  publishing: ["published", "ready_to_publish", "failed"],
  published: ["draft"],
  manual_review: ["validating", "needs_repair", "ready_to_publish", "failed"],
  failed: ["planning", "generating", "validating", "repairing"],
};

export function canTransitionCourseStage(from: CourseStage, to: CourseStage) {
  return COURSE_STAGE_TRANSITIONS[from].includes(to);
}

export function assertCourseStageTransition(from: CourseStage, to: CourseStage) {
  if (!canTransitionCourseStage(from, to)) {
    throw new Error(`Invalid course pipeline transition: ${from} -> ${to}`);
  }
}
