"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { EMPTY_LEARNER_STATE, readLearnerState, writeLearnerState, type LearnerState } from "@/lib/learner-state";
import { isCurrentLearnerSession, learnerSessionSnapshot } from "@/lib/learner-storage";
import { learnerJson, type LearnerSourceStatus } from "@/lib/learner-source";
import { hasPendingLearnerSync, beginLearnerStateRead, queueLearnerStateChanges, syncLearnerState } from "@/lib/learner-sync";
import { deferClientTask } from "@/lib/browser-compat";

export function useLearnerState() {
  const { user, account, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const session = useMemo(() => ({ ...learnerSessionSnapshot(uid), accountGeneration: user?.accountGeneration }), [uid, user?.accountGeneration]);
  const [state, setState] = useState<LearnerState>(EMPTY_LEARNER_STATE);
  const [ready, setReady] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LearnerSourceStatus>("loading");
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const stateRef = useRef<LearnerState>(EMPTY_LEARNER_STATE);
  const deviceSaved = useRef(true);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const controller = new AbortController();
    const current = () => !cancelled && isCurrentLearnerSession(session);
    const local = deviceSaved.current ? readLearnerState(uid) : stateRef.current;
    deferClientTask(() => {
      if (!current()) return;
      stateRef.current = local;
      setState(local); setReady(true); setLoadStatus("loading"); setSyncError(null);
      if (!user || account?.legalAcceptanceRequired) return;
      void (async () => {
        try {
          if (!deviceSaved.current) {
            const queued = queueLearnerStateChanges(user.uid, readLearnerState(uid), stateRef.current);
            deviceSaved.current = writeLearnerState(stateRef.current, uid) && queued;
            if (!deviceSaved.current) throw new Error("This browser could not save your changes. Keep this page open and try again.");
          }
          if (hasPendingLearnerSync(user.uid)) await syncLearnerState(user);
          const mergeCloud = beginLearnerStateRead(user.uid);
          const cloud = await learnerJson<LearnerState>(user, "/api/learner-state", { cache: "no-store", signal: controller.signal });
          if (!current()) return;
          // Persist any legacy same-account device changes before a later retry.
          const merged = mergeCloud(cloud);
          if (!deviceSaved.current) return;
          stateRef.current = merged; setState(merged); writeLearnerState(merged, uid);
          const localAhead = JSON.stringify(merged.notes) !== JSON.stringify(cloud.notes)
            || (Date.parse(merged.updatedAt ?? "") || 0) > (Date.parse(cloud.updatedAt ?? "") || 0);
          if (localAhead) { queueLearnerStateChanges(user.uid, cloud, merged); await syncLearnerState(user); }
          if (!current()) return;
          setLoadStatus(Object.keys(merged.notes).length || merged.courseBookmarks.length || merged.lessonBookmarks.length ? "loaded" : "empty");
          setSyncStatus("saved");
        } catch (error) {
          if (!current()) return;
          setLoadStatus(Object.keys(stateRef.current.notes).length || stateRef.current.updatedAt ? "stale" : "error");
          setSyncStatus("error");
          setSyncError(error instanceof Error ? error.message : "Account sync is unavailable. Try again.");
        }
      })();
    });
    return () => { cancelled = true; controller.abort(); };
  }, [account?.legalAcceptanceRequired, attempt, authLoading, session, uid, user]);

  const update = useCallback((recipe: (current: LearnerState) => LearnerState) => {
    if (!user || session.uid !== user.uid || !isCurrentLearnerSession(session) || account?.legalAcceptanceRequired) return;
    const previous = stateRef.current;
    const next = { ...recipe(previous), updatedAt: new Date().toISOString() };
    stateRef.current = next; setState(next);
    const queued = queueLearnerStateChanges(user.uid, previous, next);
    deviceSaved.current = writeLearnerState(next, uid) && queued;
    setSyncStatus("saving"); setSyncError(null);
    if (!deviceSaved.current) {
      setSyncStatus("error");
      setSyncError("This browser could not save your changes. Keep this page open and try again.");
      return;
    }
    void syncLearnerState(user).then(() => {
      if (isCurrentLearnerSession(session)) setSyncStatus("saved");
    }).catch(() => {
      if (!isCurrentLearnerSession(session)) return;
      setSyncStatus("error");
      setSyncError("Your latest learning changes are saved on this device but have not synced yet. Try again.");
    });
  }, [account?.legalAcceptanceRequired, session, uid, user]);

  const visible = session.uid === uid && isCurrentLearnerSession(session);
  return { state: visible ? state : EMPTY_LEARNER_STATE, update, ready: visible && ready, syncStatus, syncError, loadStatus, retry };
}
