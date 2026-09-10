import { z } from "zod";

export const FLASHCARD_LEGACY_SCHEMA_VERSION = 1 as const;
export const FLASHCARD_SCHEMA_VERSION = 2 as const;
export const FLASHCARD_DECK_LIMIT = 250;
export const FLASHCARD_CARD_LIMIT = 200;
export const GENERATED_FLASHCARD_LIMIT = 24;

export const flashcardScopeSchema = z.enum(["lesson", "module", "course"]);
export const flashcardDepthSchema = z.enum(["focused", "balanced", "comprehensive"]);
export const flashcardEmphasisSchema = z.enum(["balanced", "key-ideas", "application"]);
export const flashcardTypeSchema = z.enum(["recall", "contrast", "misconception", "application"]);
export const flashcardRatingSchema = z.enum(["again", "almost", "got-it"]);
export const flashcardDeckStatusSchema = z.enum(["draft", "active", "archived", "deleted"]);
const flashcardRecordVersionSchema = z.union([
  z.literal(FLASHCARD_LEGACY_SCHEMA_VERSION),
  z.literal(FLASHCARD_SCHEMA_VERSION),
]);

export type FlashcardScope = z.infer<typeof flashcardScopeSchema>;
export type FlashcardDepth = z.infer<typeof flashcardDepthSchema>;
export type FlashcardEmphasis = z.infer<typeof flashcardEmphasisSchema>;
export type FlashcardType = z.infer<typeof flashcardTypeSchema>;
export type FlashcardRating = z.infer<typeof flashcardRatingSchema>;
export type FlashcardDeckStatus = z.infer<typeof flashcardDeckStatusSchema>;

export const flashcardSourceRefSchema = z.object({
  ref: z.string().trim().min(1).max(180),
  lessonId: z.string().trim().min(1).max(120),
  lessonTitle: z.string().trim().min(1).max(160),
  field: z.enum(["concept", "objective", "takeaway", "content", "guided-practice", "transfer", "attempted-check"]),
}).strict();

export type FlashcardSourceRef = z.infer<typeof flashcardSourceRefSchema>;

export const flashcardSchema = z.object({
  id: z.string().trim().min(8).max(120),
  version: flashcardRecordVersionSchema,
  deckId: z.string().trim().min(8).max(120),
  courseId: z.string().trim().min(1).max(180).nullable(),
  position: z.number().int().min(0).max(FLASHCARD_CARD_LIMIT - 1),
  prompt: z.string().trim().min(8).max(240),
  answer: z.string().trim().min(1).max(600),
  type: flashcardTypeSchema,
  origin: z.enum(["generated", "manual", "generated-edited"]),
  objectiveIds: z.array(z.string().trim().min(1).max(120)).max(5),
  sourceRefs: z.array(flashcardSourceRefSchema).max(4),
  sourceFingerprint: z.string().trim().min(16).max(128).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
}).strict();

export type Flashcard = z.infer<typeof flashcardSchema>;

export const flashcardDeckSchema = z.object({
  id: z.string().trim().min(8).max(120),
  version: flashcardRecordVersionSchema,
  ownerUid: z.string().trim().min(1).max(256),
  revision: z.number().int().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400),
  kind: z.enum(["generated", "custom", "recovered"]),
  status: flashcardDeckStatusSchema,
  courseId: z.string().trim().min(1).max(180).nullable(),
  courseTopic: z.string().trim().min(1).max(180).nullable(),
  moduleIndex: z.number().int().min(0).max(100).nullable(),
  lessonIds: z.array(z.string().trim().min(1).max(120)).max(40),
  scope: z.union([flashcardScopeSchema, z.literal("custom")]),
  generationSettings: z.object({
    depth: flashcardDepthSchema,
    emphasis: flashcardEmphasisSchema,
    includeAttemptedChecks: z.boolean(),
  }).strict().nullable(),
  sourceFingerprint: z.string().trim().min(16).max(128).nullable(),
  cardCount: z.number().int().min(0).max(FLASHCARD_CARD_LIMIT),
  dueCount: z.number().int().min(0).max(FLASHCARD_CARD_LIMIT),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastReviewedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
}).strict();

export type FlashcardDeck = z.infer<typeof flashcardDeckSchema>;

export interface FlashcardDeckDetail {
  deck: FlashcardDeck;
  cards: Flashcard[];
}

export const flashcardReviewStateSchema = z.object({
  version: flashcardRecordVersionSchema,
  deckId: z.string().trim().min(8).max(120),
  cardId: z.string().trim().min(8).max(120),
  courseId: z.string().trim().min(1).max(180).nullable(),
  dueAt: z.string().datetime(),
  repetitions: z.number().int().min(0).max(10_000),
  lapses: z.number().int().min(0).max(10_000),
  lastRating: flashcardRatingSchema,
  lastReviewedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export type FlashcardReviewState = z.infer<typeof flashcardReviewStateSchema>;

export const flashcardGenerationInputSchema = z.object({
  courseId: z.string().trim().min(1).max(180),
  scope: flashcardScopeSchema,
  lessonId: z.string().trim().min(1).max(120).optional(),
  moduleIndex: z.number().int().min(0).max(100).optional(),
  depth: flashcardDepthSchema.default("balanced"),
  emphasis: flashcardEmphasisSchema.default("balanced"),
  includeAttemptedChecks: z.boolean().default(true),
}).strict().superRefine((value, context) => {
  if (value.scope === "lesson" && !value.lessonId) {
    context.addIssue({ code: "custom", path: ["lessonId"], message: "Lesson scope requires a lesson." });
  }
  if (value.scope === "module" && value.moduleIndex == null) {
    context.addIssue({ code: "custom", path: ["moduleIndex"], message: "Module scope requires a module." });
  }
});

export const editableFlashcardInputSchema = z.object({
  id: z.string().trim().min(8).max(120).optional(),
  prompt: z.string().trim().min(8).max(240),
  answer: z.string().trim().min(1).max(600),
  type: flashcardTypeSchema.default("recall"),
}).strict();

export const customDeckInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).default(""),
  cards: z.array(editableFlashcardInputSchema).min(1).max(FLASHCARD_CARD_LIMIT),
}).strict();

export const deckUpdateInputSchema = z.object({
  revision: z.number().int().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).default(""),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  cards: z.array(editableFlashcardInputSchema).min(1).max(FLASHCARD_CARD_LIMIT),
}).strict();

export const generatedCardOutputSchema = z.object({
  prompt: z.string().trim().min(8).max(240),
  answer: z.string().trim().min(1).max(600),
  type: flashcardTypeSchema,
  objectiveIds: z.array(z.string().trim().min(1).max(120)).max(5),
  sourceRefIds: z.array(z.string().trim().min(1).max(180)).min(1).max(4),
}).strict();

export const generatedDeckOutputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400),
  cards: z.array(generatedCardOutputSchema).min(2).max(GENERATED_FLASHCARD_LIMIT),
}).strict();

export type GeneratedDeckOutput = z.infer<typeof generatedDeckOutputSchema>;

export const flashcardEvaluationOutputSchema = z.object({
  results: z.array(z.object({
    index: z.number().int().min(0).max(GENERATED_FLASHCARD_LIMIT - 1),
    grounded: z.boolean(),
    atomic: z.boolean(),
    specific: z.boolean(),
    reason: z.string().trim().max(240),
  }).strict()).max(GENERATED_FLASHCARD_LIMIT),
}).strict();

export function generatedCardTarget(scope: FlashcardScope, depth: FlashcardDepth) {
  const values: Record<FlashcardDepth, Record<FlashcardScope, number>> = {
    focused: { lesson: 5, module: 8, course: 12 },
    balanced: { lesson: 8, module: 16, course: 24 },
    comprehensive: { lesson: 12, module: 20, course: 24 },
  };
  return values[depth][scope];
}

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokens(value: string) {
  return new Set(normalized(value).split(" ").filter((token) => token.length > 2));
}

function similarity(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function flashcardQualityIssues(
  cards: GeneratedDeckOutput["cards"],
  allowedSourceRefs: ReadonlySet<string>,
) {
  const issues: string[] = [];
  const blockedPrompt = /(?:takeaway\s+\d+|which lesson idea begins|what should you remember about)/i;
  cards.forEach((card, index) => {
    const label = `Card ${index + 1}`;
    if (blockedPrompt.test(card.prompt)) issues.push(`${label} uses an arbitrary or overly broad retrieval cue.`);
    if (card.answer.length > 320) issues.push(`${label} answer is too long for atomic recall.`);
    if (normalized(card.answer).length > 24 && normalized(card.prompt).includes(normalized(card.answer))) {
      issues.push(`${label} reveals its answer in the prompt.`);
    }
    if (card.sourceRefIds.some((ref) => !allowedSourceRefs.has(ref))) {
      issues.push(`${label} cites a source reference that was not supplied.`);
    }
    for (let prior = 0; prior < index; prior += 1) {
      if (similarity(card.prompt, cards[prior].prompt) >= 0.76 || similarity(card.answer, cards[prior].answer) >= 0.82) {
        issues.push(`${label} substantially duplicates card ${prior + 1}.`);
      }
    }
  });
  if (cards.length >= 6 && !cards.some((card) => card.type === "application" || card.type === "contrast")) {
    issues.push("The deck needs at least one application or contrast card.");
  }
  return issues;
}

export function nextFlashcardDueAt(
  rating: FlashcardRating,
  previous: Pick<FlashcardReviewState, "repetitions" | "lapses"> | null,
  now = new Date(),
) {
  const repetitions = previous?.repetitions ?? 0;
  const days = rating === "again"
    ? 1
    : rating === "almost"
      ? Math.max(1, Math.min(14, repetitions + 1))
      : Math.max(3, Math.min(90, 3 * (2 ** Math.min(repetitions, 5))));
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString();
}
