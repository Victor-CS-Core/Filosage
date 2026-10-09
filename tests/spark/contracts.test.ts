import assert from "node:assert/strict";
import test from "node:test";
import {
  safeSparkManifest,
  sparkBlockSchema,
  sparkTurnResponseSchema,
} from "../../src/lib/spark/contracts.ts";

const base = {
  id: "block-1",
  sourceRefs: [],
  evidenceStatus: "course_supported" as const,
};

test("trusted Spark blocks accept known formulas and reject executable or nonfinite configuration", () => {
  const neuron = sparkBlockSchema.safeParse({
    ...base,
    type: "parameter_explorer",
    title: "A neuron",
    prompt: "Change one input.",
    template: "neuron-v1",
    config: { x1: 3, x2: 7, weight1: 0.8, weight2: 0.2, bias: -4, x1Label: "Study", x2Label: "Sleep", minimum: 0, maximum: 10, step: 1 },
  });
  assert.equal(neuron.success, true);
  if (!neuron.success || neuron.data.type !== "parameter_explorer" || neuron.data.template !== "neuron-v1") {
    assert.fail("Expected a parsed neuron explorer.");
  }
  assert.equal(sparkBlockSchema.safeParse({ ...neuron.data, template: "javascript-v1", code: "alert(1)" }).success, false);
  assert.equal(sparkBlockSchema.safeParse({ ...neuron.data, config: { ...neuron.data.config, x1: Number.POSITIVE_INFINITY } }).success, false);
});

test("learner manifests cannot carry answer keys", () => {
  const block = {
    ...base,
    type: "single_choice",
    taskId: "task-1",
    taskVersion: "task-v1",
    prompt: "Which input contributes more?",
    options: [{ id: "study", text: "Study" }, { id: "sleep", text: "Sleep" }],
    correctOptionId: "study",
  };
  assert.equal(sparkBlockSchema.safeParse(block).success, false);
});

test("manifests and turn responses enforce block and byte bounds", () => {
  const manifest = {
    schemaVersion: 1,
    registryVersion: "spark-registry-v1",
    id: "manifest-1",
    courseId: "course-1",
    lessonId: "1-1",
    lessonVersion: "lesson-v1",
    locale: "en",
    stage: "practice",
    objectiveIds: ["objective-1"],
    contentHash: "a".repeat(64),
    evidenceStatus: "course_supported",
    blocks: [],
    createdAt: "2026-10-09T00:00:00.000Z",
  };
  assert.equal(safeSparkManifest(manifest).success, true);
  assert.equal(safeSparkManifest({ ...manifest, blocks: Array.from({ length: 9 }, (_, index) => ({
    ...base,
    id: `block-${index}`,
    type: "explanation",
    title: "Title",
    text: "Text",
    style: "concise",
  })) }).success, false);
  assert.equal(sparkTurnResponseSchema.safeParse({
    schemaVersion: 1,
    lessonVersion: "lesson-v1",
    stage: "practice",
    availability: "saved_only",
    blocks: [{ ...base, type: "explanation", title: "Title", text: "x".repeat(70_000), style: "concise" }],
    suggestedActions: [],
    usage: { questionsRemaining: null },
  }).success, false);
});