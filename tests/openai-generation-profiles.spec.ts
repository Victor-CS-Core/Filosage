import { expect, test } from "@playwright/test";
import {
  AI_PROMPT_VERSIONS,
  aiUsageProfileMetadata,
  openAiExecutionProfile,
  stablePromptCacheKey,
} from "../src/lib/openai-generation";

test("keeps Sol off normal generation paths and reserves it for recovery", () => {
  const environment = {} as NodeJS.ProcessEnv;
  const normalProfiles = [
    openAiExecutionProfile("course.standard", environment),
    openAiExecutionProfile("course.repair", environment),
    openAiExecutionProfile("lesson.standard", environment),
    openAiExecutionProfile("lesson.fallback", environment),
    openAiExecutionProfile("tutor.standard", environment),
    openAiExecutionProfile("baseline.standard", environment),
    openAiExecutionProfile("capstone.standard", environment),
  ];
  const recoveryProfiles = [
    openAiExecutionProfile("course.recovery", environment),
    openAiExecutionProfile("lesson.recovery", environment),
  ];

  expect(normalProfiles.every((profile) => profile.model !== "gpt-5.6-sol" && !profile.recovery)).toBe(true);
  expect(recoveryProfiles.every((profile) => profile.model === "gpt-5.6-sol" && profile.recovery)).toBe(true);
  expect(recoveryProfiles.every((profile) => profile.reasoningEffort === "high")).toBe(true);
});

test("uses explicit workload reasoning and stable versioned cache keys", () => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    OPENAI_COURSE_MODEL: "gpt-5.6-terra",
    OPENAI_LESSON_MODEL: "gpt-5.6-luna",
    OPENAI_TUTOR_MODEL: "gpt-5.6-luna",
  };
  const course = openAiExecutionProfile("course.standard", environment);
  const lesson = openAiExecutionProfile("lesson.standard", environment);
  const tutor = openAiExecutionProfile("tutor.standard", environment);

  expect(course.reasoningEffort).toBe("medium");
  expect(lesson.reasoningEffort).toBe("medium");
  expect(tutor.reasoningEffort).toBe("low");
  expect(tutor.textVerbosity).toBe("low");
  expect(course.promptVersion).toBe(AI_PROMPT_VERSIONS.course);
  expect(course.promptCacheKey).toBe(stablePromptCacheKey("course", course.promptVersion, course.model));
  expect(openAiExecutionProfile("course.standard", environment).promptCacheKey).toBe(course.promptCacheKey);
  expect(course.promptCacheKey).not.toContain("user");
  expect(aiUsageProfileMetadata(course)).toEqual({
    promptVersion: course.promptVersion,
    profile: "course.standard",
    reasoningEffort: "medium",
    promptCacheKey: course.promptCacheKey,
  });
});

test("honors model overrides without changing workload policy", () => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    OPENAI_COURSE_RECOVERY_MODEL: "gpt-5.6-sol-custom",
    OPENAI_ASSESSMENT_MODEL: "gpt-5.6-terra",
  };

  const recovery = openAiExecutionProfile("course.recovery", environment);
  const assessment = openAiExecutionProfile("baseline.standard", environment);
  expect(recovery.model).toBe("gpt-5.6-sol-custom");
  expect(recovery.reasoningEffort).toBe("high");
  expect(assessment.model).toBe("gpt-5.6-terra");
  expect(assessment.reasoningEffort).toBe("medium");
});
