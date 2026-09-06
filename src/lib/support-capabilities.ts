export interface SupportCapabilities { submissionEnabled: boolean; historyEnabled: true }
export function parseSupportCapabilities(value: unknown): SupportCapabilities | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || typeof data.submissionEnabled !== "boolean" || data.historyEnabled !== true) return null;
  return { submissionEnabled: data.submissionEnabled, historyEnabled: true };
}
