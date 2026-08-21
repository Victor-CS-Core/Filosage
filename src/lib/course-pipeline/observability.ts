import type { CourseStage } from "@/lib/course-pipeline/contract";
import { createStoredDocument } from "@/lib/document-store";

export type CoursePipelineEventName =
  | "course_pipeline_started"
  | "course_stage_started"
  | "course_stage_completed"
  | "course_stage_failed"
  | "course_blueprint_validated"
  | "course_validation_completed"
  | "course_publication_decided"
  | "course_repair_planned"
  | "course_repair_completed"
  | "course_repair_exhausted"
  | "course_lab_generated"
  | "course_lab_failed"
  | "course_visual_generated"
  | "course_visual_failed"
  | "course_published"
  | "course_publish_failed"
  | "course_pipeline_rollback_triggered";

export interface CoursePipelineEvent {
  event: CoursePipelineEventName;
  correlationId: string;
  courseId?: string;
  actorHash?: string;
  stage?: CourseStage;
  durationMs?: number;
  outcome?: string;
  ruleCodes?: string[];
  contractVersion?: string;
  promptVersion?: string;
  model?: string;
  retryCount?: number;
  repairAttempt?: number;
  snapshotHash?: string;
  featureFlags?: Record<string, boolean>;
  comparison?: {
    v1Decision: string;
    v2Decision: string;
    disagrees: boolean;
    mode: "shadow" | "active";
  };
}

export function writeCoursePipelineEvent(event: CoursePipelineEvent) {
  console.info(JSON.stringify(event));
}

export async function recordCoursePipelineEvent(event: CoursePipelineEvent) {
  const stored = {
    ...event,
    recordedAt: new Date().toISOString(),
  };
  writeCoursePipelineEvent(stored);
  try {
    await createStoredDocument("coursePipelineEvents", stored);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "course_pipeline_event_persist_failed",
      correlationId: event.correlationId,
      courseId: event.courseId,
      eventName: event.event,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
  }
}
