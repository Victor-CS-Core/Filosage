import { z } from "zod";

export const SPARK_SCHEMA_VERSION = 1 as const;
export const SPARK_REGISTRY_VERSION = "spark-registry-v1" as const;
export const SPARK_MAX_BLOCKS = 8;
export const SPARK_MAX_RESPONSE_BYTES = 64 * 1024;
export const SPARK_MAX_TUTOR_MESSAGE_CHARACTERS = 1_500;
export const SPARK_MAX_INPUT_TOKENS = 4_000;
export const SPARK_MAX_OUTPUT_TOKENS = 900;

const id = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/);
const text = z.string().trim().min(1).max(4_000);
const shortText = z.string().trim().min(1).max(500);
const finiteNumber = z.number().finite();
const sourceRefs = z.array(id).max(8).default([]);
const objectiveIds = z.array(id).min(1).max(8).optional();
const evidenceStatus = z.enum(["course_supported", "ai_general_knowledge", "mixed", "unverified"]);
const blockBase = {
  id,
  objectiveIds,
  sourceRefs,
  evidenceStatus,
};
const taskBase = {
  ...blockBase,
  taskId: id,
  taskVersion: id,
  prompt: text,
};

const optionSchema = z.object({ id, text: shortText }).strict();

export const sparkBlockSchema = z.union([
  z.object({
    ...blockBase,
    type: z.literal("explanation"),
    title: shortText,
    text,
    style: z.enum(["concise", "analogy", "worked_example", "misconception"]),
    steps: z.array(shortText).max(8).optional(),
  }).strict(),
  z.object({
    ...taskBase,
    type: z.literal("single_choice"),
    options: z.array(optionSchema).min(2).max(6),
  }).strict(),
  z.object({
    ...taskBase,
    type: z.literal("multiple_choice"),
    options: z.array(optionSchema).min(2).max(8),
    minimumSelections: z.number().int().min(1).max(8).default(1),
    maximumSelections: z.number().int().min(1).max(8),
  }).strict(),
  z.object({
    ...taskBase,
    type: z.literal("numeric"),
    inputLabel: shortText,
    unit: z.string().trim().max(40).optional(),
    minimum: finiteNumber.optional(),
    maximum: finiteNumber.optional(),
    step: finiteNumber.positive().optional(),
  }).strict(),
  z.object({
    ...taskBase,
    type: z.literal("ordering"),
    items: z.array(optionSchema).min(2).max(10),
  }).strict(),
  z.object({
    ...taskBase,
    type: z.literal("matching"),
    left: z.array(optionSchema).min(2).max(10),
    right: z.array(optionSchema).min(2).max(10),
  }).strict(),
  z.object({
    ...taskBase,
    type: z.literal("flashcard"),
    front: text,
    revealLabel: shortText.default("Reveal answer"),
  }).strict(),
  z.object({
    ...taskBase,
    type: z.literal("short_response"),
    minimumCharacters: z.number().int().min(1).max(4_000).default(20),
    maximumCharacters: z.number().int().min(20).max(8_000).default(2_000),
    grading: z.literal("ai_rubric"),
  }).strict(),
  z.object({
    ...blockBase,
    type: z.literal("step_through"),
    title: shortText,
    steps: z.array(z.object({ id, label: shortText, detail: text }).strict()).min(2).max(12),
    textEquivalent: text,
  }).strict(),
  z.object({
    ...blockBase,
    type: z.literal("parameter_explorer"),
    title: shortText,
    prompt: shortText,
    template: z.literal("neuron-v1"),
    config: z.object({
      x1: finiteNumber,
      x2: finiteNumber,
      weight1: finiteNumber,
      weight2: finiteNumber,
      bias: finiteNumber,
      x1Label: shortText,
      x2Label: shortText,
      minimum: finiteNumber,
      maximum: finiteNumber,
      step: finiteNumber.positive(),
    }).strict(),
  }).strict(),
  z.object({
    ...blockBase,
    type: z.literal("parameter_explorer"),
    title: shortText,
    prompt: shortText,
    template: z.literal("linear-v1"),
    config: z.object({
      x: finiteNumber,
      slope: finiteNumber,
      intercept: finiteNumber,
      xLabel: shortText,
      yLabel: shortText,
      minimum: finiteNumber,
      maximum: finiteNumber,
      step: finiteNumber.positive(),
    }).strict(),
  }).strict(),
  z.object({
    ...blockBase,
    type: z.literal("parameter_explorer"),
    title: shortText,
    prompt: shortText,
    template: z.literal("compound-growth-v1"),
    config: z.object({
      principal: finiteNumber.nonnegative(),
      ratePercent: finiteNumber,
      periods: z.number().int().min(1).max(600),
      contribution: finiteNumber.nonnegative().default(0),
      currencyLabel: z.string().trim().min(1).max(12).default("units"),
      disclaimer: z.literal("Illustrative math activity, not financial advice."),
    }).strict(),
  }).strict(),
  z.object({
    ...taskBase,
    type: z.literal("project_checkpoint"),
    criteria: z.array(shortText).min(1).max(8),
    maximumCharacters: z.number().int().min(100).max(8_000).default(4_000),
  }).strict(),
]);

export const sparkStageSchema = z.enum(["define", "activate", "practice", "feedback", "transfer", "return"]);
export type SparkStage = z.infer<typeof sparkStageSchema>;
export type SparkBlock = z.infer<typeof sparkBlockSchema>;

export const sparkManifestSchema = z.object({
  schemaVersion: z.literal(SPARK_SCHEMA_VERSION),
  registryVersion: z.literal(SPARK_REGISTRY_VERSION),
  id,
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
  lessonVersion: id,
  locale: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35),
  stage: sparkStageSchema,
  objectiveIds: z.array(id).min(1).max(8),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceStatus,
  blocks: z.array(sparkBlockSchema).max(SPARK_MAX_BLOCKS),
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine((manifest, context) => {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength;
  if (bytes > SPARK_MAX_RESPONSE_BYTES) {
    context.addIssue({ code: "custom", message: `Spark manifest exceeds ${SPARK_MAX_RESPONSE_BYTES} bytes.` });
  }
});

export type SparkManifest = z.infer<typeof sparkManifestSchema>;

export const sparkSuggestedActionSchema = z.enum([
  "explain_differently",
  "give_example",
  "practice",
  "revise",
  "transfer",
  "review",
]);
export type SparkSuggestedAction = z.infer<typeof sparkSuggestedActionSchema>;

export const sparkTurnRequestSchema = z.object({
  requestId: z.string().uuid(),
  lessonVersion: id,
  action: sparkSuggestedActionSchema,
  message: z.string().trim().min(1).max(SPARK_MAX_TUTOR_MESSAGE_CHARACTERS),
  locale: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35).default("en"),
}).strict();

export const sparkTurnResponseSchema = z.object({
  schemaVersion: z.literal(SPARK_SCHEMA_VERSION),
  lessonVersion: id,
  stage: sparkStageSchema,
  availability: z.enum(["live", "practice_only", "saved_only"]),
  blocks: z.array(sparkBlockSchema).max(SPARK_MAX_BLOCKS),
  suggestedActions: z.array(sparkSuggestedActionSchema).max(4),
  usage: z.object({ questionsRemaining: z.number().int().nonnegative().nullable() }).strict(),
}).strict().superRefine((response, context) => {
  const bytes = new TextEncoder().encode(JSON.stringify(response)).byteLength;
  if (bytes > SPARK_MAX_RESPONSE_BYTES) {
    context.addIssue({ code: "custom", message: `Spark response exceeds ${SPARK_MAX_RESPONSE_BYTES} bytes.` });
  }
});
export type SparkTurnResponse = z.infer<typeof sparkTurnResponseSchema>;

export const sparkSessionRequestSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
  lessonVersion: id,
  locale: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35).default("en"),
}).strict();
export type SparkSessionRequest = z.infer<typeof sparkSessionRequestSchema>;

export const sparkAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), optionIds: z.array(id).min(1).max(8) }).strict(),
  z.object({ kind: z.literal("numeric"), value: finiteNumber, unit: z.string().trim().max(40).optional() }).strict(),
  z.object({ kind: z.literal("ordering"), itemIds: z.array(id).min(2).max(10) }).strict(),
  z.object({ kind: z.literal("matching"), pairs: z.array(z.object({ leftId: id, rightId: id }).strict()).min(2).max(10) }).strict(),
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(8_000) }).strict(),
  z.object({ kind: z.literal("self_check"), recalled: z.boolean() }).strict(),
]);

export const sparkAttemptRequestSchema = z.object({
  requestId: z.string().uuid(),
  sessionId: id,
  lessonVersion: id,
  taskId: id,
  taskVersion: id,
  answer: sparkAnswerSchema,
}).strict();
export type SparkAttemptRequest = z.infer<typeof sparkAttemptRequestSchema>;

export const sparkPrepareRequestSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
  locale: z.string().trim().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35).default("en"),
}).strict();
export type SparkPrepareRequest = z.infer<typeof sparkPrepareRequestSchema>;

export const sparkBudgetCategorySchema = z.enum(["tutoring", "preparation", "assessment", "summary", "embedding"]);
export type SparkBudgetCategory = z.infer<typeof sparkBudgetCategorySchema>;

export function safeSparkManifest(value: unknown) {
  return sparkManifestSchema.safeParse(value);
}

export function savedTextFallback(lessonVersion: string, textValue: string): z.infer<typeof sparkTurnResponseSchema> {
  return {
    schemaVersion: 1,
    lessonVersion,
    stage: "practice",
    availability: "saved_only",
    blocks: [{
      type: "explanation",
      id: "saved-lesson-fallback",
      title: "Saved lesson",
      text: textValue.slice(0, 4_000),
      style: "concise",
      sourceRefs: [],
      evidenceStatus: "course_supported",
    }],
    suggestedActions: ["practice"],
    usage: { questionsRemaining: null },
  };
}