"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  FileCheck2,
  LoaderCircle,
  PauseCircle,
  Pencil,
  PlayCircle,
  Target,
} from "lucide-react";
import type { Course } from "@/lib/course-types";
import type { BaselineAssessment } from "@/lib/learning-types";
import {
  BASELINE_LEVEL_LABELS,
  BASELINE_LEVELS,
  buildDiagnostic,
  explainPlan,
  recommendedLessonFor,
  type BaselineLevel,
  type LearningOutcomePlan,
} from "@/lib/mastery";
import { createClientId } from "@/lib/browser-compat";
import { trackProductEvent } from "@/lib/product-analytics";
import CourseDisclosure from "@/components/CourseDisclosure";

interface OutcomePlannerProps {
  course: Course;
  courseId: string;
  topic: string;
  user: { getIdToken(): Promise<string> } | null;
  plan: LearningOutcomePlan | null;
  syncStatus: "idle" | "saving" | "saved" | "error";
  onSave(plan: LearningOutcomePlan): Promise<void>;
  onBaseline(assessment: BaselineAssessment): void;
}

export default function OutcomePlanner({
  course,
  courseId,
  topic,
  user,
  plan,
  syncStatus,
  onSave,
  onBaseline,
}: OutcomePlannerProps) {
  const router = useRouter();
  const initialDiagnostic = useMemo(() => buildDiagnostic(course), [course]);
  const [editing, setEditing] = useState(!plan);
  const [desiredOutcome, setDesiredOutcome] = useState(plan?.desiredOutcome ?? course.outcome ?? "");
  const [applicationContext, setApplicationContext] = useState(plan?.applicationContext ?? "");
  const [targetArtifact, setTargetArtifact] = useState(plan?.targetArtifact ?? course.capstone?.deliverable ?? "");
  const [targetDate, setTargetDate] = useState(plan?.targetDate ?? "");
  const [weeklyMinutes, setWeeklyMinutes] = useState(plan?.weeklyMinutes ?? 120);
  const [diagnostics, setDiagnostics] = useState(plan?.diagnostics ?? initialDiagnostic);
  const [saving, setSaving] = useState(false);
  const [diagnosticTracked, setDiagnosticTracked] = useState(false);
  const [baselineSubmission, setBaselineSubmission] = useState("");
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  const updateDiagnostic = (objectiveId: string, level: BaselineLevel) => {
    if (!diagnosticTracked) {
      trackProductEvent("diagnostic_started", { route: "/course", courseId });
      setDiagnosticTracked(true);
    }
    setDiagnostics((current) => current.map((item) => item.objectiveId === objectiveId ? { ...item, level } : item));
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedOutcome = String(formData.get("desiredOutcome") ?? desiredOutcome).trim();
    const submittedContext = String(formData.get("applicationContext") ?? applicationContext).trim();
    const submittedArtifact = String(formData.get("targetArtifact") ?? targetArtifact).trim();
    const submittedTargetDate = String(formData.get("targetDate") ?? targetDate).trim();
    const submittedWeeklyMinutes = Number(formData.get("weeklyMinutes") ?? weeklyMinutes);
    if (!submittedOutcome || !submittedContext || !submittedArtifact) return;
    setSaving(true);
    const now = new Date().toISOString();
    const scheduleChanged = Boolean(
      plan
      && (plan.weeklyMinutes !== submittedWeeklyMinutes || (plan.targetDate ?? "") !== submittedTargetDate),
    );
    const scheduleHistory = [
      ...(plan?.scheduleHistory ?? []),
      ...(!plan || scheduleChanged ? [{
        action: plan ? "rescheduled" as const : "created" as const,
        changedAt: now,
        weeklyMinutes: submittedWeeklyMinutes,
        ...(submittedTargetDate ? { targetDate: submittedTargetDate } : {}),
      }] : []),
    ].slice(-50);
    const nextPlan: LearningOutcomePlan = {
      courseId,
      courseTopic: topic,
      desiredOutcome: submittedOutcome,
      applicationContext: submittedContext,
      targetArtifact: submittedArtifact,
      targetDate: submittedTargetDate || undefined,
      weeklyMinutes: submittedWeeklyMinutes,
      diagnostics,
      recommendedLessonId: recommendedLessonFor(diagnostics),
      explanation: explainPlan(diagnostics, submittedWeeklyMinutes),
      createdAt: plan?.createdAt ?? now,
      updatedAt: now,
      status: plan?.status ?? "active",
      pausedAt: plan?.pausedAt,
      resumeAt: plan?.resumeAt,
      scheduleHistory,
      baselineAssessment: plan?.baselineAssessment,
    };
    await onSave(nextPlan);
    setEditing(false);
    setSaving(false);
    trackProductEvent("outcome_defined", { route: "/course", courseId });
    trackProductEvent("diagnostic_completed", { route: "/course", courseId });
    trackProductEvent("plan_created", { route: "/course", courseId });
    if (scheduleChanged) trackProductEvent("outcome_rescheduled", { route: "/course", courseId });
  };

  const togglePause = async () => {
    if (!plan || saving) return;
    setSaving(true);
    const changedAt = new Date().toISOString();
    const pausing = plan.status !== "paused";
    const nextPlan: LearningOutcomePlan = {
      ...plan,
      status: pausing ? "paused" : "active",
      pausedAt: pausing ? changedAt : undefined,
      resumeAt: undefined,
      updatedAt: changedAt,
      scheduleHistory: [
        ...(plan.scheduleHistory ?? []),
        {
          action: pausing ? "paused" as const : "resumed" as const,
          changedAt,
          weeklyMinutes: plan.weeklyMinutes,
          ...(plan.targetDate ? { targetDate: plan.targetDate } : {}),
        },
      ].slice(-50),
    };
    await onSave(nextPlan);
    trackProductEvent(pausing ? "outcome_paused" : "outcome_resumed", {
      route: "/course",
      courseId,
    });
    setSaving(false);
  };

  const assessBaseline = async () => {
    if (!user || baselineSubmission.trim().length < 120 || baselineBusy) return;
    setBaselineBusy(true);
    setBaselineError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/assess-baseline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createClientId(),
        },
        body: JSON.stringify({ courseId, submission: baselineSubmission }),
      });
      const data = await response.json() as { assessment?: BaselineAssessment; error?: string };
      if (!response.ok || !data.assessment) throw new Error(data.error || "The starting sample could not be assessed.");
      onBaseline(data.assessment);
      setBaselineSubmission("");
      trackProductEvent("baseline_assessed", {
        route: "/course",
        courseId,
        score: data.assessment.score,
      });
    } catch (error) {
      setBaselineError(error instanceof Error ? error.message : "The starting sample could not be assessed.");
    } finally {
      setBaselineBusy(false);
    }
  };

  if (!editing && plan) {
    const [moduleIndex] = plan.recommendedLessonId.split("-").map(Number);
    const nextModule = course.modules[moduleIndex] ?? course.modules[0];
    return (
      <section className="outcome-plan" aria-labelledby="outcome-plan-title">
        <div className="outcome-plan-summary">
          <div className="outcome-plan-status">
            <p className="overline">Your outcome</p>
            <span className={plan.status === "paused" ? "is-paused" : "is-active"}>
              {plan.status === "paused" ? "Paused" : "Active"}
            </span>
          </div>
          <h2 id="outcome-plan-title">{plan.desiredOutcome}</h2>
          <p>{plan.status === "paused"
            ? "Your route is paused. Nothing is lost, and overdue work will be reprioritized without a penalty when you resume."
            : plan.explanation}</p>
          <dl>
            <div><dt>Use it for</dt><dd>{plan.applicationContext}</dd></div>
            <div><dt>Proof you will create</dt><dd>{plan.targetArtifact}</dd></div>
            <div><dt>Weekly pace</dt><dd>{plan.weeklyMinutes} minutes</dd></div>
          </dl>
          <div className="outcome-plan-actions">
            {plan.status !== "paused" && (
              <button className="button button-primary" type="button" onClick={() => router.push(`/course/${encodeURIComponent(topic)}/lesson/${plan.recommendedLessonId}?id=${courseId}`)}>
                Start with {nextModule?.title ?? "the first module"} <ArrowRight size={16} />
              </button>
            )}
            {plan.status === "paused" && (
              <button className="button button-primary" type="button" disabled={saving} onClick={() => void togglePause()}>
                <PlayCircle size={16} /> Resume plan
              </button>
            )}
            <button className="button button-secondary" type="button" onClick={() => router.push(`/evidence/${courseId}`)}>
              <FileCheck2 size={16} /> View evidence
            </button>
            <button className="text-button" type="button" onClick={() => setEditing(true)}><Pencil size={14} /> Edit plan</button>
            {plan.status !== "paused" && (
              <button className="text-button" type="button" disabled={saving} onClick={() => void togglePause()}><PauseCircle size={14} /> Pause plan</button>
            )}
          </div>
          <small className="outcome-sync-status">{syncStatus === "saving" ? "Syncing plan…" : syncStatus === "error" ? "Saved on this device; account sync is pending." : user ? "Plan available across your devices." : "Plan saved on this device."}</small>
        </div>

        {course.capstone && (
          <div className="baseline-check">
            <div>
              <ClipboardCheck size={19} />
              <span><strong>Comparable starting point</strong><small>Optional · signed-in assessment</small></span>
            </div>
            {plan.baselineAssessment ? (
              <div className="baseline-result" role="status">
                <strong>{plan.baselineAssessment.score}% of capstone criteria demonstrated before study</strong>
                <p>{plan.baselineAssessment.summary}</p>
                <small>Assessed {new Date(plan.baselineAssessment.assessedAt).toLocaleDateString()}. This is separate from your self-reported diagnostic.</small>
              </div>
            ) : user ? (
              <>
                <p>Attempt the capstone brief now. Erudoza will score the same criteria used at the end, so improvement is measurable.</p>
                <textarea
                  rows={5}
                  value={baselineSubmission}
                  onChange={(event) => setBaselineSubmission(event.target.value)}
                  placeholder="Describe your starting approach in enough detail to assess it against the capstone criteria."
                  aria-label="Starting capstone sample"
                />
                <button className="button button-secondary button-small" type="button" disabled={baselineBusy || baselineSubmission.trim().length < 120} onClick={() => void assessBaseline()}>
                  {baselineBusy ? <LoaderCircle className="spin" size={15} /> : <ClipboardCheck size={15} />}
                  {baselineBusy ? "Assessing starting point…" : "Assess starting point"}
                </button>
                {baselineError && <p className="form-error" role="alert">{baselineError}</p>}
              </>
            ) : (
              <p>Sign in if you want a criterion-by-criterion baseline that can be compared with your final capstone. Your learning plan still works without an account.</p>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <CourseDisclosure
      className="outcome-onboarding"
      defaultOpen
      description="About two minutes. Your answers choose a starting point; they do not lock any lessons."
      eyebrow="Before lesson one"
      headingId="outcome-onboarding-title"
      leading={<Target size={21} />}
      title="Turn this course into a plan for your goal."
    >
      <form onSubmit={save}>
        <div className="outcome-fields">
          <label>What do you want to be able to do?
            <textarea name="desiredOutcome" required rows={2} maxLength={500} value={desiredOutcome} onChange={(event) => setDesiredOutcome(event.target.value)} placeholder="Make the capability specific and observable." />
          </label>
          <label>Where will you use it?
            <textarea name="applicationContext" required rows={2} maxLength={500} value={applicationContext} onChange={(event) => setApplicationContext(event.target.value)} placeholder="A project, role, decision, or real situation." />
          </label>
          <label>What will prove you can do it?
            <input name="targetArtifact" required maxLength={300} value={targetArtifact} onChange={(event) => setTargetArtifact(event.target.value)} placeholder="A decision, explanation, analysis, or finished artifact." />
          </label>
          <div className="outcome-field-row">
            <label>Weekly study time
              <select name="weeklyMinutes" value={weeklyMinutes} onChange={(event) => setWeeklyMinutes(Number(event.target.value))}>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
                <option value={300}>5 hours</option>
              </select>
            </label>
            <label>Target date <small>Optional</small>
              <input name="targetDate" type="date" value={targetDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setTargetDate(event.target.value)} />
            </label>
          </div>
        </div>

        <fieldset className="diagnostic-grid">
          <legend>Quick diagnostic</legend>
          <p>Choose the level that is true today. Self-report guides the route; later practice provides stronger evidence.</p>
          {diagnostics.map((item) => (
            <div className="diagnostic-row" key={item.objectiveId}>
              <div><strong>{item.moduleTitle}</strong><small>{item.objective}</small></div>
              <div role="radiogroup" aria-label={`Current level for ${item.moduleTitle}`}>
                {BASELINE_LEVELS.map((level) => (
                  <label className={item.level === level ? "is-selected" : ""} key={level}>
                    <input type="radio" name={item.objectiveId} value={level} checked={item.level === level} onChange={() => updateDiagnostic(item.objectiveId, level)} />
                    {item.level === level && <Check size={13} />}
                    <span>{BASELINE_LEVEL_LABELS[level]}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <div className="outcome-form-actions">
          {plan && <button className="button button-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>}
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <Target size={16} />}
            {saving ? "Building your route…" : "Build my learning route"}
          </button>
        </div>
      </form>
    </CourseDisclosure>
  );
}
