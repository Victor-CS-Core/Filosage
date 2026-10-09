import "server-only";

import { DIRECT_GOOGLE_ISSUER } from "@/lib/identity-types";
import type { VerifiedProviderIdentity, VerifiedUser } from "@/lib/identity-types";
import { resolveCanonicalIdentity } from "@/lib/identity-link-server";
import { serverEnvironment } from "@/lib/runtime-environment";
import { providerDisplayName } from "@/lib/display-name";

/**
 * Standalone Google OAuth for Cloudflare Workers.
 *
 * Azure Easy Auth (/.auth/login/google) does not exist on Cloudflare, so this
 * module implements the OAuth 2.0 authorization-code flow directly:
 *   1. GET /api/auth/google -> redirect to Google with state + PKCE
 *   2. GET /api/auth/google/callback -> validate state, exchange code for tokens,
 *      verify the ID token against Google's JWKS, establish a signed session cookie
 *
 * The session cookie is an HMAC-signed (SHA-256) JSON payload using
 * IDENTITY_LINK_HMAC_SECRET. It carries the fully-resolved VerifiedUser so
 * authenticated requests do not need a D1 lookup for identity resolution.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export const GOOGLE_SESSION_COOKIE = "filosage-google-session";
export const GOOGLE_OAUTH_STATE_COOKIE = "filosage-oauth-state";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

export function googleOAuthConfigured(): boolean {
  return Boolean(
    serverEnvironment.GOOGLE_CLIENT_ID?.trim()
    && serverEnvironment.GOOGLE_CLIENT_SECRET?.trim()
    && serverEnvironment.IDENTITY_LINK_HMAC_SECRET?.trim(),
  );
}

export function isCloudflareGoogleAuthActive(): boolean {
  return serverEnvironment.CLOUDFLARE_D1_ENABLED?.trim().toLowerCase() === "true"
    && serverEnvironment.DIRECT_GOOGLE_AUTH_ENABLED?.trim().toLowerCase() === "true"
    && googleOAuthConfigured();
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = serverEnvironment.IDENTITY_LINK_HMAC_SECRET!.trim();
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signPayload(payload: string): Promise<string> {
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${base64UrlEncode(payload)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySignedPayload(signed: string): Promise<string | null> {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = signed.slice(0, dot);
  const sigB64 = signed.slice(dot + 1);
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = base64UrlDecode(payloadB64);
    sigBytes = base64UrlDecode(sigB64);
  } catch {
    return null;
  }
  const key = await hmacKey();
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes.buffer as ArrayBuffer, payloadBytes.buffer as ArrayBuffer);
  if (!valid) return null;
  return new TextDecoder().decode(payloadBytes);
}

function randomToken(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function sha256Base64Url(input: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
    .then((digest) => base64UrlEncode(new Uint8Array(digest)));
}

export interface OAuthState {
  state: string;
  codeVerifier: string;
  postLoginPath: string;
  createdAt: number;
}

export async function createOAuthState(postLoginPath: string): Promise<{ state: OAuthState; cookieValue: string }> {
  const state: OAuthState = {
    state: randomToken(24),
    codeVerifier: randomToken(48),
    postLoginPath: postLoginPath.startsWith("/") ? postLoginPath : "/",
    createdAt: Date.now(),
  };
  const cookieValue = await signPayload(JSON.stringify(state));
  return { state, cookieValue };
}

export async function parseOAuthState(cookieValue: string | undefined | null): Promise<OAuthState | null> {
  if (!cookieValue) return null;
  const json = await verifySignedPayload(cookieValue);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as OAuthState;
    if (typeof parsed.state !== "string" || typeof parsed.codeVerifier !== "string") return null;
    if (Date.now() - parsed.createdAt > STATE_TTL_SECONDS * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function googleAuthorizationUrl(request: Request, oauthState: OAuthState): Promise<string> {
  const clientId = serverEnvironment.GOOGLE_CLIENT_ID!.trim();
  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
  const codeChallenge = await sha256Base64Url(oauthState.codeVerifier);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: oauthState.state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleTokenResponse {
  id_token?: string;
  access_token?: string;
  expires_in?: number;
}

export async function exchangeCodeForTokens(request: Request, code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: serverEnvironment.GOOGLE_CLIENT_ID!.trim(),
      client_secret: serverEnvironment.GOOGLE_CLIENT_SECRET!.trim(),
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }
  return response.json() as Promise<GoogleTokenResponse>;
}

interface GoogleIdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  exp?: number;
  iat?: number;
}

interface GoogleJwk extends JsonWebKey {
  kid?: string;
}

let cachedJwks: { keys: GoogleJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function googleJwks(): Promise<GoogleJwk[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS) return cachedJwks.keys;
  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) throw new Error(`Google JWKS fetch failed (${response.status})`);
  const data = await response.json() as { keys?: GoogleJwk[] };
  if (!Array.isArray(data.keys)) throw new Error("Google JWKS response malformed");
  cachedJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedProviderIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  let header: { kid?: string; alg?: string };
  let claims: GoogleIdTokenClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    throw new Error("Malformed ID token payload");
  }
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unexpected ID token algorithm");
  const jwks = await googleJwks();
  const jwk = jwks.find((key) => key.kid === header.kid);
  if (!jwk) {
    cachedJwks = null; // force refresh once in case of key rotation
    const refreshed = await googleJwks();
    const retry = refreshed.find((key) => key.kid === header.kid);
    if (!retry) throw new Error("ID token signing key not found");
    return verifyWithKey(parts, claims, retry);
  }
  return verifyWithKey(parts, claims, jwk);
}

async function verifyWithKey(
  parts: string[],
  claims: GoogleIdTokenClaims,
  jwk: GoogleJwk,
): Promise<VerifiedProviderIdentity> {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature.buffer as ArrayBuffer,
    signingInput,
  );
  if (!valid) throw new Error("ID token signature invalid");

  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuer = claims.iss?.replace(/\/$/, "");
  if (issuer !== DIRECT_GOOGLE_ISSUER && issuer !== "accounts.google.com") {
    throw new Error("ID token issuer mismatch");
  }
  const clientId = serverEnvironment.GOOGLE_CLIENT_ID!.trim();
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId)) throw new Error("ID token audience mismatch");
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) throw new Error("ID token expired");
  if (typeof claims.iat === "number" && claims.iat > nowSeconds + 300) throw new Error("ID token issued in the future");
  const email = claims.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ID token email invalid");
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (!emailVerified) throw new Error("ID token email not verified");
  if (!claims.sub) throw new Error("ID token subject missing");

  return {
    provider: "google",
    issuer: DIRECT_GOOGLE_ISSUER,
    subject: claims.sub,
    email,
    emailVerified: true,
    authTime: typeof claims.iat === "number" ? claims.iat : nowSeconds,
    name: providerDisplayName(claims.name, email) ?? undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}

export async function createSessionCookie(user: VerifiedUser): Promise<string> {
  const payload = JSON.stringify({
    user,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
  const signed = await signPayload(payload);
  return `${GOOGLE_SESSION_COOKIE}=${signed}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${GOOGLE_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function stateCookie(value: string): string {
  return `${GOOGLE_OAUTH_STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`;
}

export function clearStateCookie(): string {
  return `${GOOGLE_OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function getCloudflareVerifiedUser(request: Request): Promise<VerifiedUser | null> {
  if (!isCloudflareGoogleAuthActive()) return null;
  const signed = getCookie(request, GOOGLE_SESSION_COOKIE);
  if (!signed) return null;
  const json = await verifySignedPayload(signed);
  if (!json) return null;
  try {
    const session = JSON.parse(json) as { user?: VerifiedUser; expiresAt?: number };
    if (!session.user || typeof session.expiresAt !== "number") return null;
    if (Date.now() > session.expiresAt) return null;
    // Re-resolve the canonical identity so account linking changes apply.
    return resolveCanonicalIdentity(session.user.providerIdentity);
  } catch {
    return null;
  }
}

export { getCookie as getRequestCookie };
