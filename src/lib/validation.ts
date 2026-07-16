import { z } from "zod";

export const topicSchema = z
  .string()
  .trim()
  .min(2, "Enter a topic with at least 2 characters.")
  .max(120, "Keep the topic under 120 characters.");

export const courseOutlineSchema = z.object({
  mission: z.string().trim().min(1).max(500),
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
  topic: topicSchema,
  lessonTitle: z.string().trim().min(1).max(160),
  lessonConcept: z.string().trim().min(1).max(500),
  courseId: z.string().trim().min(1).max(200).nullable().optional(),
  lessonId: z.string().regex(/^\d+-\d+$/).nullable().optional(),
});

export const tutorInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4_000),
      }),
    )
    .min(1)
    .max(30),
  data: z.object({
    topic: topicSchema,
    lessonTitle: z.string().trim().min(1).max(160),
    lessonConcept: z.string().trim().min(1).max(500),
    lessonContent: z.string().trim().min(1).max(30_000),
  }),
});

export function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "The request was not valid.";
}
