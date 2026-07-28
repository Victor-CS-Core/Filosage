"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLocalMasteryJourney,
  mergeMasteryEvidence,
  saveLocalMasteryJourney,
  type LearningOutcomePlan,
  type MasteryEvidence,
} from "@/lib/mastery";
import { deferClientTask } from "@/lib/browser-compat";

interface TokenUser {
  getIdToken(): Promise<string>;
}

export function useMasteryJourney(courseId: string | null | undefined, user: TokenUser | null) {
  const [plan, setPlan] = useState<LearningOutcomePlan | null>(null);
  const [evidence, setEvidence] = useState<MasteryEvidence[]>([]);
  const [hydratedCourseId, setHydratedCourseId] = useState<string | null | undefined>(undefined);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const ready = hydratedCourseId === (courseId ?? null);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      deferClientTask(() => {
        if (cancelled) return;
        setPlan(null);
        setEvidence([]);
        setHydratedCourseId(null);
      });
      return () => { cancelled = true; };
    }
    const local = getLocalMasteryJourney(courseId);

    const loadCloud = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/mastery?courseId=${encodeURIComponent(courseId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) return;
        const cloud = await response.json() as {
          plan: LearningOutcomePlan | null;
          evidence: MasteryEvidence[];
        };
        if (cancelled) return;
        const preferredPlan = !local.plan
          ? cloud.plan
          : !cloud.plan || local.plan.updatedAt >= cloud.plan.updatedAt
            ? local.plan
            : cloud.plan;
        const nextPlan = preferredPlan
          ? {
              ...preferredPlan,
              baselineAssessment: preferredPlan.baselineAssessment
                ?? cloud.plan?.baselineAssessment
                ?? local.plan?.baselineAssessment,
            }
          : null;
        const nextEvidence = mergeMasteryEvidence(local.evidence, cloud.evidence ?? []);
        setPlan(nextPlan);
        setEvidence(nextEvidence);
        saveLocalMasteryJourney(courseId, { plan: nextPlan, evidence: nextEvidence });
        const cloudEvidenceIds = new Set((cloud.evidence ?? []).map((item) => item.id));
        const missingEvidence = local.evidence.filter((item) => !cloudEvidenceIds.has(item.id)).slice(0, 100);
        await Promise.all([
          ...(local.plan && (!cloud.plan || local.plan.updatedAt >= cloud.plan.updatedAt)
            ? [fetch("/api/mastery", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(local.plan),
              })]
            : []),
          ...missingEvidence.map((item) => fetch("/api/mastery", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(item),
          })),
        ]);
      } catch {
        // Local evidence remains available while account sync is unavailable.
      }
    };
    deferClientTask(() => {
      if (cancelled) return;
      setPlan(local.plan);
      setEvidence(local.evidence);
      setHydratedCourseId(courseId);
      if (user) void loadCloud();
    });
    return () => { cancelled = true; };
  }, [courseId, user]);

  const savePlan = useCallback(async (nextPlan: LearningOutcomePlan) => {
    if (!courseId) return;
    setPlan(nextPlan);
    saveLocalMasteryJourney(courseId, { plan: nextPlan, evidence });
    if (!user) {
      setSyncStatus("saved");
      return;
    }
    setSyncStatus("saving");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/mastery", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(nextPlan),
      });
      if (!response.ok) throw new Error("sync failed");
      const data = await response.json() as { plan: LearningOutcomePlan };
      setPlan(data.plan);
      saveLocalMasteryJourney(courseId, { plan: data.plan, evidence });
      setSyncStatus("saved");
    } catch {
      setSyncStatus("error");
    }
  }, [courseId, evidence, user]);

  const addEvidence = useCallback(async (items: MasteryEvidence[]) => {
    if (!courseId || !items.length) return;
    const nextEvidence = mergeMasteryEvidence(evidence, items);
    setEvidence(nextEvidence);
    saveLocalMasteryJourney(courseId, { plan, evidence: nextEvidence });
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await Promise.all(items.map((item) => fetch("/api/mastery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(item),
      })));
    } catch {
      // Evidence is already stored locally and can merge on a later visit.
    }
  }, [courseId, evidence, plan, user]);

  const applyBaselineAssessment = useCallback((assessment: LearningOutcomePlan["baselineAssessment"]) => {
    if (!courseId || !plan || !assessment) return;
    const nextPlan = { ...plan, baselineAssessment: assessment, updatedAt: new Date().toISOString() };
    setPlan(nextPlan);
    saveLocalMasteryJourney(courseId, { plan: nextPlan, evidence });
  }, [courseId, evidence, plan]);

  return {
    plan,
    evidence,
    ready,
    syncStatus,
    savePlan,
    addEvidence,
    applyBaselineAssessment,
  };
}
