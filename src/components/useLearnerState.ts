"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { EMPTY_LEARNER_STATE, readLearnerState, writeLearnerState, type LearnerState } from "@/lib/learner-state";
import { deferClientTask } from "@/lib/browser-compat";

export function useLearnerState() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<LearnerState>(EMPTY_LEARNER_STATE);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncQueue = useRef(Promise.resolve());
  const stateRef = useRef<LearnerState>(EMPTY_LEARNER_STATE);

  useEffect(() => {
    if (authLoading) return;
    const local = readLearnerState();
    stateRef.current = local;
    deferClientTask(() => setState(local));
    if (!user) {
      deferClientTask(() => setReady(true));
      return;
    }
    let cancelled = false;
    void user.getIdToken().then((token) => fetch("/api/learner-state", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })).then(async (response) => {
      if (!response.ok) return;
      const cloud = await response.json() as LearnerState;
      if (!cancelled) {
        const noteKeys = new Set([...Object.keys(local.notes), ...Object.keys(cloud.notes)]);
        const notes: Record<string, string> = {};
        const noteUpdatedAt: Record<string, string> = {};
        noteKeys.forEach((key) => {
          const localTime = Date.parse(local.noteUpdatedAt[key] ?? "") || 0;
          const cloudTime = Date.parse(cloud.noteUpdatedAt[key] ?? "") || 0;
          const useLocal = key in local.notes && (!(key in cloud.notes) || localTime >= cloudTime);
          notes[key] = useLocal ? local.notes[key] : cloud.notes[key];
          const updatedAt = useLocal ? local.noteUpdatedAt[key] : cloud.noteUpdatedAt[key];
          if (updatedAt) noteUpdatedAt[key] = updatedAt;
        });
        const localUpdated = Date.parse(local.updatedAt ?? "") || 0;
        const cloudUpdated = Date.parse(cloud.updatedAt ?? "") || 0;
        const preferLocalSettings = localUpdated > cloudUpdated;
        const merged: LearnerState = {
          courseBookmarks: preferLocalSettings ? local.courseBookmarks : cloud.courseBookmarks,
          lessonBookmarks: preferLocalSettings ? local.lessonBookmarks : cloud.lessonBookmarks,
          notes,
          noteUpdatedAt,
          weeklyLessonGoal: preferLocalSettings ? local.weeklyLessonGoal : cloud.weeklyLessonGoal,
          updatedAt: preferLocalSettings ? local.updatedAt : cloud.updatedAt,
        };
        stateRef.current = merged;
        setState(merged);
        writeLearnerState(merged);
      }
    }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const update = useCallback((recipe: (current: LearnerState) => LearnerState) => {
    const next = { ...recipe(stateRef.current), updatedAt: new Date().toISOString() };
    stateRef.current = next;
    setState(next);
    writeLearnerState(next);
    if (user) {
      setSyncStatus("saving");
      setSyncError(null);
      syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
        const token = await user.getIdToken();
        const response = await fetch("/api/learner-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(next),
        });
        if (!response.ok) throw new Error("Your latest learning changes are saved on this device but have not synced yet.");
        setSyncStatus("saved");
      }).catch((error: unknown) => {
        setSyncStatus("error");
        setSyncError(error instanceof Error ? error.message : "Learning changes have not synced yet.");
      });
    }
  }, [user]);

  return { state, update, ready, syncStatus, syncError };
}
