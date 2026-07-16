"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { EMPTY_LEARNER_STATE, readLearnerState, writeLearnerState, type LearnerState } from "@/lib/learner-state";

export function useLearnerState() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<LearnerState>(EMPTY_LEARNER_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const local = readLearnerState();
    queueMicrotask(() => setState(local));
    if (!user) {
      queueMicrotask(() => setReady(true));
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
        const merged: LearnerState = {
          courseBookmarks: Array.from(new Set([...local.courseBookmarks, ...cloud.courseBookmarks])),
          lessonBookmarks: Array.from(new Set([...local.lessonBookmarks, ...cloud.lessonBookmarks])),
          notes: { ...local.notes, ...cloud.notes },
          weeklyLessonGoal: cloud.weeklyLessonGoal || local.weeklyLessonGoal,
        };
        setState(merged);
        writeLearnerState(merged);
      }
    }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const update = useCallback((recipe: (current: LearnerState) => LearnerState) => {
    setState((current) => {
      const next = recipe(current);
      writeLearnerState(next);
      if (user) void user.getIdToken().then((token) => fetch("/api/learner-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(next),
      })).catch(() => undefined);
      return next;
    });
  }, [user]);

  return { state, update, ready };
}
