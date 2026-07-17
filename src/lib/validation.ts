import { z } from "zod";

export const topicSchema = z
  .string()
  .trim()
  .min(2, "Enter a topic with at least 2 characters.")
  .max(120, "Keep the topic under 120 characters.");

const isoDateTimeSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
  "Use an ISO 8601 UTC timestamp.",
);

export const courseRequestSchema = z.object({
  topic: topicSchema,
  goal: z.string().trim().max(500).optional().default(""),
  application: z.string().trim().max(500).optional().default(""),
  background: z.string().trim().max(500).optional().default(""),
  level: z.enum(["Foundations", "Intermediate", "Advanced"]).optional(),
  weeklyMinutes: z.number().int().min(30).max(1_200).optional(),
  targetWeeks: z.number().int().min(2).max(12).optional().default(4),
  courseStyle: z.enum(["Balanced", "Concept-first", "Project-led"]).optional().default("Balanced"),
});

export const courseOutlineSchema = z.object({
  mission: z.string().trim().min(1).max(500),
  level: z.enum(["Foundations", "Intermediate", "Advanced"]),
  estimatedMinutes: z.number().int().min(10).max(10_000),
  outcome: z.string().trim().min(1).max(500),
  prerequisites: z.array(z.string().trim().min(1).max(160)).max(6),
  category: z.string().trim().min(1).max(80),
  modules: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(300),
        lessons: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(120),
              concept: z.string().trim().min(1).max(300),
              estimatedMinutes: z.number().int().min(3).max(90),
            }),
          )
          .min(2)
          .max(6),
      }),
    )
    .min(2)
    .max(6),
});

export const lessonDataSchema = z.object({
  content: z.string().trim().min(1).max(30_000),
  diagram: z.string().max(8_000),
  diagramSummary: z.string().trim().min(1).max(2_000),
  quizzes: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(500),
        options: z.array(z.string().trim().min(1).max(300)).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().trim().min(1).max(1_000),
      }),
    )
    .min(2)
    .max(3),
});

export const generateLessonInputSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
});

export const tutorInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(12),
  data: z.object({
    courseId: z.string().trim().min(1).max(200),
    lessonId: z.string().regex(/^\d+-\d+$/),
  }),
});

export const progressUpdateSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  topic: topicSchema,
  lessonId: z.string().regex(/^\d+-\d+$/),
  lessonTitle: z.string().trim().min(1).max(160),
  totalQuestions: z.number().int().min(0).max(20),
  firstAttemptCorrect: z.number().int().min(0).max(20),
  attempts: z.number().int().min(0).max(100),
  confidence: z.enum(["low", "medium", "high"]),
  review: z.boolean().optional(),
  totalLessons: z.number().int().min(1).max(500).optional(),
  estimatedMinutes: z.number().int().min(1).max(180).optional(),
  nextLessonId: z.string().regex(/^\d+-\d+$/).nullable().optional(),
  nextLessonTitle: z.string().trim().min(1).max(160).nullable().optional(),
});

export const learnerStateSchema = z.object({
  courseBookmarks: z.array(z.string().trim().min(1).max(200)).max(500),
  lessonBookmarks: z.array(z.string().trim().min(1).max(400)).max(2_000),
  notes: z.record(z.string().trim().min(1).max(400), z.string().max(12_000)),
  noteUpdatedAt: z.record(z.string().trim().min(1).max(400), isoDateTimeSchema).default({}),
  weeklyLessonGoal: z.number().int().min(1).max(50),
  updatedAt: isoDateTimeSchema.optional(),
});

export function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "The request was not valid.";
}
