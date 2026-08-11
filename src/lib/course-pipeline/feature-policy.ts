import { createHash } from "node:crypto";

export interface CoursePipelineFlagActor {
  uid: string;
  isOwner: boolean;
}

export interface CoursePipelineFlags extends Record<string, boolean> {
  pipelineV2: boolean;
  validationV2: boolean;
  repairV2: boolean;
  labsV2: boolean;
  visualsV2: boolean;
  publicationV2: boolean;
  shadowMode: boolean;
}

const enabled = (environment: Record<string, string | undefined>, name: string) =>
  environment[name]?.trim().toLowerCase() === "true";

function cohortPercentage(environment: Record<string, string | undefined>) {
  const parsed = Number(environment.COURSE_PIPELINE_V2_COHORT_PERCENT ?? "0");
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

function actorIsEligible(
  environment: Record<string, string | undefined>,
  actor?: CoursePipelineFlagActor,
) {
  if (!actor) return false;
  if (actor.isOwner) return true;
  const ownerOnly = environment.COURSE_PIPELINE_V2_OWNER_ONLY?.trim().toLowerCase() !== "false";
  if (ownerOnly) return false;
  const percentage = cohortPercentage(environment);
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  const bucket = Number.parseInt(createHash("sha256").update(actor.uid).digest("hex").slice(0, 8), 16) % 10_000;
  return bucket < percentage * 100;
}

export function resolveCoursePipelineFeatureFlags(
  environment: Record<string, string | undefined>,
  actor?: CoursePipelineFlagActor,
): CoursePipelineFlags {
  const eligible = actorIsEligible(environment, actor);
  const pipelineV2 = eligible && enabled(environment, "COURSE_PIPELINE_V2");
  const validationV2 = pipelineV2 && enabled(environment, "COURSE_VALIDATION_V2");
  return {
    pipelineV2,
    validationV2,
    repairV2: validationV2 && enabled(environment, "COURSE_REPAIR_V2"),
    labsV2: pipelineV2 && enabled(environment, "COURSE_LABS_V2"),
    visualsV2: pipelineV2 && enabled(environment, "COURSE_VISUALS_V2"),
    publicationV2: validationV2 && enabled(environment, "COURSE_PUBLICATION_V2"),
    shadowMode: eligible && enabled(environment, "COURSE_PIPELINE_SHADOW_MODE"),
  };
}

export function courseUsesPipelineV2(course: Record<string, unknown>) {
  return Number(course.courseSchemaVersion ?? 0) >= 5
    || (typeof course.qualityContractVersion === "string" && course.qualityContractVersion.startsWith("course-quality-v2"));
}
