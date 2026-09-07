import { isCurrentLearnerSession, learnerRequest, learnerSessionSnapshot, type LearnerStorageUser } from "@/lib/learner-storage";

export type LearnerSourceStatus = "loading" | "loaded" | "empty" | "stale" | "error";
export interface LearnerSourceState<T> { status: LearnerSourceStatus; data: T | undefined; error: string | null }
export const LEARNER_SOURCE_TIMEOUT_MS = 8_000;

export function assertLearnerSession(session: ReturnType<typeof learnerSessionSnapshot>) {
  if (!isCurrentLearnerSession(session)) throw new Error("Your learning session changed. Sign in again to continue.");
}

export async function withLearnerDeadline<T>(signal: AbortSignal, task: (signal: AbortSignal) => Promise<T>, timeoutMs = LEARNER_SOURCE_TIMEOUT_MS): Promise<T> {
  const deadline = new AbortController();
  const combined = AbortSignal.any([signal, deadline.signal]);
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error(deadline.signal.aborted
      ? "This is taking too long. Try again; your saved work is still on this device."
      : "Your learning session changed. Sign in again to continue."));
    combined.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  try {
    if (combined.aborted) onAbort();
    return await Promise.race([aborted, Promise.resolve().then(() => {
      if (combined.aborted) throw new Error("Request cancelled.");
      return task(combined);
    })]);
  } finally {
    clearTimeout(timer);
    combined.removeEventListener("abort", onAbort);
  }
}

export async function learnerJsonResponse<T>(user: LearnerStorageUser, input: string, init: RequestInit = {}, timeoutMs?: number) {
  const session = learnerSessionSnapshot(user.uid);
  return withLearnerDeadline(init.signal ? AbortSignal.any([session.signal, init.signal]) : session.signal, async (signal) => {
    const response = await learnerRequest(user, input, { ...init, signal });
    const data = await response.json() as T;
    assertLearnerSession(session);
    signal.throwIfAborted();
    return { ok: response.ok, status: response.status, data };
  }, timeoutMs);
}

export async function learnerJson<T>(user: LearnerStorageUser, input: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const response = await learnerJsonResponse<T>(user, input, init, timeoutMs);
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "Your account could not access this record. Sign in again or check your account access."
    : "Account data is unavailable. Try again; your saved work is still on this device.");
  return response.data;
}

// A source keeps only this account/session's last successful result. Failed
// requests never certify an empty record, and a superseded retry cannot win.
export function createLearnerSource<T>(user: LearnerStorageUser, loadData: (signal: AbortSignal) => Promise<T>, isEmpty: (value: T) => boolean, initial?: T, retain?: (value: T) => void) {
  const session = learnerSessionSnapshot(user.uid);
  let state: LearnerSourceState<T> = { status: "loading", data: initial, error: null };
  const listeners = new Set<() => void>();
  let operation = 0;
  let request: AbortController | undefined;
  const emit = (next: LearnerSourceState<T>) => { state = next; listeners.forEach((listener) => listener()); };
  return {
    getSnapshot: () => state,
    replace: (data: T) => {
      if (!isCurrentLearnerSession(session)) return;
      operation += 1; request?.abort();
      const status = isEmpty(data) ? "empty" : "loaded";
      retain?.(data);
      emit({ status, data, error: null });
    },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: () => { operation += 1; request?.abort(); },
    load: async () => {
      request?.abort();
      const own = ++operation;
      const controller = new AbortController();
      request = controller;
      const current = () => own === operation && !controller.signal.aborted && isCurrentLearnerSession(session);
      if (!current()) return;
      emit({ ...state, status: "loading", error: null });
      try {
        const data = await withLearnerDeadline(AbortSignal.any([session.signal, controller.signal]), loadData);
        if (current()) {
          const status = isEmpty(data) ? "empty" : "loaded";
          retain?.(data);
          emit({ status, data, error: null });
        }
      } catch (error) {
        if (current()) emit({ ...state, status: state.data === undefined ? "error" : "stale", error: error instanceof Error ? error.message : "Account data is unavailable. Try again." });
      }
    },
  };
}
