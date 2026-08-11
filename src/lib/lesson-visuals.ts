import { z } from "zod";

export type LessonVisualPlacement = "after-purpose" | "after-explanation" | "before-guided-practice";

interface LessonVisualBase {
  id: string;
  placement: LessonVisualPlacement;
  title: string;
  summary: string;
  version: 1;
  objectiveIds?: string[];
}

export interface ConceptContrastVisual extends LessonVisualBase {
  type: "concept-contrast";
  misconception: string;
  accurateView: string;
  whyItMatters: string;
}

export interface ProcessFlowVisual extends LessonVisualBase {
  type: "process-flow";
  steps: Array<{ title: string; detail: string }>;
}

export interface ComparisonMatrixVisual extends LessonVisualBase {
  type: "comparison-matrix";
  columns: [string, string];
  rows: Array<{ criterion: string; values: [string, string] }>;
}

export interface WorkedExampleTraceVisual extends LessonVisualBase {
  type: "worked-example-trace";
  prompt: string;
  steps: Array<{ title: string; detail: string; check: string }>;
}

export interface PrerequisiteMapVisual extends LessonVisualBase {
  type: "prerequisite-map";
  nodes: Array<{ label: string; detail: string; role: "foundation" | "current" | "next" }>;
}

export type LessonVisual =
  | ConceptContrastVisual
  | ProcessFlowVisual
  | ComparisonMatrixVisual
  | WorkedExampleTraceVisual
  | PrerequisiteMapVisual;

export interface LessonVisualContext {
  lessonMode?: "concept" | "worked-example" | "comparison" | "case-study" | "practice-lab" | "synthesis";
  buildsOn?: string[];
  misconception?: string;
}

const label = z.string().trim().min(1).max(120);
const text = z.string().trim().min(1).max(260);
const base = {
  id: z.string().trim().regex(/^visual-[a-z0-9-]+$/).max(80),
  placement: z.enum(["after-purpose", "after-explanation", "before-guided-practice"]),
  title: label,
  summary: z.string().trim().min(1).max(180),
  version: z.literal(1),
  objectiveIds: z.array(z.string().trim().regex(/^objective-[a-z0-9-]+$/)).min(1).max(5).optional(),
};

export const lessonVisualSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("concept-contrast"), misconception: text, accurateView: text, whyItMatters: text }),
  z.object({ ...base, type: z.literal("process-flow"), steps: z.array(z.object({ title: label, detail: text })).min(2).max(5) }),
  z.object({ ...base, type: z.literal("comparison-matrix"), columns: z.tuple([label, label]), rows: z.array(z.object({ criterion: label, values: z.tuple([text, text]) })).min(2).max(5) }),
  z.object({ ...base, type: z.literal("worked-example-trace"), prompt: text, steps: z.array(z.object({ title: label, detail: text, check: text })).min(2).max(5) }),
  z.object({ ...base, type: z.literal("prerequisite-map"), nodes: z.array(z.object({ label, detail: text, role: z.enum(["foundation", "current", "next"]) })).min(2).max(4) }),
]);

export const lessonVisualsSchema = z.array(lessonVisualSchema).max(2).default([]);

const candidateBase = { title: label, summary: z.string().trim().min(1).max(180) };
const lessonVisualCandidateSchema = z.discriminatedUnion("type", [
  z.object({ ...candidateBase, type: z.literal("concept-contrast"), misconception: text, accurateView: text, whyItMatters: text }),
  z.object({ ...candidateBase, type: z.literal("process-flow"), steps: z.array(z.object({ title: label, detail: text })).min(2).max(5) }),
  z.object({ ...candidateBase, type: z.literal("comparison-matrix"), columns: z.tuple([label, label]), rows: z.array(z.object({ criterion: label, values: z.tuple([text, text]) })).min(2).max(5) }),
  z.object({ ...candidateBase, type: z.literal("worked-example-trace"), prompt: text, steps: z.array(z.object({ title: label, detail: text, check: text })).min(2).max(5) }),
  z.object({ ...candidateBase, type: z.literal("prerequisite-map"), nodes: z.array(z.object({ label, detail: text, role: z.enum(["foundation", "current", "next"]) })).min(2).max(4) }),
]);

const placementOrder: Record<LessonVisualPlacement, number> = {
  "after-purpose": 0,
  "after-explanation": 1,
  "before-guided-practice": 2,
};

const placementForType: Record<LessonVisual["type"], LessonVisualPlacement> = {
  "concept-contrast": "after-purpose",
  "process-flow": "after-explanation",
  "comparison-matrix": "after-explanation",
  "worked-example-trace": "before-guided-practice",
  "prerequisite-map": "after-purpose",
};

function earnsWideCanvas(visual: LessonVisual) {
  return visual.type === "worked-example-trace" || visual.type === "prerequisite-map";
}

function parseCandidate(value: unknown, index: number): LessonVisual | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }

  const stored = lessonVisualSchema.safeParse(candidate);
  if (stored.success) {
    return { ...stored.data, placement: placementForType[stored.data.type] };
  }

  const proposed = lessonVisualCandidateSchema.safeParse(candidate);
  if (!proposed.success) return null;
  return {
    ...proposed.data,
    id: `visual-${proposed.data.type}-${index + 1}`,
    placement: placementForType[proposed.data.type],
    version: 1,
  } as LessonVisual;
}

function isEligible(visual: LessonVisual, context: LessonVisualContext | undefined) {
  if (!context) return true;
  switch (visual.type) {
    case "concept-contrast":
      return Boolean(context.misconception?.trim());
    case "comparison-matrix":
      return context.lessonMode === "comparison";
    case "worked-example-trace":
      return context.lessonMode === "worked-example";
    case "prerequisite-map":
      return Boolean(context.buildsOn?.some((item) => item.trim()));
    case "process-flow":
      return true;
  }
}

function editorialPriority(visual: LessonVisual, context: LessonVisualContext | undefined) {
  if (visual.type === "worked-example-trace" && context?.lessonMode === "worked-example") return 100;
  if (visual.type === "comparison-matrix" && context?.lessonMode === "comparison") return 100;
  if (visual.type === "prerequisite-map" && context?.buildsOn?.length) return 90;
  if (visual.type === "concept-contrast" && context?.misconception) return 80;
  if (visual.type === "process-flow") return 70;
  return 60;
}

/**
 * Curation keeps only renderable registered visuals. The stored V2 visual
 * applicability plan, not this renderer helper, decides whether a missing
 * visual is an essential blocker or an optional enrichment warning.
 */
export function curateLessonVisuals(value: unknown, context?: LessonVisualContext): LessonVisual[] {
  if (!Array.isArray(value)) return [];
  const candidates = value
    .map(parseCandidate)
    .filter((visual): visual is LessonVisual => Boolean(visual))
    .filter((visual) => isEligible(visual, context))
    .sort((left, right) => editorialPriority(right, context) - editorialPriority(left, context));
  const selected: LessonVisual[] = [];
  const ids = new Set<string>();
  const placements = new Set<LessonVisualPlacement>();
  let hasWideCanvas = false;

  for (const visual of candidates) {
    const prerequisiteMapHasCurrent = visual.type !== "prerequisite-map" || visual.nodes.some((node) => node.role === "current");
    const adjacentToSelected = selected.some((current) => Math.abs(placementOrder[visual.placement] - placementOrder[current.placement]) < 2);
    if (
      ids.has(visual.id)
      || placements.has(visual.placement)
      || !prerequisiteMapHasCurrent
      || adjacentToSelected
      || (hasWideCanvas && earnsWideCanvas(visual))
    ) continue;

    selected.push(visual);
    ids.add(visual.id);
    placements.add(visual.placement);
    hasWideCanvas ||= earnsWideCanvas(visual);
    if (selected.length === 2) break;
  }

  return selected.sort((left, right) => placementOrder[left.placement] - placementOrder[right.placement]);
}

export function visualsToSpeech(visuals: LessonVisual[]) {
  return visuals.map((visual) => {
    switch (visual.type) {
      case "concept-contrast":
        return `Visual contrast: it may seem that ${visual.misconception}. A more accurate view is ${visual.accurateView}.`;
      case "process-flow":
        return `Visual process: ${visual.steps.map((step, index) => `step ${index + 1}, ${step.title}: ${step.detail}`).join(" ")}`;
      case "comparison-matrix":
        return `Visual comparison of ${visual.columns[0]} and ${visual.columns[1]}. ${visual.rows.map((row) => `${row.criterion}: ${row.values[0]} versus ${row.values[1]}.`).join(" ")}`;
      case "worked-example-trace":
        return `Worked example trace: ${visual.prompt}. ${visual.steps.map((step, index) => `step ${index + 1}, ${step.title}: ${step.detail}`).join(" ")}`;
      case "prerequisite-map":
        return `Learning map: ${visual.nodes.map((node) => `${node.role}, ${node.label}: ${node.detail}`).join(" ")}`;
    }
  }).join(" ");
}
