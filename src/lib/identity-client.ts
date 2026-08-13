"use client";

export interface FilosageUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  reauthenticationToken?: string;
}

interface EasyAuthSessionResponse {
  recentAuthentication?: boolean;
  user?: {
    uid?: unknown;
    displayName?: unknown;
    email?: unknown;
    photoURL?: unknown;
  } | null;
}

const EASY_AUTH_SESSION_MARKER = "azure-easy-auth-session";
const REAUTHENTICATED_QUERY = "filosage_reauthenticated";

// Azure Container Apps provides these endpoints only in the deployed
// production runtime. Development keeps the existing isolated local account.
export const isGoogleAuthConfigured = process.env.NODE_ENV === "production";

function toFilosageUser(session: EasyAuthSessionResponse, reauthenticationToken?: string): FilosageUser | null {
  const uid = typeof session.user?.uid === "string" ? session.user.uid.trim() : "";
  const email = typeof session.user?.email === "string" ? session.user.email.trim().toLowerCase() : "";
  if (!uid || !email) return null;
  return {
    uid,
    displayName: typeof session.user?.displayName === "string" ? session.user.displayName : null,
    email,
    photoURL: typeof session.user?.photoURL === "string" ? session.user.photoURL : null,
    getIdToken: async () => EASY_AUTH_SESSION_MARKER,
    ...(reauthenticationToken ? { reauthenticationToken } : {}),
  };
}

async function easyAuthSession() {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Azure authentication status is unavailable.");
  const body = await response.json() as EasyAuthSessionResponse;
  return body.user ? body : null;
}

export async function currentEasyAuthUser() {
  const session = await easyAuthSession();
  return session ? toFilosageUser(session) : null;
}

export async function currentEasyAuthSession() {
  return await easyAuthSession() ? EASY_AUTH_SESSION_MARKER : null;
}

function sameOriginPath(path: string) {
  if (typeof window === "undefined") return "/";
  const candidate = new URL(path, window.location.origin);
  return candidate.origin === window.location.origin
    ? `${candidate.pathname}${candidate.search}${candidate.hash}`
    : "/";
}

function navigateToAuth(path: string): Promise<never> {
  window.location.assign(path);
  return new Promise<never>(() => undefined);
}

export function beginGoogleSignIn(postLoginPath = "/") {
  const destination = encodeURIComponent(sameOriginPath(postLoginPath));
  return navigateToAuth(`/.auth/login/google?post_login_redirect_uri=${destination}`);
}

export async function beginGoogleReauthentication(postLoginPath = "/privacy-center") {
  const current = new URL(window.location.href);
  if (current.searchParams.get(REAUTHENTICATED_QUERY) === "1") {
    current.searchParams.delete(REAUTHENTICATED_QUERY);
    window.history.replaceState({}, "", `${current.pathname}${current.search}${current.hash}`);
    const session = await easyAuthSession();
    if (!session?.recentAuthentication) {
      throw new Error("Google did not provide a recent-authentication proof. Your account was not deleted.");
    }
    const user = toFilosageUser(session, EASY_AUTH_SESSION_MARKER);
    if (!user) throw new Error("Your Google confirmation did not complete.");
    return user;
  }
  const destination = new URL(sameOriginPath(postLoginPath), window.location.origin);
  destination.searchParams.set(REAUTHENTICATED_QUERY, "1");
  return navigateToAuth(
    `/.auth/login/google?prompt=select_account&post_login_redirect_uri=${encodeURIComponent(`${destination.pathname}${destination.search}`)}`,
  );
}

export function signOutFromEasyAuth(postLogoutPath = "/") {
  const destination = encodeURIComponent(sameOriginPath(postLogoutPath));
  return navigateToAuth(`/.auth/logout?post_logout_redirect_uri=${destination}`);
}
