import { serverEnvironment } from "@/lib/runtime-environment";

export const AI_PROMPT_VERSIONS = {
  course: "2026-08-04-guided-apprenticeship",
  lesson: "2026-08-03-guided-apprenticeship",
  tutor: "2026-08-04-grounded-tutor",
  baseline: "2026-08-04-baseline-assessor",
  capstone: "2026-08-04-capstone-assessor",
  commandCenter: "2026-08-06-draft-only-v5",
} as const;

export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
export type AiTextVerbosity = "low" | "medium" | "high";

export type AiExecutionProfileId =
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
  "course.standard": {
    workload: "course",
    modelEnv: ["OPENAI_COURSE_MODEL", "OPENAI_MODEL"],
    defaultModel: "gpt-5.6-terra",
    reasoningEffort: "medium",
    textVerbosity: "medium",
  },
  "course.repair": {
    workload: "course",
    modelEnv: ["OPENAI_COURSE_MODEL", "OPENAI_MODEL"],
    defaultModel: "gpt-5.6-terra",
    reasoningEffort: "medium",
    textVerbosity: "medium",
  },
  "course.recovery": {
    workload: "course",
    modelEnv: ["OPENAI_COURSE_RECOVERY_MODEL"],
    defaultModel: "gpt-5.6-sol",
    reasoningEffort: "high",
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
  return normalized.slice(0, 120);
}

export function openAiExecutionProfile(
  id: AiExecutionProfileId,
  environment: NodeJS.ProcessEnv = serverEnvironment,
): AiExecutionProfile {
  const spec = PROFILE_SPECS[id];
  const model = configuredModel(spec, environment);
  const promptVersion = AI_PROMPT_VERSIONS[spec.workload];
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
