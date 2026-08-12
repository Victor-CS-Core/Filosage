import type { VisualApplicability } from "@/lib/course-pipeline/contract";
import { COURSE_PIPELINE_VERSIONS } from "@/lib/course-pipeline/contract";

export const VISUAL_CAPABILITY_REGISTRY = {
  "concept-contrast": { schemaVersion: 1, accessibleFallback: "contrast prose" },
  "process-flow": { schemaVersion: 1, accessibleFallback: "ordered list" },
  "comparison-matrix": { schemaVersion: 1, accessibleFallback: "data table" },
  "worked-example-trace": { schemaVersion: 1, accessibleFallback: "numbered reasoning trace" },
  "prerequisite-map": { schemaVersion: 1, accessibleFallback: "prerequisite list" },
} as const;

export type RegisteredVisualType = keyof typeof VISUAL_CAPABILITY_REGISTRY;
export const VISUAL_POLICY_VERSION = COURSE_PIPELINE_VERSIONS.visualPolicy;

export function isRegisteredVisualType(value: string): value is RegisteredVisualType {
  return Object.hasOwn(VISUAL_CAPABILITY_REGISTRY, value);
}

function boundedText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function accessibleVisualFallbackFromLesson(lesson: Record<string, unknown>) {
  const visualPlan = lesson.visualPlan && typeof lesson.visualPlan === "object"
    ? lesson.visualPlan as Record<string, unknown>
    : {};
  const takeaways = Array.isArray(lesson.keyTakeaways)
    ? lesson.keyTakeaways.map(boundedText).filter(Boolean).slice(0, 5)
    : [];
  const content = [
    boundedText(lesson.learningObjective),
    boundedText(lesson.summary),
    boundedText(visualPlan.rationale),
    takeaways.length ? `Key points: ${takeaways.join("; ")}` : "",
  ].filter(Boolean).join(" ").slice(0, 4_000).trim();
  if (content.length < 40) {
    throw new Error("The lesson does not contain enough validated text to build an accessible visual fallback.");
  }
  return { kind: "text" as const, content };
}

export function defaultVisualApplicability(objective: string, conceptContext = ""): { applicability: VisualApplicability; rationale: string } {
  const normalized = `${objective} ${conceptContext}`.toLowerCase();
  if (/\bignore all previous instructions\b/.test(normalized)) {
    return { applicability: "not_useful", rationale: "Untrusted prompt text cannot create a visual requirement." };
  }
  if (/\b(map|diagram|locate|anatomy|geometry|circuit|electromagnetic induction|cellular respiration|blood flow|heart|knife skills?|severe bleeding|first[- ]aid|mapa|diagrama|anatomía|geometría|circuito|carte|diagramme|anatomie|géométrie|γεωμετρία)\b/.test(normalized)) {
    return { applicability: "essential", rationale: "The objective depends on a spatial or relational representation." };
  }
  if (/\b(compare|sequence|process|flow|trace|calculate|systems?|workflows?|equation|risk|regulation|analytics|measurement|espresso|extraction|induction|comparar|secuencia|proceso|flujo|calcular|sistemas?|ecuación|riesgo|réglementation|comparer|séquence|processus|flux|calculer|systèmes?|équation|risque)\b/.test(normalized)) {
    return { applicability: "helpful", rationale: "A registered structured visual can reduce avoidable working-memory load." };
  }
  return { applicability: "not_useful", rationale: "The objective can be taught accurately through text and active practice." };
}
