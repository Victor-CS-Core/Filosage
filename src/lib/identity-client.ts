"use client";

import { accountSessionMarker } from "@/lib/account-session";
import { normalizeDisplayName } from "@/lib/display-name";

export interface FilosageUser {
  uid: string;
  accountGeneration?: string;
  displayName: string | null;
  email: string;
  photoURL: string | null;
  provider: "google" | "local";
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  reauthenticationToken?: string;
}

export interface ManagedAuthenticationState {
  recentAuthentication: boolean;
  authentication: {
    primaryProvider: "google" | null;
    googleAvailable: boolean;
  };
  user: FilosageUser | null;
}

interface AuthenticationSessionResponse {
  recentAuthentication: boolean;
  authentication: ManagedAuthenticationState["authentication"];
  user: {
    uid: string;
  accountGeneration?: string;
    displayName: string | null;
    email: string;
    photoURL: string | null;
    authenticationProvider: "google" | "local";
  } | null;
}

const REAUTHENTICATED_QUERY = "filosage_reauthenticated";
const MAX_SESSION_RESPONSE_BYTES = 16 * 1024;
const SESSION_UNAVAILABLE_MESSAGE = "Authentication status is unavailable.";
export const RECENT_AUTHENTICATION_PROOF_MISSING_MESSAGE =
  "We could not confirm a recent sign-in, so the sensitive action was not completed.";

export const isManagedAuthConfigured = process.env.NODE_ENV === "production";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function boundedString(value: unknown, maximum: number) {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

export async function readBoundedJsonResponse(
  response: Response,
  maximumBytes: number,
  failureMessage: string,
): Promise<unknown> {
  const declared = response.headers.get("content-length")?.trim();
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    throw new Error(failureMessage);
  }
  if (!response.body) throw new Error(failureMessage);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new Error(failureMessage);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(failureMessage);
  }
}

function parsedSession(value: unknown): AuthenticationSessionResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["recentAuthentication", "authentication", "user"])) {
    return null;
  }
  if (typeof value.recentAuthentication !== "boolean" || !isRecord(value.authentication)) {
    return null;
  }
  const authentication = value.authentication;
  if (!hasExactKeys(authentication, ["primaryProvider", "googleAvailable"])) {
    return null;
  }
  if ((authentication.primaryProvider !== null && authentication.primaryProvider !== "google")
    || typeof authentication.googleAvailable !== "boolean") {
    return null;
  }
  const expectedPrimaryProvider = authentication.googleAvailable ? "google" : null;
  if (authentication.primaryProvider !== expectedPrimaryProvider) return null;

  const safeAuthentication: ManagedAuthenticationState["authentication"] = {
    primaryProvider: authentication.primaryProvider,
    googleAvailable: authentication.googleAvailable,
  };
  if (value.user === null) {
    return {
      recentAuthentication: value.recentAuthentication,
      authentication: safeAuthentication,
      user: null,
    };
  }
  if (!isRecord(value.user) || !hasExactKeys(value.user, [
    ...(value.user.accountGeneration !== undefined ? ["accountGeneration"] : []),
    "uid",
    "displayName",
    "email",
    "photoURL",
    "authenticationProvider",
  ])) return null;
  const uid = boundedString(value.user.uid, 512);
  const accountGeneration = value.user.accountGeneration === undefined ? undefined : boundedString(value.user.accountGeneration, 128);
  if (accountGeneration === null || accountGeneration === "") return null;
  const email = boundedString(value.user.email, 320);
  const displayName = value.user.displayName === null
    ? null
    : normalizeDisplayName(value.user.displayName);
  const photoURL = value.user.photoURL === null
    ? null
    : boundedString(value.user.photoURL, 2_048);
  const provider = value.user.authenticationProvider;
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  if (!uid || uid !== uid.trim() || !normalizedEmail || email !== normalizedEmail
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    || (value.user.displayName !== null && displayName === null)
    || (value.user.photoURL !== null && photoURL === null)
    || (provider !== "google" && provider !== "local")) {
    return null;
  }
  return {
    recentAuthentication: value.recentAuthentication,
    authentication: safeAuthentication,
    user: {
      uid,
      accountGeneration,
      displayName,
      email: normalizedEmail,
      photoURL,
      authenticationProvider: provider,
    },
  };
}

function toFilosageUser(
  session: AuthenticationSessionResponse,
  reauthenticationToken?: string,
): FilosageUser | null {
  if (!session.user) return null;
  return {
    uid: session.user.uid,
    accountGeneration: session.user.accountGeneration,
    displayName: session.user.displayName,
    email: session.user.email,
    photoURL: session.user.photoURL,
    provider: session.user.authenticationProvider,
    getIdToken: async () => accountSessionMarker(session.user!.uid, session.user!.accountGeneration),
    ...(reauthenticationToken ? { reauthenticationToken } : {}),
  };
}

export async function currentAuthenticationState(): Promise<ManagedAuthenticationState> {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(SESSION_UNAVAILABLE_MESSAGE);
  const body = parsedSession(await readBoundedJsonResponse(
    response,
    MAX_SESSION_RESPONSE_BYTES,
    SESSION_UNAVAILABLE_MESSAGE,
  ));
  if (!body) throw new Error(SESSION_UNAVAILABLE_MESSAGE);
  return {
    recentAuthentication: body.recentAuthentication,
    authentication: body.authentication,
    user: toFilosageUser(body),
  };
}

export async function currentAuthenticationUser() {
  return (await currentAuthenticationState()).user;
}

export async function currentAuthenticationSession() {
  const user = (await currentAuthenticationState()).user;
  return user ? accountSessionMarker(user.uid, user.accountGeneration) : null;
}

function sameOriginPath(path: string) {
  if (typeof window === "undefined") return "/";
  try {
    const candidate = new URL(path, window.location.origin);
    return candidate.origin === window.location.origin
      ? `${candidate.pathname}${candidate.search}${candidate.hash}`
      : "/";
  } catch {
    return "/";
  }
}

function navigateToAuth(path: string): Promise<never> {
  window.location.assign(path);
  return new Promise<never>(() => undefined);
}

export function beginManagedSignIn(
  postLoginPath = "/",
  prompt?: "login" | "select_account",
) {
  const destination = encodeURIComponent(sameOriginPath(postLoginPath));
  const promptParameter = prompt ? `&prompt=${encodeURIComponent(prompt)}` : "";
  return navigateToAuth(`/api/auth/google?post_login_redirect_uri=${destination}${promptParameter}`);
}

export async function beginManagedReauthentication(
  expectedCanonicalUid: string,
  postLoginPath = "/privacy-center",
) {
  const current = new URL(window.location.href);
  if (current.searchParams.get(REAUTHENTICATED_QUERY) === "1") {
    current.searchParams.delete(REAUTHENTICATED_QUERY);
    window.history.replaceState({}, "", `${current.pathname}${current.search}${current.hash}`);
    const state = await currentAuthenticationState();
    if (!state.recentAuthentication || state.user?.uid !== expectedCanonicalUid) {
      throw new Error(RECENT_AUTHENTICATION_PROOF_MISSING_MESSAGE);
    }
    return {
      ...state.user,
      reauthenticationToken: accountSessionMarker(state.user.uid, state.user.accountGeneration),
    } as FilosageUser;
  }
  const destination = new URL(sameOriginPath(postLoginPath), window.location.origin);
  destination.searchParams.set(REAUTHENTICATED_QUERY, "1");
  return beginManagedSignIn(
    `${destination.pathname}${destination.search}`,
    "select_account",
  );
}

export function signOutFromAuthentication(postLogoutPath = "/") {
  const destination = encodeURIComponent(sameOriginPath(postLogoutPath));
  return navigateToAuth(`/api/auth/google/logout?post_logout_redirect_uri=${destination}`);
}
