import "server-only";

import type { VerifiedUser } from "@/lib/identity-types";
import { resolveCanonicalIdentity } from "@/lib/identity-link-server";
import { serverEnvironment } from "@/lib/runtime-environment";
import { isCloudflareGoogleAuthActive, signPayload, verifySignedPayload } from "@/lib/cloudflare-google-auth";

/**
 * Native-app (iOS) authentication for Cloudflare Workers.
 *
 * Browsers keep using the HttpOnly session cookie. Native apps cannot share
 * that cookie, so they use the same Google OAuth flow inside
 * ASWebAuthenticationSession and finish with a PKCE-bound code exchange:
 *
 *   1. App opens  GET /api/auth/mobile/start?code_challenge=..&state=..&redirect_uri=filosage://auth
 *      -> 302 into the existing /api/auth/google flow, with post-login path
 *         pointing at /api/auth/mobile/finish.
 *   2. Google -> /api/auth/google/callback (unchanged) sets the web session
 *      cookie inside the in-app browser and redirects to /api/auth/mobile/finish.
 *   3. /api/auth/mobile/finish reads that cookie, mints a 2-minute signed code
 *      bound to the PKCE challenge, and redirects to filosage://auth?code=..&state=..
 *   4. App POSTs { code, codeVerifier } to /api/auth/mobile/token and receives
 *      a 30-day bearer token: "Authorization: Bearer fsm1.<signed>".
 *
 * Every payload is HMAC-signed with IDENTITY_LINK_HMAC_SECRET (same key as the
 * session cookie) and carries a distinct `kind`, so codes, access tokens,
 * OAuth state, and cookies are never interchangeable. No D1 schema changes.
 */

export const MOBILE_TOKEN_PREFIX = "fsm1.";
export const MOBILE_REDIRECT_URI = "filosage://auth";
const CODE_TTL_MS = 2 * 60 * 1000;
const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

interface MobileCodePayload {
  kind: "fsm-code";
  user: VerifiedUser;
  challenge: string;
  exp: number;
}

interface MobileAccessPayload {
  kind: "fsm-access";
  user: VerifiedUser;
  iat: number;
  exp: number;
}

/** Mobile auth needs the Cloudflare Google flow plus an explicit kill switch. */
export function isMobileAuthActive(): boolean {
  return isCloudflareGoogleAuthActive()
    && serverEnvironment.MOBILE_AUTH_ENABLED?.trim().toLowerCase() === "true";
}

export function isValidCodeChallenge(value: string | null): value is string {
  return typeof value === "string" && CHALLENGE_PATTERN.test(value);
}

export function isValidAppState(value: string | null): value is string {
  return typeof value === "string" && STATE_PATTERN.test(value);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64Url(new Uint8Array(digest));
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function createMobileCode(user: VerifiedUser, challenge: string): Promise<string> {
  const payload: MobileCodePayload = { kind: "fsm-code", user, challenge, exp: Date.now() + CODE_TTL_MS };
  return signPayload(JSON.stringify(payload));
}

/** Verifies the code signature, expiry, and PKCE verifier (S256). */
export async function redeemMobileCode(code: string, codeVerifier: string): Promise<VerifiedUser | null> {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier)) return null;
  const json = await verifySignedPayload(code);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as Partial<MobileCodePayload>;
    if (payload.kind !== "fsm-code" || !payload.user || typeof payload.challenge !== "string") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    const computed = await sha256Base64Url(codeVerifier);
    if (!timingSafeEqual(computed, payload.challenge)) return null;
    return payload.user;
  } catch {
    return null;
  }
}

export async function createMobileAccessToken(user: VerifiedUser): Promise<{ token: string; expiresAt: number }> {
  const now = Date.now();
  const payload: MobileAccessPayload = { kind: "fsm-access", user, iat: now, exp: now + ACCESS_TTL_MS };
  return { token: `${MOBILE_TOKEN_PREFIX}${await signPayload(JSON.stringify(payload))}`, expiresAt: payload.exp };
}

/** True when the request carries a mobile bearer token (valid or not). */
export function hasMobileBearer(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  return /^Bearer\s+fsm1\./i.test(header);
}

/**
 * Resolves the user for a mobile bearer token. Returns null when the token is
 * missing, malformed, expired, or forged. Callers must NOT fall back to cookie
 * auth when a mobile bearer is present (see auth-server.ts patch).
 */
export async function getMobileVerifiedUser(request: Request): Promise<VerifiedUser | null> {
  if (!isMobileAuthActive() || !hasMobileBearer(request)) return null;
  const raw = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const signed = raw.slice(MOBILE_TOKEN_PREFIX.length);
  const json = await verifySignedPayload(signed);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as Partial<MobileAccessPayload>;
    if (payload.kind !== "fsm-access" || !payload.user?.providerIdentity) return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    // Re-resolve so account linking / deletion changes apply, same as cookies.
    return resolveCanonicalIdentity(payload.user.providerIdentity);
  } catch {
    return null;
  }
}
