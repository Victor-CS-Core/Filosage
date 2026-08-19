import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

export const PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY = "filosage:managed-redirect-acceptance:v1";
export const PENDING_IDENTITY_RECOVERY_KEY = "filosage:identity-recovery:v1";
const PENDING_ACCEPTANCE_MAX_AGE_MS = 15 * 60 * 1000;
const PENDING_RECOVERY_MAX_AGE_MS = 15 * 60 * 1000;
const PENDING_HINT_MAX_BYTES = 1_024;

export interface PendingManagedRedirectAcceptance {
  source: "signup";
  termsVersion: string;
  privacyVersion: string;
  ageEligibilityConfirmed: true;
  createdAt: number;
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function boundedCandidate(value: string | null) {
  if (!value || new TextEncoder().encode(value).byteLength > PENDING_HINT_MAX_BYTES) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function currentTimestamp(value: unknown, now: number, maximumAge: number) {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value <= now
    && now - value <= maximumAge;
}

export function pendingManagedRedirectAcceptance(now = Date.now()): PendingManagedRedirectAcceptance {
  return {
    source: "signup",
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    ageEligibilityConfirmed: true,
    createdAt: now,
  };
}

export function parsePendingManagedRedirectAcceptance(
  value: string | null,
  now = Date.now(),
): PendingManagedRedirectAcceptance | null {
  const candidate = boundedCandidate(value);
  if (!exactObject(candidate, [
    "source",
    "termsVersion",
    "privacyVersion",
    "ageEligibilityConfirmed",
    "createdAt",
  ])
    || candidate.source !== "signup"
    || candidate.termsVersion !== TERMS_VERSION
    || candidate.privacyVersion !== PRIVACY_VERSION
    || candidate.ageEligibilityConfirmed !== true
    || !currentTimestamp(candidate.createdAt, now, PENDING_ACCEPTANCE_MAX_AGE_MS)) {
    return null;
  }
  return {
    source: "signup",
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    ageEligibilityConfirmed: true,
    createdAt: candidate.createdAt as number,
  };
}

export function pendingIdentityRecovery(now = Date.now()) {
  return { createdAt: now, returnPath: "/profile?identity-linked=1" } as const;
}

export function parsePendingIdentityRecovery(value: string | null, now = Date.now()) {
  const candidate = boundedCandidate(value);
  if (!exactObject(candidate, ["createdAt", "returnPath"])
    || !currentTimestamp(candidate.createdAt, now, PENDING_RECOVERY_MAX_AGE_MS)
    || candidate.returnPath !== "/profile?identity-linked=1") {
    return null;
  }
  return {
    createdAt: candidate.createdAt as number,
    returnPath: "/profile?identity-linked=1",
  } as const;
}
