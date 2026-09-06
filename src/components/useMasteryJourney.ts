"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getLocalMasteryJourney, mergeMasteryEvidence, normalizeLearnerReportedMasteryEvidence,
  saveLocalMasteryJourney, type LearningOutcomePlan, type MasteryEvidence,
} from "@/lib/mastery";
import { deferClientTask } from "@/lib/browser-compat";
import { isCurrentLearnerSession, learnerRequest, learnerSessionSnapshot, type LearnerStorageUser } from "@/lib/learner-storage";

type Journey = { plan: LearningOutcomePlan | null; evidence: MasteryEvidence[] };
const EMPTY_JOURNEY: Journey = { plan: null, evidence: [] };

export function useMasteryJourney(courseId: string | null | undefined, user: LearnerStorageUser | null) {
  const scope = JSON.stringify([user?.uid ?? null, courseId ?? null]);
  const session = useMemo(() => learnerSessionSnapshot(user?.uid ?? null), [user?.uid]);
  const [record, setRecord] = useState<{ scope: string; journey: Journey }>({ scope: "", journey: EMPTY_JOURNEY });
  const [hydratedScope, setHydratedScope] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error" | "unsaved">("idle");
  const latest = useRef(EMPTY_JOURNEY);
  const journey = record.scope === scope ? record.journey : EMPTY_JOURNEY;
  const current = useCallback(() => Boolean(user && session.uid === user.uid && isCurrentLearnerSession(session)), [session, user]);
  const storeJourney = useCallback((value: Journey) => {
    if (!courseId || !current()) return false;
    latest.current = value;
    setRecord({ scope, journey: value });
    return saveLocalMasteryJourney(courseId, value, user!.uid);
  }, [courseId, current, scope, user]);

  useEffect(() => {
    let cancelled = false;
    const requestController = new AbortController();
    const active = () => !cancelled && current();
    const local = courseId && user ? getLocalMasteryJourney(courseId, user.uid) : EMPTY_JOURNEY;
    const loadCloud = async () => {
      if (!courseId || !user || !active()) return;
      try {
        const response = await learnerRequest(user, `/api/mastery?courseId=${encodeURIComponent(courseId)}`, {
          cache: "no-store", signal: requestController.signal,
        });
        if (!response.ok) return;
        const cloud = await response.json() as Journey;
        if (!active()) return;
        const owned = latest.current;
        const preferredPlan = !owned.plan ? cloud.plan : !cloud.plan || owned.plan.updatedAt >= cloud.plan.updatedAt ? owned.plan : cloud.plan;
        const nextPlan = preferredPlan ? {
          ...preferredPlan,
          baselineAssessment: preferredPlan.baselineAssessment ?? cloud.plan?.baselineAssessment ?? owned.plan?.baselineAssessment,
        } : null;
        storeJourney({ plan: nextPlan, evidence: mergeMasteryEvidence(owned.evidence, cloud.evidence ?? []) });
        const cloudEvidenceIds = new Set((cloud.evidence ?? []).map((item) => item.id));
        const missingEvidence = owned.evidence.filter((item) => !cloudEvidenceIds.has(item.id)).slice(0, 100);
        if (!active()) return;
        const responses = await Promise.all([
          ...(owned.plan && (!cloud.plan || owned.plan.updatedAt >= cloud.plan.updatedAt)
            ? [learnerRequest(user, "/api/mastery", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(owned.plan), signal: requestController.signal,
              })] : []),
          ...missingEvidence.map((item) => learnerRequest(user, "/api/mastery", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item), signal: requestController.signal,
          })),
        ]);
        if (responses.some((response) => !response.ok)) throw new Error("sync failed");
      } catch {
        if (active()) setSyncStatus("error");
      }
    };
    deferClientTask(() => {
      if (cancelled || !isCurrentLearnerSession(session)) return;
      latest.current = local;
      setRecord({ scope, journey: local });
      setHydratedScope(scope);
      setSyncStatus("idle");
      void loadCloud();
    });
    return () => { cancelled = true; requestController.abort(); };
  }, [courseId, current, scope, session, storeJourney, user]);

  const savePlan = useCallback(async (plan: LearningOutcomePlan) => {
    if (!courseId || !user || !current()) return;
    const deviceSaved = storeJourney({ ...latest.current, plan });
    setSyncStatus("saving");
    try {
      const response = await learnerRequest(user, "/api/mastery", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan),
      });
      if (!response.ok) throw new Error("sync failed");
      const data = await response.json() as { plan: LearningOutcomePlan };
      if (!current()) return;
      storeJourney({ ...latest.current, plan: data.plan });
      setSyncStatus("saved");
    } catch {
      if (current()) setSyncStatus(deviceSaved ? "error" : "unsaved");
    }
  }, [courseId, current, storeJourney, user]);

  const addEvidence = useCallback(async (items: MasteryEvidence[]) => {
    if (!courseId || !user || !items.length || !current()) return;
    const normalized = items.map(normalizeLearnerReportedMasteryEvidence);
    storeJourney({ ...latest.current, evidence: mergeMasteryEvidence(latest.current.evidence, normalized) });
    try {
      const responses = await Promise.all(normalized.map((item) => learnerRequest(user, "/api/mastery", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item),
      })));
      if (responses.some((response) => !response.ok)) throw new Error("sync failed");
    } catch { if (current()) setSyncStatus("error"); }
  }, [courseId, current, storeJourney, user]);

  const applyBaselineAssessment = useCallback((assessment: LearningOutcomePlan["baselineAssessment"]) => {
    if (!current() || !latest.current.plan || !assessment) return;
    storeJourney({ ...latest.current, plan: { ...latest.current.plan, baselineAssessment: assessment, updatedAt: new Date().toISOString() } });
  }, [current, storeJourney]);

  return { ...journey, ready: hydratedScope === scope, syncStatus, savePlan, addEvidence, applyBaselineAssessment };
}
