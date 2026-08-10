export const LESSON_GENERATION_TOTAL_BUDGET_MS = 48_000;
export const LESSON_GENERATION_CLEANUP_BUDGET_MS = 6_000;
export const LESSON_GENERATION_MAX_ATTEMPT_MS = 40_000;
export const LESSON_GENERATION_MIN_REPAIR_BUDGET_MS = 14_000;

export function lessonGenerationRemainingMs(startedAt: number, now = Date.now()) {
  return Math.max(0, LESSON_GENERATION_TOTAL_BUDGET_MS - Math.max(0, now - startedAt));
}

export function lessonGenerationAttemptTimeoutMs(startedAt: number, now = Date.now()) {
  const available = lessonGenerationRemainingMs(startedAt, now) - LESSON_GENERATION_CLEANUP_BUDGET_MS;
  return Math.max(1, Math.min(LESSON_GENERATION_MAX_ATTEMPT_MS, available));
}

export function canAttemptLessonRepair(startedAt: number, now = Date.now()) {
  return lessonGenerationRemainingMs(startedAt, now) >= LESSON_GENERATION_MIN_REPAIR_BUDGET_MS;
}

export function isLessonGenerationTimeout(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "APIConnectionTimeoutError"
    || error.name === "AbortError"
    || /timed?\s*out|timeout|aborted/i.test(error.message);
}
