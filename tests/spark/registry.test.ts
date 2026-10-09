import assert from "node:assert/strict";
import test from "node:test";
import { gradeSparkAnswer } from "../../src/lib/spark/registry.ts";

const base = {
  courseId: "course-1",
  lessonId: "0-0",
  lessonVersion: "lesson-version",
  taskId: "task-1",
  taskVersion: "task-version",
  objectiveIds: ["objective-1"],
  feedback: "Use the criterion to check the committed answer.",
};

test("deterministic task families grade only matching answer contracts", () => {
  assert.equal(gradeSparkAnswer({ ...base, kind: "choice", correctOptionIds: ["a", "c"] }, { kind: "choice", optionIds: ["c", "a"] }).state, "demonstrated");
  assert.equal(gradeSparkAnswer({ ...base, kind: "numeric", expected: 10, tolerance: 0.1, acceptedUnits: ["kg"] }, { kind: "numeric", value: 10.05, unit: "KG" }).state, "demonstrated");
  assert.equal(gradeSparkAnswer({ ...base, kind: "ordering", expectedItemIds: ["a", "b"] }, { kind: "ordering", itemIds: ["b", "a"] }).state, "needs_revision");
  assert.equal(gradeSparkAnswer({
    ...base,
    kind: "matching",
    expectedPairs: [{ leftId: "a", rightId: "b" }, { leftId: "c", rightId: "d" }],
  }, { kind: "matching", pairs: [{ leftId: "c", rightId: "d" }, { leftId: "a", rightId: "b" }] }).verified, true);
  assert.throws(() => gradeSparkAnswer({ ...base, kind: "choice", correctOptionIds: ["a"] }, { kind: "text", text: "a" }), /SPARK_ANSWER_KIND_MISMATCH/);
});

test("self-check and text tasks never manufacture verified evidence", () => {
  assert.equal(gradeSparkAnswer({ ...base, kind: "self_check" }, { kind: "self_check", recalled: true }).verified, false);
  const grade = gradeSparkAnswer({
    ...base,
    kind: "text",
    rubricVersion: "rubric-1",
    criteria: ["Explain the decision"],
    grading: "ai_rubric",
  }, { kind: "text", text: "My committed response" });
  assert.equal(grade.state, "needs_review");
  assert.equal(grade.gradingMethod, "pending_ai");
});