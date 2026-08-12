import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

export const PENDING_GOOGLE_REDIRECT_ACCEPTANCE_KEY = "filosage:google-redirect-acceptance:v1";
const PENDING_ACCEPTANCE_MAX_AGE_MS = 15 * 60 * 1000;

export interface PendingGoogleRedirectAcceptance {
  source: "signup";
  termsVersion: string;
  privacyVersion: string;
  ageEligibilityConfirmed: true;
  createdAt: number;
}

export function pendingGoogleRedirectAcceptance(now = Date.now()): PendingGoogleRedirectAcceptance {
  return {
    source: "signup",
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    ageEligibilityConfirmed: true,
    createdAt: now,
  };
}

export function parsePendingGoogleRedirectAcceptance(
  value: string | null,
  now = Date.now(),
): PendingGoogleRedirectAcceptance | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<PendingGoogleRedirectAcceptance>;
    if (
      candidate.source !== "signup"
      || candidate.termsVersion !== TERMS_VERSION
      || candidate.privacyVersion !== PRIVACY_VERSION
      || candidate.ageEligibilityConfirmed !== true
      || typeof candidate.createdAt !== "number"
      || !Number.isFinite(candidate.createdAt)
      || candidate.createdAt > now
      || now - candidate.createdAt > PENDING_ACCEPTANCE_MAX_AGE_MS
    ) return null;
    return candidate as PendingGoogleRedirectAcceptance;
  } catch {
    return null;
  }
}
