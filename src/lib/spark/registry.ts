import { z } from "zod";
import { sparkAnswerSchema } from "@/lib/spark/contracts";

const id = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/);
const base = {
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
  lessonVersion: id,
  taskId: id,
  taskVersion: id,
  objectiveIds: z.array(id).min(1).max(8),
};

export const sparkTaskRecordSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("choice"),
    correctOptionIds: z.array(id).min(1).max(8),
    feedback: z.string().trim().min(1).max(4_000),
  }).passthrough(),
  z.object({
    ...base,
    kind: z.literal("numeric"),
    expected: z.number().finite(),
    tolerance: z.number().finite().nonnegative(),
    acceptedUnits: z.array(z.string().trim().min(1).max(40)).max(8),
    feedback: z.string().trim().min(1).max(4_000),
  }).passthrough(),
  z.object({
    ...base,
    kind: z.literal("ordering"),
    expectedItemIds: z.array(id).min(2).max(10),
    feedback: z.string().trim().min(1).max(4_000),
  }).passthrough(),
  z.object({
    ...base,
    kind: z.literal("matching"),
    expectedPairs: z.array(z.object({ leftId: id, rightId: id }).strict()).min(2).max(10),
    feedback: z.string().trim().min(1).max(4_000),
  }).passthrough(),
  z.object({
    ...base,
    kind: z.literal("self_check"),
    feedback: z.string().trim().min(1).max(4_000),
  }).passthrough(),
  z.object({
    ...base,
    kind: z.literal("text"),
    rubricVersion: id,
    criteria: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
    grading: z.enum(["ai_rubric", "project_review"]),
  }).passthrough(),
]);

export type SparkTaskRecord = z.infer<typeof sparkTaskRecordSchema>;
export type SparkAnswer = z.infer<typeof sparkAnswerSchema>;

export interface SparkGrade {
  state: "demonstrated" | "needs_revision" | "self_checked" | "needs_review";
  gradingMethod: "deterministic" | "self_check" | "pending_ai" | "pending_project_review";
  verified: boolean;
  feedback: string;
}

function sameValues(actual: string[], expected: string[]) {
  return actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

export function gradeSparkAnswer(taskValue: unknown, answerValue: unknown): SparkGrade {
  const task = sparkTaskRecordSchema.parse(taskValue);
  const answer = sparkAnswerSchema.parse(answerValue);
  if (task.kind === "choice" && answer.kind === "choice") {
    const correct = sameValues(answer.optionIds, task.correctOptionIds);
    return { state: correct ? "demonstrated" : "needs_revision", gradingMethod: "deterministic", verified: correct, feedback: task.feedback };
  }
  if (task.kind === "numeric" && answer.kind === "numeric") {
    const unit = answer.unit?.trim().toLowerCase();
    const unitAccepted = !task.acceptedUnits.length
      || Boolean(unit && task.acceptedUnits.some((candidate) => candidate.toLowerCase() === unit));
    const correct = unitAccepted && Math.abs(answer.value - task.expected) <= task.tolerance;
    return { state: correct ? "demonstrated" : "needs_revision", gradingMethod: "deterministic", verified: correct, feedback: task.feedback };
  }
  if (task.kind === "ordering" && answer.kind === "ordering") {
    const correct = answer.itemIds.length === task.expectedItemIds.length
      && answer.itemIds.every((value, index) => value === task.expectedItemIds[index]);
    return { state: correct ? "demonstrated" : "needs_revision", gradingMethod: "deterministic", verified: correct, feedback: task.feedback };
  }
  if (task.kind === "matching" && answer.kind === "matching") {
    const actual = answer.pairs.map((pair) => `${pair.leftId}:${pair.rightId}`);
    const expected = task.expectedPairs.map((pair) => `${pair.leftId}:${pair.rightId}`);
    const correct = sameValues(actual, expected);
    return { state: correct ? "demonstrated" : "needs_revision", gradingMethod: "deterministic", verified: correct, feedback: task.feedback };
  }
  if (task.kind === "self_check" && answer.kind === "self_check") {
    return { state: "self_checked", gradingMethod: "self_check", verified: false, feedback: task.feedback };
  }
  if (task.kind === "text" && answer.kind === "text") {
    return task.grading === "ai_rubric"
      ? { state: "needs_review", gradingMethod: "pending_ai", verified: false, feedback: "Attempt saved. Feedback is pending." }
      : { state: "needs_review", gradingMethod: "pending_project_review", verified: false, feedback: "Checkpoint saved for project review." };
  }
  throw new Error("SPARK_ANSWER_KIND_MISMATCH");
}