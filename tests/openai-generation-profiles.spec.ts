import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { zodTextFormat } from "openai/helpers/zod";
import {
  AI_PROMPT_VERSIONS,
  AI_GENERATION_OUTPUT_BUDGETS,
  COURSE_PIPELINE_V2_PROMPT_VERSIONS,
  aiUsageProfileMetadata,
  openAiExecutionProfile,
  stablePromptCacheKey,
} from "../src/lib/openai-generation";
import { lessonGenerationSchema } from "../src/lib/validation";
import { commandCenterDraftContentSchema } from "../src/lib/command-center-draft-schema";
import {
  LESSON_GENERATION_TOTAL_BUDGET_MS,
  canAttemptLessonRepair,
  isLessonGenerationTimeout,
  lessonGenerationAttemptTimeoutMs,
} from "../src/lib/lesson-generation-runtime";

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
    openAiExecutionProfile("course.research", environment),
    openAiExecutionProfile("course.grounding", environment),
    openAiExecutionProfile("lesson.grounding", environment),
    openAiExecutionProfile("course.standard", environment),
    openAiExecutionProfile("course.repair", environment),
    openAiExecutionProfile("lesson.standard", environment),
    openAiExecutionProfile("lesson.fallback", environment),
    openAiExecutionProfile("tutor.standard", environment),
    openAiExecutionProfile("baseline.standard", environment),
    openAiExecutionProfile("capstone.standard", environment),
    openAiExecutionProfile("command-center.draft", environment),
  ];
  const recoveryProfiles = [
    openAiExecutionProfile("course.recovery", environment),
    openAiExecutionProfile("lesson.recovery", environment),
  ];

  expect(normalProfiles.every((profile) => profile.model !== "gpt-5.6-sol" && !profile.recovery)).toBe(true);
  expect(normalProfiles.slice(0, 2).every((profile) => profile.model === "gpt-5.6-terra")).toBe(true);
  expect(normalProfiles.slice(2, 5).every((profile) => profile.model === "gpt-5.6-luna")).toBe(true);
  expect(recoveryProfiles.every((profile) => profile.model === "gpt-5.6-sol" && profile.recovery)).toBe(true);
  expect(recoveryProfiles.map((profile) => profile.reasoningEffort)).toEqual(["medium", "high"]);
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
  const commandCenter = openAiExecutionProfile("command-center.draft", environment);
  const research = openAiExecutionProfile("course.research", environment);
  const grounding = openAiExecutionProfile("course.grounding", environment);

  expect(course.reasoningEffort).toBe("none");
  expect(course.model).toBe("gpt-5.6-luna");
  expect(lesson.reasoningEffort).toBe("low");
  expect(tutor.reasoningEffort).toBe("low");
  expect(tutor.textVerbosity).toBe("low");
  expect(commandCenter.model).toBe("gpt-5.6-terra");
  expect(commandCenter.reasoningEffort).toBe("medium");
  expect(commandCenter.promptVersion).toBe(AI_PROMPT_VERSIONS.commandCenter);
  expect(course.promptVersion).toBe(AI_PROMPT_VERSIONS.course);
  expect(course.promptCacheKey).toBe(stablePromptCacheKey("course", course.promptVersion, course.model));
  expect(openAiExecutionProfile("course.standard", environment).promptCacheKey).toBe(course.promptCacheKey);
  expect(course.promptCacheKey).not.toContain("user");
  expect(research.promptCacheKey.length).toBeLessThanOrEqual(64);
  expect(grounding.promptCacheKey.length).toBeLessThanOrEqual(64);
  expect(research.reasoningEffort).toBe("low");
  expect(research.model).toBe("gpt-5.6-terra");
  expect(grounding.reasoningEffort).toBe("low");
  expect(grounding.model).toBe("gpt-5.6-terra");
  expect(AI_GENERATION_OUTPUT_BUDGETS.courseOutline).toBeGreaterThan(7_000);
  expect(AI_GENERATION_OUTPUT_BUDGETS.courseGrounding).toBeGreaterThanOrEqual(3_000);
  expect(AI_GENERATION_OUTPUT_BUDGETS.lessonGrounding).toBeGreaterThan(1_800);
  expect(stablePromptCacheKey("research", "a".repeat(120), "gpt-5.6-terra")).toHaveLength(64);
  expect(aiUsageProfileMetadata(course)).toEqual({
    promptVersion: course.promptVersion,
    profile: "course.standard",
    reasoningEffort: "none",
    promptCacheKey: course.promptCacheKey,
  });
});

test("keeps V1 and V2 generation prompt versions separable", () => {
  const environment = {} as NodeJS.ProcessEnv;
  expect(openAiExecutionProfile("course.standard", environment).promptVersion).toBe(AI_PROMPT_VERSIONS.course);
  expect(openAiExecutionProfile("lesson.standard", environment, { coursePipelineV2: true }).promptVersion)
    .toBe(COURSE_PIPELINE_V2_PROMPT_VERSIONS.lesson);
});

test("honors model overrides without changing workload policy", () => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    OPENAI_COURSE_RECOVERY_MODEL: "gpt-5.6-sol-custom",
    OPENAI_COURSE_RESEARCH_MODEL: "gpt-5.6-luna-custom",
    OPENAI_COURSE_GROUNDING_MODEL: "gpt-5.6-luna-custom",
    OPENAI_ASSESSMENT_MODEL: "gpt-5.6-terra",
  };

  const recovery = openAiExecutionProfile("course.recovery", environment);
  const research = openAiExecutionProfile("course.research", environment);
  const grounding = openAiExecutionProfile("course.grounding", environment);
  const assessment = openAiExecutionProfile("baseline.standard", environment);
  expect(recovery.model).toBe("gpt-5.6-sol-custom");
  expect(recovery.reasoningEffort).toBe("medium");
  expect(research.model).toBe("gpt-5.6-luna-custom");
  expect(grounding.model).toBe("gpt-5.6-luna-custom");
  expect(assessment.model).toBe("gpt-5.6-terra");
  expect(assessment.reasoningEffort).toBe("medium");
});

test("keeps the lesson response format inside the OpenAI strict JSON Schema subset", () => {
  const format = zodTextFormat(lessonGenerationSchema, "lesson");
  expect(findUnsupportedLessonSchemaShape(format.schema)).toBeNull();
  expect(format.schema.required).toContain("visuals");
  expect(format.schema.required).toContain("citations");
});

test("keeps command-center drafts inside the strict structured-output subset", () => {
  const format = zodTextFormat(commandCenterDraftContentSchema, "command_center_draft");
  expect(findUnsupportedLessonSchemaShape(format.schema)).toBeNull();
  expect(format.schema.required).toEqual(expect.arrayContaining([
    "summary",
    "responseDraft",
    "evidenceUsed",
    "confidence",
    "cautions",
  ]));
});

test("keeps synchronous lesson generation inside the Worker deadline", () => {
  const startedAt = 1_000_000;
  expect(LESSON_GENERATION_TOTAL_BUDGET_MS).toBeLessThan(60_000);
  expect(lessonGenerationAttemptTimeoutMs(startedAt, startedAt)).toBe(40_000);
  expect(lessonGenerationAttemptTimeoutMs(startedAt, startedAt + 35_000)).toBe(7_000);
  expect(canAttemptLessonRepair(startedAt, startedAt + 34_000)).toBe(true);
  expect(canAttemptLessonRepair(startedAt, startedAt + 34_001)).toBe(false);
  expect(isLessonGenerationTimeout(Object.assign(new Error("Request timed out"), { name: "APIConnectionTimeoutError" }))).toBe(true);
});

test("keeps Recognition v2 optional and removes long-request browser keepalive", async () => {
  const [routeSource, lessonPageSource] = await Promise.all([
    readFile("src/app/api/generate-lesson/route.ts", "utf8"),
    readFile("src/app/course/[topic]/lesson/[lessonId]/page.tsx", "utf8"),
  ]);
  expect(routeSource).toContain("lesson_optional_interaction_omitted");
  expect(routeSource).not.toContain("requireInteractionV2: true");
  expect(lessonPageSource).not.toContain("keepalive: true");
});

test("bounds the final task key while preserving long model and prompt identities", () => {
  const version = "long-prompt-version-".repeat(8);
  const model = "custom-model-".repeat(8);
  const base = stablePromptCacheKey("research", version, model);
  expect(base).not.toBe(stablePromptCacheKey("research", `${version}changed`, model));
  expect(base).not.toBe(stablePromptCacheKey("research", version, `${model}changed`));
  const bibliography = stablePromptCacheKey("research", version, model, "bibliography");
  expect(bibliography).not.toBe(base);
  expect(bibliography).toHaveLength(64);
  expect(bibliography).toMatch(/^[a-z0-9:._-]+:[a-f0-9]{16}$/);
});
