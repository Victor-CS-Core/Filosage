import { EXPECTED_ACCOUNT_HEADER } from "@/lib/account-session";

// Browser learning records are owned by a canonical account, never by the next
// person using the device. Unowned historical keys are deliberately not read,
// migrated, or erased: their ownership cannot be established.
export type LearnerStorageFamily = "learner-state" | "progress" | "mastery" | "experience-draft" | "transfer-draft" | "outcome-feedback";
export interface LearnerStorageUser {
  uid: string;
  getIdToken(): Promise<string>;
}
export const LEARNER_SESSION_CHANGE_KEY = "filosage:learner-session-change:v1";
export const LEARNER_SESSION_INVALIDATED_EVENT = "filosage:learner-session-invalidated";

let activeUid: string | null = null;
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

export function setLearnerStorageIdentity(uid: string | null) {
  if (uid !== null && (!uid || uid !== uid.trim())) throw new Error("A canonical account ID is required for learning storage.");
  if (activeUid !== uid) {
    controller.abort();
    controller = new AbortController();
    activeUid = uid;
    revision += 1;
  }
  return revision;
}

export function announceLearnerSessionChange(reason: "refresh" | "signed-out" = "refresh") {
  try {
    const hint = `${reason}:${encodeURIComponent(activeUid ?? "")}:`;
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

export async function learnerRequest(user: LearnerStorageUser | null, input: string, init: RequestInit = {}) {
  const session = learnerSessionSnapshot();
  const assertCurrent = () => {
    if (!user || session.uid !== user.uid || !isCurrentLearnerSession(session)) {
      throw new Error("Your learning session changed. Sign in again to continue.");
    }
  };
  assertCurrent();
  const token = await user!.getIdToken();
  assertCurrent();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set(EXPECTED_ACCOUNT_HEADER, encodeURIComponent(user!.uid));
  const signal = init.signal ? AbortSignal.any([session.signal, init.signal]) : session.signal;
  const response = await fetch(input, { ...init, headers, signal });
  assertCurrent();
  if (response.status === 401) invalidateLearnerSession();
  return response;
}
