export const ACCOUNT_DELETION_RECENT_AUTH_SECONDS = 5 * 60;

const ALLOWED_CLOCK_SKEW_SECONDS = 60;

export interface AuthenticationClaims {
  authTime?: number;
  subject?: string;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

/**
 * Reads authentication metadata only after the caller has independently
 * validated the identity token. Decoding a JWT is not signature
 * verification and this helper must never be used as authentication by itself.
 */
export function authenticationClaimsFromIdToken(idToken: string): AuthenticationClaims {
  try {
    const encodedPayload = idToken.split(".")[1];
    if (!encodedPayload) return {};
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Record<string, unknown>;
    const authTime = typeof payload.auth_time === "number"
      && Number.isInteger(payload.auth_time)
      && payload.auth_time >= 0
      ? payload.auth_time
      : undefined;
    const subject = typeof payload.sub === "string" && payload.sub.length > 0
      ? payload.sub
      : undefined;
    return { authTime, subject };
  } catch {
    return {};
  }
}

export function hasRecentAuthentication(
  authTime: number | undefined,
  nowSeconds = Math.floor(Date.now() / 1_000),
  maximumAgeSeconds = ACCOUNT_DELETION_RECENT_AUTH_SECONDS,
) {
  if (!Number.isInteger(authTime) || authTime === undefined || authTime < 0) return false;
  if (!Number.isInteger(nowSeconds) || !Number.isInteger(maximumAgeSeconds) || maximumAgeSeconds < 0) return false;
  const ageSeconds = nowSeconds - authTime;
  return ageSeconds >= -ALLOWED_CLOCK_SKEW_SECONDS && ageSeconds <= maximumAgeSeconds;
}
