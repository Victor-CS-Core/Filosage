"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { EMPTY_LEARNER_STATE, readLearnerState, writeLearnerState, type LearnerState } from "@/lib/learner-state";
import { isCurrentLearnerSession, learnerRequest, learnerSessionSnapshot } from "@/lib/learner-storage";
import { deferClientTask } from "@/lib/browser-compat";

export function useLearnerState() {
  const { user, account, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const session = useMemo(() => learnerSessionSnapshot(uid), [uid]);
  const [state, setState] = useState<LearnerState>(EMPTY_LEARNER_STATE);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncQueue = useRef(Promise.resolve());
  const stateRef = useRef<LearnerState>(EMPTY_LEARNER_STATE);

  useEffect(() => {
    if (authLoading) return;
    const local = readLearnerState(uid);
    const sessionCurrent = () => isCurrentLearnerSession(session);
    let cancelled = false;
    const controller = new AbortController();
    stateRef.current = local;
    deferClientTask(() => { if (!cancelled && sessionCurrent()) { setState(local); setReady(false); setSyncStatus("idle"); setSyncError(null); } });
    if (!user || account?.legalAcceptanceRequired) {
      deferClientTask(() => { if (!cancelled && sessionCurrent()) setReady(true); });
      return () => { cancelled = true; controller.abort(); };
    }
    void learnerRequest(user, "/api/learner-state", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const cloud = await response.json() as LearnerState;
      if (!cancelled && sessionCurrent()) {
        const local = readLearnerState(uid);
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
          dashboardPreferences: preferLocalSettings ? local.dashboardPreferences : cloud.dashboardPreferences,
          reminderPreferences: preferLocalSettings ? local.reminderPreferences : cloud.reminderPreferences,
          updatedAt: preferLocalSettings ? local.updatedAt : cloud.updatedAt,
        };
        stateRef.current = merged;
        setState(merged);
        writeLearnerState(merged, uid);
        if (preferLocalSettings || Object.keys(notes).some((key) => notes[key] !== cloud.notes[key])) {
          setSyncStatus("error");
          setSyncError("Your latest learning changes are saved on this device but have not synced yet.");
        }
      }
    }).catch(() => {
      if (!cancelled && sessionCurrent()) {
        setSyncStatus("error");
        setSyncError("Your learning changes are available on this device. Account sync is unavailable.");
      }
    }).finally(() => { if (!cancelled && sessionCurrent()) setReady(true); });
    return () => { cancelled = true; controller.abort(); };
  }, [account?.legalAcceptanceRequired, authLoading, session, uid, user]);

  const update = useCallback((recipe: (current: LearnerState) => LearnerState) => {
    if (!user || session.uid !== user.uid || !isCurrentLearnerSession(session) || account?.legalAcceptanceRequired) return;
    const previous = stateRef.current;
    const next = { ...recipe(previous), updatedAt: new Date().toISOString() };
    stateRef.current = next;
    setState(next);
    const deviceSaved = writeLearnerState(next, uid);
    if (user) {
      const noteChanges = Object.keys(next.notes).flatMap((key) => {
        if (next.notes[key] === previous.notes[key] && next.noteUpdatedAt[key] === previous.noteUpdatedAt[key]) return [];
        return [{
          key,
          content: next.notes[key],
          updatedAt: next.noteUpdatedAt[key] ?? next.updatedAt!,
        }];
      });
      const deletedNoteKeys = Object.keys(previous.notes).filter((key) => !(key in next.notes));
      const payload = {
        preferences: {
          courseBookmarks: next.courseBookmarks,
          lessonBookmarks: next.lessonBookmarks,
          weeklyLessonGoal: next.weeklyLessonGoal,
          dashboardPreferences: next.dashboardPreferences,
          reminderPreferences: next.reminderPreferences,
          updatedAt: next.updatedAt,
        },
        noteChanges,
        deletedNoteKeys,
      };
      setSyncStatus("saving");
      setSyncError(null);
      syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
        if (!isCurrentLearnerSession(session)) return;
        const response = await learnerRequest(user, "/api/learner-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("sync failed");
        if (isCurrentLearnerSession(session)) setSyncStatus("saved");
      }).catch(() => {
        if (!isCurrentLearnerSession(session)) return;
        setSyncStatus("error");
        setSyncError(deviceSaved
          ? "Your latest learning changes are saved on this device but have not synced yet."
          : "Your browser could not save these changes. Keep this page open and try again.");
      });
    }
  }, [account?.legalAcceptanceRequired, session, uid, user]);

  const visible = session.uid === uid && isCurrentLearnerSession(session);
  return { state: visible ? state : EMPTY_LEARNER_STATE, update, ready: visible && ready, syncStatus, syncError };
}
