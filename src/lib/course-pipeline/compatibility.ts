import { z } from "zod";
import { courseOutlineSchema, lessonDataSchema, nonSubstantiveLessonDataSchema } from "@/lib/validation";

const legacyLessonSummarySchema = z.object({
  title: z.string().trim().min(1).max(160),
  concept: z.string().trim().min(1).max(500),
}).passthrough();

const legacyCourseSchema = z.object({
  topic: z.string().trim().min(2).max(160),
  modules: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    lessons: z.array(legacyLessonSummarySchema).min(1).max(20),
  }).passthrough()).min(1).max(20),
}).passthrough();

const legacyQuizSchema = z.object({
  question: z.string().trim().min(1).max(1_000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
  correctIndex: z.number().int().min(0),
  explanation: z.string().trim().min(1).max(2_000),
}).passthrough().superRefine((quiz, context) => {
  if (quiz.correctIndex >= quiz.options.length) {
    context.addIssue({ code: "custom", path: ["correctIndex"], message: "The correct answer index is outside the available options." });
  }
});

const legacyLessonSchema = z.object({
  content: z.string().trim().min(200).max(30_000),
  quizzes: z.array(legacyQuizSchema).min(1).max(10),
}).passthrough();

export function isLegacyCourseCandidate(value: Record<string, unknown>) {
  if (typeof value.schemaVersion === "number") return value.schemaVersion < 4;
  return typeof value.courseSchemaVersion !== "number"
    && Array.isArray(value.modules)
    && (!("mission" in value) || !("outcome" in value) || !("capstone" in value));
}

export function isLegacyLessonCandidate(value: Record<string, unknown>) {
  if (typeof value.schemaVersion === "number") return value.schemaVersion < 4;
  return typeof value.courseSchemaVersion !== "number"
    && typeof value.content === "string"
    && Array.isArray(value.quizzes)
    && (!("learningObjective" in value) || !("guidedPractice" in value) || !("transferTask" in value));
}

export function parseCourseCandidate(value: Record<string, unknown>) {
  return isLegacyCourseCandidate(value) ? legacyCourseSchema.safeParse(value) : courseOutlineSchema.safeParse(value);
}

export function parseLessonCandidate(value: Record<string, unknown>) {
  if (isLegacyLessonCandidate(value)) return legacyLessonSchema.safeParse(value);
  if (["introduction", "review", "glossary", "reference", "capstone"].includes(String(value.lessonKind ?? ""))) {
    return nonSubstantiveLessonDataSchema.safeParse(value);
  }
  return lessonDataSchema.safeParse(value);
}
