import assert from "node:assert/strict";
import test from "node:test";
import type { SparkLessonContext } from "../../src/lib/spark/access.ts";
import { buildSparkPreparation, chunkSparkLesson, sparkManifestFromDocument } from "../../src/lib/spark/preparation.ts";

function context(content: string): SparkLessonContext {
  return {
    courseId: "course-1",
    lessonId: "0-0",
    lessonVersion: "lesson-1234567890abcdef",
    contentHash: "a".repeat(64),
    course: { topic: "Neural networks", modules: [] },
    summary: { title: "A first neuron", concept: "Weighted inputs" },
    lesson: {
      content,
      objectiveIds: ["objective-neuron"],
      quizzes: [{
        question: "Which input contributes more?",
        options: ["Input one", "Input two"],
        correctIndex: 0,
        explanation: "Input one has the larger weight.",
      }],
    },
  };
}

test("preparation creates stable bounded chunks and a validated manifest", () => {
  const lesson = context(Array.from({ length: 12 }, (_, index) => `Section ${index}. ${"concept ".repeat(80)}`).join("\n\n"));
  const first = chunkSparkLesson(lesson);
  const second = chunkSparkLesson(lesson);
  assert.deepEqual(first, second);
  assert.ok(first.length > 1 && first.length <= 16);
  assert.ok(first.every((chunk) => chunk.text.split(/\s+/).length <= 600));
  const prepared = buildSparkPreparation(lesson, "en", "2026-10-09T00:00:00.000Z");
  assert.equal(prepared.manifest.blocks.some((block) => block.type === "parameter_explorer" && block.template === "neuron-v1"), true);
  assert.equal(JSON.stringify(prepared.manifest).includes("correctOptionIds"), false);
  assert.deepEqual(prepared.taskRecords[0]?.correctOptionIds, ["option-1"]);
});

test("manifest identity changes with locale without changing server task keys", () => {
  const lesson = context("A concise saved lesson.");
  const english = buildSparkPreparation(lesson, "en", "2026-10-09T00:00:00.000Z");
  const spanish = buildSparkPreparation(lesson, "es", "2026-10-09T00:00:00.000Z");
  assert.notEqual(english.manifest.id, spanish.manifest.id);
  assert.equal(english.manifest.id, buildSparkPreparation(lesson, "en-US", "2026-10-09T00:00:00.000Z").manifest.id);
  assert.equal(english.taskRecords[0]?.taskVersion, spanish.taskRecords[0]?.taskVersion);
});

test("a persisted manifest remains readable through the strict learner contract", () => {
  const prepared = buildSparkPreparation(context("A concise saved lesson."), "en", "2026-10-09T00:00:00.000Z");
  assert.deepEqual(sparkManifestFromDocument(prepared.manifest), prepared.manifest);
  assert.equal(sparkManifestFromDocument({ ...prepared.manifest, ownerUid: "private-owner" }), null);
});