"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getLocalMasteryJourney, mergeMasteryEvidence, normalizeLearnerReportedMasteryEvidence,
  saveLocalMasteryJourney, type LearningOutcomePlan, type MasteryEvidence,
} from "@/lib/mastery";
import { deferClientTask } from "@/lib/browser-compat";
import { isCurrentLearnerSession, learnerSessionSnapshot, type LearnerStorageUser } from "@/lib/learner-storage";

import { learnerJson, type LearnerSourceStatus } from "@/lib/learner-source";

type Journey = { plan: LearningOutcomePlan | null; evidence: MasteryEvidence[] };
const EMPTY_JOURNEY: Journey = { plan: null, evidence: [] };

export function useMasteryJourney(courseId: string | null | undefined, user: LearnerStorageUser | null) {
  const scope = JSON.stringify([user?.uid ?? null, user?.accountGeneration ?? null, courseId ?? null]);
  const session = useMemo(() => ({ ...learnerSessionSnapshot(user?.uid ?? null), accountGeneration: user?.accountGeneration }), [user?.uid, user?.accountGeneration]);
  const [record, setRecord] = useState<{ scope: string; journey: Journey }>({ scope: "", journey: EMPTY_JOURNEY });
  const [hydratedScope, setHydratedScope] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error" | "unsaved">("idle");
  const [loadStatus, setLoadStatus] = useState<LearnerSourceStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const latest = useRef(EMPTY_JOURNEY);
  const latestScope = useRef(scope);
  const latestDeviceSaved = useRef(true);
  const journey = record.scope === scope ? record.journey : EMPTY_JOURNEY;
  const current = useCallback(() => Boolean(user && session.uid === user.uid && isCurrentLearnerSession(session)), [session, user]);
  const storeJourney = useCallback((value: Journey) => {
    if (!courseId || !current()) return false;
    latest.current = value; latestScope.current = scope;
    setRecord({ scope, journey: value });
    latestDeviceSaved.current = saveLocalMasteryJourney(courseId, value, user!.uid);
    return latestDeviceSaved.current;
  }, [courseId, current, scope, user]);

  useEffect(() => {
    let cancelled = false;
    const requestController = new AbortController();
    const active = () => !cancelled && current();
    const local = latestScope.current === scope && !latestDeviceSaved.current ? latest.current : courseId && user ? getLocalMasteryJourney(courseId, user.uid) : EMPTY_JOURNEY;
    const loadCloud = async () => {
      if (!courseId || !user || !active()) return;
      try {
        const cloud = await learnerJson<Journey>(user, `/api/mastery?courseId=${encodeURIComponent(courseId)}`, {
          cache: "no-store", signal: requestController.signal,
        });
        if (!active()) return;
        const owned = latest.current;
        const preferredPlan = !owned.plan ? cloud.plan : !cloud.plan || owned.plan.updatedAt >= cloud.plan.updatedAt ? owned.plan : cloud.plan;
        const nextPlan = preferredPlan ? {
          ...preferredPlan,
          baselineAssessment: preferredPlan.baselineAssessment ?? cloud.plan?.baselineAssessment ?? owned.plan?.baselineAssessment,
        } : null;
        const mergedEvidence = mergeMasteryEvidence(owned.evidence, cloud.evidence ?? []);
        storeJourney({ plan: nextPlan, evidence: mergedEvidence });
        const cloudEvidenceIds = new Set((cloud.evidence ?? []).map((item) => item.id));
        const pendingEvidence = owned.evidence.filter((item) => !cloudEvidenceIds.has(item.id));
        const missingEvidence = pendingEvidence.slice(0, 100);
        if (!active()) return;
        await Promise.all([
          ...(owned.plan && (!cloud.plan || owned.plan.updatedAt >= cloud.plan.updatedAt)
            ? [learnerJson(user, "/api/mastery", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(owned.plan), signal: requestController.signal,
              })] : []),
          ...missingEvidence.map((item) => learnerJson(user, "/api/mastery", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item), signal: requestController.signal,
          })),
        ]);
        if (active()) {
          if (pendingEvidence.length > missingEvidence.length) {
            setLoadStatus("stale"); setSyncStatus(latestDeviceSaved.current ? "error" : "unsaved");
            setLoadError("Some learning evidence still needs account sync. Retry to continue without duplicating saved records.");
          } else { setLoadStatus(nextPlan || mergedEvidence.length ? "loaded" : "empty"); setSyncStatus("saved"); }
        }
      } catch (error) {
        if (active()) {
          setSyncStatus(latestDeviceSaved.current ? "error" : "unsaved");
          setLoadStatus(latest.current.plan || latest.current.evidence.length ? "stale" : "error");
          setLoadError(error instanceof Error ? error.message : "Your learning evidence is unavailable. Try again.");
        }
      }
    };
    deferClientTask(() => {
      if (cancelled || !isCurrentLearnerSession(session)) return;
      latest.current = local;
      setRecord({ scope, journey: local });
      setHydratedScope(scope);
      setSyncStatus("idle");
      setLoadStatus("loading"); setLoadError(null);
      void loadCloud();
    });
    return () => { cancelled = true; requestController.abort(); };
  }, [attempt, courseId, current, scope, session, storeJourney, user]);

  const savePlan = useCallback(async (plan: LearningOutcomePlan) => {
    if (!courseId || !user || !current()) return;
    const deviceSaved = storeJourney({ ...latest.current, plan });
    setSyncStatus("saving");
    try {
      const data = await learnerJson<{ plan: LearningOutcomePlan }>(user, "/api/mastery", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan),
      });
      if (!current()) return;
      if (latest.current.plan?.updatedAt !== plan.updatedAt) return;
      storeJourney({ ...latest.current, plan: data.plan });
      setSyncStatus("saved");
    } catch {
      if (current()) setSyncStatus(deviceSaved ? "error" : "unsaved");
    }
  }, [courseId, current, storeJourney, user]);

  const addEvidence = useCallback(async (items: MasteryEvidence[]) => {
    if (!courseId || !user || !items.length || !current()) return;
    const normalized = items.map(normalizeLearnerReportedMasteryEvidence);
    const deviceSaved = storeJourney({ ...latest.current, evidence: mergeMasteryEvidence(latest.current.evidence, normalized) });
    setSyncStatus("saving");
    try {
      await Promise.all(normalized.map((item) => learnerJson(user, "/api/mastery", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item),
      })));
      if (current()) setSyncStatus("saved");
    } catch { if (current()) setSyncStatus(deviceSaved ? "error" : "unsaved"); }
  }, [courseId, current, storeJourney, user]);

  const applyBaselineAssessment = useCallback((assessment: LearningOutcomePlan["baselineAssessment"]) => {
    if (!current() || !latest.current.plan || !assessment) return;
    storeJourney({ ...latest.current, plan: { ...latest.current.plan, baselineAssessment: assessment, updatedAt: new Date().toISOString() } });
  }, [current, storeJourney]);

  return { ...journey, ready: hydratedScope === scope, syncStatus, loadStatus, loadError, retry, savePlan, addEvidence, applyBaselineAssessment };
}
