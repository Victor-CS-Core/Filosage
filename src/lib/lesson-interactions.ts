import { z } from "zod";
import type { LessonData } from "@/lib/course-types";

const shortText = z.string().trim().min(1).max(240);
const label = z.string().trim().min(1).max(100);
const morsePattern = z.string().trim().min(1).max(80).regex(/^[.\- /]+$/);
const base = {
  id: z.string().trim().regex(/^interaction-[a-z0-9-]+$/).max(90),
  title: label,
  summary: z.string().trim().min(1).max(180),
  version: z.literal(1),
};

export const lessonInteractionSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("classification"),
    prompt: shortText,
    groups: z.array(label).min(2).max(4),
    items: z.array(z.object({ label, groupIndex: z.number().int().min(0).max(3), explanation: shortText })).min(3).max(8),
  }),
  z.object({
    ...base,
    type: z.literal("sequence"),
    prompt: shortText,
    steps: z.array(z.object({ label, detail: shortText })).min(3).max(7),
  }),
  z.object({
    ...base,
    type: z.literal("scenario"),
    prompt: shortText,
    options: z.array(z.object({ label, consequence: shortText })).min(2).max(4),
    recommendedIndex: z.number().int().min(0).max(3),
    explanation: shortText,
  }),
  z.object({
    ...base,
    type: z.literal("signal"),
    prompt: shortText,
    patterns: z.array(z.object({ label, value: morsePattern })).min(2).max(8),
  }),
]);

export const lessonInteractionsSchema = z.array(lessonInteractionSchema).max(1).default([]);
export type LessonInteraction = z.infer<typeof lessonInteractionSchema>;

const candidateBase = { title: label, summary: z.string().trim().min(1).max(180) };
export const lessonInteractionCandidateSchema = z.discriminatedUnion("type", [
  z.object({ ...candidateBase, type: z.literal("classification"), prompt: shortText, groups: z.array(label).min(2).max(4), items: z.array(z.object({ label, groupIndex: z.number().int().min(0).max(3), explanation: shortText })).min(3).max(8) }),
  z.object({ ...candidateBase, type: z.literal("sequence"), prompt: shortText, steps: z.array(z.object({ label, detail: shortText })).min(3).max(7) }),
  z.object({ ...candidateBase, type: z.literal("scenario"), prompt: shortText, options: z.array(z.object({ label, consequence: shortText })).min(2).max(4), recommendedIndex: z.number().int().min(0).max(3), explanation: shortText }),
  z.object({ ...candidateBase, type: z.literal("signal"), prompt: shortText, patterns: z.array(z.object({ label, value: morsePattern })).min(2).max(8) }),
]);

function parseInteraction(value: unknown, index: number): LessonInteraction | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate) as unknown; } catch { return null; }
  }
  const stored = lessonInteractionSchema.safeParse(candidate);
  if (stored.success) return stored.data;
  const proposed = lessonInteractionCandidateSchema.safeParse(candidate);
  if (!proposed.success) return null;
  const data = proposed.data;
  if (data.type === "classification") {
    const groupCount = data.groups.length;
    if (data.items.some((item) => item.groupIndex >= groupCount)) return null;
  }
  if (data.type === "scenario" && data.recommendedIndex >= data.options.length) return null;
  return { ...data, id: `interaction-${data.type}-${index + 1}`, version: 1 } as LessonInteraction;
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

/**
 * Existing lessons receive a useful interaction without topic-specific branching.
 * Generated interaction data still takes precedence when it is available.
 */
export function deriveLessonInteractions(lesson: LessonData): LessonInteraction[] {
  const stored = curateLessonInteractions(lesson.interactions);
  if (stored.length) return stored;

  const patterns = uniqueMorsePatterns(lesson.content);
  if (patterns.length >= 2) {
    return [{
      id: "interaction-signal-derived",
      type: "signal",
      title: "Signal studio",
      summary: "Hear, inspect, and build the timing pattern instead of only reading it.",
      version: 1,
      prompt: "Choose a pattern, listen to its rhythm, then build a signal of your own.",
      patterns: patterns.map((value, index) => ({ label: `Pattern ${index + 1}`, value })),
    }];
  }

  if ((lesson.guidedPractice?.steps.length ?? 0) >= 3) {
    return [{
      id: "interaction-sequence-derived",
      type: "sequence",
      title: "Put the method in order",
      summary: "Reconstruct the workflow before beginning guided practice.",
      version: 1,
      prompt: lesson.guidedPractice?.prompt ?? "Arrange the steps into a defensible sequence.",
      steps: lesson.guidedPractice!.steps.map((detail, index) => ({ label: `Step ${index + 1}`, detail })),
    }];
  }

  if (lesson.experience?.type === "comparison") {
    return [{
      id: "interaction-scenario-derived",
      type: "scenario",
      title: "Test the boundary",
      summary: "Commit to a choice, then compare it with the lesson's reasoning.",
      version: 1,
      prompt: lesson.experience.boundaryCase.prompt,
      options: lesson.experience.options.map((option) => ({ label: option, consequence: `Consider when ${option} best fits the stated criteria.` })),
      recommendedIndex: 0,
      explanation: lesson.experience.boundaryCase.resolution,
    }];
  }

  return [];
}

export function interactionsToSpeech(interactions: LessonInteraction[]) {
  return interactions.map((interaction) => {
    if (interaction.type === "classification") return `Interactive classification: ${interaction.prompt}. Groups: ${interaction.groups.join(", ")}.`;
    if (interaction.type === "sequence") return `Interactive sequence: ${interaction.prompt}. ${interaction.steps.map((step, index) => `Step ${index + 1}, ${step.label}: ${step.detail}`).join(" ")}`;
    if (interaction.type === "scenario") return `Interactive decision: ${interaction.prompt}. Choices: ${interaction.options.map((option) => option.label).join(", ")}.`;
    return `Interactive signal studio: ${interaction.prompt}. Patterns: ${interaction.patterns.map((pattern) => `${pattern.label}, ${pattern.value}`).join(". ")}.`;
  }).join(" ");
}
