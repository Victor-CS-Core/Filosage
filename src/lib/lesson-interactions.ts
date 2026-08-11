import { z } from "zod";
import type { LessonData } from "@/lib/course-types";

const shortText = z.string().trim().min(1).max(240);
const label = z.string().trim().min(1).max(100);
const morsePattern = z.string().trim().min(1).max(80).regex(/^[.\- /]+$/);
const practicePurpose = z.literal("practice").optional();
const explorePurpose = z.literal("explore").optional();
const base = {
  id: z.string().trim().regex(/^interaction-[a-z0-9-]+$/).max(90),
  title: label,
  summary: z.string().trim().min(1).max(180),
  version: z.literal(1),
  objectiveIds: z.array(z.string().trim().regex(/^objective-[a-z0-9-]+$/)).min(1).max(5).optional(),
};

export const INTERACTION_QUALITY_GATE_VERSION = "objective-practice-v2.1";

const recognitionChoiceSchema = z.object({
  label,
  feedback: shortText,
  misconception: label.optional(),
});

const recognitionItemSchema = z.object({
  id: z.string().trim().regex(/^item-[a-z0-9-]+$/).max(90),
  stimulus: z.object({
    kind: z.enum(["text", "signal"]),
    value: z.string().trim().min(1).max(160),
    accessibleLabel: z.string().trim().min(1).max(240),
  }),
  choices: z.array(recognitionChoiceSchema).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: shortText,
  difficulty: z.enum(["foundation", "contrast", "transfer"]),
});
const recognitionItemCandidateSchema = recognitionItemSchema.omit({ id: true });

export const lessonInteractionSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("classification"),
    purpose: practicePurpose,
    prompt: shortText,
    groups: z.array(label).min(2).max(4),
    items: z.array(z.object({ label, groupIndex: z.number().int().min(0).max(3), explanation: shortText })).min(3).max(8),
  }),
  z.object({
    ...base,
    type: z.literal("sequence"),
    purpose: practicePurpose,
    prompt: shortText,
    steps: z.array(z.object({ label, detail: shortText })).min(3).max(7),
  }),
  z.object({
    ...base,
    type: z.literal("scenario"),
    purpose: practicePurpose,
    prompt: shortText,
    options: z.array(z.object({ label, consequence: shortText })).min(2).max(4),
    recommendedIndex: z.number().int().min(0).max(3),
    explanation: shortText,
  }),
  z.object({
    ...base,
    type: z.literal("signal"),
    purpose: explorePurpose,
    prompt: shortText,
    patterns: z.array(z.object({ label, value: morsePattern })).min(2).max(8),
  }),
  z.object({
    id: z.string().trim().regex(/^interaction-[a-z0-9-]+$/).max(90),
    type: z.literal("recognition"),
    purpose: z.literal("practice"),
    title: label,
    summary: z.string().trim().min(1).max(180),
    version: z.literal(2),
    objectiveIds: z.array(z.string().trim().regex(/^objective-[a-z0-9-]+$/)).min(1).max(5).optional(),
    targetSkill: z.string().trim().min(12).max(400),
    referencePolicy: z.literal("hidden-until-complete"),
    prompt: shortText,
    mastery: z.object({
      minimumFirstAttemptCorrect: z.number().int().min(1).max(20),
      retryMissed: z.literal(true),
    }),
    items: z.array(recognitionItemSchema).min(6).max(16),
  }),
]);

export const lessonInteractionsSchema = z.array(lessonInteractionSchema).max(1).default([]);
export type LessonInteraction = z.infer<typeof lessonInteractionSchema>;
export interface InteractionItemEvidence {
  itemId: string;
  attempts: number;
  firstAttemptCorrect: boolean;
  mastered: boolean;
  receipt?: string;
}

export interface InteractionEvidence {
  interactionId: string;
  itemCount: number;
  minimumFirstAttemptCorrect: number;
  firstAttemptCorrect: number;
  attempts: number;
  completed: boolean;
  itemResults: InteractionItemEvidence[];
}
type SequenceInteraction = Extract<LessonInteraction, { type: "sequence" }>;

const SEQUENCE_PROMPT = "Arrange the actions into a coherent workflow. Decide what each action needs from the one before it.";
const ORDER_PREFIX = /^(?:(?:step|stage|phase|task|action|part|item)\s*(?:#\s*)?\d+|(?:first|second|third|fourth|fifth|sixth|seventh)(?:\s+(?:step|stage|phase|task|action|part|item))?|\d+)\s*[:.)-]?\s*/i;

function neutralSequenceLabel(value: string) {
  const semanticLabel = value.trim().replace(ORDER_PREFIX, "").trim();
  return semanticLabel || "Action";
}

function normalizeSequence(interaction: SequenceInteraction): SequenceInteraction {
  return {
    ...interaction,
    // Generated prompts often restate the ordered procedure. The cards provide
    // the task context, so a neutral instruction protects the retrieval task.
    prompt: SEQUENCE_PROMPT,
    steps: interaction.steps.map((step) => ({
      ...step,
      label: neutralSequenceLabel(step.label),
    })),
  };
}

function normalizeInteraction(interaction: LessonInteraction): LessonInteraction {
  const normalized = interaction.type === "sequence" ? normalizeSequence(interaction) : interaction;
  return {
    ...normalized,
    purpose: normalized.type === "signal" ? "explore" : "practice",
  } as LessonInteraction;
}

const candidateBase = { title: label, summary: z.string().trim().min(1).max(180) };
export const lessonInteractionCandidateSchema = z.discriminatedUnion("type", [
  z.object({ ...candidateBase, type: z.literal("classification"), prompt: shortText, groups: z.array(label).min(2).max(4), items: z.array(z.object({ label, groupIndex: z.number().int().min(0).max(3), explanation: shortText })).min(3).max(8) }),
  z.object({ ...candidateBase, type: z.literal("sequence"), prompt: shortText, steps: z.array(z.object({ label, detail: shortText })).min(3).max(7) }),
  z.object({ ...candidateBase, type: z.literal("scenario"), prompt: shortText, options: z.array(z.object({ label, consequence: shortText })).min(2).max(4), recommendedIndex: z.number().int().min(0).max(3), explanation: shortText }),
  z.object({ ...candidateBase, type: z.literal("signal"), prompt: shortText, patterns: z.array(z.object({ label, value: morsePattern })).min(2).max(8) }),
  z.object({
    ...candidateBase,
    type: z.literal("recognition"),
    targetSkill: z.string().trim().min(12).max(400),
    referencePolicy: z.literal("hidden-until-complete"),
    prompt: shortText,
    mastery: z.object({ minimumFirstAttemptCorrect: z.number().int().min(1).max(20), retryMissed: z.literal(true) }),
    items: z.array(recognitionItemCandidateSchema).min(6).max(16),
  }),
]);

function parseInteraction(value: unknown, index: number): LessonInteraction | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate) as unknown; } catch { return null; }
  }
  const stored = lessonInteractionSchema.safeParse(candidate);
  if (stored.success) return normalizeInteraction(stored.data);
  const proposed = lessonInteractionCandidateSchema.safeParse(candidate);
  if (!proposed.success) return null;
  const data = proposed.data;
  if (data.type === "classification") {
    const groupCount = data.groups.length;
    if (data.items.some((item) => item.groupIndex >= groupCount)) return null;
  }
  if (data.type === "scenario" && data.recommendedIndex >= data.options.length) return null;
  if (data.type === "recognition") {
    if (data.mastery.minimumFirstAttemptCorrect > data.items.length) return null;
    return {
      ...data,
      id: `interaction-recognition-${index + 1}`,
      purpose: "practice",
      version: 2,
      items: data.items.map((item, itemIndex) => ({ ...item, id: `item-${itemIndex + 1}` })),
    };
  }
  return normalizeInteraction({
    ...data,
    id: `interaction-${data.type}-${index + 1}`,
    purpose: data.type === "signal" ? "explore" : "practice",
    version: 1,
  } as LessonInteraction);
}

export function curateLessonInteractions(value: unknown): LessonInteraction[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseInteraction).filter((item): item is LessonInteraction => Boolean(item)).slice(0, 1);
}

function uniqueMorsePatterns(markdown: string) {
  const values = Array.from(markdown.matchAll(/`([^`\n]{1,120})`/g), (match) => match[1]
    .replace(/[\u00b7\u2022]/g, ".")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim())
    .filter((value) => /^[.\- /]+$/.test(value) && /[.-]/.test(value));
  return [...new Set(values)].slice(0, 6);
}

interface MorsePair {
  character: string;
  pattern: string;
}

function morsePairs(markdown: string): MorsePair[] {
  const pairs: MorsePair[] = [];
  const seen = new Set<string>();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim().replace(/^`|`$/g, ""));
    const character = cells[1]?.toUpperCase();
    const pattern = cells[2]
      ?.replace(/[\u00b7\u2022]/g, ".")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\s+/g, "");
    if (!character || !pattern || !/^[A-Z0-9]$/.test(character) || !/^[.-]{1,6}$/.test(pattern)) continue;
    if (seen.has(character) || pairs.some((pair) => pair.pattern === pattern)) continue;
    seen.add(character);
    pairs.push({ character, pattern });
  }
  return pairs.slice(0, 16);
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function patternCue(pattern: string) {
  const start = pattern.startsWith(".") ? "a dot" : "a dash";
  const end = pattern.endsWith(".") ? "a dot" : "a dash";
  return pattern.length === 1
    ? `It is the single ${pattern === "." ? "dot" : "dash"} character.`
    : `It has ${pattern.length} marks, beginning with ${start} and ending with ${end}.`;
}

function patternWords(pattern: string) {
  return Array.from(pattern, (mark) => mark === "." ? "dot" : "dash").join(" ");
}

function recognitionThreshold(objective: string | undefined, itemCount: number) {
  const stated = objective?.match(/\b(\d{1,2})\s+of\s+(\d{1,2})\b/i);
  if (stated && Number(stated[2]) === itemCount) {
    return Math.min(itemCount, Math.max(1, Number(stated[1])));
  }
  return Math.max(1, Math.ceil(itemCount * 0.8));
}

function deriveMorseRecognition(lesson: LessonData): LessonInteraction | null {
  const pairs = morsePairs(lesson.content);
  if (pairs.length < 6) return null;
  const objective = lesson.learningObjective?.trim()
    || "Recognize each introduced Morse pattern as a whole character.";
  const items = pairs.map((correct, itemIndex) => {
    const distractors = pairs
      .filter((pair) => pair.character !== correct.character)
      .sort((left, right) => {
        const leftScore = editDistance(correct.pattern, left.pattern) * 10
          + Math.abs(correct.pattern.length - left.pattern.length);
        const rightScore = editDistance(correct.pattern, right.pattern) * 10
          + Math.abs(correct.pattern.length - right.pattern.length);
        return leftScore - rightScore || left.character.localeCompare(right.character);
      })
      .slice(0, 3);
    const correctPosition = itemIndex % 4;
    const choices = [...distractors];
    choices.splice(correctPosition, 0, correct);
    return {
      id: `item-morse-${correct.character.toLowerCase()}`,
      stimulus: {
        kind: "signal" as const,
        value: correct.pattern,
        accessibleLabel: `Morse pattern ${patternWords(correct.pattern)}`,
      },
      choices: choices.map((choice) => ({
        label: choice.character,
        feedback: choice.character === correct.character
          ? `${correct.character} is ${correct.pattern}. ${patternCue(correct.pattern)}`
          : `${choice.character} is ${choice.pattern}, not ${correct.pattern}. Compare the direction and ending before answering again.`,
        misconception: choice.character === correct.character
          ? undefined
          : `Confused ${correct.character} with ${choice.character}`,
      })),
      correctIndex: correctPosition,
      explanation: `${correct.character} maps to ${correct.pattern}. ${patternCue(correct.pattern)}`,
      difficulty: correct.pattern.length <= 2
        ? "foundation" as const
        : correct.pattern.length <= 3
          ? "contrast" as const
          : "transfer" as const,
    };
  });
  return {
    id: "interaction-recognition-morse",
    type: "recognition",
    purpose: "practice",
    title: "Recognize the character",
    summary: "Identify each whole Morse pattern before seeing the answer, then strengthen only the patterns you miss.",
    version: 2,
    targetSkill: objective,
    referencePolicy: "hidden-until-complete",
    prompt: "Choose the character represented by each complete pattern. The reference remains in the Learn tab while you practice here.",
    mastery: {
      minimumFirstAttemptCorrect: recognitionThreshold(lesson.learningObjective, items.length),
      retryMissed: true,
    },
    items,
  };
}

function normalizedWords(value: string | undefined) {
  return new Set((value ?? "").toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
}

export function interactionQualityIssues(lesson: LessonData, requireVersion2 = false) {
  const interactions = deriveLessonInteractions(lesson);
  const practice = interactions.filter((interaction) => interaction.purpose === "practice");
  const issues: string[] = [];
  if (requireVersion2 && !practice.some((interaction) => interaction.type === "recognition" && interaction.version === 2)) {
    issues.push("The lesson needs a Recognition v2 practice lab with item-level mastery evidence; legacy interactions and explorers do not satisfy this requirement.");
    return issues;
  }
  for (const interaction of practice) {
    if (interaction.type !== "recognition") continue;
    const objectiveWords = normalizedWords(lesson.learningObjective);
    const targetWords = normalizedWords(interaction.targetSkill);
    const sharedWords = [...objectiveWords].filter((word) => targetWords.has(word));
    if (objectiveWords.size >= 3 && sharedWords.length < Math.min(3, objectiveWords.size)) {
      issues.push("The recognition lab target does not match the lesson's observable objective.");
    }
    if (interaction.mastery.minimumFirstAttemptCorrect > interaction.items.length) {
      issues.push("The lab mastery threshold exceeds its available items.");
    }
    if (interaction.mastery.minimumFirstAttemptCorrect < Math.ceil(interaction.items.length * 0.7)) {
      issues.push("The lab mastery threshold is too low to demonstrate reliable first-pass recognition.");
    }
    const stimuli = interaction.items.map((item) => `${item.stimulus.kind}:${item.stimulus.value.trim().toLowerCase()}`);
    if (new Set(stimuli).size !== stimuli.length) {
      issues.push("The recognition lab repeats a stimulus instead of testing distinct decisions.");
    }
    if (interaction.items.length >= 6 && new Set(interaction.items.map((item) => item.correctIndex)).size < 3) {
      issues.push("The recognition lab needs varied correct-answer positions to avoid a guessing pattern.");
    }
    for (const item of interaction.items) {
      const labels = item.choices.map((choice) => choice.label.trim().toLowerCase());
      if (new Set(labels).size !== labels.length) issues.push(`Lab item ${item.id} repeats an answer choice.`);
      if (item.choices.some((choice) => choice.feedback.trim().length < 12)) {
        issues.push(`Lab item ${item.id} needs explanatory feedback for every choice.`);
      }
      if (item.choices.some((choice) => /^(?:pattern|option|choice|answer)\s+[a-d0-9]+$/i.test(choice.label))) {
        issues.push(`Lab item ${item.id} uses generic answer labels instead of meaningful content.`);
      }
    }
    const knownMorse = new Map(morsePairs(lesson.content).map((pair) => [pair.pattern, pair.character]));
    for (const item of interaction.items.filter((candidate) => candidate.stimulus.kind === "signal")) {
      const expectedCharacter = knownMorse.get(item.stimulus.value);
      if (expectedCharacter && item.choices[item.correctIndex]?.label.toUpperCase() !== expectedCharacter) {
        issues.push(`Lab item ${item.id} has an answer key that conflicts with the lesson content.`);
      }
    }
  }
  return [...new Set(issues)];
}

/**
 * Existing lessons receive a useful interaction without topic-specific branching.
 * Generated interaction data still takes precedence when it is available.
 */
export function deriveLessonInteractions(lesson: LessonData): LessonInteraction[] {
  const stored = curateLessonInteractions(lesson.interactions);
  if (stored[0]?.type === "recognition") return stored;

  const recognition = deriveMorseRecognition(lesson);
  if (recognition) return [recognition];
  if (stored.length) return stored;

  const patterns = uniqueMorsePatterns(lesson.content);
  if (patterns.length >= 2) {
    return [{
      id: "interaction-signal-derived",
      type: "signal",
      title: "Signal studio",
      summary: "Hear, inspect, and build the timing pattern instead of only reading it.",
      version: 1,
      purpose: "explore",
      prompt: "Choose a pattern, listen to its rhythm, then build a signal of your own.",
      patterns: patterns.map((value, index) => ({ label: `Pattern ${index + 1}`, value })),
    }];
  }

  return [];
}

export function interactionsToSpeech(interactions: LessonInteraction[]) {
  return interactions.map((interaction) => {
    if (interaction.type === "recognition") return `Interactive recognition practice: ${interaction.prompt}. This lab contains ${interaction.items.length} independent items.`;
    if (interaction.type === "classification") return `Interactive classification: ${interaction.prompt}. Groups: ${interaction.groups.join(", ")}.`;
    if (interaction.type === "sequence") return `Interactive sequence: ${interaction.prompt}. This lab contains ${interaction.steps.length} actions to arrange.`;
    if (interaction.type === "scenario") return `Interactive decision: ${interaction.prompt}. Choices: ${interaction.options.map((option) => option.label).join(", ")}.`;
    return `Interactive signal studio: ${interaction.prompt}. Patterns: ${interaction.patterns.map((pattern) => `${pattern.label}, ${pattern.value}`).join(". ")}.`;
  }).join(" ");
}
