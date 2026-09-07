"use client";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { createLearnerSource, learnerJson } from "@/lib/learner-source";
import { learnerSessionSnapshot, readLearnerStorage, writeLearnerStorage, type LearnerStorageUser } from "@/lib/learner-storage";

export function useLearnerSource<T>(user: LearnerStorageUser | null, path: string | null, empty: (value: T) => boolean) {
  const epoch = learnerSessionSnapshot().revision;
  const source = useMemo(() => learnerSessionSnapshot().revision === epoch && user && path
    ? createLearnerSource(user, (signal) => learnerJson<T>(user, path, { cache: "no-store", signal }), empty,
      readLearnerStorage<T>(user.uid, "source-cache", path) ?? undefined,
      (data) => { writeLearnerStorage(user.uid, "source-cache", path, data); })
    : null, [empty, epoch, path, user]);
  const unavailable = useMemo(() => ({ status: "loading" as const, data: undefined, error: null }), []);
  const state = useSyncExternalStore(source?.subscribe ?? (() => () => {}), source?.getSnapshot ?? (() => unavailable), () => unavailable);
  useEffect(() => {
    void source?.load();
    return () => source?.cancel();
  }, [source]);
  const retry = useCallback(() => { void source?.load(); }, [source]);
  const replace = useCallback((data: T) => source?.replace(data), [source]);
  return { ...state, retry, replace };
}
