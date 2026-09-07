export class EvaluationBudgetError extends Error {
  readonly status = 409;
  constructor(readonly code: string, readonly preDispatch = true) { super(`${code}: evaluation requires its approved configuration, sufficient reserved budget and reconciled provider evidence.`); }
}
export function evaluationBudgetErrorFrom(error: unknown): EvaluationBudgetError | undefined {
  for (let i = 0; i < 8 && error; i++) {
    if (error instanceof EvaluationBudgetError) return error;
    error = typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
  }
}
export function isEvaluationPreDispatchError(error: unknown) { return evaluationBudgetErrorFrom(error)?.preDispatch === true; }
