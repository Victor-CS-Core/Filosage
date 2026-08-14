export type SourceVerificationData = {
  url?: string;
  evidenceClaims?: Array<{ id?: string }>;
};

export function sourceVerificationDataFromInput(input: string): SourceVerificationData[] {
  const match = input.match(/<SOURCE_VERIFICATION_DATA>([\s\S]*?)<\/SOURCE_VERIFICATION_DATA>/);
  try {
    const parsed = match ? JSON.parse(match[1]) as SourceVerificationData | SourceVerificationData[] : [];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}
