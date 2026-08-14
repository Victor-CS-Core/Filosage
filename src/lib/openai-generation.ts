import { serverEnvironment } from "@/lib/runtime-environment";

export const AI_PROMPT_VERSIONS = {
  research: "2026-08-14-grounded-course-research-v5",
  grounding: "2026-08-14-claim-grounding-v3",
  course: "2026-08-14-grounded-evidence-ceiling-v1",
  lesson: "2026-08-14-grounded-claims-v3",
  tutor: "2026-08-04-grounded-tutor",
  baseline: "2026-08-04-baseline-assessor",
  capstone: "2026-08-04-capstone-assessor",
  commandCenter: "2026-08-06-draft-only-v5",
} as const;

export const COURSE_PIPELINE_V2_PROMPT_VERSIONS = {
  course: "2026-08-14-grounded-source-v4",
  lesson: "2026-08-14-grounded-source-v5",
} as const;

export const AI_GENERATION_OUTPUT_BUDGETS = {
  research: 3_000,
  sourceEvidenceValidation: 3_000,
  courseOutline: 9_000,
  courseGrounding: 3_000,
  lessonGrounding: 2_000,
} as const;

export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export type AiTextVerbosity = "low" | "medium" | "high";

export type AiExecutionProfileId =
  | "course.research"
  | "course.grounding"
  | "lesson.grounding"
  | "course.standard"
  | "course.repair"
  | "course.recovery"
  | "lesson.standard"
  | "lesson.fallback"
  | "lesson.recovery"
  | "tutor.standard"
  | "baseline.standard"
  | "capstone.standard"
  | "command-center.draft";

export interface AiExecutionProfile {
  id: AiExecutionProfileId;
  workload: keyof typeof AI_PROMPT_VERSIONS;
  model: string;
  promptVersion: string;
  reasoningEffort: AiReasoningEffort;
  textVerbosity: AiTextVerbosity;
  promptCacheKey: string;
  recovery: boolean;
}

interface ProfileSpec {
  workload: AiExecutionProfile["workload"];
  modelEnv: string[];
  defaultModel: string;
  reasoningEffort: AiReasoningEffort;
  textVerbosity: AiTextVerbosity;
  recovery?: boolean;
}

const PROFILE_SPECS: Record<AiExecutionProfileId, ProfileSpec> = {
  "course.research": {
    workload: "research",
    modelEnv: ["OPENAI_COURSE_RESEARCH_MODEL"],
    defaultModel: "gpt-5.6-terra",
    reasoningEffort: "low",
    textVerbosity: "medium",
  },
  "course.grounding": {
    workload: "grounding",
    modelEnv: ["OPENAI_COURSE_GROUNDING_MODEL"],
    defaultModel: "gpt-5.6-terra",
    reasoningEffort: "low",
    textVerbosity: "low",
  },
  "lesson.grounding": {
    workload: "grounding",
    modelEnv: ["OPENAI_LESSON_GROUNDING_MODEL", "OPENAI_LESSON_MODEL"],
    defaultModel: "gpt-5.6-luna",
    reasoningEffort: "low",
    textVerbosity: "low",
  },
  "course.standard": {
    workload: "course",
    modelEnv: ["OPENAI_COURSE_STANDARD_MODEL"],
    defaultModel: "gpt-5.6-luna",
    reasoningEffort: "none",
    textVerbosity: "medium",
  },
  "course.repair": {
    workload: "course",
    modelEnv: ["OPENAI_COURSE_REPAIR_MODEL", "OPENAI_COURSE_STANDARD_MODEL"],
    defaultModel: "gpt-5.6-luna",
    reasoningEffort: "none",
    textVerbosity: "medium",
  },
  "course.recovery": {
    workload: "course",
    modelEnv: ["OPENAI_COURSE_RECOVERY_MODEL"],
    defaultModel: "gpt-5.6-sol",
    reasoningEffort: "medium",
    textVerbosity: "medium",
    recovery: true,
  },
  "lesson.standard": {
    workload: "lesson",
    modelEnv: ["OPENAI_LESSON_MODEL"],
    defaultModel: "gpt-5.6-luna",
    reasoningEffort: "medium",
    textVerbosity: "medium",
  },
  "lesson.fallback": {
    workload: "lesson",
    modelEnv: ["OPENAI_LESSON_FALLBACK_MODEL", "OPENAI_COURSE_MODEL", "OPENAI_MODEL"],
    defaultModel: "gpt-5.6-terra",
    reasoningEffort: "medium",
    textVerbosity: "medium",
  },
  "lesson.recovery": {
    workload: "lesson",
    modelEnv: ["OPENAI_LESSON_RECOVERY_MODEL", "OPENAI_COURSE_RECOVERY_MODEL"],
    defaultModel: "gpt-5.6-sol",
    reasoningEffort: "high",
    textVerbosity: "medium",
    recovery: true,
  },
  "tutor.standard": {
    workload: "tutor",
    modelEnv: ["OPENAI_TUTOR_MODEL"],
    defaultModel: "gpt-5.6-luna",
    reasoningEffort: "low",
    textVerbosity: "low",
  },
  "baseline.standard": {
    workload: "baseline",
    modelEnv: ["OPENAI_ASSESSMENT_MODEL", "OPENAI_TUTOR_MODEL"],
    defaultModel: "gpt-5.6-luna",
    reasoningEffort: "medium",
    textVerbosity: "low",
  },
  "capstone.standard": {
    workload: "capstone",
    modelEnv: ["OPENAI_ASSESSMENT_MODEL", "OPENAI_TUTOR_MODEL"],
    defaultModel: "gpt-5.6-luna",
    reasoningEffort: "medium",
    textVerbosity: "low",
  },
  "command-center.draft": {
    workload: "commandCenter",
    modelEnv: ["OPENAI_COMMAND_CENTER_MODEL", "OPENAI_MODEL"],
    defaultModel: "gpt-5.6-terra",
    reasoningEffort: "medium",
    textVerbosity: "medium",
  },
};

function configuredModel(spec: ProfileSpec, environment: NodeJS.ProcessEnv) {
  for (const key of spec.modelEnv) {
    const configured = environment[key]?.trim();
    if (configured) return configured;
  }
  return spec.defaultModel;
}

export function stablePromptCacheKey(
  workload: AiExecutionProfile["workload"],
  promptVersion: string,
  model: string,
) {
  const normalized = `filosage:${workload}:${promptVersion}:${model}`
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-");
  // The Responses API rejects prompt_cache_key values longer than 64 chars.
  return normalized.slice(0, 64);
}

export function openAiExecutionProfile(
  id: AiExecutionProfileId,
  environment: NodeJS.ProcessEnv = serverEnvironment,
  options: { coursePipelineV2?: boolean } = {},
): AiExecutionProfile {
  const spec = PROFILE_SPECS[id];
  const model = configuredModel(spec, environment);
  const promptVersion = options.coursePipelineV2 && (spec.workload === "course" || spec.workload === "lesson")
    ? COURSE_PIPELINE_V2_PROMPT_VERSIONS[spec.workload]
    : AI_PROMPT_VERSIONS[spec.workload];
  return {
    id,
    workload: spec.workload,
    model,
    promptVersion,
    reasoningEffort: spec.reasoningEffort,
    textVerbosity: spec.textVerbosity,
    promptCacheKey: stablePromptCacheKey(spec.workload, promptVersion, model),
    recovery: spec.recovery === true,
  };
}

export function aiUsageProfileMetadata(profile: AiExecutionProfile) {
  return {
    promptVersion: profile.promptVersion,
    profile: profile.id,
    reasoningEffort: profile.reasoningEffort,
    promptCacheKey: profile.promptCacheKey,
  };
}
