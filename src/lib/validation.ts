import { z } from "zod";
import { lessonVisualsSchema } from "@/lib/lesson-visuals";
import { lessonInteractionsSchema } from "@/lib/lesson-interactions";
import { isSafePublicSourceUrl } from "@/lib/source-safety";
import { containsSerializedCriterionList } from "@/lib/course-criteria";

export const topicSchema = z
  .string()
  .trim()
  .min(2, "Enter a topic with at least 2 characters.")
  .max(120, "Keep the topic under 120 characters.");

const isoDateTimeSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
  "Use an ISO 8601 UTC timestamp.",
);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.");

export const courseRequestSchema = z.object({
  topic: topicSchema,
  goal: z.string().trim().max(500, "Keep the learning goal under 500 characters.").optional().default(""),
  application: z.string().trim().max(500, "Keep the application under 500 characters.").optional().default(""),
  background: z.string().trim().max(500, "Keep your background under 500 characters.").optional().default(""),
  level: z.enum(["Foundations", "Intermediate", "Advanced"]).optional(),
  weeklyMinutes: z.number().int().min(30).max(1_200).optional(),
  targetWeeks: z.number().int().min(2).max(12).optional().default(4),
  courseStyle: z.enum(["Balanced", "Concept-first", "Project-led"]).optional().default("Balanced"),
  artifactPreference: z.string().trim().max(500, "Keep the artifact preference under 500 characters.").optional().default(""),
  scenarioPreference: z.string().trim().max(500, "Keep the scenario under 500 characters.").optional().default(""),
  language: z.string().trim().min(2).max(80).optional().default("English"),
  freshnessRequired: z.boolean().optional().default(false),
  sourcePack: z.array(z.object({
    id: z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/),
    label: z.string().trim().min(2).max(120),
    url: z.string().url().startsWith("https://").max(500)
      .refine(isSafePublicSourceUrl, "Use a public HTTPS address without credentials, local hosts, or raw IP addresses.")
      .optional(),
    kind: z.enum(["primary", "official", "licensed", "author-provided"]),
    rights: z.enum(["link-only", "public-domain", "licensed", "author-owned"]),
    author: z.string().trim().max(160).optional(),
    publisher: z.string().trim().max(160).optional(),
    publicationDate: isoDateSchema.optional(),
    note: z.string().trim().max(800).optional(),
  }).superRefine((source, context) => {
    if (!source.url && !source.note) context.addIssue({ code: "custom", message: "Add a source URL or a short source note." });
  })).max(5).optional().default([]),
});

export const courseOutlineSchema = z.object({
  mission: z.string().trim().min(1).max(500),
  level: z.enum(["Foundations", "Intermediate", "Advanced"]),
  estimatedMinutes: z.number().int().min(10).max(10_000),
  outcome: z.string().trim().min(1).max(500),
  prerequisites: z.array(z.string().trim().min(1).max(160)).max(6),
  category: z.string().trim().min(1).max(80),
  audience: z.string().trim().min(1).max(240),
  artifact: z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    format: z.string().trim().min(1).max(120),
  }),
  scenario: z.object({
    title: z.string().trim().min(1).max(120),
    context: z.string().trim().min(1).max(500),
    stakes: z.string().trim().min(1).max(300),
  }),
  modules: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(300),
        objective: z.string().trim().min(1).max(300),
        challenge: z.object({
          title: z.string().trim().min(1).max(120),
          prompt: z.string().trim().min(1).max(600),
          successCriteria: z.array(z.string().trim().min(1).max(220)).min(2).max(4),
        }),
        milestone: z.object({
          title: z.string().trim().min(1).max(120),
          deliverable: z.string().trim().min(1).max(300),
          evidence: z.string().trim().min(1).max(300),
        }),
        lessons: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(120),
              concept: z.string().trim().min(1).max(300),
              estimatedMinutes: z.number().int().min(3).max(90),
              objective: z.string().trim().min(1).max(300),
              lessonMode: z.enum(["concept", "worked-example", "comparison", "case-study", "practice-lab", "synthesis"]),
              buildsOn: z.array(z.string().trim().min(1).max(120)).max(3),
              misconception: z.string().trim().min(1).max(300),
              practiceType: z.enum(["explain", "classify", "calculate", "decide", "create", "debug"]),
              masteryCriteria: z.string().trim().min(1).max(300),
              activityPreview: z.string().trim().min(1).max(300),
              artifactContribution: z.string().trim().min(1).max(300),
              sourceIds: z.array(z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/)).max(5).optional().default([]),
              contentBasis: z.enum(["verified-source", "model-knowledge"]).optional().default("model-knowledge"),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(6),
  capstone: z.object({
    title: z.string().trim().min(1).max(120),
    brief: z.string().trim().min(1).max(800),
    deliverable: z.string().trim().min(1).max(300),
    successCriteria: z.array(
      z.string().trim().min(1).max(220)
        .refine((criterion) => !containsSerializedCriterionList(criterion), "Return each success criterion as a separate list item."),
    ).min(3).max(6),
  }),
});

const quizSchema = z.object({
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(1_000),
  optionFeedback: z.array(z.string().trim().min(1).max(500)).length(4),
});

const lessonWithoutVisualsSchema = z.object({
  learningObjective: z.string().trim().min(1).max(400),
  connection: z.string().trim().min(1).max(500),
  keyTakeaways: z.array(z.string().trim().min(1).max(240)).min(2).max(5),
  content: z.string().trim().min(400).max(24_000),
  guidedPractice: z.object({
    prompt: z.string().trim().min(1).max(800),
    steps: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
    modelAnswer: z.string().trim().min(1).max(2_000),
  }),
  transferTask: z.object({
    prompt: z.string().trim().min(1).max(800),
    successCriteria: z.array(
      z.string().trim().min(1).max(240)
        .refine((criterion) => !containsSerializedCriterionList(criterion), "Return each success criterion as a separate list item."),
    ).min(1).max(4),
    modelResponse: z.string().trim().min(1).max(2_000),
  }),
  quizzes: z
    .array(quizSchema)
    .min(1)
    .max(3),
  citations: z.array(z.object({
    id: z.string().trim().regex(/^citation-[a-z0-9-]{1,60}$/),
    sourceId: z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/),
    evidenceClaimId: z.string().trim().regex(/^evidence-[a-z0-9-]{1,80}$/).optional(),
    claim: z.string().trim().min(1).max(280),
    section: z.enum(["learning_objective", "connection", "content", "key_takeaway", "experience", "guided_practice", "transfer_task", "visual", "interaction", "quiz", "quiz_explanation"]),
    locator: z.string().trim().min(1).max(160).optional(),
    objectiveIds: z.array(z.string().trim().regex(/^objective-[a-z0-9-]+$/)).min(1).max(5).optional(),
  })).max(8).optional().default([]),
});

const lessonExperienceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("concept"),
    predictionPrompt: z.string().trim().min(1).max(600),
    mentalModel: z.object({
      title: z.string().trim().min(1).max(160),
      parts: z.array(z.object({ label: z.string().trim().min(1).max(120), role: z.string().trim().min(1).max(300) })).min(2).max(5),
    }),
    misconceptionCheck: z.object({ claim: z.string().trim().min(1).max(300), correction: z.string().trim().min(1).max(600) }),
  }),
  z.object({
    type: z.literal("worked-example"),
    scenario: z.string().trim().min(1).max(800),
    steps: z.array(z.object({ title: z.string().trim().min(1).max(120), reasoning: z.string().trim().min(1).max(500), output: z.string().trim().min(1).max(500) })).min(3).max(6),
    fadingPrompt: z.string().trim().min(1).max(800),
  }),
  z.object({
    type: z.literal("comparison"),
    options: z.array(z.string().trim().min(1).max(120)).length(2),
    criteria: z.array(z.object({ criterion: z.string().trim().min(1).max(120), first: z.string().trim().min(1).max(300), second: z.string().trim().min(1).max(300) })).min(3).max(6),
    boundaryCase: z.object({ prompt: z.string().trim().min(1).max(600), resolution: z.string().trim().min(1).max(600) }),
  }),
  z.object({
    type: z.literal("case-study"),
    brief: z.string().trim().min(1).max(800),
    evidence: z.array(z.object({ label: z.string().trim().min(1).max(120), detail: z.string().trim().min(1).max(500) })).min(3).max(6),
    interpretations: z.array(z.string().trim().min(1).max(400)).min(2).max(4),
    decisionPrompt: z.string().trim().min(1).max(800),
  }),
  z.object({
    type: z.literal("practice-lab"),
    brief: z.string().trim().min(1).max(800),
    materials: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
    tasks: z.array(z.string().trim().min(1).max(400)).min(3).max(7),
    artifactPrompt: z.string().trim().min(1).max(800),
    successCriteria: z.array(
      z.string().trim().min(1).max(240)
        .refine((criterion) => !containsSerializedCriterionList(criterion), "Return each success criterion as a separate list item."),
    ).min(2).max(5),
  }),
  z.object({
    type: z.literal("synthesis"),
    challenge: z.string().trim().min(1).max(800),
    connections: z.array(z.object({ concept: z.string().trim().min(1).max(120), contribution: z.string().trim().min(1).max(400) })).min(2).max(6),
    capstoneContribution: z.string().trim().min(1).max(600),
    reflectionPrompt: z.string().trim().min(1).max(600),
  }),
]);

export const lessonDataSchema = lessonWithoutVisualsSchema.extend({
  visuals: lessonVisualsSchema.optional().default([]),
  interactions: lessonInteractionsSchema.optional().default([]),
  experience: lessonExperienceSchema.optional(),
});

export const nonSubstantiveLessonDataSchema = lessonDataSchema
  .omit({ connection: true, keyTakeaways: true, guidedPractice: true, transferTask: true, quizzes: true })
  .extend({
    lessonKind: z.enum(["introduction", "review", "glossary", "reference", "capstone"]),
    content: z.string().trim().min(200).max(24_000),
    connection: z.string().trim().min(1).max(500).optional(),
    keyTakeaways: z.array(z.string().trim().min(1).max(240)).max(5).optional().default([]),
    guidedPractice: lessonWithoutVisualsSchema.shape.guidedPractice.optional(),
    transferTask: lessonWithoutVisualsSchema.shape.transferTask.optional(),
    quizzes: z.array(quizSchema).max(3).optional().default([]),
  });

export const lessonGenerationSchema = lessonWithoutVisualsSchema.extend({
  visuals: z.array(z.string().trim().min(2).max(6_000)).max(2),
  interactions: z.array(z.string().trim().min(2).max(6_000)).max(1),
  experience: lessonExperienceSchema,
  citations: z.array(z.object({
    sourceId: z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/),
    evidenceClaimId: z.string().trim().regex(/^evidence-[a-z0-9-]{1,80}$/).nullable(),
    claim: z.string().trim().min(1).max(280),
    section: z.enum(["learning_objective", "connection", "content", "key_takeaway", "experience", "guided_practice", "transfer_task", "visual", "interaction", "quiz", "quiz_explanation"]),
    locator: z.string().trim().min(1).max(160).nullable(),
  })).max(8),
});

export type GeneratedLessonData = z.infer<typeof lessonGenerationSchema>;

export const generateLessonInputSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
  regenerate: z.boolean().optional().default(false),
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
  totalQuestions: z.number().int().min(0).max(40),
  firstAttemptCorrect: z.number().int().min(0).max(40),
  attempts: z.number().int().min(0).max(800),
  confidence: z.enum(["low", "medium", "high"]),
  review: z.boolean().optional(),
  reviewKind: z.enum(["spaced", "delayed-7", "delayed-28"]).optional(),
  totalLessons: z.number().int().min(1).max(500).optional(),
  estimatedMinutes: z.number().int().min(1).max(180).optional(),
  nextLessonId: z.string().regex(/^\d+-\d+$/).nullable().optional(),
  nextLessonTitle: z.string().trim().min(1).max(160).nullable().optional(),
  activityEvidence: z.object({
    quizResults: z.array(z.object({
      quizIndex: z.number().int().min(0).max(20),
      attempts: z.number().int().min(1).max(20),
      firstAttemptCorrect: z.boolean(),
      confidence: z.enum(["low", "medium", "high"]),
      receipt: z.string().min(40).max(2_000).optional(),
    }).strict()).max(20),
    transferResponse: z.string().trim().max(8_000).optional(),
    experienceEvidence: z.object({
      type: z.enum(["concept", "worked-example", "comparison", "case-study", "practice-lab", "synthesis"]),
      response: z.string().trim().min(20).max(8_000),
      completed: z.literal(true),
    }).strict().optional(),
    interactionEvidence: z.object({
      interactionId: z.string().trim().regex(/^interaction-[a-z0-9-]+$/).max(90),
      itemCount: z.number().int().min(6).max(16),
      minimumFirstAttemptCorrect: z.number().int().min(1).max(16),
      firstAttemptCorrect: z.number().int().min(0).max(16),
      attempts: z.number().int().min(6).max(320),
      completed: z.boolean(),
      itemResults: z.array(z.object({
        itemId: z.string().trim().regex(/^item-[a-z0-9-]+$/).max(90),
        attempts: z.number().int().min(1).max(20),
        firstAttemptCorrect: z.boolean(),
        mastered: z.boolean(),
        receipt: z.string().min(40).max(2_000).optional(),
      }).strict()).min(6).max(16),
    }).strict().optional(),
  }).strict().optional(),
}).superRefine((value, context) => {
  if (value.firstAttemptCorrect > value.totalQuestions) {
    context.addIssue({ code: "custom", path: ["firstAttemptCorrect"], message: "Correct answers cannot exceed the question count." });
  }
  if (value.totalQuestions > 0 && value.attempts < value.totalQuestions) {
    context.addIssue({ code: "custom", path: ["attempts"], message: "Attempts cannot be lower than the question count." });
  }
  if (value.reviewKind && value.review !== true) {
    context.addIssue({ code: "custom", path: ["reviewKind"], message: "A review kind can only be recorded during review." });
  }
});

export const capstoneSubmissionSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  submission: z
    .string()
    .trim()
    .min(120, "Describe your capstone work in at least a short paragraph so it can be assessed against the success criteria.")
    .max(8_000, "Keep the capstone submission under 8,000 characters."),
});

export const baselineSubmissionSchema = capstoneSubmissionSchema;

export const capstoneVerdictSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  criteria: z
    .array(
      z.object({
        criterion: z.string().trim().min(1).max(240),
        met: z.boolean(),
        feedback: z.string().trim().min(1).max(400),
      }),
    )
    .min(1)
    .max(6),
});

export const learnerStateSchema = z.object({
  courseBookmarks: z.array(z.string().trim().min(1).max(200)).max(500),
  lessonBookmarks: z.array(z.string().trim().min(1).max(400)).max(2_000),
  notes: z.record(z.string().trim().min(1).max(400), z.string().max(12_000)).refine((value) => Object.keys(value).length <= 500, "Keep no more than 500 lesson notes."),
  noteUpdatedAt: z.record(z.string().trim().min(1).max(400), isoDateTimeSchema).refine((value) => Object.keys(value).length <= 500, "Keep no more than 500 note timestamps.").default({}),
  weeklyLessonGoal: z.number().int().min(1).max(50),
  dashboardPreferences: z.object({
    preset: z.enum(["default", "focused", "progress", "discover", "custom"]),
    sections: z.object({
      nextUp: z.boolean(),
      achievements: z.boolean(),
      learningTip: z.boolean(),
      snapshot: z.boolean(),
      quickActions: z.boolean(),
    }),
    metrics: z.object({
      studyTime: z.boolean(),
      lessons: z.boolean(),
      streak: z.boolean(),
      accuracy: z.boolean(),
      mastered: z.boolean(),
    }),
    mainOrder: z.array(z.enum(["nextUp", "achievements", "learningTip"])).length(3),
    sideOrder: z.array(z.enum(["snapshot", "quickActions"])).length(2),
  }).default({
    preset: "default",
    sections: { nextUp: true, achievements: true, learningTip: true, snapshot: true, quickActions: true },
    metrics: { studyTime: true, lessons: true, streak: true, accuracy: true, mastered: true },
    mainOrder: ["nextUp", "achievements", "learningTip"],
    sideOrder: ["snapshot", "quickActions"],
  }),
  reminderPreferences: z.object({
    cadence: z.enum(["off", "daily", "weekdays", "weekly"]),
    preferredTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().trim().min(1).max(100),
    inAppEnabled: z.boolean(),
  }).default({
    cadence: "off",
    preferredTime: "09:00",
    timezone: "UTC",
    inAppEnabled: true,
  }),
  updatedAt: isoDateTimeSchema.optional(),
});

export const learnerPreferencesSchema = learnerStateSchema.omit({
  notes: true,
  noteUpdatedAt: true,
});

export const learnerStateUpdateSchema = z.object({
  preferences: learnerPreferencesSchema,
  noteChanges: z.array(z.object({
    key: z.string().trim().min(1).max(400),
    content: z.string().max(12_000),
    updatedAt: isoDateTimeSchema,
  })).max(50),
  deletedNoteKeys: z.array(z.string().trim().min(1).max(400)).max(50).default([]),
}).strict();

export function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
