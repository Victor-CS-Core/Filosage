import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";
import {
  resolveCoursePipelineFeatureFlags,
  type CoursePipelineFlagActor,
} from "@/lib/course-pipeline/feature-policy";

export type { CoursePipelineFlagActor } from "@/lib/course-pipeline/feature-policy";

export function lessonVisualsEnabled(actor?: CoursePipelineFlagActor) {
  const legacyEnabled = serverEnvironment.LESSON_VISUALS_ENABLED?.trim().toLowerCase() === "true";
  const flags = coursePipelineFeatureFlags(actor);
  return legacyEnabled || (flags.pipelineV2 && flags.visualsV2);
}

export function coursePipelineFeatureFlags(actor?: CoursePipelineFlagActor) {
  return resolveCoursePipelineFeatureFlags(serverEnvironment, actor);
}
