import { EXPECTED_ACCOUNT_HEADER, EXPECTED_GENERATION_HEADER } from "@/lib/account-session";

// Browser learning records are owned by a canonical account, never by the next
// person using the device. Unowned historical keys are deliberately not read,
// migrated, or erased: their ownership cannot be established.
export type LearnerStorageFamily = "learner-state" | "progress" | "mastery" | "experience-draft" | "transfer-draft" | "outcome-feedback" | "generation-operation" | "learner-sync" | "source-cache";
export interface LearnerStorageUser {
  uid: string;
  accountGeneration?: string;
  getIdToken(): Promise<string>;
}
export const LEARNER_SESSION_CHANGE_KEY = "filosage:learner-session-change:v1";
export const LEARNER_SESSION_INVALIDATED_EVENT = "filosage:learner-session-invalidated";

const sessionListeners = new Set<() => void>();
export function subscribeLearnerSession(listener: () => void) {
  sessionListeners.add(listener); return () => { sessionListeners.delete(listener); };
}

let activeUid: string | null = null;
let activeGeneration: string | null = null;
let revision = 0;
let controller = new AbortController();

export function learnerStorageKey(uid: string, family: LearnerStorageFamily, resourceId = "all") {
  if (!uid || uid !== uid.trim()) throw new Error("A canonical account ID is required for learning storage.");
  return `filosage:learner:v1:${encodeURIComponent(uid)}:${family}:${encodeURIComponent(resourceId)}`;
}

export function activeLearnerUid() { return activeUid; }

export function learnerSessionSnapshot(uid = activeUid) {
  return { uid, revision, signal: controller.signal };
}

export function isCurrentLearnerSession(session: ReturnType<typeof learnerSessionSnapshot>) {
  return session.uid === activeUid && session.revision === revision && !session.signal.aborted;
}

export function setLearnerStorageIdentity(uid: string | null, generation: string | null = null) {
  if (uid !== null && (!uid || uid !== uid.trim())) throw new Error("A canonical account ID is required for learning storage.");
  if (activeUid !== uid || activeGeneration !== generation) {
    controller.abort();
    controller = new AbortController();
    if (typeof window !== "undefined" && uid && generation) {
      try {
        const key = `filosage:learner-generation:v1:${encodeURIComponent(uid)}`;
        const previous = localStorage.getItem(key);
        if (previous && previous !== generation) {
          const prefix = `filosage:learner:v1:${encodeURIComponent(uid)}:`;
          for (const entry of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => key !== null)) if (entry.startsWith(prefix)) localStorage.removeItem(entry);
        }
        localStorage.setItem(key, generation);
      } catch { /* Storage is optional. */ }
    }
    activeUid = uid;
    activeGeneration = generation;
    revision += 1;
    sessionListeners.forEach((listener) => listener());
  }
  return revision;
}

export function announceLearnerSessionChange(reason: "refresh" | "signed-out" = "refresh") {
  try {
    const hint = `${reason}:${encodeURIComponent(activeUid ?? "")}:${encodeURIComponent(activeGeneration ?? "")}:`;
    // Opening a second tab as the same account must not reset an active draft.
    // This hint only suppresses redundant notifications; it never authorizes IO.
    if (reason === "refresh" && localStorage.getItem(LEARNER_SESSION_CHANGE_KEY)?.startsWith(hint)) return;
    localStorage.setItem(LEARNER_SESSION_CHANGE_KEY, `${hint}${Date.now()}:${Math.random()}`);
  } catch { /* Storage is optional. */ }
}

export function invalidateLearnerSession() {
  setLearnerStorageIdentity(null);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LEARNER_SESSION_INVALIDATED_EVENT));
    announceLearnerSessionChange("signed-out");
  }
}

export function readLearnerStorage<T>(uid: string | null, family: LearnerStorageFamily, resourceId = "all"): T | null {
  if (typeof window === "undefined" || !uid || uid !== activeUid) return null;
  try {
    return JSON.parse(localStorage.getItem(learnerStorageKey(uid, family, resourceId)) ?? "null") as T | null;
  } catch { return null; }
}

export function writeLearnerStorage(uid: string | null, family: LearnerStorageFamily, resourceId: string, value: unknown) {
  if (typeof window === "undefined" || !uid || uid !== activeUid) return false;
  try {
    localStorage.setItem(learnerStorageKey(uid, family, resourceId), JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function removeLearnerStorage(uid: string | null, family: LearnerStorageFamily, resourceId = "all") {
  if (typeof window === "undefined" || !uid || uid !== activeUid) return;
  try { localStorage.removeItem(learnerStorageKey(uid, family, resourceId)); } catch { /* Storage is optional. */ }
}

export type LearnerSessionVerdict = "valid" | "invalid" | "unknown";

const SESSION_CHECK_TIMEOUT_MS = 5_000;

/**
 * One bounded check of the central session endpoint, used before a
 * feature-scoped 401 is allowed to end the session. "invalid" is returned
 * only when the endpoint definitively reports no session for this user
 * (401, an explicit null user, or a different user's session); network
 * failures, timeouts, and unexpected responses are "unknown" and must
 * never sign the user out.
 */
export async function checkLearnerSessionOnce(uid: string): Promise<LearnerSessionVerdict> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401) return "invalid";
    if (!response.ok) return "unknown";
    const body = (await response.json().catch(() => null)) as
      | { user?: { uid?: unknown } | null }
      | null;
    if (!body || typeof body !== "object") return "unknown";
    if (body.user === null) return "invalid";
    const sessionUid = body.user && typeof body.user === "object" ? body.user.uid : undefined;
    if (typeof sessionUid === "string" && sessionUid) {
      return sessionUid === uid ? "valid" : "invalid";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export interface LearnerRequestOptions {
  /**
   * Feature-scoped requests (Spark) set this so a feature 401 alone cannot
   * end the session: the central session is checked once, and only a
   * definitively invalid verdict invalidates it. Product rule: only
   * confirmed session invalidation ends a session; an individual feature
   * failure does not.
   */
  verifySessionOnUnauthorized?: boolean;
}

export async function learnerRequest(user: LearnerStorageUser | null, input: string, init: RequestInit = {}, options: LearnerRequestOptions = {}) {
  const session = learnerSessionSnapshot();
  const assertCurrent = () => {
    if (!user || session.uid !== user.uid || !isCurrentLearnerSession(session)) {
      throw new Error("Your learning session changed. Sign in again to continue.");
    }
  };
  assertCurrent();
  const token = await user!.getIdToken();
  assertCurrent();
  init.signal?.throwIfAborted();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set(EXPECTED_ACCOUNT_HEADER, encodeURIComponent(user!.uid));
  if (user!.accountGeneration) headers.set(EXPECTED_GENERATION_HEADER, encodeURIComponent(user!.accountGeneration!));
  const signal = init.signal ? AbortSignal.any([session.signal, init.signal]) : session.signal;
  const response = await fetch(input, { ...init, headers, signal });
  assertCurrent();
  const generationUnavailable = response.status === 403
    && (await response.clone().json().catch(() => ({}))).code === "ACCOUNT_GENERATION_UNAVAILABLE";
  assertCurrent();
  if (response.status === 401 || generationUnavailable) {
    let confirmedInvalid = true;
    if (response.status === 401 && options.verifySessionOnUnauthorized) {
      confirmedInvalid = (await checkLearnerSessionOnce(user!.uid)) === "invalid";
    }
    if (confirmedInvalid) invalidateLearnerSession();
  }
  return response;
}

export function clearLearnerAccountStorage(uid: string) {
  if (typeof window === "undefined" || !uid || uid !== activeUid) return;
  try {
    const prefix = `filosage:learner:v1:${encodeURIComponent(uid)}:`;
    for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => key !== null)) if (key.startsWith(prefix)) localStorage.removeItem(key);
  } catch { /* Storage is optional. */ }
  invalidateLearnerSession();
}
