import { expect, test } from "@playwright/test";
import { zodTextFormat } from "openai/helpers/zod";
import {
  AI_PROMPT_VERSIONS,
  aiUsageProfileMetadata,
  openAiExecutionProfile,
  stablePromptCacheKey,
} from "../src/lib/openai-generation";
import { lessonGenerationSchema } from "../src/lib/validation";

function findUnsupportedLessonSchemaShape(value: unknown, path = "$schema"): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "default")) return `${path}.default`;
  if (Array.isArray(record.items)) return `${path}.items`;
  for (const [key, child] of Object.entries(record)) {
    if (key === "default") continue;
    if (Array.isArray(child)) {
      for (let index = 0; index < child.length; index += 1) {
        const match = findUnsupportedLessonSchemaShape(child[index], `${path}.${key}[${index}]`);
        if (match) return match;
      }
      continue;
    }
    const match = findUnsupportedLessonSchemaShape(child, `${path}.${key}`);
    if (match) return match;
  }
  return null;
}

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

test("keeps the lesson response format inside the OpenAI strict JSON Schema subset", () => {
  const format = zodTextFormat(lessonGenerationSchema, "lesson");
  expect(findUnsupportedLessonSchemaShape(format.schema)).toBeNull();
  expect(format.schema.required).toContain("visuals");
  expect(format.schema.required).toContain("sourceReferences");
});
