import type { LabApplicability } from "@/lib/course-pipeline/contract";
import { COURSE_PIPELINE_VERSIONS } from "@/lib/course-pipeline/contract";

export const LAB_CAPABILITY_REGISTRY = {
  recognition: { schemaVersion: 2, interactive: true, progress: "durable", fallback: "retrieval questions" },
} as const;

export const LEGACY_RENDERABLE_INTERACTION_TYPES = ["classification", "sequence", "scenario", "signal"] as const;

export type RegisteredLabType = keyof typeof LAB_CAPABILITY_REGISTRY;
export const LAB_REGISTRY_VERSION = COURSE_PIPELINE_VERSIONS.labRegistry;

export function isRegisteredLabType(value: string): value is RegisteredLabType {
  return Object.hasOwn(LAB_CAPABILITY_REGISTRY, value);
}

export function isLegacyRenderableInteractionType(value: string) {
  return (LEGACY_RENDERABLE_INTERACTION_TYPES as readonly string[]).includes(value);
}

export function defaultLabApplicability(objective: string, conceptContext = ""): { applicability: LabApplicability; rationale: string } {
  const normalized = `${objective} ${conceptContext}`.toLowerCase();
  if (/\b(?:poem|close reading|essay|oral[- ]history|interview|knife skills?|first[- ]aid|severe bleeding|current ai regulation|haitian revolution|primary evidence|ignore all previous instructions)\b/.test(normalized)) {
    return { applicability: "not_applicable", rationale: "The implemented interaction grammar would not improve this objective safely or authentically." };
  }
  if (/\b(classify|sequence|calculate|debug|trace|identify|choose|decide|match|solve|verify|predict|conduct|adjust|analy[sz]e|apply|clasificar|secuenciar|calcular|depurar|identificar|elegir|decidir|resolver|predecir|analizar|aplicar|classer|calculer|identifier|choisir|décider|résoudre|analyser|appliquer)\b/.test(normalized)
    || /\b(?:distributed workflows?|cellular respiration|project risk|product analytics|spanish conversation|greek.*terminology)\b/.test(normalized)) {
    return { applicability: "recommended", rationale: "The objective includes a decision or procedure that can benefit from feedback." };
  }
  return { applicability: "not_applicable", rationale: "No implemented interaction adds meaningful practice beyond the lesson activity." };
}
