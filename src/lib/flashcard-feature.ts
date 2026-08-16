import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";

function enabled(value: string | undefined, localDefault: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return localDefault;
}

export function flashcardFeatureConfiguration(environment: NodeJS.ProcessEnv = serverEnvironment) {
  const local = environment.NODE_ENV !== "production";
  const decksEnabled = enabled(environment.FLASHCARD_DECKS_ENABLED, local);
  return {
    decksEnabled,
    generationEnabled: decksEnabled && enabled(environment.FLASHCARD_AI_GENERATION_ENABLED, local),
  };
}
